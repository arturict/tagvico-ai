const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
  });
}

const isClient = (source) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(source);

function resolveImport(from, specifier) {
  const base = specifier.startsWith('@/') ? path.join(src, specifier.slice(2))
    : specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// On 2026-10-01 the app layout (a server component) called a helper exported from a 'use client'
// module; Next refuses that at runtime and every signed-in page failed, while typecheck and unit
// tests passed. Server code may render client components (Capitalised exports) but must not call
// their plain functions or read their constants.
test('server modules do not call functions exported from client modules', () => {
  const offenders = [];
  for (const file of files(src)) {
    const source = fs.readFileSync(file, 'utf8');
    if (isClient(source)) continue;
    for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
      if (/^import\s+type/.test(match[0])) continue;
      const target = resolveImport(file, match[2]);
      if (!target || !isClient(fs.readFileSync(target, 'utf8'))) continue;
      const names = match[1].split(',').map((part) => part.trim()).filter((part) => part && !part.startsWith('type '))
        .map((part) => part.split(/\s+as\s+/).pop().trim());
      for (const name of names) {
        if (/^[a-z]/.test(name) && !/^use[A-Z]/.test(name)) offenders.push(`${path.relative(root, file)} imports ${name} from ${path.relative(root, target)}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
