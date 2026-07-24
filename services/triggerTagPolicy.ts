type Environment = Record<string, unknown>;

function parseTags(value: unknown): string[] {
  const seen = new Set<string>();
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase('en-US');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function requested(env: Environment = process.env): boolean {
  return ['yes', 'true', '1', 'on'].includes(
    String(env.PROCESS_PREDEFINED_DOCUMENTS || '').trim().toLowerCase()
  );
}

function getPolicy(env: Environment = process.env) {
  const tags = parseTags(env.TAGS);
  const filterRequested = requested(env);
  return {
    tags,
    filterRequested,
    filterActive: filterRequested && tags.length > 0,
    fellBackToAllDocuments: filterRequested && tags.length === 0
  };
}

export = { getPolicy, parseTags };
