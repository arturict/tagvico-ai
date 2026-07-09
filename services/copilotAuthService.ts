import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const config = require('../config/config');

type Challenge = { verificationUrl: string; userCode: string };
type ChallengeWaiter = { resolve(value: LoginView): void; reject(error: Error): void; timer: NodeJS.Timeout };
type LoginState = {
  loginId: string;
  child: ChildProcessWithoutNullStreams;
  output: string;
  verificationUrl?: string;
  userCode?: string;
  completed: boolean;
  success?: boolean;
  error?: string;
  cancelled?: boolean;
  waiters: ChallengeWaiter[];
  expiryTimer: NodeJS.Timeout;
};
type LoginView = {
  loginId: string;
  verificationUrl?: string;
  userCode?: string;
  completed: boolean;
  success?: boolean;
  error?: string;
};

function publicState(state: LoginState): LoginView {
  return {
    loginId: state.loginId,
    verificationUrl: state.verificationUrl,
    userCode: state.userCode,
    completed: state.completed,
    success: state.success,
    error: state.error
  };
}

class CopilotAuthService {
  private logins = new Map<string, LoginState>();

  parseChallenge(output: string): Challenge | null {
    const clean = output.replace(/\u001b\[[0-9;]*m/g, ' ');
    const match = clean.match(/visit\s+(https:\/\/[^\s]+)\s+and enter code\s+([A-Z0-9-]+)/i);
    if (!match) return null;
    return {
      verificationUrl: match[1].replace(/[.,;]+$/, ''),
      userCode: match[2].toUpperCase()
    };
  }

  private resolveChallenge(state: LoginState, challenge: Challenge) {
    if (!state.userCode) {
      state.verificationUrl = challenge.verificationUrl;
      state.userCode = challenge.userCode;
    }
    const view = publicState(state);
    state.waiters.splice(0).forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve(view);
    });
  }

  private rejectWaiters(state: LoginState, error: Error) {
    state.waiters.splice(0).forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    });
  }

  private waitForChallenge(state: LoginState) {
    if (state.userCode) return Promise.resolve(publicState(state));
    if (state.completed) return Promise.reject(new Error(state.error || 'GitHub Copilot login did not return a device code'));
    return new Promise<LoginView>((resolve, reject) => {
      const waiter: ChallengeWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          state.waiters = state.waiters.filter((candidate) => candidate !== waiter);
          reject(new Error('GitHub Copilot did not return a device code in time'));
        }, 30_000)
      };
      state.waiters.push(waiter);
    });
  }

  async login(): Promise<LoginView> {
    const active = Array.from(this.logins.values()).find((state) => !state.completed);
    if (active) return this.waitForChallenge(active);

    const home = config.copilot.home;
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    const executable = process.env.COPILOT_BINARY || path.join(process.cwd(), 'node_modules', '.bin', 'copilot');
    const child = spawn(executable, ['--no-color', 'login'], {
      env: {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: process.env.HOME || '/app',
        COPILOT_HOME: home,
        BROWSER: 'false',
        CI: '1',
        LANG: process.env.LANG || 'C.UTF-8',
        TMPDIR: process.env.TMPDIR || os.tmpdir(),
        ...(process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY } : {}),
        ...(process.env.HTTP_PROXY ? { HTTP_PROXY: process.env.HTTP_PROXY } : {}),
        ...(process.env.NO_PROXY ? { NO_PROXY: process.env.NO_PROXY } : {})
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const loginId = crypto.randomUUID();
    const state: LoginState = {
      loginId,
      child,
      output: '',
      completed: false,
      waiters: [],
      expiryTimer: setTimeout(() => {
        if (state.completed) return;
        state.error = 'GitHub Copilot device code expired';
        state.child.kill('SIGTERM');
      }, 15 * 60 * 1000)
    };
    this.logins.set(loginId, state);

    const receive = (chunk: Buffer) => {
      state.output = `${state.output}${String(chunk)}`.slice(-8192);
      const challenge = this.parseChallenge(state.output);
      if (challenge) this.resolveChallenge(state, challenge);
    };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.once('error', (error) => {
      state.completed = true;
      state.success = false;
      state.error = error.message;
      clearTimeout(state.expiryTimer);
      this.rejectWaiters(state, error);
    });
    child.once('exit', (code, signal) => {
      state.completed = true;
      state.success = code === 0 && !state.cancelled;
      state.error = state.success
        ? undefined
        : state.error || (state.cancelled ? 'GitHub Copilot login cancelled' : `GitHub Copilot login exited (${code ?? signal ?? 'unknown'})`);
      clearTimeout(state.expiryTimer);
      if (!state.userCode) this.rejectWaiters(state, new Error(state.error || 'GitHub Copilot login failed'));
    });

    return this.waitForChallenge(state);
  }

  loginStatus(loginId: string): LoginView | null {
    const state = this.logins.get(loginId);
    return state ? publicState(state) : null;
  }

  cancel(loginId: string) {
    const state = this.logins.get(loginId);
    if (!state) return false;
    state.cancelled = true;
    state.error = 'GitHub Copilot login cancelled';
    if (!state.completed) state.child.kill('SIGTERM');
    return true;
  }
}

export = new CopilotAuthService();
