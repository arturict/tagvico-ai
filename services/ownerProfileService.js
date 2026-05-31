function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9@._+-]+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalize(value)
    .split(/\s+/)
    .filter((part) => part.length >= 3);
}

function parseProfileLines(rawProfiles = '') {
  const map = new Map();
  String(rawProfiles || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const [user, rest = ''] = line.split(':');
      const username = normalize(user).split(' ')[0];
      if (!username) return;
      const hints = rest
        .split(',')
        .map((hint) => hint.trim())
        .filter(Boolean);
      map.set(username, hints);
    });
  return map;
}

function userHints(user, profileMap) {
  const username = normalize(user.username);
  const profileHints = profileMap.get(username) || [];
  const baseHints = [
    user.username,
    user.first_name,
    user.last_name,
    [user.first_name, user.last_name].filter(Boolean).join(' '),
    user.email
  ];
  return [...baseHints, ...profileHints]
    .flatMap((hint) => [hint, ...tokenize(hint)])
    .map(normalize)
    .filter((hint) => hint.length >= 3);
}

function scoreProfile(text, hints) {
  const haystack = ` ${normalize(text)} `;
  let score = 0;
  const matched = [];
  for (const hint of [...new Set(hints)]) {
    if (!hint) continue;
    const needle = ` ${hint} `;
    if (haystack.includes(needle) || haystack.includes(hint)) {
      const weight = hint.includes(' ') ? 4 : Math.min(3, Math.max(1, Math.floor(hint.length / 4)));
      score += weight;
      matched.push(hint);
    }
  }
  return { score, matched };
}

function buildContext(content, analysis = {}, doc = {}) {
  const analyzed = analysis.document || analysis || {};
  return [
    doc.title,
    analyzed.title,
    analyzed.correspondent,
    analyzed.document_type,
    Array.isArray(analyzed.tags) ? analyzed.tags.join(' ') : '',
    content
  ].filter(Boolean).join('\n');
}

function findOwnerMatch({ content = '', analysis = {}, doc = {}, users = [], rawProfiles = '' }) {
  const profileMap = parseProfileLines(rawProfiles);
  const context = buildContext(content, analysis, doc);
  const candidates = users
    .map((user) => ({ user, ...scoreProfile(context, userHints(user, profileMap)) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    return null;
  }
  return {
    id: candidates[0].user.id,
    username: candidates[0].user.username,
    score: candidates[0].score,
    matched: candidates[0].matched
  };
}

module.exports = {
  findOwnerMatch,
  parseProfileLines
};
