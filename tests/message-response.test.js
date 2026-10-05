// Chat replies load the Markdown renderer lazily and each Streamdown plugin
// only for a reply that uses it; the server still renders finished Markdown.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
let response;

test.before(async () => {
  const cache = path.join(root, 'node_modules', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  const out = path.join(fs.mkdtempSync(path.join(cache, 'tagvico-message-response-')), 'response.cjs');
  await esbuild.build({
    stdin: {
      contents: `import React from 'react';
        import { prerenderToNodeStream } from 'react-dom/static';
        import { MessageResponse, pluginKey } from '@/components/ai-elements/message-response';
        export { pluginKey };
        export async function render(markdown) {
          const { prelude } = await prerenderToNodeStream(<MessageResponse>{markdown}</MessageResponse>);
          let html = '';
          for await (const chunk of prelude) html += chunk;
          return html;
        }`,
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
  response = require(out);
});

test('plain prose needs no Streamdown plugin', () => {
  assert.equal(response.pluginKey('The renewal is due on **15 August**. See [1](/documents/4).'), '');
  assert.equal(response.pluginKey('Use `inline code` and a price of $12 or $15.'), '');
  assert.equal(response.pluginKey(undefined), '');
});

test('a reply loads only the plugins its content uses', () => {
  assert.equal(response.pluginKey('Steps:\n\n```js\nconsole.log(1)\n```'), 'code');
  assert.equal(response.pluginKey('~~~\nplain fence\n~~~'), 'code');
  assert.equal(response.pluginKey('```mermaid\ngraph TD; A-->B\n```'), 'code,mermaid');
  assert.equal(response.pluginKey('$$\nE = mc^2\n$$'), 'math');
  assert.equal(response.pluginKey('重要な書類です。'), 'cjk');
});

test('the server renders the finished Markdown, not the plain-text fallback', async () => {
  const html = await response.render('A **bold** claim.\n\n- first\n- second');
  assert.match(html, /data-streamdown="strong"[^>]*>bold</);
  assert.match(html, /<li[^>]*>first<\/li>/);
  assert.doesNotMatch(html, /\*\*bold\*\*/);
  assert.doesNotMatch(html, /whitespace-pre-wrap/);
});
