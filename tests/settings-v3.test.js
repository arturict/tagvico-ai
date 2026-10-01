const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tagvico-settings-v3-'));
process.env.TAGVICO_DATA_DIR = dataDir;
process.env.SCAN_INTERVAL = '5 * * * *';
process.env.AI_PROVIDER = 'ollama';
process.env.OLLAMA_MODEL = 'qwen3.5:4b';
process.env.OPENROUTER_API_KEY = '';
process.env.COPILOT_GITHUB_TOKEN = 'injected-copilot-token';
fs.writeFileSync(path.join(dataDir, '.env'), [
  'TAGVICO_AI_INITIAL_SETUP=yes',
  'TAGVICO_AI_VERSION=3.0.0',
  'PAPERLESS_API_URL=http://paperless.internal:8000',
  'PAPERLESS_API_TOKEN=paperless-secret-value',
  'PAPERLESS_USERNAME=admin',
  'AI_PROVIDER=compatible',
  'COMPATIBLE_BASE_URL=http://proxy.internal:8317/v1',
  'COMPATIBLE_API_KEY=proxy-secret-value',
  'COMPATIBLE_MODEL=gpt-5.6-terra',
  'OPENROUTER_API_KEY=openrouter-persisted-secret',
  'AI_MODEL=gpt-5.6-terra',
  'API_KEY=external-secret-value',
  "EXTERNAL_API_HEADERS='{\"Authorization\":\"Bearer header-secret-value\"}'",
  "EXTERNAL_API_BODY='{\"password\":\"body-secret-value\"}'",
  'AI_PROCESSING_MODE=flex',
  'SCAN_INTERVAL=*/30 * * * *',
  "CUSTOM_PROMPT='Prefer broad archive categories.'",
  "OWNER_PROFILES=`alex: O'Reilly\nfinance: vendor bills`",
  'CONTROLLED_TAGGING_ENABLED=yes',
  'TAG_MAX_PER_DOCUMENT=4'
].join('\n'));

const service = require('../dist/services/settingsV3Service');
const setupService = require('../dist/services/setupService');
const runtimeEnvironment = require('../dist/services/runtimeEnvironment');
const providerDiscoveryService = require('../dist/services/providerDiscoveryService');

test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test('GET settings redacts every secret while retaining configured metadata', async () => {
  const settings = await service.getSettings();
  const serialized = JSON.stringify(settings);
  assert.equal(serialized.includes('paperless-secret-value'), false);
  assert.equal(serialized.includes('proxy-secret-value'), false);
  assert.equal(serialized.includes('external-secret-value'), false);
  assert.equal(serialized.includes('header-secret-value'), false);
  assert.equal(serialized.includes('body-secret-value'), false);
  assert.equal(settings.paperless.token.configured, true);
  assert.equal(settings.security.apiKey.configured, true);
  assert.equal(settings.security.externalApiHeaders.configured, true);
  assert.equal(settings.security.externalApiBody.configured, true);
  assert.equal(settings.ai.providers.find((provider) => provider.instanceId === 'compatible').configuration.apiKey.configured, true);
});

test('GET settings reports the running version, not a stale one persisted in the data directory', async () => {
  const settings = await service.getSettings();
  assert.equal(settings.diagnostics.version, require('../package.json').version);
});

test('GET settings follows injected-environment precedence and preserves flex mode', async () => {
  const settings = await service.getSettings();
  assert.equal(settings.automation.scanInterval, '5 * * * *');
  assert.equal(settings.automation.processingMode, 'flex');
  assert.equal(settings.automation.customPrompt, 'Prefer broad archive categories.');
});

test('empty injected placeholders do not mask credentials saved in Settings', async () => {
  assert.equal(
    runtimeEnvironment.runtimeEnvironmentValue('OPENROUTER_API_KEY'),
    'openrouter-persisted-secret'
  );
  const settings = await service.getSettings();
  assert.equal(
    settings.ai.providers.find((provider) => provider.instanceId === 'openrouter').configuration.apiKey.configured,
    true
  );
});

