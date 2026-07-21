import path from 'node:path';

export function resolveDataDirectory(): string {
  const configuredDirectory = process.env.TAGVICO_DATA_DIR?.trim();
  if (configuredDirectory) {
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), configuredDirectory);
  }

  const isolatedRoot = process.env.TAGVICO_BUILD_DATA_ROOT?.trim()
    || process.env.TAGVICO_TEST_DATA_ROOT?.trim();
  if (isolatedRoot) return path.resolve(isolatedRoot, String(process.pid));

  return path.resolve(/* turbopackIgnore: true */ process.cwd(), 'data');
}
