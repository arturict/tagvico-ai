const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TERMINAL = new Set(['completed', 'failed', 'expired', 'cancelled']);
type BatchClient = { files: { create(input: unknown): Promise<{ id: string }>; content(id: string): Promise<{ text(): Promise<string> }> }; batches: { create(input: unknown): Promise<{ id: string; status: string; output_file_id?: string }>; retrieve(id: string): Promise<{ id: string; status: string; output_file_id?: string }> } };
type BatchItem = { client: BatchClient; body: unknown; resolve: (value: unknown) => void; reject: (reason?: unknown) => void; customId: string };
type BatchOutput = { custom_id: string; error?: { message?: string }; response?: { status_code: number; body: unknown } };

class OpenAIBatchService {
  pending: BatchItem[];
  timer: NodeJS.Timeout | null;
  constructor() {
    this.pending = [] as BatchItem[];
    this.timer = null as NodeJS.Timeout | null;
  }

  enqueue(client: BatchClient, body: unknown): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      this.pending.push({ client, body, resolve, reject, customId: `doc-${crypto.randomUUID()}` });
      if (!this.timer) this.timer = setTimeout(() => this.flush(), 100);
    });
  }

  async flush() {
    const items = this.pending.splice(0);
    this.timer = null;
    if (!items.length) return;

    const client = items[0].client;
    const tempPath = path.join(os.tmpdir(), `tagvico-batch-${crypto.randomUUID()}.jsonl`);
    try {
      const jsonl = items.map(({ customId, body }: BatchItem) => JSON.stringify({
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
        metadata: { application: 'tagvico-ai' }
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
      const lines = (await output.text()).trim().split(/\r?\n/).filter(Boolean).map((line: string) => JSON.parse(line) as BatchOutput);
      const byId = new Map(lines.map((line: BatchOutput) => [line.custom_id, line]));
      for (const item of items) {
        const line = byId.get(item.customId);
        if (!line || line.error || !line.response || line.response.status_code >= 400) {
          item.reject(new Error(line?.error?.message || `No successful result for ${item.customId}`));
        } else {
          item.resolve(line.response.body);
        }
      }
    } catch (error) {
      items.forEach((item: BatchItem) => item.reject(error));
    } finally {
      await fsp.rm(tempPath, { force: true }).catch(() => {});
    }
  }
}

module.exports = new OpenAIBatchService();
