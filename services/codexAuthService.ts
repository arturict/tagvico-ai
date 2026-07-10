import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import config = require('../config/config');

type CodexModel = {
  id: string;
  name: string;
  isDefault: boolean;
  reasoningEfforts: Array<{ id: string; description: string }>;
};
type JsonObject = Record<string, unknown>;
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout };
type RpcMessage = { id?: string | number; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };
type LoginState = JsonObject & { loginId: string; completed: boolean };
type LoginStartResult = JsonObject & { loginId?: string };
const appConfig = config as unknown as { codex: { home: string } };

class CodexAuthService {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private logins = new Map<string, LoginState>();
  private nextId = 1;
  private starting: Promise<void> | null = null;

  private async start() {
    if (this.process && !this.process.killed) return;
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve, reject) => {
      const executable = process.env.CODEX_BINARY || path.join(process.cwd(), 'node_modules', '.bin', 'codex');
      fs.mkdirSync(appConfig.codex.home, { recursive: true, mode: 0o700 });
      const child = spawn(executable, ['app-server', '--listen', 'stdio://'], {
        env: { ...process.env, CODEX_HOME: appConfig.codex.home }, stdio: ['pipe', 'pipe', 'pipe']
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
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { return; }
    if (!parsed || typeof parsed !== 'object') return;
    const message = parsed as RpcMessage;
    if (message.id !== undefined) {
      const pending = this.pending.get(Number(message.id));
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(Number(message.id));
      if (message.error) pending.reject(new Error(message.error.message || 'Codex request failed'));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === 'account/login/completed') {
      const event = message.params;
      if (event && typeof event === 'object' && 'loginId' in event && typeof event.loginId === 'string') {
        this.logins.set(event.loginId, { ...this.logins.get(event.loginId), ...event, loginId: event.loginId, completed: true });
      }
    }
  }

  private rawRequest<T = unknown>(method: string, params: JsonObject = {}, timeoutMs = 30_000): Promise<T> {
    if (!this.process) return Promise.reject(new Error('Codex app-server is not running'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex request timed out: ${method}`)); }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.process!.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  private async request<T = unknown>(method: string, params: JsonObject = {}, timeoutMs?: number): Promise<T> {
    await this.start(); return this.rawRequest<T>(method, params, timeoutMs);
  }

  private failAll(error: Error) {
    this.process = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  async account() { return this.request('account/read', { refreshToken: false }); }
  normalizeModels(result: unknown): CodexModel[] {
    const payload = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    const entries = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
    return entries
      .filter((model): model is Record<string, unknown> => Boolean(model) && typeof model === 'object')
      .filter((model) => model.hidden !== true && Boolean(model.id || model.model))
      .map((model) => ({
        id: String(model.id || model.model),
        name: String(model.displayName || model.name || model.id || model.model),
        isDefault: model.isDefault === true || model.default === true,
        reasoningEfforts: Array.isArray(model.supportedReasoningEfforts)
          ? model.supportedReasoningEfforts.map((effort) => {
            const item = effort && typeof effort === 'object' ? effort as Record<string, unknown> : {};
            return {
              id: String(item.reasoningEffort || item.id || effort),
              description: String(item.description || '')
            };
          })
          : []
      }));
  }
  async models(): Promise<CodexModel[]> {
    return this.normalizeModels(await this.request('model/list', { limit: 100 }));
  }
  async login(type: 'chatgpt' | 'chatgptDeviceCode') {
    const result = await this.request<LoginStartResult>('account/login/start', { type }, 30_000);
    if (result.loginId) this.logins.set(result.loginId, { ...result, loginId: result.loginId, completed: false });
    return result;
  }
  loginStatus(loginId: string) { return this.logins.get(loginId) || null; }
  async cancel(loginId: string) { const result = await this.request('account/login/cancel', { loginId }); this.logins.delete(loginId); return result; }
  async logout() { const result = await this.request('account/logout'); this.logins.clear(); return result; }
}

export = new CodexAuthService();
