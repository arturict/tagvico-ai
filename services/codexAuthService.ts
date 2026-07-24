import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type LoginState = { loginId: string; completed: boolean; cancelled?: boolean; output: string; error?: string; startedAt: string };
const appConfig = { codex: { home: process.env.CODEX_HOME || 'data/codex', model: process.env.CODEX_MODEL || 'gpt-5.4-mini' } };
const ANSI = /\u001b\[[0-9;]*m/g;
const CHILD_ENVIRONMENT_KEYS = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'PATHEXT',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'TERM',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'CODEX_CA_CERTIFICATE'
] as const;

function command() {
  const explicit = process.env.CODEX_BINARY;
  if (explicit) return { file: explicit, prefix: [] as string[] };
  const bundledBinary = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    'node_modules',
    '@openai',
    'codex',
    'bin',
    'codex.js'
  );
  if (fs.existsSync(bundledBinary)) return { file: process.execPath, prefix: [bundledBinary] };
  // Keep the global binary fallback for development environments that
  // intentionally omit the bundled CLI package.
  if (process.platform === 'win32') return { file: process.env.ComSpec || 'cmd.exe', prefix: ['/d', '/s', '/c', 'codex'] };
  return { file: 'codex', prefix: [] as string[] };
}

class CodexAuthService {
  private logins = new Map<string, LoginState & { child?: ReturnType<typeof spawn> }>();
  environment() {
    fs.mkdirSync(/*turbopackIgnore: true*/ appConfig.codex.home, { recursive: true, mode: 0o700 });
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: process.env.NODE_ENV || 'production',
      CODEX_HOME: appConfig.codex.home
    };
    for (const key of CHILD_ENVIRONMENT_KEYS) {
      const value = process.env[key];
      if (value) environment[key] = value;
    }
    environment.PATH ||= process.platform === 'win32'
      ? 'C:\\Windows\\System32;C:\\Windows'
      : '/usr/local/bin:/usr/bin:/bin';
    return environment;
  }
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
  async models() {
    const executable = command();
    return new Promise<Array<{ id: string; name: string; isDefault: boolean; reasoningEfforts: Array<{ id: string; description: string }> }>>((resolve, reject) => {
      const child = spawn(executable.file, [...executable.prefix, 'app-server', '--stdio'], {
        env: this.environment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      let nextRequestId = 2;
      let settled = false;
      const collected: ReturnType<CodexAuthService['normalizeModels']> = [];
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        child.kill('SIGTERM');
        if (error) reject(error);
        else resolve(collected);
      };
      const requestPage = (cursor?: string | null) => {
        child.stdin.write(`${JSON.stringify({
          id: nextRequestId++, method: 'model/list', params: { includeHidden: false, limit: 100, cursor: cursor || null }
        })}\n`);
      };
      const timeout = setTimeout(() => finish(new Error('Codex model discovery timed out')), 20_000);
      child.once('error', (error) => finish(error));
      child.stderr.on('data', (chunk) => { stderr = `${stderr}${String(chunk).replace(ANSI, '')}`.slice(-4_000); });
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        let newline = stdout.indexOf('\n');
        while (newline >= 0) {
          const line = stdout.slice(0, newline).trim();
          stdout = stdout.slice(newline + 1);
          newline = stdout.indexOf('\n');
          if (!line) continue;
          try {
            const message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
            if (message.id === 1) {
              if (message.error) return finish(new Error(message.error.message || 'Codex app-server initialization failed'));
              requestPage();
            } else if (typeof message.id === 'number' && message.id >= 2) {
              if (message.error) return finish(new Error(message.error.message || 'Codex model discovery failed'));
              const result = message.result && typeof message.result === 'object' ? message.result as Record<string, unknown> : {};
              collected.push(...this.normalizeModels(result));
              const cursor = typeof result.nextCursor === 'string' ? result.nextCursor : null;
              if (cursor && collected.length < 500) requestPage(cursor);
              else finish();
            }
          } catch {
            // Ignore non-protocol log lines. The app-server contract is JSONL.
          }
        }
      });
      child.once('exit', (code, signal) => {
        if (!settled) finish(new Error(stderr.trim() || `Codex model discovery exited (${code ?? signal ?? 'unknown'})`));
      });
      child.stdin.write(`${JSON.stringify({
        id: 1,
        method: 'initialize',
        params: { clientInfo: { name: 'tagvico', title: 'Tagvico', version: '3.1.2' } }
      })}\n`);
    });
  }
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
