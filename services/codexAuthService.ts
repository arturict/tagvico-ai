import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import config = require('../config/config');

type Pending = { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout };
type CodexModel = {
  id: string;
  name: string;
  isDefault: boolean;
  reasoningEfforts: Array<{ id: string; description: string }>;
};

class CodexAuthService {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private logins = new Map<string, any>();
  private nextId = 1;
  private starting: Promise<void> | null = null;

  private async start() {
    if (this.process && !this.process.killed) return;
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve, reject) => {
      const executable = process.env.CODEX_BINARY || path.join(process.cwd(), 'node_modules', '.bin', 'codex');
      fs.mkdirSync((config as any).codex.home, { recursive: true, mode: 0o700 });
      const child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
        env: { ...process.env, CODEX_HOME: (config as any).codex.home }, stdio: ['pipe', 'pipe', 'pipe']
      });
      this.process = child;
      readline.createInterface({ input: child.stdout }).on('line', (line) => this.receive(line));
      child.stderr.on('data', (chunk) => console.warn(`[codex app-server] ${String(chunk).trim()}`));
      child.once('error', reject);
      child.once('exit', (code) => this.failAll(new Error(`Codex app-server exited (${code ?? 'signal'})`)));
      this.rawRequest('initialize', {
        clientInfo: { name: 'tagvico_ai', title: 'Tagvico AI', version: require(path.join(process.cwd(), 'package.json')).version }
      }, 15_000).then(() => {
        child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`); resolve();
      }, reject);
    }).finally(() => { this.starting = null; });
    return this.starting;
  }

  private receive(line: string) {
    let message: any;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined) {
      const pending = this.pending.get(Number(message.id));
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(Number(message.id));
      if (message.error) pending.reject(new Error(message.error.message || 'Codex request failed'));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === 'account/login/completed') {
      const event = message.params || {};
      if (event.loginId) this.logins.set(event.loginId, { ...this.logins.get(event.loginId), ...event, completed: true });
    }
  }

  private rawRequest(method: string, params: any = {}, timeoutMs = 30_000) {
    if (!this.process) return Promise.reject(new Error('Codex app-server is not running'));
    const id = this.nextId++;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex request timed out: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.process!.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private async request(method: string, params: any = {}, timeoutMs?: number) {
    await this.start(); return this.rawRequest(method, params, timeoutMs);
  }

  private failAll(error: Error) {
    this.process = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  async account() { return this.request('account/read', { refreshToken: false }); }
  normalizeModels(result: any): CodexModel[] {
    const entries = Array.isArray(result?.data) ? result.data : Array.isArray(result?.models) ? result.models : [];
    return entries
      .filter((model: any) => model && model.hidden !== true && (model.id || model.model))
      .map((model: any) => ({
        id: String(model.id || model.model),
        name: String(model.displayName || model.name || model.id || model.model),
        isDefault: model.isDefault === true || model.default === true,
        reasoningEfforts: Array.isArray(model.supportedReasoningEfforts)
          ? model.supportedReasoningEfforts.map((effort: any) => ({
            id: String(effort.reasoningEffort || effort.id || effort),
            description: String(effort.description || '')
          }))
          : []
      }));
  }
  async models(): Promise<CodexModel[]> {
    return this.normalizeModels(await this.request('model/list', { limit: 100 }));
  }
  async login(type: 'chatgpt' | 'chatgptDeviceCode') {
    const result = await this.request('account/login/start', { type }, 30_000);
    if (result.loginId) this.logins.set(result.loginId, { ...result, completed: false });
    return result;
  }
  loginStatus(loginId: string) { return this.logins.get(loginId) || null; }
  async cancel(loginId: string) { const result = await this.request('account/login/cancel', { loginId }); this.logins.delete(loginId); return result; }
  async logout() { const result = await this.request('account/logout'); this.logins.clear(); return result; }
}

export = new CodexAuthService();
