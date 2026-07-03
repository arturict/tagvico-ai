// @ts-nocheck — legacy module; tracked for strict typing.
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TERMINAL = new Set(['completed', 'failed', 'expired', 'cancelled']);

class OpenAIBatchService {
  constructor() {
    this.pending = [];
    this.timer = null;
  }

  enqueue(client, body) {
    return new Promise((resolve, reject) => {
      this.pending.push({ client, body, resolve, reject, customId: `doc-${crypto.randomUUID()}` });
      if (!this.timer) this.timer = setTimeout(() => this.flush(), 100);
    });
  }

  async flush() {
    const items = this.pending.splice(0);
    this.timer = null;
    if (!items.length) return;

    const client = items[0].client;
    const tempPath = path.join(os.tmpdir(), `archivista-batch-${crypto.randomUUID()}.jsonl`);
    try {
      const jsonl = items.map(({ customId, body }) => JSON.stringify({
        custom_id: customId,
        method: 'POST',
        url: '/v1/chat/completions',
        body
      })).join('\n');
      await fsp.writeFile(tempPath, `${jsonl}\n`, { mode: 0o600 });
      const input = await client.files.create({ file: fs.createReadStream(tempPath), purpose: 'batch' });
      let batch = await client.batches.create({
        input_file_id: input.id,
        endpoint: '/v1/chat/completions',
        completion_window: '24h',
        metadata: { application: 'archivista-ai' }
      });

      const pollMs = Math.max(1000, Number(process.env.BATCH_POLL_INTERVAL_MS || 30000));
      while (!TERMINAL.has(batch.status)) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
        batch = await client.batches.retrieve(batch.id);
      }
      if (batch.status !== 'completed' || !batch.output_file_id) {
        throw new Error(`OpenAI batch ${batch.id} ended with status ${batch.status}`);
      }

      const output = await client.files.content(batch.output_file_id);
      const lines = (await output.text()).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
      const byId = new Map(lines.map((line) => [line.custom_id, line]));
      for (const item of items) {
        const line = byId.get(item.customId);
        if (!line || line.error || line.response?.status_code >= 400) {
          item.reject(new Error(line?.error?.message || `No successful result for ${item.customId}`));
        } else {
          item.resolve(line.response.body);
        }
      }
    } catch (error) {
      items.forEach((item) => item.reject(error));
    } finally {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
    }
  }
}

module.exports = new OpenAIBatchService();
