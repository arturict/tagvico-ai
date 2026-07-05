#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const excludedDirectories = new Set(['.git', 'dist', 'node_modules']);
const allowedFiles = new Map([
  ['CHANGELOG.md', /archivista/i],
  ['README.md', /`ARCHIVISTA_\*`/],
  ['Dockerfile', /ARCHIVISTA_AI_PORT/],
  ['docker-compose.yml', /ARCHIVISTA_AI_HOST_PORT/],
  ['config/config.ts', /resolveEnv\('TAGVICO_AI_VERSION', 'ARCHIVISTA_AI_VERSION'\)/],
  ['services/configHelpers.ts', /resolveEnv\('TAGVICO_AI_VERSION', 'ARCHIVISTA_AI_VERSION'/],
  ['server.ts', /resolveEnv\('TAGVICO_AI_PORT', 'ARCHIVISTA_AI_PORT'\)/],
  ['routes/setup.ts', /resolveEnv\('TAGVICO_AI_(?:PORT|INITIAL_SETUP)', 'ARCHIVISTA_AI_(?:PORT|INITIAL_SETUP)'\)/],
  ['tests/env-compatibility.test.js', /(?:TEST_)?ARCHIVISTA_/]
]);

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (excludedDirectories.has(entry.name)) return [];
    const fullPath = path.join(directory, entry.name);
    if (fullPath === __filename) return [];
    if (entry.isDirectory()) return collectFiles(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}

const violations = [];
for (const file of collectFiles(root)) {
  const relative = path.relative(root, file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!/archivista/i.test(line)) return;
    const allowed = allowedFiles.get(relative);
    if (!allowed || !allowed.test(line)) violations.push(`${relative}:${index + 1}`);
  });
}

if (violations.length > 0) {
  console.error(`Unexpected legacy Archivista references:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Legacy Archivista references are limited to documented compatibility fallbacks.');
}
