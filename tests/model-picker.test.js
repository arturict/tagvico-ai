// The shared model picker: filtering, favourites, shortcuts and keyboard
// selection are pure logic and are tested directly; the panel is rendered to
// HTML on the server to check the structure, the ARIA roles and the hints.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
let picker;

test.before(async () => {
  // Inside node_modules so the externalised packages (react, lucide) resolve from the project.
  const cache = path.join(root, 'node_modules', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const out = path.join(fs.mkdtempSync(path.join(cache, 'tagvico-picker-')), 'picker.cjs');
  await esbuild.build({
    stdin: {
      contents: `import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { ModelPickerPanel } from '@/components/model-picker/model-picker-panel';
        export * from '@/components/model-picker/logic';
        export const renderPanel = (props) => renderToStaticMarkup(<ModelPickerPanel {...props} />);`,
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
      name: 'alias',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => build.resolve(`./src/${args.path.slice(2)}`, { resolveDir: root, kind: args.kind }));
      }
    }]
  });
  picker = require(out);
});

const chatgpt = { id: 'chatgpt', name: 'ChatGPT plan', icon: { path: '/provider-icons/openai.svg' }, badge: 'New' };
const router = { id: 'openrouter', name: 'OpenRouter', icon: { path: '/provider-icons/openrouter.svg' } };
const providers = [chatgpt, router];
const models = [
  { providerId: 'chatgpt', id: 'gpt-6-luna', name: 'GPT-6-Luna', badges: ['Default'] },
  { providerId: 'chatgpt', id: 'gpt-6-astra', name: 'GPT-6-Astra' },
  { providerId: 'openrouter', id: 'anthropic/claude-sonnet', name: 'Claude Sonnet' },
  { providerId: 'ghost', id: 'orphan', name: 'Orphan' }
];

const names = (entries) => entries.map((entry) => entry.model.name);

test('entries drop models of unknown providers and key favourites per provider', () => {
  const entries = picker.buildEntries(providers, models);
  assert.deepEqual(names(entries), ['GPT-6-Luna', 'GPT-6-Astra', 'Claude Sonnet']);
  assert.equal(entries[0].key, 'chatgpt:gpt-6-luna');
});

test('the rail filters by provider and a query searches every provider', () => {
  const entries = picker.buildEntries(providers, models);
  const rail = { kind: 'provider', providerId: 'openrouter' };
  assert.deepEqual(names(picker.visibleEntries(entries, [], rail, '')), ['Claude Sonnet']);
  assert.deepEqual(names(picker.visibleEntries(entries, [], rail, 'luna')), ['GPT-6-Luna']);
  assert.deepEqual(names(picker.visibleEntries(entries, [], rail, 'openrouter sonnet')), ['Claude Sonnet'], 'words match name, id and provider together');
  assert.deepEqual(names(picker.visibleEntries(entries, [], rail, 'anthropic/')), ['Claude Sonnet'], 'the model id is searched');
  assert.deepEqual(names(picker.visibleEntries(entries, [], rail, 'nothing like this')), []);
});

test('favourites keep the order they were starred in and ignore models that are gone', () => {
  const entries = picker.buildEntries(providers, models);
  let favorites = [];
  favorites = picker.toggleFavorite(favorites, 'openrouter:anthropic/claude-sonnet');
  favorites = picker.toggleFavorite(favorites, 'chatgpt:gpt-6-luna');
  favorites = picker.toggleFavorite(favorites, 'chatgpt:retired');
  assert.deepEqual(names(picker.visibleEntries(entries, favorites, { kind: 'favorites' }, '')), ['Claude Sonnet', 'GPT-6-Luna']);
  const list = picker.favoriteEntries(entries, favorites);
  assert.equal(picker.shortcutNumber(list, 'chatgpt:gpt-6-luna'), 2);
  assert.equal(picker.shortcutNumber(list, 'chatgpt:gpt-6-astra'), null);
  assert.deepEqual(picker.toggleFavorite(favorites, 'chatgpt:gpt-6-luna'), ['openrouter:anthropic/claude-sonnet', 'chatgpt:retired']);
});

test('stored favourites survive damaged storage', () => {
  assert.deepEqual(picker.parseFavorites(null), []);
  assert.deepEqual(picker.parseFavorites('not json'), []);
  assert.deepEqual(picker.parseFavorites('{"a":1}'), []);
  assert.deepEqual(picker.parseFavorites('["a:b",3,"a:b",""]'), ['a:b']);
});

test('the picker opens on the provider of the current model and highlights it', () => {
  const entries = picker.buildEntries(providers, models);
  const selection = { providerId: 'chatgpt', modelId: 'gpt-6-astra' };
  const rail = picker.initialRail(entries, providers, selection);
  assert.deepEqual(rail, { kind: 'provider', providerId: 'chatgpt' });
  assert.equal(picker.initialActiveIndex(picker.visibleEntries(entries, [], rail, ''), selection), 1);
  assert.deepEqual(picker.initialRail([], [], null), { kind: 'favorites' });
});

