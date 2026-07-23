import { defineConfig } from 'vitepress';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const version = process.env.TAGVICO_DOCS_VERSION || 'v2';
const versionsRoot = path.resolve(import.meta.dirname, '../versions');
const availableVersions = readdirSync(versionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
const latestVersion = availableVersions[0];
const base = process.env.TAGVICO_DOCS_BASE || '/docs/';
const outDir = process.env.TAGVICO_DOCS_OUT_DIR || '../docs-site';
const versionLink = (targetVersion: string) => {
  if (targetVersion === version) return '/';
  if (targetVersion === latestVersion) return '../';
  return version === latestVersion ? `/${targetVersion}/` : `../${targetVersion}/`;
};

export default defineConfig({
  title: 'Tagvico AI',
  description: 'Versioned documentation for the private action center and household companion for Paperless-ngx.',
  lang: 'en-US',
  base,
  srcDir: `versions/${version}`,
  outDir,
  cleanUrls: true,
  lastUpdated: process.env.TAGVICO_DOCS_LAST_UPDATED !== 'false',
  appearance: true,
  head: [
    ['link', { rel: 'icon', type: 'image/x-icon', href: `${base}favicon.ico` }],
    ['link', { rel: 'alternate', type: 'text/plain', href: `${base}llms.txt`, title: 'LLM documentation index' }],
    ['link', { rel: 'alternate', type: 'text/plain', href: `${base}llms-full.txt`, title: 'Complete LLM documentation' }],
    ['meta', { name: 'theme-color', content: '#c8ff2e' }],
  ],
  themeConfig: {
    logo: '/tagvico-icon.png',
    siteTitle: 'Tagvico AI Docs',
    nav: [
      { text: 'Guide', link: '/installation' },
      { text: 'Features', link: '/features' },
      { text: 'Providers', link: '/providers' },
      {
        text: version.toUpperCase(),
        items: availableVersions.map((item) => ({
          text: item === latestVersion ? `${item.toUpperCase()} (current)` : item.toUpperCase(),
          link: versionLink(item),
          target: '_self',
        })),
      },
      { text: 'Landing page', link: 'https://tagvico.arturf.ch/', target: '_self' },
    ],
    sidebar: [
      {
        text: `${version.toUpperCase()} Guide`,
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Installation', link: '/installation' },
          { text: 'Upgrading', link: '/upgrading' },
          { text: 'Removing Tagvico', link: '/removing' },
        ],
      },
      {
        text: 'Product',
        items: [
          { text: 'Feature showcase', link: '/features' },
          { text: 'AI tagging for Paperless', link: '/paperless-ai-tagging' },
          { text: 'Provider overview', link: '/providers' },
          { text: 'Privacy & security', link: '/privacy' },
          { text: 'Troubleshooting', link: '/troubleshooting' },
        ],
      },
      {
        text: 'Machine-readable',
        items: [
          { text: 'LLM index', link: `${base}llms.txt` },
          { text: 'Complete docs for LLMs', link: `${base}llms-full.txt` },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/arturict/tagvico-ai' }],
    editLink: {
      pattern: `https://github.com/arturict/tagvico-ai/edit/main/website/versions/${version}/:path`,
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: `Tagvico AI ${version.toUpperCase()} documentation`,
      copyright: 'Released under the MIT License.',
    },
  },
});
