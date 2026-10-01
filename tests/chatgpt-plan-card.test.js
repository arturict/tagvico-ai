const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// The settings components are TSX under src/. Compile the two the plan card
// needs into a temporary folder so they can be rendered with a stubbed status.
const sourceDirectory = path.resolve(__dirname, '..', 'src', 'components', 'settings');
// Inside node_modules/.cache so the compiled files resolve react from the project.
const cacheDirectory = path.resolve(__dirname, '..', 'node_modules', '.cache');
fs.mkdirSync(cacheDirectory, { recursive: true });
const outputDirectory = fs.mkdtempSync(path.join(cacheDirectory, 'tagvico-plan-card-'));
for (const name of ['chatgpt-plan-sign-in.tsx', 'inline-status.tsx', 'provider-auth.ts']) {
  const output = ts.transpileModule(fs.readFileSync(path.join(sourceDirectory, name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
  });
  fs.writeFileSync(path.join(outputDirectory, name.replace(/\.tsx?$/, '.js')), output.outputText);
}
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const { ChatGPTPlanSignIn, callbackAddressProblem, MALFORMED_ADDRESS } = require(path.join(outputDirectory, 'chatgpt-plan-sign-in.js'));
const { providerAuthFromStatus } = require(path.join(outputDirectory, 'provider-auth.js'));

test.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));

const render = (props) => renderToStaticMarkup(React.createElement(ChatGPTPlanSignIn, {
  apiBase: '/api/chatgpt',
  onConnected: () => undefined,
  onError: () => undefined,
  ...props
}));

test('signed out: the card offers Continue with ChatGPT and nothing that needs an account', () => {
  const auth = providerAuthFromStatus('chatgpt', { authenticated: false, planUsage: false, account: null });
  const html = render({ authenticated: auth.authenticated, accountLabel: auth.label, onLogout: () => undefined });
  assert.match(html, /Not connected/);
  assert.match(html, /Continue with ChatGPT/);
  assert.doesNotMatch(html, /Sign out|>Manage usage<|Reconnect ChatGPT/);
  assert.match(html, /Plus and Pro plans only/);
});

test('signed in: the stubbed status shows the account, usage link, reconnect and sign out', () => {
  const auth = providerAuthFromStatus('chatgpt', {
    authenticated: true,
    planUsage: true,
    account: { email: 'family@example.org' },
    model: 'gpt-6-luna'
  });
  assert.deepEqual(auth, { loading: false, authenticated: true, label: 'family@example.org' });
  const html = render({ authenticated: auth.authenticated, accountLabel: auth.label, onLogout: () => undefined });
  assert.match(html, /Using ChatGPT plan · family@example\.org/);
  assert.match(html, /Reconnect ChatGPT/);
  assert.match(html, /href="https:\/\/chatgpt\.com\/settings\/usage"/);
  assert.match(html, /Sign out/);
  assert.doesNotMatch(html, /Continue with ChatGPT/);
});

test('a sign-in without plan usage is not treated as connected', () => {
  assert.equal(providerAuthFromStatus('chatgpt', { authenticated: true, planUsage: false }).authenticated, false);
  assert.equal(providerAuthFromStatus('codex', { authenticated: true, account: { planType: 'plus' } }).label, 'Connected · plus');
  assert.equal(providerAuthFromStatus('copilot', { authenticated: false }).label, 'Not connected');
});

test('the pasted address is checked for shape before it is sent', () => {
  const valid = 'http://127.0.0.1:1455/auth/callback?code=abc&state=xyz';
  assert.equal(callbackAddressProblem(valid), null);
  assert.equal(callbackAddressProblem('?code=abc&state=xyz'), null);
  assert.equal(callbackAddressProblem('not a url'), MALFORMED_ADDRESS);
  assert.equal(callbackAddressProblem('http://'), MALFORMED_ADDRESS);
  assert.match(callbackAddressProblem(''), /Paste the address/);
  assert.match(callbackAddressProblem('http://127.0.0.1:1455/auth/callback?state=xyz'), /no sign-in code/);
  assert.match(callbackAddressProblem('http://127.0.0.1:1455/auth/callback?code=abc'), /no sign-in state/);
});