test('arrow keys wrap, Enter chooses and Ctrl/Cmd+number reaches a favourite', () => {
  const state = { count: 3, active: 0, favoriteCount: 2 };
  assert.deepEqual(picker.listKeyAction({ key: 'ArrowDown' }, state), { type: 'move', index: 1 });
  assert.deepEqual(picker.listKeyAction({ key: 'ArrowUp' }, state), { type: 'move', index: 2 });
  assert.deepEqual(picker.listKeyAction({ key: 'End' }, state), { type: 'move', index: 2 });
  assert.deepEqual(picker.listKeyAction({ key: 'Home' }, { ...state, active: 2 }), { type: 'move', index: 0 });
  assert.deepEqual(picker.listKeyAction({ key: 'Enter' }, state), { type: 'select' });
  assert.deepEqual(picker.listKeyAction({ key: '2', ctrlKey: true }, state), { type: 'favorite', entryIndex: 1 });
  assert.deepEqual(picker.listKeyAction({ key: '1', metaKey: true }, state), { type: 'favorite', entryIndex: 0 });
  assert.equal(picker.listKeyAction({ key: '3', ctrlKey: true }, state), null, 'no third favourite');
  assert.equal(picker.listKeyAction({ key: '1' }, state), null, 'a plain digit is typed into the search');
  assert.equal(picker.listKeyAction({ key: '1', ctrlKey: true, shiftKey: true }, state), null);
  assert.equal(picker.listKeyAction({ key: 'ArrowDown' }, { ...state, count: 0 }), null);
  assert.equal(picker.listKeyAction({ key: 'Escape' }, state), null, 'Escape belongs to the popover');
});

test('closed-popover shortcuts leave text fields alone except the chat composer', () => {
  const field = (tagName, extra = {}) => ({ tagName, closest: () => null, ...extra });
  assert.equal(picker.shortcutAllowedFrom(null), true);
  assert.equal(picker.shortcutAllowedFrom(field('BODY')), true);
  assert.equal(picker.shortcutAllowedFrom(field('INPUT')), false);
  assert.equal(picker.shortcutAllowedFrom(field('TEXTAREA')), false);
  assert.equal(picker.shortcutAllowedFrom(field('DIV', { isContentEditable: true })), false);
  assert.equal(picker.shortcutAllowedFrom(field('TEXTAREA', { closest: (selector) => (selector === '.chat-composer' ? {} : null) })), true);
});

test('the panel renders the rail, search, options with hints and the check', () => {
  const entries = picker.buildEntries(providers, models);
  const html = picker.renderPanel({
    providers,
    entries,
    favorites: ['chatgpt:gpt-6-astra'],
    selection: { providerId: 'chatgpt', modelId: 'gpt-6-luna' },
    loading: false,
    error: '',
    shortcutPrefix: 'Ctrl+',
    onChoose() {},
    onToggleFavorite() {},
    onRefresh() {}
  });
  assert.match(html, /role="group" aria-label="Filter by provider"/);
  assert.match(html, /aria-label="Favourites"[^>]*>/);
  assert.match(html, /aria-pressed="true" aria-label="ChatGPT plan"/, 'the selected provider is the active rail item');
  assert.match(html, /role="combobox"[^>]*aria-label="Search models"/);
  assert.match(html, /placeholder="Search models\.\.\."/);
  assert.match(html, /role="listbox" aria-label="Models"/);
  assert.equal((html.match(/role="option"/g) || []).length, 2, 'only the provider in the rail is listed');
  assert.match(html, /role="option"[^>]*aria-selected="true"[^>]*data-model-id="gpt-6-luna"/);
  assert.match(html, /<span class="mp-badge">Default<\/span><span class="mp-badge">New<\/span>/);
  assert.match(html, /<kbd class="mp-kbd" aria-hidden="true">Ctrl\+1<\/kbd>/, 'the one favourite carries Ctrl+1');
  assert.equal((html.match(/<kbd/g) || []).length, 1);
  assert.match(html, /aria-label="Remove GPT-6-Astra from favourites"/);
  assert.match(html, /aria-label="Add GPT-6-Luna to favourites"/);
  assert.match(html, /aria-label="Refresh models"/);
  assert.match(html, /<span class="mp-model-id">gpt-6-luna<\/span>/);
  assert.match(html, /style="[^"]*--mp-logo-url:url\(&quot;\/provider-icons\/openai\.svg&quot;\)/, 'logos are fixed-size masks of the registry icon');
  assert.doesNotMatch(html, /<img/, 'logos are never images that can stretch');
});

test('the panel explains empty favourites and failed loads', () => {
  const base = {
    providers,
    entries: picker.buildEntries(providers, models),
    favorites: [],
    selection: null,
    loading: false,
    error: '',
    shortcutPrefix: 'Ctrl+',
    onChoose() {},
    onToggleFavorite() {}
  };
  const noProviders = picker.renderPanel({ ...base, providers: [], entries: [] });
  assert.match(noProviders, /No favourites yet|No connected provider listed a model/);
  const failed = picker.renderPanel({ ...base, entries: [], error: 'Could not load models.' });
  assert.match(failed, /role="alert">Could not load models\.</);
  const loading = picker.renderPanel({ ...base, entries: [], loading: true });
  assert.match(loading, /aria-busy="true"/);
  const note = picker.renderPanel({ ...base, providerNote: (provider) => `Switch to ${provider.name}` });
  assert.match(note, /Switch to ChatGPT plan/);
});
