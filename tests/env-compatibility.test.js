const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const compiledPath = path.join(__dirname, '../dist/services/configHelpers.js');
if (!fs.existsSync(compiledPath)) {
  require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
    module._compile(output, filename);
  };
}
const { resolveEnv } = require(fs.existsSync(compiledPath) ? compiledPath : '../services/configHelpers.ts');

test('resolveEnv prefers the canonical environment variable without warning', () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    const value = resolveEnv('TEST_TAGVICO_PORT_CANONICAL', 'TEST_ARCHIVISTA_PORT_CANONICAL', {
      TEST_TAGVICO_PORT_CANONICAL: '4100',
      TEST_ARCHIVISTA_PORT_CANONICAL: '3100'
    });
    assert.equal(value, '4100');
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = originalWarn;
  }
});

test('resolveEnv supports a legacy fallback and emits its deprecation warning once', () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    const env = { TEST_ARCHIVISTA_PORT_FALLBACK: '3200' };
    assert.equal(resolveEnv('TEST_TAGVICO_PORT_FALLBACK', 'TEST_ARCHIVISTA_PORT_FALLBACK', env), '3200');
    assert.equal(resolveEnv('TEST_TAGVICO_PORT_FALLBACK', 'TEST_ARCHIVISTA_PORT_FALLBACK', env), '3200');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /TEST_ARCHIVISTA_PORT_FALLBACK is deprecated/);
    assert.match(warnings[0], /TEST_TAGVICO_PORT_FALLBACK/);
  } finally {
    console.warn = originalWarn;
  }
});

test('resolveEnv returns undefined when neither environment variable is set', () => {
  assert.equal(resolveEnv('TEST_TAGVICO_PORT_MISSING', 'TEST_ARCHIVISTA_PORT_MISSING', {}), undefined);
});
