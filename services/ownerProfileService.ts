interface PaperlessUser {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

interface OwnerHint {
  value: string;
  weight: number;
  kind: string;
}

interface OwnerCandidate {
  user: PaperlessUser;
  score: number;
  matched: OwnerHint[];
}

type ProfileMap = Map<string, string[]>;
type AnalysisValue = Record<string, unknown> & { document?: Record<string, unknown> };

function normalize(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9@._+-]+/g, ' ')
    .trim();
}

function tokenize(value: unknown): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((part) => part.length >= 3);
}

const GENERIC_USER_TOKENS = new Set([
  'admin',
  'user',
  'paperless',
  'tagvico',
  'scanner',
  'service',
  'system'
]);

function parseProfileLines(rawProfiles = ''): ProfileMap {
  const map: ProfileMap = new Map();
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

function uniqueHints(hints: OwnerHint[]): OwnerHint[] {
  const seen = new Set<string>();
  return hints.filter((hint) => {
    if (!hint.value || seen.has(hint.value)) return false;
    seen.add(hint.value);
    return true;
  });
}

function hint(value: unknown, weight: number, kind: string): OwnerHint | null {
  const normalized = normalize(value);
  if (normalized.length < 3) return null;
  return { value: normalized, weight, kind };
}

function userHints(user: PaperlessUser, profileMap: ProfileMap): OwnerHint[] {
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
  ].filter((item): item is OwnerHint => item !== null);

  return uniqueHints(hints);
}

function scoreProfile(text: string, hints: OwnerHint[]): { score: number; matched: OwnerHint[] } {
  const haystack = ` ${normalize(text)} `;
  let score = 0;
  const matched: OwnerHint[] = [];
  for (const item of hints) {
    const needle = ` ${item.value} `;
    if (haystack.includes(needle)) {
      score += item.weight;
      matched.push({ value: item.value, kind: item.kind, weight: item.weight });
    }
  }
  return { score, matched };
}

function isClearWinner(candidates: OwnerCandidate[]): boolean {
  if (!candidates.length) return false;
  const [winner, runnerUp] = candidates;
  if (winner.score < 7) return false;
  const hasStrongSignal = winner.matched.some((match) => match.weight >= 5);
  if (!hasStrongSignal) return false;
  if (!runnerUp) return true;
  return winner.score - runnerUp.score >= 3 && winner.score >= runnerUp.score * 1.5;
}

function buildContext(
  content: string,
  analysis: AnalysisValue = {},
  doc: Record<string, unknown> = {}
): string {
  const analyzed = analysis.document || analysis;
  return [
    doc.title,
    analyzed.title,
    analyzed.correspondent,
    analyzed.document_type,
    Array.isArray(analyzed.tags) ? analyzed.tags.join(' ') : '',
    content
  ].filter(Boolean).join('\n');
}

function findOwnerMatch({
  content = '',
  analysis = {},
  doc = {},
  users = [],
  rawProfiles = ''
}: {
  content?: string;
  analysis?: AnalysisValue;
  doc?: Record<string, unknown>;
  users?: PaperlessUser[];
  rawProfiles?: string;
}) {
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
