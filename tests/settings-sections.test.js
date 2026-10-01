const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'components', 'settings', 'sections.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const sections = { exports: {} };
Function('module', 'exports', compiled)(sections, sections.exports);
const {
  settingsSectionIds,
  settingsSectionTitles,
  legacySettingsSections,
  legacyChannelAnchors,
  isSettingsSectionId
} = sections.exports;

test('Settings has six tabs and Channels is its own section', () => {
  assert.deepEqual(settingsSectionIds, ['paperless', 'providers', 'automation', 'channels', 'tags', 'people']);
  assert.deepEqual(
    settingsSectionIds.map((id) => settingsSectionTitles[id]),
    ['Paperless', 'AI models', 'Automation', 'Channels', 'Tags', 'People & security']
  );
  assert.equal(isSettingsSectionId('channels'), true);
  assert.equal(isSettingsSectionId('nonsense'), false);
});

test('old section URLs still resolve to a real section', () => {
  for (const [from, to] of Object.entries(legacySettingsSections)) {
    assert.equal(isSettingsSectionId(to), true, `${from} -> ${to}`);
    assert.equal(isSettingsSectionId(from), false, `${from} must not shadow a real section`);
  }
  assert.equal(legacySettingsSections.telegram, 'channels');
  assert.equal(legacySettingsSections.discord, 'channels');
  assert.equal(legacySettingsSections.ai, 'providers');
  // /settings/automation keeps opening Automation; only an old channel anchor moves on.
  assert.equal(Object.hasOwn(legacySettingsSections, 'automation'), false);
  assert.deepEqual([...legacyChannelAnchors].sort(), ['channels', 'discord', 'telegram']);
});
