import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionsRoot = path.join(root, 'website', 'versions');
const docsSiteRoot = path.join(root, 'docs-site');
const vitepress = path.join(root, 'node_modules', 'vitepress', 'bin', 'vitepress.js');
const [command = 'build', requestedVersion] = process.argv.slice(2);

function versions() {
  return readdirSync(versionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

function runVitePress(action, version, base, outDir) {
  const result = spawnSync(process.execPath, [vitepress, action, 'website'], {
    cwd: root,
    env: {
      ...process.env,
      TAGVICO_DOCS_VERSION: version,
      TAGVICO_DOCS_BASE: base,
      TAGVICO_DOCS_OUT_DIR: outDir,
    },
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (command === 'build') {
  const allVersions = versions();
  const latest = requestedVersion || allVersions.at(-1);
  const archives = requestedVersion ? [requestedVersion] : allVersions;
  rmSync(docsSiteRoot, { recursive: true, force: true });
  runVitePress('build', latest, '/docs/', '../docs-site');
  for (const version of archives) {
    runVitePress('build', version, `/docs/${version}/`, `../docs-site/${version}`);
  }
} else if (command === 'dev' || command === 'preview') {
  runVitePress(command, requestedVersion || versions().at(-1), '/docs/', '../docs-site');
} else if (command === 'new-major') {
  const major = Number(requestedVersion);
  if (!Number.isInteger(major) || major < 2) {
    console.error('Usage: npm run docs:new-major -- <major-number>');
    process.exit(1);
  }
  const target = `v${major}`;
  const targetPath = path.join(versionsRoot, target);
  if (existsSync(targetPath)) {
    console.error(`${target} documentation already exists.`);
    process.exit(1);
  }
  const source = versions().filter((item) => Number(item.slice(1)) < major).at(-1);
  if (!source) {
    console.error('No earlier major documentation is available to snapshot.');
    process.exit(1);
  }
  mkdirSync(versionsRoot, { recursive: true });
  cpSync(path.join(versionsRoot, source), targetPath, { recursive: true });
  console.log(`Created ${target} from ${source}. Update it, then run npm run docs:build.`);
} else {
  console.error(`Unknown documentation command: ${command}`);
  process.exit(1);
}
