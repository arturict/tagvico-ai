const tagGroups = require('./tagGroupService');
const exceptions = require('./tagExceptionService');
const paperlessService = require('./paperlessService');

async function processSuggestions(documentId: number, suggestions: unknown) {
  const result = tagGroups.enforceSuggestions(suggestions);
  if (!result.policy.enabled) return paperlessService.processTags(result.valid);
  exceptions.enqueue(documentId, result.unknown);
  const processed = await paperlessService.processTags(result.valid, { restrictToExistingTags: true });
  exceptions.recordAssignments(documentId, result.valid, processed.tagIds);
  return { ...processed, unknown: result.unknown };
}

export = { processSuggestions };
