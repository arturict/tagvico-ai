'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const failures = [];
const removedSettingsView = path.join(root, 'views', 'settings.ejs');

if (fs.existsSync(removedSettingsView)) {
  failures.push('views/settings.ejs must not return; /settings belongs to the Next.js application.');
}
for (const removedPath of [
  path.join(root, 'views', 'partials', 'config-form.ejs'),
  path.join(root, 'public', 'js', 'config-form.js'),
  ...['dashboard', 'history', 'operations'].flatMap((name) => [
    path.join(root, 'views', `${name}.ejs`),
    path.join(root, 'public', 'js', `${name}.js`)
  ])
]) {
  if (fs.existsSync(removedPath)) {
    failures.push(`${path.relative(root, removedPath)} must not return; setup and settings use shared React forms.`);
  }
}

const nextConfig = fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8');
if (/source:\s*['"]\/automation\/settings['"][\s\S]{0,160}destination:\s*`\$\{backend\}\/settings`/.test(nextConfig)) {
  failures.push('/automation/settings must not rewrite to the legacy EJS settings page.');
}
for (const route of ['dashboard', 'history', 'operations']) {
  if (new RegExp(`source:\\s*['"]\\/${route}\\/:path\\*['"]`).test(nextConfig)) {
    failures.push(`/${route} must remain a native Next.js route, not a legacy backend rewrite.`);
  }
}

const providerFiles = [
  path.join(root, 'services', 'aiServiceFactory.ts'),
  path.join(root, 'services', 'providerCatalogService.ts')
];
for (const file of providerFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (/switch\s*\(\s*(?:normalizeProvider\([^)]*\)|provider)\s*\)/.test(source)) {
    failures.push(`${path.relative(root, file)} contains a provider switch; route provider behavior through providerRegistry.`);
  }
}

const factory = fs.readFileSync(path.join(root, 'services', 'aiServiceFactory.ts'), 'utf8');
if (!factory.includes('providerRegistry.getProviderDefinition')
  || !factory.includes('providerRuntimeResolver.getRuntimeService')) {
  failures.push('AIServiceFactory must resolve provider definitions and runtime adapters through the registry.');
}

if (failures.length) {
  failures.forEach((failure) => console.error(`ARCHITECTURE ${failure}`));
  process.exit(1);
}

console.log('PASS settings architecture');
