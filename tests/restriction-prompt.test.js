const test = require('node:test');
const assert = require('node:assert/strict');
const RestrictionPromptService = require('../dist/services/restrictionPromptService');

test('restriction prompt replaces tag and correspondent placeholders', () => {
  const result = RestrictionPromptService.processRestrictionsInPrompt(
    'Tags: %RESTRICTED_TAGS%\nCorrespondents: %RESTRICTED_CORRESPONDENTS%',
    [{ name: 'invoice' }, { name: 'receipt' }], ['ACME Corp', 'Tax Office'], {}
  );
  assert.match(result, /Tags: invoice, receipt/);
  assert.match(result, /Correspondents: ACME Corp, Tax Office/);
  assert.doesNotMatch(result, /%RESTRICTED_/);
});

test('restriction prompt handles missing placeholders and empty data', () => {
  assert.match(RestrictionPromptService.processRestrictionsInPrompt('Analyze this.', [], [], {}), /^Analyze this\./);
  assert.match(RestrictionPromptService.processRestrictionsInPrompt('Tags: %RESTRICTED_TAGS%', [], [], {}), /^Tags: /);
});
