// The mascot and the small touches around it: the drawing and its exported files, the time-aware
// greeting, the tab title with the Needs-you count, keyboard shortcuts, per-chat drafts and the
// pieces that render on the server (mascot, toasts).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

// Bundles TypeScript entries the way the web build resolves `@/` and `@root/`, with React and
// the other packages left to node_modules.
async function bundle(contents) {
  const cache = path.join(root, 'node_modules', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const out = path.join(fs.mkdtempSync(path.join(cache, 'tagvico-touches-')), 'bundle.cjs');
  await esbuild.build({
    stdin: { contents, resolveDir: root, sourcefile: 'entry.tsx', loader: 'tsx' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    jsx: 'automatic',
    outfile: out,
    logLevel: 'silent',
    plugins: [{
      name: 'aliases',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => build.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind }));
      }
    }]
  });
  return require(out);
}

let lib;
test.before(async () => {
  lib = await bundle(`
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    export * from '@/components/mascot/art';
    export { Mascot } from '@/components/mascot/mascot';
    export { dayPart, greeting } from '@/components/chat/greeting';
    export { tabTitle, pageNameFromTitle } from '@/components/shell/title';
    export { shortcutAction } from '@/components/shell/shortcuts';
    export { draftKey, saveDraft, loadDraft } from '@/components/chat/use-draft';
    import { ToastProvider, useToast } from '@/components/ui/toast';
    export const renderToastProbe = () => {
      const Probe = () => <p>{String(useToast().available)}</p>;
      return [renderToStaticMarkup(<Probe />), renderToStaticMarkup(<ToastProvider><Probe /></ToastProvider>)];
    };
    export { renderToStaticMarkup };
  `);
});

// ------------------------------------------------------------------ the drawing

test('every pose is drawn inside the 16 x 16 grid with the brand colours only', () => {
  const allowed = new Set(Object.values(lib.MASCOT_COLORS));
  assert.deepEqual([...lib.MASCOT_POSES], ['idle', 'thinking', 'happy', 'sleeping', 'searching', 'oops', 'waving']);
  for (const pose of lib.MASCOT_POSES) {
    const rects = [];
    const walk = (node) => { rects.push(...(node.rects || [])); (node.children || []).forEach(walk); };
    walk(lib.poseTree(pose));
    assert.ok(rects.length > 10, `${pose} has art`);
    for (const rect of rects) {
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= lib.MASCOT_GRID && rect.y + rect.h <= lib.MASCOT_GRID, `${pose} stays on the grid: ${JSON.stringify(rect)}`);
      assert.ok(allowed.has(rect.fill), `${pose} uses a palette colour: ${rect.fill}`);
    }
  }
  assert.equal(lib.MASCOT_COLORS.lime, '#B5EA0B', 'the lime of public/tagvico-icon.png');
});

test('the Mascot component is decorative, crisp and snaps to whole pixels of the art grid', () => {
  const html = lib.renderToStaticMarkup(require('react').createElement(lib.Mascot, { pose: 'happy', size: 50 }));
  assert.match(html, /^<svg class="mascot is-happy"/);
  assert.match(html, /width="48" height="48"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /shape-rendering="crispEdges"/);
  assert.match(html, /focusable="false"/);
  assert.doesNotMatch(html, /role="img"|<title>/, 'the surrounding text carries the meaning');
  assert.match(lib.renderToStaticMarkup(require('react').createElement(lib.Mascot, { size: 3 })), /width="16" height="16"/);
  assert.match(lib.renderToStaticMarkup(require('react').createElement(lib.Mascot, { animated: false })), /class="mascot is-idle is-still"/);
});

