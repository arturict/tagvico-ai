import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

type LoginState = { loginId: string; completed: boolean; cancelled?: boolean; output: string; error?: string; startedAt: string };
const appConfig = { codex: { home: process.env.CODEX_HOME || 'data/codex', model: process.env.CODEX_MODEL || 'gpt-5.4-mini' } };
const ANSI = /\u001b\[[0-9;]*m/g;

function command() {
  const explicit = process.env.CODEX_BINARY;
  if (explicit) return { file: explicit, prefix: [] as string[] };
  if (process.platform === 'win32') return { file: process.env.ComSpec || 'cmd.exe', prefix: ['/d', '/s', '/c', 'codex'] };
  return { file: 'codex', prefix: [] as string[] };
}

class CodexAuthService {
  private logins = new Map<string, LoginState & { child?: ReturnType<typeof spawn> }>();
  private environment() { fs.mkdirSync(/*turbopackIgnore: true*/ appConfig.codex.home, { recursive: true, mode: 0o700 }); return { ...process.env, CODEX_HOME: appConfig.codex.home }; }
  private run(args: string[], timeout = 20_000) {
    const executable = command();
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(executable.file, [...executable.prefix, ...args], { env: this.environment(), timeout, windowsHide: true }, (error, stdout, stderr) => error ? reject(new Error(String(stderr || stdout || error.message).replace(ANSI, '').trim())) : resolve({ stdout: String(stdout).replace(ANSI, ''), stderr: String(stderr).replace(ANSI, '') }));
    });
  }
  async account() {
    try { const result = await this.run(['login', 'status']); const loggedIn = /logged in using chatgpt/i.test(`${result.stdout}\n${result.stderr}`); return { account: loggedIn ? { type: 'chatgpt', planType: null } : null, source: 'codex login status' }; }
    catch { return { account: null, source: 'codex login status' }; }
  }
  normalizeModels(result: unknown) {
    const payload = result && typeof result === 'object' ? result as Record<string, unknown> : {};
    const entries = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
    return entries.filter((model): model is Record<string, unknown> => Boolean(model) && typeof model === 'object')
      .filter((model) => model.hidden !== true && Boolean(model.id || model.model))
      .map((model) => ({
        id: String(model.id || model.model), name: String(model.displayName || model.name || model.id || model.model),
        isDefault: model.isDefault === true || model.default === true,
        reasoningEfforts: Array.isArray(model.supportedReasoningEfforts) ? model.supportedReasoningEfforts.map((effort) => {
          const item = effort && typeof effort === 'object' ? effort as Record<string, unknown> : {};
          return { id: String(item.reasoningEffort || item.id || effort), description: String(item.description || '') };
        }) : []
      }));
  }
  async models() { return [{ id: appConfig.codex.model, name: appConfig.codex.model, isDefault: true, reasoningEfforts: [] }]; }
  async login(_type: 'chatgpt' | 'chatgptDeviceCode') {
    const active = Array.from(this.logins.values()).find((entry) => !entry.completed);
    if (active) return this.view(active);
    const loginId = crypto.randomUUID(); const executable = command();
    const state: LoginState & { child?: ReturnType<typeof spawn> } = { loginId, completed: false, output: '', startedAt: new Date().toISOString() };
    const child = spawn(executable.file, [...executable.prefix, 'login', '--device-auth'], { env: this.environment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    state.child = child; this.logins.set(loginId, state);
    const append = (chunk: unknown) => { state.output = `${state.output}${String(chunk).replace(ANSI, '')}`.slice(-12_000); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.once('error', (error) => { state.error = error.message; state.completed = true; delete state.child; });
    child.once('exit', (code, signal) => { if (code !== 0 && !state.cancelled) state.error = `Codex login exited (${code ?? signal ?? 'unknown'})`; state.completed = true; delete state.child; });
    return this.view(state);
  }
  private view(state: LoginState) { return { loginId: state.loginId, completed: state.completed, cancelled: state.cancelled || false, output: state.output, error: state.error || null, startedAt: state.startedAt }; }
  loginStatus(loginId: string) { const state = this.logins.get(loginId); return state ? this.view(state) : null; }
  async cancel(loginId: string) { const state = this.logins.get(loginId); if (!state) return { success: false }; state.cancelled = true; state.completed = true; state.child?.kill('SIGTERM'); delete state.child; return { success: true, ...this.view(state) }; }
  async logout() { await this.run(['logout']); this.logins.clear(); return { success: true }; }
}

const codexAuthService = new CodexAuthService();
export default codexAuthService;
module.exports = codexAuthService;
