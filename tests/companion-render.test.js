// Renders the real chat component tree to HTML on the server, with the
// framework hooks (router, image, useChat) and the markdown renderer stubbed.
// It covers the logic that decides what the member sees: grounded citations,
// proposals inside answers, role gating, outcomes and error links.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const virtual = {
  'next/navigation': 'export const useRouter = () => ({ push() {}, refresh() {} });',
  'next/image': "import React from 'react'; export default function Image(props) { return React.createElement('img', { src: props.src, alt: props.alt }); }",
  '@ai-sdk/react': `export function useChat(options) {
    const override = globalThis.__chat || {};
    return {
      messages: override.messages || options.messages,
      status: override.status || 'ready',
      error: override.error,
      sendMessage() {}, regenerate() {}, stop() {}, clearError() {}
    };
  }`,
  '@/components/ai-elements/message': `import React from 'react';
    const h = React.createElement;
    export const Message = ({ from, children }) => h('div', { className: 'group ' + (from === 'user' ? 'is-user' : 'is-assistant') }, children);
    export const MessageContent = ({ children }) => h('div', null, children);
    export const MessageResponse = ({ children }) => h('div', { 'data-markdown': true }, children);
    export const MessageActions = ({ children }) => h('div', null, children);
    export const MessageAction = ({ children, label }) => h('button', { 'aria-label': label }, children);`
};

async function bundle() {
  // Inside node_modules so the externalised packages (react, ai, radix) resolve from the project.
  const cache = path.join(root, 'node_modules', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const out = path.join(fs.mkdtempSync(path.join(cache, 'tagvico-render-')), 'render.cjs');
  await esbuild.build({
    stdin: {
      contents: `import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { Companion } from '@/components/companion';
        export const render = (props) => renderToStaticMarkup(<Companion {...props} />);`,
      resolveDir: root,
      sourcefile: 'entry.tsx',
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    jsx: 'automatic',
    outfile: out,
    logLevel: 'silent',
    plugins: [{
      name: 'chat-test-aliases',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.namespace === 'virtual') return undefined;
          if (Object.hasOwn(virtual, args.path)) return { path: args.path, namespace: 'virtual' };
          const relative = args.path.startsWith('@/')
            ? `./src/${args.path.slice(2)}`
            : args.path.startsWith('@root/') ? `./${args.path.slice(6)}` : null;
          return relative ? build.resolve(relative, { resolveDir: root, kind: args.kind }) : undefined;
        });
        build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => ({ contents: virtual[args.path], loader: 'tsx', resolveDir: root }));
      }
    }]
  });
  return require(out).render;
}

let render;
test.before(async () => {
  render = await bundle();
});

const baseProps = {
  sessionId: 's1',
  displayName: 'release-owner',
  initialMessages: [],
  initialApprovals: [],
  initialSessions: [{ id: 's1', title: 'New conversation', message_count: 0, updated_at: '2026-10-01 10:00:00' }],
  canApprove: true,
  isOwner: true,
  approverNames: ['release-owner', 'Release Adult'],
  needsCount: 7,
  start: { paperless: 'ok', suggestions: [
    { kind: 'Action', icon: 'calendar', prompt: 'What is due soon in our open actions?', hint: 'Next: Pay rent, due 2026-10-03' },
    { kind: 'Answer', icon: 'files', prompt: 'Show my newest documents.', hint: 'Latest: Hausrat renewal' }
  ] },
  renderedAt: Date.parse('2026-10-01T10:00:00Z')
};

const activity = (extra = {}) => ({
  toolName: 'search_documents',
  label: 'Searching Paperless',
  detail: 'Found 1 matching document.',
  status: 'succeeded',
  result: { count: 1, documents: [{ id: 6, title: 'Hausrat renewal' }] },
  ...extra
});
const conversation = (activities, text) => [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'When is the renewal due?' }] },
  { id: 'a1', role: 'assistant', parts: [...activities.map((data) => ({ type: 'data-companion-activity', data })), { type: 'text', text }] }
];
const approval = (extra = {}) => ({
  id: 'ap-1', status: 'pending', sessionId: 's1', createdAt: '',
  copy: { title: 'Review renewal', meta: 'Document #6', details: ['Due 2026-10-15'] },
  outcome: null,
  ...extra
});

test('empty chat greets the member, shows the household count and only real starter prompts', () => {
  globalThis.__chat = undefined;
  const html = render(baseProps);
  assert.match(html, /Hello, release-owner\./);
  assert.match(html, /7 things wait for you/);
  assert.match(html, /<a class="chat-needs has-items" href="\/inbox"/);
  assert.match(html, /<a class="chat-head-needs" href="\/inbox">/);
  assert.match(html, /What is due soon in our open actions\?/);
  assert.match(html, /Next: Pay rent, due 2026-10-03/);
  assert.doesNotMatch(html, /sparkle/i);
  assert.doesNotMatch(html, /Ask Tagvico/);
  assert.match(html, />New chat</);
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="New chat"/, 'an empty chat has nothing to leave');
  assert.doesNotMatch(html, /chat-paperless-note/);

  const down = render({ ...baseProps, needsCount: 0, start: { paperless: 'unreachable', suggestions: [] } });
  assert.match(down, /Nothing waits for you/);
  assert.match(down, /Paperless could not be reached/);
  assert.match(down, /href="\/settings\/paperless"/);
  const member = render({ ...baseProps, isOwner: false, start: { paperless: 'access', suggestions: [] } });
  assert.match(member, /Paperless access is not set up for you/);
  assert.doesNotMatch(member, /Open Paperless settings/);
});