test('PATCH uses a revision and empty secret fields retain existing values', async () => {
  const before = await service.getSettings();
  const after = await service.patchSettings({
    revision: before.revision,
    patch: {
      provider: { instanceId: 'compatible', values: { apiKey: '', baseUrl: 'http://127.0.0.1:8317/v1' } },
      ai: { activeProviderInstanceId: 'compatible', activeModelId: 'gpt-5.6-sol' }
    }
  });
  const persisted = await setupService.loadConfig();
  assert.equal(persisted.COMPATIBLE_API_KEY, 'proxy-secret-value');
  assert.equal(persisted.COMPATIBLE_BASE_URL, 'http://127.0.0.1:8317/v1');
  assert.equal(persisted.TAGVICO_UI_MANAGED_AI_SELECTION, 'yes');
  assert.equal(after.ai.activeProviderInstanceId, 'compatible');
  assert.equal(after.ai.activeModelId, 'gpt-5.6-sol');
  assert.equal(after.automation.scanInterval, '5 * * * *');
  assert.notEqual(after.revision, before.revision);
});

test('PATCH stores the canonical Paperless API base and retains empty write-only templates', async () => {
  const before = await service.getSettings();
  await service.patchSettings({
    revision: before.revision,
    patch: {
      paperless: { baseUrl: 'http://paperless.example:8000/' },
      security: { externalApiHeaders: '', externalApiBody: '' }
    }
  });
  const persisted = await setupService.loadConfig();
  assert.equal(persisted.PAPERLESS_API_URL, 'http://paperless.example:8000/api');
  assert.equal(persisted.EXTERNAL_API_HEADERS, '{"Authorization":"Bearer header-secret-value"}');
  assert.equal(persisted.EXTERNAL_API_BODY, '{"password":"body-secret-value"}');
  assert.equal(persisted.OWNER_PROFILES, "alex: O'Reilly\nfinance: vendor bills");
});

test('stale revisions fail without overwriting newer settings', async () => {
  const current = await service.getSettings();
  await assert.rejects(
    service.patchSettings({
      revision: '000000000000000000000000',
      patch: { automation: { automaticProcessing: true } }
    }),
    (error) => error && error.status === 409
  );
  assert.equal((await service.getSettings()).revision, current.revision);
});

test('invalid tag limits are rejected by the typed patch schema', async () => {
  const current = await service.getSettings();
  await assert.rejects(service.patchSettings({
    revision: current.revision,
    patch: { tags: { maximumPerDocument: 100 } }
  }), /Use at most 10\./);
});

test('empty trigger tags mean scan all and prompts persist as explicit settings', async () => {
  const current = await service.getSettings();
  const after = await service.patchSettings({
    revision: current.revision,
    patch: {
      automation: {
        processPredefinedDocuments: true,
        customPrompt: 'Use stable categories.',
        advancedSystemPrompt: 'Classify household documents conservatively.'
      },
      tags: { triggerTags: [] }
    }
  });
  const persisted = await setupService.loadConfig();
  assert.equal(persisted.PROCESS_PREDEFINED_DOCUMENTS, 'no');
  assert.equal(persisted.TAGS, '');
  assert.equal(persisted.CUSTOM_PROMPT, 'Use stable categories.');
  assert.equal(persisted.SYSTEM_PROMPT, 'Classify household documents conservatively.');
  assert.equal(after.automation.processPredefinedDocuments, false);
  assert.equal(after.automation.customPrompt, 'Use stable categories.');
});

test('PATCH rejects unsupported enrichment methods, unsafe URLs and malformed JSON', async () => {
  const current = await service.getSettings();
  await assert.rejects(service.patchSettings({
    revision: current.revision,
    patch: { security: { externalApiMethod: 'PATCH' } }
  }));
  await assert.rejects(service.patchSettings({
    revision: current.revision,
    patch: { security: { externalApiUrl: 'https://user:password@example.com/lookup' } }
  }), /without embedded credentials/);
  await assert.rejects(service.patchSettings({
    revision: current.revision,
    patch: { security: { externalApiHeaders: 'not-json' } }
  }), /valid JSON object/);
});

