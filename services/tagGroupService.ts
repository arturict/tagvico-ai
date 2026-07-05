type TagGroup = { id: string; name: string; preset?: boolean; permanent?: boolean; enabled: boolean; tags: string[] };

const PRESETS: Array<Omit<TagGroup, 'enabled'>> = [
  { id: 'finance', name: 'Finance', preset: true, tags: ['Invoice', 'Receipt', 'Bank Statement', 'Tax', 'Payment', 'Budget'] },
  { id: 'legal-contracts', name: 'Legal & Contracts', preset: true, tags: ['Contract', 'Agreement', 'Legal Notice', 'Terms', 'Power of Attorney'] },
  { id: 'home-utilities', name: 'Home & Utilities', preset: true, tags: ['Rent', 'Utilities', 'Maintenance', 'Warranty', 'Property'] },
  { id: 'insurance', name: 'Insurance', preset: true, tags: ['Insurance Policy', 'Claim', 'Premium Notice', 'Coverage', 'Insurance Correspondence'] },
  { id: 'health', name: 'Health', preset: true, tags: ['Medical Report', 'Prescription', 'Lab Result', 'Appointment', 'Health Insurance'] },
  { id: 'work-employment', name: 'Work & Employment', preset: true, tags: ['Employment Contract', 'Payslip', 'Expense Report', 'Work Certificate', 'HR Correspondence'] },
  { id: 'education', name: 'Education', preset: true, tags: ['Certificate', 'Transcript', 'Course', 'Exam', 'School Correspondence'] },
  { id: 'identity-government', name: 'Identity & Government', preset: true, tags: ['Identity Document', 'Government Notice', 'Civil Record', 'Permit', 'Travel Document'] },
  { id: 'action-workflow', name: 'Action & Workflow', preset: true, tags: ['Action Required', 'To Pay', 'To Review', 'Deadline', 'Reference'] },
  { id: 'other', name: 'Other', permanent: true, tags: [] }
];

function normalizeTag(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function cleanTags(tags: unknown): string[] {
  const seen = new Set<string>();
  return (Array.isArray(tags) ? tags : []).map((tag) => String(tag || '').trim().replace(/\s+/g, ' ')).filter((tag) => {
    const key = normalizeTag(tag);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function defaults(): TagGroup[] {
  return PRESETS.map((group) => ({ ...group, enabled: false, tags: [...group.tags] }));
}

function parseGroups(value: unknown): TagGroup[] {
  let supplied: any[] = [];
  try { supplied = Array.isArray(value) ? value : JSON.parse(String(value || '[]')); } catch { supplied = []; }
  const byId = new Map(supplied.filter(Boolean).map((group) => [String(group.id || ''), group]));
  const groups = defaults().map((base) => {
    const override = byId.get(base.id);
    if (!override) return base;
    return { ...base, enabled: Boolean(override.enabled), tags: cleanTags(override.tags) };
  });
  for (const group of supplied) {
    const id = String(group?.id || '').trim();
    if (!id || byId.has(id) && PRESETS.some((preset) => preset.id === id)) continue;
    const name = String(group?.name || '').trim();
    if (!name) continue;
    groups.push({ id, name, enabled: Boolean(group.enabled), tags: cleanTags(group.tags) });
  }
  return groups;
}

function flattenVocabulary(groups: TagGroup[]): string[] {
  const vocabulary = new Map<string, string>();
  for (const group of groups.filter((item) => item.enabled)) {
    for (const tag of cleanTags(group.tags)) if (!vocabulary.has(normalizeTag(tag))) vocabulary.set(normalizeTag(tag), tag);
  }
  return [...vocabulary.values()];
}

function getConfig(env: Record<string, any> = process.env) {
  const groups = parseGroups(env.TAG_GROUPS_JSON);
  const maximum = Math.min(10, Math.max(1, Number.parseInt(String(env.TAG_MAX_PER_DOCUMENT || '3'), 10) || 3));
  return { enabled: String(env.CONTROLLED_TAGGING_ENABLED || 'no') === 'yes', maximum, groups, vocabulary: flattenVocabulary(groups) };
}

function enforceSuggestions(suggestions: unknown, env: Record<string, any> = process.env) {
  const policy = getConfig(env);
  const unknown: string[] = [];
  if (!policy.enabled) return { valid: cleanTags(suggestions), unknown, policy };
  const canonical = new Map(policy.vocabulary.map((tag) => [normalizeTag(tag), tag]));
  const valid: string[] = [];
  const seen = new Set<string>();
  for (const suggestion of cleanTags(suggestions)) {
    const key = normalizeTag(suggestion);
    if (seen.has(key)) continue;
    seen.add(key);
    const match = canonical.get(key);
    if (match && valid.length < policy.maximum) valid.push(match);
    else if (!match) unknown.push(suggestion);
  }
  return { valid, unknown, policy };
}

function promptContract(env: Record<string, any> = process.env): string {
  const policy = getConfig(env);
  if (!policy.enabled) return '';
  return `CONTROLLED TAGGING: Return at most ${policy.maximum} tags. Use only exact, case-sensitive names from this JSON vocabulary: ${JSON.stringify(policy.vocabulary)}. Never translate, alter, or invent a tag.`;
}

export = { PRESETS, defaults, parseGroups, cleanTags, normalizeTag, flattenVocabulary, getConfig, enforceSuggestions, promptContract };
