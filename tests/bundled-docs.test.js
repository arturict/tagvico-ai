'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('the production image builds and verifies bundled versioned docs', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /apt-get install[\s\S]*\bgit\b/);
  assert.match(dockerfile, /npm run docs:build/);
  assert.match(dockerfile, /docs-site\/index\.html/);
  assert.match(dockerfile, /require\("\.\/package\.json"\)\.version\.split\("\."\)\[0\]/);
  assert.match(dockerfile, /"docs-site\/"\+major\+"\/index\.html"/);
});

test('the application serves bundled docs and aliases documentation locally', () => {
  const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  const nextConfig = fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8');

  assert.match(server, /app\.use\('\/docs', express\.static\(bundledDocsDirectory/);
  assert.match(server, /res\.sendFile\(path\.join\(bundledDocsDirectory, 'index\.html'\)\)/);
  assert.match(nextConfig, /source: '\/docs', destination: `\$\{backend\}\/docs`/);
  assert.match(nextConfig, /source: '\/docs\/:path\*'/);
  assert.match(nextConfig, /source: '\/documentation'/);
  assert.match(nextConfig, /destination: '\/docs'/);
  assert.doesNotMatch(nextConfig, /tagvico\.arturf\.ch\/docs/);
});

test('documentation navigation stays on the current Tagvico instance', () => {
  const docsConfig = fs.readFileSync(path.join(root, 'website', '.vitepress', 'config.mts'), 'utf8');
  const docsScript = fs.readFileSync(path.join(root, 'scripts', 'docs.mjs'), 'utf8');

  assert.match(docsConfig, /const versionLink = \(targetVersion: string\)/);
  assert.match(docsConfig, /link: versionLink\(item\)/);
  assert.match(docsConfig, /logo: '\/tagvico-icon\.png'/);
  assert.doesNotMatch(docsConfig, /tagvico\.arturf\.ch\/docs/);
  assert.match(docsScript, /TAGVICO_DOCS_ORIGIN/);
});

test('application and versioned docs use the same Tagvico favicon and metadata', () => {
  const favicon = fs.readFileSync(path.join(root, 'public', 'favicon.ico'));
  const appFavicon = fs.readFileSync(path.join(root, 'src', 'app', 'favicon.ico'));
  const staticDocsFavicon = fs.readFileSync(path.join(root, 'docs', 'favicon.ico'));
  const v2Favicon = fs.readFileSync(path.join(root, 'website', 'versions', 'v2', 'public', 'favicon.ico'));
  const v3Favicon = fs.readFileSync(path.join(root, 'website', 'versions', 'v3', 'public', 'favicon.ico'));
  const appLayout = fs.readFileSync(path.join(root, 'src', 'app', 'layout.tsx'), 'utf8');
  const legacyLayout = fs.readFileSync(path.join(root, 'views', 'layout.ejs'), 'utf8');

  assert.deepEqual(appFavicon, favicon);
  assert.deepEqual(staticDocsFavicon, favicon);
  assert.deepEqual(v2Favicon, favicon);
  assert.deepEqual(v3Favicon, favicon);
  assert.match(appLayout, /applicationName: 'Tagvico AI'/);
  assert.match(appLayout, /url: '\/tagvico-icon\.png'/);
  assert.match(legacyLayout, /<title>Tagvico AI<\/title>/);
  assert.doesNotMatch(legacyLayout, /Paperless Assistant/);
});