test('PATCH validates subscription models before persisting v3 settings', async () => {
  const discoverProviderModels = providerDiscoveryService.discoverProviderModels;
  providerDiscoveryService.discoverProviderModels = async (providerId) => {
    assert.equal(providerId, 'codex');
    return [{ id: 'available-account-model', name: 'Available account model' }];
  };
  try {
    const current = await service.getSettings();
    const before = await setupService.loadConfig();
    await assert.rejects(service.patchSettings({
      revision: current.revision,
      patch: {
        ai: {
          activeProviderInstanceId: 'codex',
          activeModelId: 'stale-account-model'
        }
      }
    }), /not available to this runtime account/);
    const after = await setupService.loadConfig();
    assert.equal(after.AI_PROVIDER, before.AI_PROVIDER);
    assert.equal(after.CODEX_MODEL, before.CODEX_MODEL);
  } finally {
    providerDiscoveryService.discoverProviderModels = discoverProviderModels;
  }
});

test('PATCH revalidates active Copilot models when account credentials change', async () => {
  const discoverProviderModels = providerDiscoveryService.discoverProviderModels;
  try {
    providerDiscoveryService.discoverProviderModels = async () => [
      { id: 'copilot-account-model', name: 'Copilot account model' }
    ];
    const current = await service.getSettings();
    await service.patchSettings({
      revision: current.revision,
      patch: {
        ai: {
          activeProviderInstanceId: 'copilot',
          activeModelId: 'copilot-account-model'
        }
      }
    });
    const selected = await service.getSettings();
    const before = await setupService.loadConfig();
    providerDiscoveryService.discoverProviderModels = async () => [
      { id: 'different-plan-model', name: 'Different plan model' }
    ];
    await assert.rejects(service.patchSettings({
      revision: selected.revision,
      patch: {
        provider: {
          instanceId: 'copilot',
          values: { githubToken: 'replacement-account-token' }
        }
      }
    }), /not available to this runtime account/);
    const after = await setupService.loadConfig();
    assert.equal(after.COPILOT_GITHUB_TOKEN, before.COPILOT_GITHUB_TOKEN);
  } finally {
    providerDiscoveryService.discoverProviderModels = discoverProviderModels;
  }
});

test('PATCH validates Copilot changes against the externally managed credential', async () => {
  const discoverProviderModels = providerDiscoveryService.discoverProviderModels;
  try {
    providerDiscoveryService.discoverProviderModels = async (providerId, environment) => {
      assert.equal(providerId, 'copilot');
      assert.equal(environment.COPILOT_GITHUB_TOKEN, 'injected-copilot-token');
      return [{ id: 'injected-account-model', name: 'Injected account model' }];
    };
    const current = await service.getSettings();
    await service.patchSettings({
      revision: current.revision,
      patch: {
        provider: {
          instanceId: 'copilot',
          values: { githubToken: 'browser-supplied-token' }
        },
        ai: {
          activeProviderInstanceId: 'copilot',
          activeModelId: 'injected-account-model'
        }
      }
    });
    const persisted = await setupService.loadConfig();
    assert.equal(persisted.COPILOT_GITHUB_TOKEN, 'browser-supplied-token');
  } finally {
    providerDiscoveryService.discoverProviderModels = discoverProviderModels;
  }
});

