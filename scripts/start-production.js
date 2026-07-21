'use strict';

const { spawn } = require('node:child_process');

const children = [];
const launch = (command, args, env) => {
  const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env }, windowsHide: true });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[START] ${command} exited unexpectedly (${signal || code || 0})`);
    shutdown(signal || 'SIGTERM', 1);
  });
  child.on('error', (error) => { if (!stopping) { console.error(`[START] Could not launch ${command}: ${error.message}`); shutdown('SIGTERM', 1); } });
};

let stopping = false;
function shutdown(signal, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
  setTimeout(() => process.exit(exitCode), 5000).unref();
}

launch(process.execPath, ['dist/server.js'], { TAGVICO_AI_PORT: process.env.TAGVICO_BACKEND_PORT || '3001' });
launch(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', process.env.TAGVICO_AI_PORT || process.env.PORT || '3000'], { TAGVICO_BACKEND_URL: process.env.TAGVICO_BACKEND_URL || 'http://127.0.0.1:3001' });
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
