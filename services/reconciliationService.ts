const paperlessService = require('./paperlessService');
const documentModel = require('../models/document');

async function preview() {
  const [remoteIds, localIds] = await Promise.all([
    paperlessService.getAllDocumentIdsUnfiltered(),
    documentModel.getTrackedDocumentIds()
  ]);
  const remote = new Set(remoteIds);
  return localIds.filter((id: number) => !remote.has(id));
}

async function run() {
  const stale = await preview();
  for (const documentId of stale) await documentModel.purgeLocalDocument(documentId);
  return { removed: stale.length, documentIds: stale };
}

export = { preview, run };