test('PATCH rechecks optimistic concurrency after slow model discovery', async () => {
  const discoverProviderModels = providerDiscoveryService.discoverProviderModels;
  let releaseDiscovery;
  let signalDiscoveryStarted;
  const discoveryStarted = new Promise((resolve) => { signalDiscoveryStarted = resolve; });
  const discoveryRelease = new Promise((resolve) => { releaseDiscovery = resolve; });
  try {
    providerDiscoveryService.discoverProviderModels = async () => {
      signalDiscoveryStarted();
      await discoveryRelease;
      return [{ id: 'slow-account-model', name: 'Slow account model' }];
    };
    const current = await service.getSettings();
    const slowPatch = service.patchSettings({
      revision: current.revision,
      patch: {
        ai: {
          activeProviderInstanceId: 'codex',
          activeModelId: 'slow-account-model'
        }
      }
    });
    await discoveryStarted;
    await service.patchSettings({
      revision: current.revision,
      patch: { automation: { automaticProcessing: true } }
    });
    releaseDiscovery();
    await assert.rejects(slowPatch, (error) => error && error.status === 409);
    assert.notEqual((await service.getSettings()).revision, current.revision);
  } finally {
    releaseDiscovery?.();
    providerDiscoveryService.discoverProviderModels = discoverProviderModels;
  }
});

test('PATCH saves the browser address for Open Paperless links and clears it again', async () => {
  const before = await service.getSettings();
  assert.equal(before.paperless.publicUrl, '');
  const saved = await service.patchSettings({
    revision: before.revision,
    patch: { paperless: { publicUrl: 'https://paperless.example.org/' } }
  });
  assert.equal(saved.paperless.publicUrl, 'https://paperless.example.org');
  assert.equal((await setupService.loadConfig()).PAPERLESS_PUBLIC_URL, 'https://paperless.example.org');
  assert.equal(saved.paperless.baseUrl, before.paperless.baseUrl);
  const cleared = await service.patchSettings({
    revision: saved.revision,
    patch: { paperless: { publicUrl: '' } }
  });
  assert.equal(cleared.paperless.publicUrl, '');
  await assert.rejects(service.patchSettings({
    revision: cleared.revision,
    patch: { paperless: { publicUrl: 'not an address' } }
  }), /http:\/\/ or https:\/\//);
});

test('PATCH rejects an invalid scan schedule with the field it belongs to', async () => {
  const current = await service.getSettings();
  await assert.rejects(
    service.patchSettings({ revision: current.revision, patch: { automation: { scanInterval: 'every day' } } }),
    (error) => error instanceof service.SettingsValidationError
      && error.field === 'automation.scanInterval'
      && error.status === 400
      && /cron/.test(error.message)
  );
  assert.equal((await setupService.loadConfig()).SCAN_INTERVAL, '*/30 * * * *');
  const valid = await service.patchSettings({
    revision: current.revision,
    patch: { automation: { scanInterval: '*/10 * * * *' } }
  });
  assert.equal((await setupService.loadConfig()).SCAN_INTERVAL, '*/10 * * * *');
  assert.ok(valid.revision);
});

test('PATCH validation errors are readable messages, not raw issue lists', async () => {
  const current = await service.getSettings();
  const failure = await service.patchSettings({
    revision: current.revision,
    patch: { tags: { maximumPerDocument: 99 } }
  }).catch((error) => error);
  assert.equal(failure.issues[0].message, 'Use at most 10.');
  assert.deepEqual(failure.issues[0].path, ['patch', 'tags', 'maximumPerDocument']);
});

test('PATCH refuses to switch to a provider whose required key is missing', async () => {
  const current = await service.getSettings();
  await assert.rejects(
    service.patchSettings({ revision: current.revision, patch: { ai: { activeProviderInstanceId: 'openai' } } }),
    (error) => error instanceof service.SettingsValidationError
      && error.field === 'ai.activeProviderInstanceId'
      && /needs its api key/i.test(error.message)
  );
  const after = await service.patchSettings({
    revision: current.revision,
    patch: {
      provider: { instanceId: 'openai', values: { apiKey: 'sk-test-openai-key-1234567890' } },
      ai: { activeProviderInstanceId: 'openai', activeModelId: 'gpt-6-luna' }
    }
  });
  assert.equal(after.ai.activeProviderInstanceId, 'openai');
  assert.equal(after.ai.activeModelId, 'gpt-6-luna');
  assert.equal((await setupService.loadConfig()).COMPANION_PROVIDER, 'openai');
});