test('the exported files in public/mascot match the drawing and the idle pose also exists at 512 px', async () => {
  const css = read('src/app/styles/mascot.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1').trim();
  for (const pose of lib.MASCOT_POSES) {
    assert.equal(read(`public/mascot/${pose}.svg`), lib.poseSvg(pose), `public/mascot/${pose}.svg is stale; run node scripts/export-mascot.js`);
    assert.equal(read(`public/mascot/${pose}-animated.svg`), lib.poseSvg(pose, css), `public/mascot/${pose}-animated.svg is stale; run node scripts/export-mascot.js`);
    const meta = await sharp(path.join(root, `public/mascot/${pose}.png`)).metadata();
    assert.deepEqual([meta.width, meta.height, meta.hasAlpha], [256, 256, true]);
  }
  const large = await sharp(path.join(root, 'public/mascot/idle-512.png')).metadata();
  assert.deepEqual([large.width, large.height], [512, 512]);
});

test('mascot motion stops under prefers-reduced-motion and moves only by whole art pixels', () => {
  const css = read('src/app/styles/mascot.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.mascot,\s*\.mascot \* \{\s*animation: none !important;/);
  const transforms = [...css.matchAll(/translate[XY]\((-?\d+)px\)/g)].map((match) => Math.abs(Number(match[1])));
  assert.ok(transforms.length > 0 && transforms.every((pixels) => pixels <= 2), 'every move is one or two pixels');
  assert.ok(!/ease|linear|cubic-bezier/.test(css), 'steps only, so the pixels stay crisp');
});

// ------------------------------------------------------------------ greeting

test('the greeting follows the Zurich clock, summer and winter, and falls back to the plain question', () => {
  const part = (iso) => lib.dayPart(new Date(iso));
  assert.equal(part('2026-10-01T03:00:00Z'), 'morning', '05:00 in Zurich (CEST)');
  assert.equal(part('2026-10-01T09:59:00Z'), 'morning', '11:59');
  assert.equal(part('2026-10-01T10:00:00Z'), 'afternoon', '12:00');
  assert.equal(part('2026-10-01T15:59:00Z'), 'afternoon', '17:59');
  assert.equal(part('2026-10-01T16:00:00Z'), 'evening', '18:00');
  assert.equal(part('2026-10-01T22:30:00Z'), 'evening', '00:30 after midnight in Zurich');
  assert.equal(part('2026-10-01T02:59:00Z'), 'evening', '04:59');
  assert.equal(part('2026-01-15T04:30:00Z'), 'morning', '05:30 in Zurich (CET)');
  assert.equal(lib.greeting('morning', 'Artur'), 'Good morning, Artur');
  assert.equal(lib.greeting('evening', 'Sandra'), 'Good evening, Sandra');
  assert.equal(lib.greeting(undefined, 'Artur'), 'What can I help with, Artur?');
});

// ------------------------------------------------------------------ tab title

test('the tab title carries the Needs-you count and says "All caught up" on an empty Needs you page', () => {
  const { tabTitle, pageNameFromTitle } = lib;
  assert.equal(tabTitle('Needs you · Tagvico', 3, true), '(3) Needs you · Tagvico');
  assert.equal(tabTitle('Needs you | Tagvico', 3, true), '(3) Needs you · Tagvico');
  assert.equal(tabTitle('Needs you · Tagvico', 0, true), 'All caught up · Tagvico');
  assert.equal(tabTitle('Chat · Tagvico', 2, false), '(2) Chat · Tagvico');
  assert.equal(tabTitle('Chat · Tagvico', 0, false), 'Chat · Tagvico', 'other pages keep their own title when nothing waits');
  assert.equal(tabTitle('Tagvico', 4, false), '(4) Tagvico');
  assert.equal(tabTitle('Tagvico', 0, false), 'Tagvico');
  assert.equal(tabTitle('Chat · Tagvico', 250, false), '(99+) Chat · Tagvico');
  // The observer feeds the result back in; the second pass must not change it.
  for (const [count, onPage] of [[3, true], [0, true], [7, false], [0, false]]) {
    const once = tabTitle('Documents · Tagvico', count, onPage);
    assert.equal(tabTitle(once, count, onPage), once);
  }
  assert.equal(pageNameFromTitle('(12) Review queue · Tagvico'), 'Review queue');
  assert.equal(pageNameFromTitle('All caught up · Tagvico'), 'All caught up');
});

// ------------------------------------------------------------------ shortcuts

test('keyboard shortcuts: slash and Ctrl/Cmd+K focus the composer, Ctrl/Cmd+Shift+O starts a chat, Escape stops an answer', () => {
  const { shortcutAction } = lib;
  const page = { tagName: 'BODY' };
  const field = { tagName: 'TEXTAREA' };
  const inDialog = { tagName: 'DIV', closest: (selector) => selector.includes('dialog') ? {} : null };

  assert.equal(shortcutAction({ key: '/' }, page), 'focus-composer');
  assert.equal(shortcutAction({ key: '/', shiftKey: true }, page), 'focus-composer', 'German layouts type slash with Shift');
  assert.equal(shortcutAction({ key: '/' }, field), null, 'typing a slash in a field is typing');
  assert.equal(shortcutAction({ key: '/' }, { tagName: 'DIV', isContentEditable: true }), null);
  assert.equal(shortcutAction({ key: '/', ctrlKey: true }, page), null);
  assert.equal(shortcutAction({ key: '/' }, page, { overlayOpen: true }), null);

  assert.equal(shortcutAction({ key: 'k', ctrlKey: true }, page), 'focus-composer');
  assert.equal(shortcutAction({ key: 'K', metaKey: true }, field), 'focus-composer', 'also from inside a field');
  assert.equal(shortcutAction({ key: 'k', ctrlKey: true, shiftKey: true }, page), null);
  assert.equal(shortcutAction({ key: 'k', ctrlKey: true }, page, { overlayOpen: true }), null);

  assert.equal(shortcutAction({ key: 'O', ctrlKey: true, shiftKey: true }, field), 'new-chat');
  assert.equal(shortcutAction({ key: 'o', metaKey: true, shiftKey: true }, page), 'new-chat');
  assert.equal(shortcutAction({ key: 'o', ctrlKey: true }, page), null, 'plain Ctrl+O stays with the browser');

  assert.equal(shortcutAction({ key: 'Escape' }, field, { streaming: true }), 'stop-response');
  assert.equal(shortcutAction({ key: 'Escape' }, field, { streaming: false }), null);
  assert.equal(shortcutAction({ key: 'Escape' }, inDialog, { streaming: true }), null, 'a dialog closes first');
  assert.equal(shortcutAction({ key: 'Escape' }, page, { streaming: true, overlayOpen: true }), null);

  assert.equal(shortcutAction({ key: '/', repeat: true }, page), null);
  assert.equal(shortcutAction({ key: 'k', ctrlKey: true, defaultPrevented: true }, page), null);
  assert.equal(shortcutAction({ key: 'k', ctrlKey: true, isComposing: true }, page), null);
  assert.equal(shortcutAction({ key: '1', ctrlKey: true }, page), null, 'Ctrl/Cmd+number belongs to the model picker');
});

// ------------------------------------------------------------------ drafts

test('drafts are kept per chat, removed when empty and never throw when storage is unavailable', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) };
  lib.saveDraft(storage, 'chat-a', 'half a question');
  lib.saveDraft(storage, 'chat-b', 'another one');
  assert.equal(lib.loadDraft(storage, 'chat-a'), 'half a question');
  assert.equal(lib.loadDraft(storage, 'chat-b'), 'another one');
  assert.equal(lib.loadDraft(storage, 'chat-c'), '');
  assert.notEqual(lib.draftKey('chat-a'), lib.draftKey('chat-b'));
  lib.saveDraft(storage, 'chat-a', '   ');
  assert.equal(lib.loadDraft(storage, 'chat-a'), '', 'a blank draft is removed');
  assert.equal(store.has(lib.draftKey('chat-a')), false);

  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.doesNotThrow(() => lib.saveDraft(broken, 'chat-a', 'text'));
  assert.equal(lib.loadDraft(broken, 'chat-a'), '');
});

// ------------------------------------------------------------------ toasts

test('toasts render nothing until shown, and callers outside a provider get a harmless no-op', () => {
  const [outside, inside] = lib.renderToastProbe();
  assert.equal(outside, '<p>false</p>');
  assert.match(inside, /<p>true<\/p>/);
  assert.match(inside, /<div class="toast-region" role="region" aria-label="Notifications"><\/div>/);
});
