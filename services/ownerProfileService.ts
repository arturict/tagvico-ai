// @ts-nocheck — migrated from JavaScript; types will be tightened incrementally.
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

const GENERIC_USER_TOKENS = new Set([
  'admin',
  'user',
  'paperless',
  'archivista',
  'scanner',
  'service',
  'system'
]);

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

function uniqueHints(hints) {
  const seen = new Set();
  return hints.filter((hint) => {
    if (!hint.value || seen.has(hint.value)) return false;
    seen.add(hint.value);
    return true;
  });
}

function hint(value, weight, kind) {
  const normalized = normalize(value);
  if (normalized.length < 3) return null;
  return { value: normalized, weight, kind };
}

function userHints(user, profileMap) {
  const username = normalize(user.username);
  const profileHints = profileMap.get(username) || [];
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const hints = [
    hint(user.email, 8, 'email'),
    hint(fullName, 8, 'full-name'),
    !GENERIC_USER_TOKENS.has(username) ? hint(user.username, 5, 'username') : null,
    hint(user.first_name, 3, 'first-name'),
    hint(user.last_name, 3, 'last-name'),
    ...profileHints.flatMap((profileHint) => [
      hint(profileHint, profileHint.includes(' ') ? 6 : 4, 'profile'),
      ...tokenize(profileHint).map((token) => hint(token, 2, 'profile-token'))
    ])
  ].filter(Boolean);

  return uniqueHints(hints);
}

function scoreProfile(text, hints) {
  const haystack = ` ${normalize(text)} `;
  let score = 0;
  const matched = [];
  for (const item of hints) {
    const needle = ` ${item.value} `;
    if (haystack.includes(needle)) {
      score += item.weight;
      matched.push({ value: item.value, kind: item.kind, weight: item.weight });
    }
  }
  return { score, matched };
}

function isClearWinner(candidates) {
  if (!candidates.length) return false;
  const [winner, runnerUp] = candidates;
  if (winner.score < 7) return false;
  const hasStrongSignal = winner.matched.some((match) => match.weight >= 5);
  if (!hasStrongSignal) return false;
  if (!runnerUp) return true;
  return winner.score - runnerUp.score >= 3 && winner.score >= runnerUp.score * 1.5;
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

  if (!isClearWinner(candidates)) return null;
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
