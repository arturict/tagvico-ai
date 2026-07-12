import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionsRoot = path.join(root, 'website', 'versions');
const docsSiteRoot = path.join(root, 'docs-site');
const vitepress = path.join(root, 'node_modules', 'vitepress', 'bin', 'vitepress.js');
const [command = 'build', requestedVersion] = process.argv.slice(2);
const docsOrigin = 'https://tagvico.arturf.ch/docs';
const pageDescriptions = {
  'index.md': 'What Tagvico AI does, its operating modes, and where to start.',
  'installation.md': 'Install v2 with Docker Compose or docker run and complete guided setup.',
  'upgrading.md': 'Back up, upgrade, validate, and roll back a v2 installation safely.',
  'removing.md': 'Remove the container, optionally delete local data, and revoke credentials.',
  'features.md': 'Review the dashboard, controlled tagging, review queue, history, OCR, and model discovery.',
  'paperless-ai-tagging.md': 'Compare Tagvico with built-in Paperless matching and evaluate local or hosted AI metadata safely.',
  'providers.md': 'Compare local, hosted, direct, compatible, and subscription-backed model providers.',
  'privacy.md': 'Understand data flow, secret storage, deployment boundaries, and screenshot policy.',
  'troubleshooting.md': 'Diagnose setup, connectivity, provider, processing, and upgrade problems.',
};

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

function generateLlmFiles(version, outputRoot, publicPath) {
  const sourceRoot = path.join(versionsRoot, version);
  const knownOrder = Object.keys(pageDescriptions);
  const pages = readdirSync(sourceRoot)
    .filter((file) => file.endsWith('.md'))
    .sort((a, b) => {
      const aIndex = knownOrder.indexOf(a);
      const bIndex = knownOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    })
    .map((file) => [file, pageDescriptions[file] || `Read the ${file.replace(/\.md$/, '').replaceAll('-', ' ')} guide.`]);
  const publicUrl = `${docsOrigin}${publicPath}`;
  const title = `Tagvico AI ${version.toUpperCase()} documentation`;
  const links = pages.map(([file, description]) => {
    const slug = file === 'index.md' ? 'index.html.md' : file;
    const source = readFileSync(path.join(sourceRoot, file), 'utf8');
    const heading = source.match(/^#\s+(.+)$/m)?.[1] || (file === 'index.md' ? 'Overview' : file);
    return `- [${heading}](${publicUrl}/${slug}): ${description}`;
  });

  const llms = [
    `# ${title}`,
    '',
    '> Official, versioned documentation for Tagvico AI, a self-hosted AI filing companion for Paperless-ngx.',
    '',
    `Use these instructions for ${version}. Do not mix commands or configuration with another major version. Tagvico reads Paperless OCR text and metadata; hosted model providers receive the content needed for classification. Start with Review first mode and pin an immutable container image tag.`,
    '',
    `## ${version.toUpperCase()} guide`,
    '',
    ...links,
    '',
    '## Optional',
    '',
    `- [Complete ${version.toUpperCase()} documentation](${publicUrl}/llms-full.txt): All guide pages combined into one Markdown document.`,
    '- [Source repository](https://github.com/arturict/tagvico-ai): Application source, releases, and issue tracker.',
    '- [Product website](https://tagvico.arturf.ch/): Tagvico AI landing page.',
    '',
  ].join('\n');

  const full = [
    `# ${title}`,
    '',
    '> Official documentation snapshot intended for language-model context. Follow the section matching the installed major version.',
    '',
    ...pages.flatMap(([file]) => {
      const source = readFileSync(path.join(sourceRoot, file), 'utf8').trim();
      return [`<!-- Source: ${publicUrl}/${file === 'index.md' ? 'index.html.md' : file} -->`, '', source, '', '---', ''];
    }),
  ].join('\n');

  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(path.join(outputRoot, 'llms.txt'), llms);
  writeFileSync(path.join(outputRoot, 'llms-full.txt'), full);
  for (const [file] of pages) {
    const source = readFileSync(path.join(sourceRoot, file));
    writeFileSync(path.join(outputRoot, file), source);
    if (file === 'index.md') writeFileSync(path.join(outputRoot, 'index.html.md'), source);
  }
}

if (command === 'build') {
  const allVersions = versions();
  const latest = requestedVersion || allVersions.at(-1);
  const archives = requestedVersion ? [requestedVersion] : allVersions;
  rmSync(docsSiteRoot, { recursive: true, force: true });
  runVitePress('build', latest, '/docs/', '../docs-site');
  generateLlmFiles(latest, docsSiteRoot, '');
  for (const version of archives) {
    runVitePress('build', version, `/docs/${version}/`, `../docs-site/${version}`);
    generateLlmFiles(version, path.join(docsSiteRoot, version), `/${version}`);
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
