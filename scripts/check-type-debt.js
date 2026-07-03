#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourceRoots = ['config', 'models', 'routes', 'services'];
const topLevelSources = ['schemas.ts', 'server.ts', 'swagger.ts'];
const allowedSuppressions = 22;

function collectTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

const files = [
  ...sourceRoots.flatMap((directory) => collectTypeScriptFiles(path.join(root, directory))),
  ...topLevelSources.map((file) => path.join(root, file)),
];

const suppressed = files
  .filter((file) => fs.readFileSync(file, 'utf8').includes('@ts-nocheck'))
  .map((file) => path.relative(root, file))
  .sort();

console.log(`Strictly checked modules: ${files.length - suppressed.length}/${files.length}`);
console.log(`Legacy @ts-nocheck modules: ${suppressed.length}/${allowedSuppressions} allowed`);

if (suppressed.length > allowedSuppressions) {
  console.error('Type debt increased. New @ts-nocheck directives are not allowed.');
  process.exitCode = 1;
}
