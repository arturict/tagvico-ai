// services/documentsService.js
// eslint-disable-next-line @typescript-eslint/no-require-imports
const paperlessService = require('./paperlessService');

interface NamedEntity { id: number; name: string }
interface DocumentSummary { created: string | number | Date }

class DocumentsService {
  tagCache: Map<number, string>;
  correspondentCache: Map<number, string>;
  constructor() {
    this.tagCache = new Map();
    this.correspondentCache = new Map();
  }

  async getTagNames() {
    if (this.tagCache.size === 0) {
      const tags = await paperlessService.getTags();
      tags.forEach((tag: NamedEntity) => {
        this.tagCache.set(tag.id, tag.name);
      });
    }
    return Object.fromEntries(this.tagCache);
  }

  async getCorrespondentNames() {
    if (this.correspondentCache.size === 0) {
      const correspondents = await paperlessService.listCorrespondentsNames();
      correspondents.forEach((corr: NamedEntity) => {
        this.correspondentCache.set(corr.id, corr.name);
      });
    }
    return Object.fromEntries(this.correspondentCache);
  }

  async getDocumentsWithMetadata() {
    const [documents, tagNames, correspondentNames] = await Promise.all([
      paperlessService.getDocuments(),
      this.getTagNames(),
      this.getCorrespondentNames()
    ]);

    // Sort documents by created date (newest first)
    documents.sort((a: DocumentSummary, b: DocumentSummary) =>
      new Date(b.created).getTime() - new Date(a.created).getTime());

    return {
      documents,
      tagNames,
      correspondentNames,
      paperlessUrl: (process.env.PAPERLESS_API_URL ?? '').replace('/api', '')
    };
  }
}

module.exports = new DocumentsService();