test('answers cite only documents the tools returned and link to them with the real title', () => {
  const html = render({
    ...baseProps,
    initialMessages: conversation([activity()], 'It is due on 2026-10-15 [doc:6]. Another guess [doc:99].')
  });
  assert.match(html, /\[1\]\(\/documents\/6\)/);
  assert.doesNotMatch(html, /doc:99|\/documents\/99/);
  assert.match(html, /<a href="\/documents\/6"[^>]*title="Hausrat renewal"><b>1<\/b><span>Hausrat renewal<\/span>/);
  assert.match(html, /Searched 1 document/);
});

test('a proposal sits inside the answer that prepared it and respects the member role', () => {
  const messages = conversation(
    [{ toolName: 'propose_action', label: 'Preparing an action proposal', detail: 'An approval card was prepared.', status: 'succeeded', result: { approvalId: 'ap-1' } }],
    'I prepared a follow-up. It waits for approval.'
  );
  const adult = render({ ...baseProps, initialMessages: messages, initialApprovals: [approval()] });
  const turn = adult.slice(adult.indexOf('chat-turn is-assistant'));
  assert.match(turn, /<article class="chat-approval is-pending"[^>]*data-approval-id="ap-1"/);
  assert.equal((adult.match(/data-approval-id="ap-1"/g) || []).length, 1, 'the card must not also appear as a loose card');
  assert.match(adult, /Review renewal/);
  assert.doesNotMatch(adult.match(/<button[^>]*is-approve[^>]*>/)[0], /disabled/);

  const member = render({ ...baseProps, canApprove: false, initialMessages: messages, initialApprovals: [approval()] });
  assert.match(member.match(/<button[^>]*is-approve[^>]*>/)[0], /disabled/);
  assert.match(member.match(/<button[^>]*is-reject[^>]*>/)[0], /disabled/);
  assert.match(member, /Only owners and adults can approve\. Ask release-owner or Release Adult\./);

  // A proposal made before cards were tied to answers still shows up once.
  const legacy = render({ ...baseProps, initialMessages: conversation([], 'Old answer.'), initialApprovals: [approval()] });
  assert.equal((legacy.match(/data-approval-id="ap-1"/g) || []).length, 1);
});

test('decided proposals show what happened and where to look', () => {
  const messages = conversation(
    [{ toolName: 'propose_action', label: 'Preparing an action proposal', detail: 'Prepared.', status: 'succeeded', result: { approvalId: 'ap-1' } }],
    'Prepared.'
  );
  const done = render({ ...baseProps, initialMessages: messages, initialApprovals: [approval({
    status: 'executed',
    outcome: { tone: 'done', title: 'Action created', detail: 'Review renewal.', href: '/actions/c1' }
  })] });
  assert.match(done, /chat-approval is-executed/);
  assert.match(done, /Action created/);
  assert.match(done, /<a href="\/actions\/c1">Open<\/a>/);
  assert.doesNotMatch(done, /is-approve/, 'a decided proposal has no buttons');

  const failed = render({ ...baseProps, initialMessages: messages, initialApprovals: [approval({
    status: 'failed',
    outcome: { tone: 'failed', title: 'Could not apply this change', detail: 'Paperless refused.' }
  })] });
  assert.match(failed, /Could not apply this change/);
  assert.match(failed, /Paperless refused\./);
});

test('failed tool steps explain themselves and provider problems link to the right place', () => {
  globalThis.__chat = undefined;
  const failedStep = render({
    ...baseProps,
    initialMessages: conversation([activity({ status: 'failed', detail: 'Paperless could not be reached. Check that it is running.', result: undefined })], 'I could not look that up.')
  });
  assert.match(failedStep, /chat-activity-error[^>]*>Paperless could not be reached\. Check that it is running\./);

  globalThis.__chat = { error: new Error(JSON.stringify({ error: 'Sign in with ChatGPT in Settings first.', code: 'chatgpt' })) };
  const owner = render({ ...baseProps, initialMessages: conversation([], 'x') });
  assert.match(owner, /data-error-code="chatgpt"/);
  assert.match(owner, /Sign in with ChatGPT in Settings first\./);
  assert.match(owner, /<a class="chat-notice-action" href="\/settings\/providers">Sign in again<\/a>/);
  const member = render({ ...baseProps, isOwner: false, initialMessages: conversation([], 'x') });
  assert.match(member, /Ask an owner to check the AI models settings\./);
  assert.doesNotMatch(member, /href="\/settings\/providers"/);

  globalThis.__chat = { error: new Error('plain failure') };
  const retry = render({ ...baseProps, initialMessages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }] });
  assert.match(retry, /data-error-code="generic"/);
  assert.match(retry, /Try again/);
  globalThis.__chat = undefined;
});

test('a proposal the backend declined is not counted as prepared and says why', () => {
  globalThis.__chat = undefined;
  const declined = activity({
    toolName: 'propose_action',
    label: 'Preparing an action',
    detail: 'Document #10 already has the action “Review renewal”. No proposal was created.',
    result: {}
  });
  const html = render({ ...baseProps, initialMessages: conversation([declined], 'Done.') });
  assert.doesNotMatch(html, /Prepared 1 proposal/);
  assert.match(html, /1 proposal not created/);
  assert.match(html, /chat-activity-note[^>]*>Document #10 already has the action/);

  const created = activity({ toolName: 'propose_action', label: 'Preparing an action', detail: 'An approval card was prepared.', result: { approvalId: 'ap-1' } });
  assert.match(render({ ...baseProps, initialMessages: conversation([created], 'Ready.'), initialApprovals: [approval()] }), /Prepared 1 proposal/);
});
