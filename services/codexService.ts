// @ts-nocheck — migrated from JavaScript; types will be tightened incrementally.
const config = require('../config/config');
const confidenceGuard = require('./confidenceGuard');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

class CodexService {
  async analyzeDocument(content, existingTags = [], correspondents = [], documentTypes = []) {
    let workingDirectory;
    try {
      const { Codex } = await import('@openai/codex-sdk');
      const { OPENAI_API_KEY, CODEX_API_KEY, ...subscriptionEnvironment } = process.env;
      void OPENAI_API_KEY;
      void CODEX_API_KEY;
      workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'archivista-codex-'));
      const codex = new Codex({ env: subscriptionEnvironment });
      const thread = codex.startThread({
        model: config.codex.model,
        sandboxMode: 'read-only',
        approvalPolicy: 'never',
        workingDirectory,
        skipGitRepoCheck: true
      });
      const schema = {
        type: 'object',
        properties: {
          title: { type: 'string' }, correspondent: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
          document_type: { type: 'string' }, document_date: { type: 'string' }, language: { type: 'string' },
          owner: { type: ['string', 'null'] }, custom_fields: { type: 'object' }
        },
        required: ['title', 'correspondent', 'tags', 'document_type', 'document_date', 'language'],
        additionalProperties: true
      };
      const prompt = `${process.env.SYSTEM_PROMPT || ''}\n${config.mustHavePrompt}\nExisting tags: ${existingTags.join(', ')}\nExisting correspondents: ${correspondents.join(', ')}\nExisting document types: ${documentTypes.join(', ')}\nDocument OCR:\n${content}`;
      const result = await thread.run(prompt, { outputSchema: schema });
      const document = confidenceGuard.annotateHeldFields(JSON.parse(result.finalResponse));
      return { document, metrics: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, truncated: false };
    } catch (error) {
      return { document: { tags: [], correspondent: null }, metrics: null, error: `Codex provider: ${error.message}` };
    } finally {
      if (workingDirectory) await fs.rm(workingDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }
  reset() {}
}

module.exports = new CodexService();
