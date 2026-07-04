// @ts-nocheck — legacy module; tracked for strict typing.
const config = require('../config/config');
const confidenceGuard = require('./confidenceGuard');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

class CodexService {
  async getStatus() {
    const authPath = path.join(config.codex.home, 'auth.json');
    const authenticated = await fs.access(authPath).then(() => true).catch(() => false);
    return {
      provider: 'codex',
      experimental: true,
      authenticated,
      model: config.codex.model,
      codexHome: config.codex.home,
      message: authenticated
        ? 'A persisted Codex login is available.'
        : 'Run codex login --device-auth with CODEX_HOME set to the configured directory.'
    };
  }

  async analyzeDocument(content, existingTags = [], correspondents = [], documentTypes = []) {
    let workingDirectory;
    try {
      const { Codex } = await import('@openai/codex-sdk');
      await fs.mkdir(config.codex.home, { recursive: true, mode: 0o700 });
      const subscriptionEnvironment = {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: process.env.HOME || '/app',
        CODEX_HOME: config.codex.home,
        LANG: process.env.LANG || 'C.UTF-8',
        TMPDIR: process.env.TMPDIR || os.tmpdir(),
        ...(process.env.CODEX_CA_CERTIFICATE ? { CODEX_CA_CERTIFICATE: process.env.CODEX_CA_CERTIFICATE } : {}),
        ...(process.env.SSL_CERT_FILE ? { SSL_CERT_FILE: process.env.SSL_CERT_FILE } : {}),
        ...(process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY } : {}),
        ...(process.env.HTTP_PROXY ? { HTTP_PROXY: process.env.HTTP_PROXY } : {}),
        ...(process.env.NO_PROXY ? { NO_PROXY: process.env.NO_PROXY } : {})
      };
      workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tagvico-codex-'));
      const codex = new Codex({
        env: subscriptionEnvironment,
        config: {
          web_search: 'disabled',
          allow_login_shell: false,
          history: { persistence: 'none' },
          memories: { enabled: false },
          features: { shell_tool: false, hooks: false, skill_mcp_dependency_install: false }
        }
      });
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
          owner: { type: ['string', 'null'] }, custom_fields: { type: 'object' },
          confidence: {
            type: 'object',
            properties: {
              title: { type: 'number', minimum: 0, maximum: 1 },
              correspondent: { type: 'number', minimum: 0, maximum: 1 },
              tags: { type: 'number', minimum: 0, maximum: 1 },
              document_type: { type: 'number', minimum: 0, maximum: 1 },
              custom_fields: { type: 'number', minimum: 0, maximum: 1 },
              owner: { type: 'number', minimum: 0, maximum: 1 }
            },
            required: ['title', 'correspondent', 'tags', 'document_type', 'custom_fields', 'owner'],
            additionalProperties: false
          }
        },
        required: ['title', 'correspondent', 'tags', 'document_type', 'document_date', 'language', 'confidence'],
        additionalProperties: false
      };
      const prompt = `You are a document metadata extractor. Do not use tools. Analyze only the supplied OCR text and return the requested JSON.\n${process.env.SYSTEM_PROMPT || ''}\n${config.mustHavePrompt}\nExisting tags: ${existingTags.join(', ')}\nExisting correspondents: ${correspondents.join(', ')}\nExisting document types: ${documentTypes.join(', ')}\nDocument OCR:\n${content}`;
      const result = await Promise.race([
        thread.run(prompt, { outputSchema: schema }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Codex timed out after ${config.codex.timeoutMs} ms`)), config.codex.timeoutMs))
      ]);
      const document = confidenceGuard.annotateHeldFields(JSON.parse(result.finalResponse));
      const usage = result.usage || {};
      const promptTokens = usage.input_tokens || usage.inputTokens || 0;
      const completionTokens = usage.output_tokens || usage.outputTokens || 0;
      return { document, metrics: { promptTokens, completionTokens, totalTokens: usage.total_tokens || usage.totalTokens || promptTokens + completionTokens }, truncated: false };
    } catch (error) {
      return { document: { tags: [], correspondent: null }, metrics: null, error: `Codex provider: ${error.message}` };
    } finally {
      if (workingDirectory) await fs.rm(workingDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }
  reset() {}
}

module.exports = new CodexService();
