const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('first-run setup verifies both dependencies and resumes without browser-stored secrets', () => {
  const wizard = read('src/components/settings/setup-wizard.tsx');
  assert.match(wizard, /fetch\('\/api\/paperless\/probe'/);
  assert.match(wizard, /fetch\('\/api\/setup\/v3\/provider-probe'/);
  assert.match(wizard, /fetch\('\/api\/setup\/v3\/codex\/login'/);
  assert.match(wizard, /ChatGPT account/);
  assert.match(wizard, /const updateProviderValue/);
  assert.match(wizard, /Connection details changed\. Check the runtime again/);
  const providerInvalidation = wizard.slice(
    wizard.indexOf('const updateProviderValue'),
    wizard.indexOf('const checkPaperless')
  );
  assert.match(providerInvalidation, /setModels\(\[\]\)/);
  assert.match(providerInvalidation, /setVerifiedModelId\(''\)/);
  assert.match(providerInvalidation, /providerProbeId\.current \+= 1/);
  assert.match(providerInvalidation, /modelId: ''/);
  assert.match(wizard, /validatedModelId/);
  assert.match(wizard, /Model ID/);
  assert.match(wizard, /safe test tool call/);
  assert.doesNotMatch(wizard, /discovered\[0\]\.id/);
  assert.match(wizard, /if \(probeId !== providerProbeId\.current\) return/);
  assert.match(read('routes/setup.ts'), /codexAuthService\.models\(\)/);
  assert.match(
    read('routes/setup.ts'),
    /status\.models\.includes\(\s*effectiveSetupConfig\.COPILOT_MODEL \|\| effectiveSetupConfig\.AI_MODEL/
  );
  assert.match(wizard, /<PaperlessDiscovery/);
  assert.match(wizard, /endpoint="\/api\/paperless\/discover"/);
  assert.match(wizard, /onSelect=\{useDiscoveredPaperless\}/);
  const setupRoutes = read('routes/setup.ts');
  assert.match(setupRoutes, /router\.post\('\/api\/paperless\/discover', allowDuringSetup/);
  // Discovery has to reach a Paperless container on the same Docker bridge, not
  // just the hardcoded home-LAN range, so the sweep comes from real interfaces.
  assert.match(setupRoutes, /function localSweepPrefixes/);
  assert.match(setupRoutes, /os\.networkInterfaces\(\)/);
  assert.match(setupRoutes, /new Set\(\[\.\.\.localSweepPrefixes\(\), '192\.168\.1'\]\)/);
  assert.match(setupRoutes, /'paperless-webserver'/);
  assert.match(setupRoutes, /host\.docker\.internal/);
  // ~1000 probes per sweep must not open ~1000 sockets at once.
  assert.match(setupRoutes, /DISCOVERY_PROBE_CONCURRENCY = 256/);
  assert.match(setupRoutes, /await probeDiscoveryCandidates\(candidates\.map\(String\)\)/);
  assert.doesNotMatch(setupRoutes, /Promise\.all\(candidates\.map/);
  assert.match(wizard, /Restored non-secret fields for this tab/);
  assert.match(wizard, /Object\.entries\(state\.providerValues\)\.filter/);

  const storedDraft = wizard.match(/sessionStorage\.setItem\(DRAFT_KEY, JSON\.stringify\(\{([\s\S]*?)\}\)\);/)?.[1] || '';
  assert.doesNotMatch(storedDraft, /paperlessToken/);
  assert.doesNotMatch(storedDraft, /\bpassword\b/);
  assert.doesNotMatch(storedDraft, /confirmPassword/);
  assert.match(storedDraft, /providerValues: publicProviderValues/);
});

test('provider probe validates the selected model and supports catalog-less compatible runtimes', () => {
  const route = read('src/app/api/setup/v3/provider-probe/route.ts');
  const validation = read('services/providerSetupValidation.ts');
  const providerRegistry = read('services/providerRegistry.ts');
  const setupService = read('services/setupService.ts');
  const setupRoutes = read('routes/setup.ts');
  const acceptance = read('scripts/release-acceptance.mjs');
  const fixture = read('tests/fixtures/release-mock-server.mjs');

  assert.match(route, /modelId: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(200\)\.optional\(\)/);
  assert.match(route, /PROBE_MAX_CONCURRENT = 3/);
  assert.match(providerRegistry, /MAX_DISCOVERY_RESPONSE_BYTES = 1024 \* 1024/);
  assert.match(providerRegistry, /MAX_DISCOVERY_MODELS = 500/);
  assert.match(providerRegistry, /readBoundedResponse\(response\)/);
  assert.match(route, /releaseAdmission = acquireProbeAdmission\(\)/);
  assert.match(route, /finally\s*\{\s*releaseAdmission\?\.\(\)/);
  assert.match(route, /validateProviderSetupModel\(input\.instanceId, values, input\.modelId\)/);
  assert.match(route, /supportsCompanionModel\(model, input\.instanceId\)/);
  assert.match(route, /capabilities: \['chat', 'tools'\]/);
  assert.match(route, /validatedModelId/);
  const manualSelection = route.slice(
    route.indexOf('if (definition.manualModelInput)'),
    route.indexOf('validatedModelId = input.modelId')
  );
  assert.ok(
    manualSelection.indexOf('validateProviderSetupModel') < manualSelection.indexOf('const selectionContract')
  );
  assert.match(validation, /validateCustomConfig\(values\.baseUrl, values\.apiKey, model\)/);
  assert.match(validation, /validateOpenAIConfig\(values\.apiKey, model\)/);
  assert.match(setupService, /confirm_tagvico_tool_support/);
  assert.match(setupService, /tool_choice/);
  assert.match(setupService, /hasSetupToolCall/);
  assert.match(setupService, /hasSupportedSetupArguments/);
  assert.match(setupService, /record\.supported === true/);
  assert.match(setupService, /isOpenAIReasoningModel as isReasoningModel/);
  assert.match(setupService, /SETUP_TOOL_REASONING_TOKEN_BUDGET = 2048/);
  assert.match(setupService, /SETUP_TOOL_STANDARD_TOKEN_BUDGET = 64/);
  assert.match(setupService, /reasoning_effort: chatCompletionsToolReasoningEffort\(model\)/);
  assert.match(setupService, /\{ forceCompletionTokens: true \}/);
  assert.match(setupService, /\{ forceStandardTokens: true \}/);
  assert.match(setupService, /max_completion_tokens\|unsupported/);
  assert.match(setupService, /\/api\/chat/);
  assert.match(setupService, /message\?\.tool_calls/);
  assert.match(setupService, /SETUP_VALIDATION_TIMEOUT_MS = 15_000/);
  assert.match(setupService, /selectedModel \|\| process\.env\.OPENAI_MODEL/);
  assert.match(setupRoutes, /validateOpenAIConfig\(\s*effectiveSetupConfig\.OPENAI_API_KEY,\s*effectiveSetupConfig\.OPENAI_MODEL/);
  assert.match(setupRoutes, /withSetupProviderTimeout(?:<SetupProviderStatus>)?\(\s*copilotService\.healthcheck/);
  assert.match(acceptance, /selectedProviderProbe\.body\.validatedModelId/);
  assert.match(acceptance, /cataloglessProviderProbe\.body\.validatedModelId/);
  assert.match(acceptance, /Array\.isArray\(tasks\.body\?\.results\)/);
  assert.match(acceptance, /Number\(task\?\.related_document\)/);
  assert.match(acceptance, /task\.related_document\.id/);
  assert.match(fixture, /\/catalogless\/chat\/completions/);
  assert.match(fixture, /\/__release\/config/);
  assert.match(fixture, /text-embedding-release/);
});

test('new setup starts in review mode with scheduled scans paused', () => {
  const setupRoute = read('src/app/api/setup/v3/route.ts');
  assert.match(setupRoute, /disableAutomaticProcessing: true/);
  assert.match(setupRoute, /write_mode: 'review'/);
  assert.match(setupRoute, /AI_MODEL: input\.provider\.modelId/);
  assert.match(read('services/configHelpers.ts'), /payload\.AI_MODEL/);
});

test('setup is serialized and remains retryable until the owner exists', () => {
  const setupRoutes = read('routes/setup.ts');
  const setupService = read('services/setupService.ts');
  const documentModel = read('models/document.ts');
  const handler = setupRoutes.slice(
    setupRoutes.indexOf('let setupRequestQueue'),
    setupRoutes.indexOf("router.post('/settings'")
  );
  assert.match(handler, /acquireSetupRequestLock/);
  assert.match(handler, /setupPendingRequests >= SETUP_MAX_PENDING_REQUESTS/);
  assert.match(setupRoutes, /router\.post\('\/setup', setupLimiter, express\.json\(\)/);
  assert.match(handler, /await setupService\.saveValidatedConfig\(config\)/);
  assert.doesNotMatch(handler, /await setupService\.saveConfig\(config\)/);
  assert.match(setupService, /async saveValidatedConfig\(config: SetupConfig\)/);
  assert.match(setupService, /const checks = await Promise\.all/);
  assert.match(read('src/app/api/setup/v3/route.ts'), /AbortSignal\.timeout\(240_000\)/);
  assert.match(handler, /finally\s*\{\s*releaseSetupRequestLock\?\.\(\)/);
  assert.match(handler, /setupPendingRequests -= 1/);
  assert.match(handler, /config\.TAGVICO_AI_INITIAL_SETUP = 'no'/);
  assert.match(setupRoutes, /async function recoverCompletedSetup\(\)/);
  assert.match(setupRoutes, /configured = await recoverCompletedSetup\(\)/);
  assert.ok(
    setupRoutes.indexOf('configured = await recoverCompletedSetup()')
      < setupRoutes.indexOf('if (req.path.startsWith')
  );
  assert.ok(
    handler.indexOf('documentModel.hasAnyUser') < handler.indexOf('buildConfigForSave')
  );
  assert.match(setupRoutes, /return next\(error\)/);
  assert.match(handler, /An owner account already exists/);
  assert.doesNotMatch(documentModel, /DELETE FROM users/);
  assert.match(documentModel, /db\.transaction/);
  assert.match(documentModel, /SELECT COUNT\(\*\) AS count FROM users/);
  assert.match(documentModel, /Refusing to replace an existing owner account/);
  assert.match(documentModel, /async hasAnyUser\(\)/);
  assert.match(documentModel, /SELECT 1 AS present FROM users LIMIT 1/);
  assert.ok(
    handler.indexOf('documentModel.addUser') < handler.lastIndexOf("savePartialConfig({ TAGVICO_AI_INITIAL_SETUP: 'yes' })")
  );
  assert.match(handler, /Initial setup remains open for retry/);
  assert.match(read('services/paperlessService.ts'), /timeout: PAPERLESS_REQUEST_TIMEOUT_MS/);
  assert.match(setupRoutes, /const effectiveSetupConfig = setupService\.effectiveConfig\(buildConfigForSave\(req\.body\)\)/);
  assert.match(setupRoutes, /effectiveSetupConfig\.PAPERLESS_API_TOKEN/);
  assert.match(
    setupRoutes,
    /effectiveSetupConfig\.OPENROUTER_API_KEY \|\| effectiveSetupConfig\.OPENAI_API_KEY/
  );
  assert.match(setupRoutes, /OPENROUTER_BASE_URL: injectedEnvironmentValue\('OPENROUTER_BASE_URL'\) \|\| providerPayload\.openrouterBaseUrl/);
  assert.match(setupService, /injectedEnvironmentValue\(name: string\)/);
  assert.match(setupService, /effectiveConfig\(config: SetupConfig\)/);
  assert.match(setupService, /config = this\.effectiveConfig\(config\)/);
  assert.match(setupService, /runtimeConfig\.injectedEnvironment = injectedEnvironment/);
  assert.match(setupRoutes, /OLLAMA_API_KEY: providerPayload\.provider === 'ollama'/);
  assert.match(setupRoutes, /providerConfig\.ollamaApiKey \|\| currentConfig\.OLLAMA_API_KEY/);
  assert.match(setupRoutes, /'OLLAMA_API_KEY'/);
  assert.match(setupService, /config\.OLLAMA_MODEL,\s*config\.OLLAMA_API_KEY/);
  assert.match(setupService, /config\.OLLAMA_CLOUD_MODEL,\s*config\.OLLAMA_CLOUD_API_KEY/);
  assert.doesNotMatch(setupService, /OLLAMA_CLOUD_API_KEY \|\| config\.OLLAMA_API_KEY/);
  const runtimeConfig = read('config/config.ts');
  assert.match(runtimeConfig, /ollama:\s*\{\s*apiKey: process\.env\.OLLAMA_API_KEY \|\| ''/);
  assert.match(runtimeConfig, /ollamaCloud:\s*\{\s*apiKey: process\.env\.OLLAMA_CLOUD_API_KEY \|\| ''/);
  assert.doesNotMatch(runtimeConfig, /OLLAMA_CLOUD_API_KEY \|\| process\.env\.OLLAMA_API_KEY/);
});

test('first-run scan scheduling can be enabled later without restarting', () => {
  const server = read('server.ts');
  const registration = server.indexOf('scanScheduler.register(async () =>');
  const setupCheck = server.indexOf('const isConfigured = await setupService.isConfigured()', registration);

  assert.ok(registration >= 0);
  assert.ok(setupCheck > registration);
  assert.match(server, /if \(!await setupService\.isConfigured\(\)\) return/);
  assert.match(server, /await scanDocuments\(\)/);
  const setupService = read('services/setupService.ts');
  assert.match(setupService, /const persistedEnvironment = this\.readPersistedEnvironment\(\)/);
  assert.match(setupService, /delete process\.env\[key\]/);
  assert.match(setupService, /process\.env\[key\] = value/);
});

test('Copilot setup probes bound startup, auth, model discovery, and cleanup', () => {
  const copilot = read('services/copilotService.ts');
  assert.match(copilot, /COPILOT_OPERATION_TIMEOUT_MS = 10_000/);
  assert.match(copilot, /COPILOT_SHUTDOWN_TIMEOUT_MS = 2_000/);
  assert.match(copilot, /withCopilotTimeout\(client\.start\(\), 'startup'\)/);
  assert.match(copilot, /withCopilotTimeout\(client\.getAuthStatus\(\), 'authentication check'\)/);
  assert.match(copilot, /withCopilotTimeout\(client\.listModels\(\), 'model discovery'\)/);
  assert.match(copilot, /await stopClient\(client\)/);
  assert.match(copilot, /fs\.rm\(workingDirectory, \{ recursive: true, force: true \}\)/);
});

test('account providers are selected atomically with a live model', () => {
  const settings = read('src/components/settings/settings-workspace.tsx');
  const selector = settings.slice(
    settings.indexOf('const selectProvider'),
    settings.indexOf('const selectModel')
  );
  assert.match(selector, /\['codex', 'copilot'\]\.includes\(instanceId\)/);
  assert.match(selector, /const models = await loadModels\(instanceId\)/);
  assert.match(selector, /const selectionId = \+\+providerSelectionId\.current/);
  assert.match(selector, /if \(selectionId !== providerSelectionId\.current\) return/);
  assert.match(selector, /activeProviderInstanceId: instanceId/);
  assert.match(selector, /activeModelId: selectedModel\.id/);
});

test('first success opens Ask Tagvico and research sources link to document views', () => {
  const login = read('src/components/login-form.tsx');
  const companion = read('src/components/companion.tsx');
  const documentSource = read('src/app/(app)/documents/[id]/page.tsx');
  assert.match(login, /firstRun \? '\/companion\?welcome=1' : '\/actions'/);
  assert.match(companion, /href=\{`\/documents\/\$\{document\.id\}`\}/);
  assert.match(companion, /Your connections are ready\. Ask a read-only question/);
  assert.match(companion, /Tagvico will wait for approval before changing anything/);
  assert.match(documentSource, /requireUser\(\)/);
  assert.match(documentSource, /getPaperlessDocument/);
  assert.match(documentSource, /axios\.isAxiosError\(error\) && error\.response\?\.status === 404/);
  assert.match(documentSource, /throw error/);
  assert.match(documentSource, /notFound\(\)/);
  assert.match(documentSource, /This view is read-only/);
});

test('mobile settings navigation scrolls internally without widening the page', () => {
  const styles = read('src/app/globals.css');
  const mobileSettings = styles.slice(styles.lastIndexOf('@media (max-width: 820px)'));
  assert.match(mobileSettings, /\.settings-nav\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(mobileSettings, /max-width:\s*100%/);
  assert.match(mobileSettings, /margin-right:\s*0/);
});

test('Companion relative dates hydrate from one server timestamp and advance after mount', () => {
  const page = read('src/app/(app)/companion/page.tsx');
  const companion = read('src/components/companion.tsx');
  assert.match(page, /renderedAt=\{Date\.now\(\)\}/);
  assert.match(companion, /useState\(renderedAt\)/);
  assert.match(companion, /setInterval\(\(\) => setReferenceTime\(Date\.now\(\)\), 60_000\)/);
  assert.match(companion, /relativeDate\(session\.updated_at,\s*referenceTime\)/);
  assert.match(companion, /Intl\.RelativeTimeFormat\('en'/);
  assert.match(companion, /value\.replace\(' ', 'T'\).*Z/);
  assert.doesNotMatch(companion, /timestamp - Date\.now\(\)/);
});

test('subscription sign-in routes are limited to the open initial setup window', () => {
  const start = read('src/app/api/setup/v3/codex/login/route.ts');
  const poll = read('src/app/api/setup/v3/codex/login/[id]/route.ts');
  const cancel = read('src/app/api/setup/v3/codex/login/[id]/cancel/route.ts');
  const guard = read('src/lib/server/initial-setup.ts');
  for (const route of [start, poll, cancel]) {
    assert.match(route, /assertInitialSetupOpen\(request\)/);
    assert.doesNotMatch(route, /requireApiUser/);
  }
  assert.match(guard, /assertSameOrigin\(request\)/);
  assert.match(guard, /allowsInitialSetup\(\)/);
  assert.match(guard, /getBackendConfigurationState/);
  assert.match(guard, /Initial setup is complete/);
  assert.match(read('src/components/settings/setup-wizard.tsx'), /setState\(\(current\) => \(\{ \.\.\.current, modelId: '' \}\)\)/);
  assert.match(
    read('src/components/settings/setup-wizard.tsx'),
    /Date\.now\(\) > deadline[\s\S]*codex\/login\/\$\{encodeURIComponent\(loginId\)\}\/cancel/
  );
  const setupRoutes = read('routes/setup.ts');
  assert.match(setupRoutes, /const codexLoginLimiter = createRateLimiter/);
  assert.match(setupRoutes, /router\.post\('\/api\/codex\/login', allowDuringSetup, codexLoginLimiter/);
  const codexAuth = read('services/codexAuthService.ts');
  assert.match(codexAuth, /version: TAGVICO_VERSION/);
  assert.doesNotMatch(codexAuth, /version: '3\.2\.0'/);
  assert.match(codexAuth, /child\.kill\('SIGTERM'\)/);
  assert.match(codexAuth, /child\.kill\('SIGKILL'\)/);
});

test('Docker release fixture keeps the mock document IDs used by acceptance', () => {
  const compose = read('docker-compose.e2e.yml');
  const fixture = read('tests/fixtures/release-mock-server.mjs');
  const acceptance = read('scripts/release-acceptance.mjs');
  assert.doesNotMatch(compose, /RELEASE_(?:ACTION_)?DOCUMENT_ID/);
  assert.doesNotMatch(compose, /PAPERLESS_API_URL:/);
  assert.match(fixture, /RELEASE_DOCUMENT_ID \|\| 42/);
  assert.match(fixture, /RELEASE_ACTION_DOCUMENT_ID \|\| 43/);
  assert.match(acceptance, /paperless-ngx:8000/);
  assert.match(acceptance, /\/api\/documents\/post_document\//);
  assert.match(acceptance, /paperlessDocumentIds: \[releaseDocumentId, releaseActionDocumentId\]/);
});

test('published deployment examples require explicit LAN exposure and remote setup', () => {
  const compose = read('docker-compose.yml');
  const readme = read('README.md');
  const v3Install = read('website/versions/v3/installation.md');
  const unraid = read('deploy/unraid/tagvico-ai.xml');
  const dockerfile = read('Dockerfile');
  assert.match(compose, /PAPERLESS_BIND_ADDRESS:-127\.0\.0\.1/);
  assert.match(compose, /TAGVICO_AI_BIND_ADDRESS:-127\.0\.0\.1/);
  assert.match(compose, /ALLOW_REMOTE_SETUP:-no/);
  assert.match(compose, /TAGVICO_AI_BIND_ADDRESS: "\$\{TAGVICO_AI_BIND_ADDRESS:-127\.0\.0\.1\}"/);
  assert.match(compose, /TAGVICO_TELEMETRY_ENDPOINT:-https:\/\/telemetry\.tagvico\.arturf\.ch\/v1\/heartbeat/);
  for (const guide of [readme, v3Install]) {
    assert.match(guide, /TAGVICO_AI_BIND_ADDRESS:-127\.0\.0\.1/);
    assert.doesNotMatch(guide, /ALLOW_REMOTE_SETUP: "yes"/);
    assert.match(guide, /TAGVICO_AI_BIND_ADDRESS=0\.0\.0\.0/);
    assert.match(guide, /ALLOW_REMOTE_SETUP=yes/);
    assert.match(guide, /telemetry\.tagvico\.arturf\.ch\/v1\/heartbeat/);
  }
  assert.match(unraid, /Target="ALLOW_REMOTE_SETUP" Default="no"/);
  assert.match(unraid, />no<\/Config>/);
  assert.match(unraid, /Target="TAGVICO_TELEMETRY_ENDPOINT"[\s\S]*\/v1\/heartbeat/);
  assert.match(dockerfile, /TAGVICO_TELEMETRY_ENDPOINT=https:\/\/telemetry\.tagvico\.arturf\.ch\/v1\/heartbeat/);
});

test('manual Paperless option failures return a retryable response instead of rejecting the route', () => {
  const routes = read('routes/setup.ts');
  const handler = routes.slice(
    routes.indexOf("router.get('/manual/options'"),
    routes.indexOf('/manual/tags:')
  );
  assert.match(handler, /try\s*\{/);
  assert.match(handler, /catch \(error\)/);
  assert.match(handler, /res\.status\(502\)\.json/);
  assert.match(handler, /Check the connection and retry/);
  assert.match(handler, /listCorrespondentsNames\(\{ throwOnError: true \}\)/);
  assert.match(handler, /listDocumentTypesNames\(\{ throwOnError: true \}\)/);
  assert.match(handler, /getUsers\(\{ throwOnError: true \}\)/);
  const paperless = read('services/paperlessService.ts');
  assert.match(paperless, /if \(throwOnError\) throw error/);
});

test('global history rescan remains available when the active filter has no matches', () => {
  const history = read('src/components/history-workspace.tsx');
  assert.match(history, /setArchiveTotal\(payload\.recordsTotal \|\| 0\)/);
  assert.match(history, /archiveTotal > 0 \? <button[^>]*>[\s\S]*?Rescan all/);
});

test('landing metrics stay separate, anonymous and privacy-signal aware', () => {
  const landing = read('docs/index.html');
  assert.doesNotMatch(landing, /ALLOW_REMOTE_SETUP: "yes"/);
  assert.equal(landing.match(/TAGVICO_AI_BIND_ADDRESS:-127\.0\.0\.1/g)?.length, 4);
  assert.equal(landing.match(/telemetry\.tagvico\.arturf\.ch\/v1\/heartbeat/g)?.length, 2);
  assert.match(landing, /ALLOW_REMOTE_SETUP=yes[\s\S]*only until[\s\S]*setup completes/);
  assert.match(landing, /Requests, not unique people/);
  assert.match(landing, /credentials: "omit"/);
  assert.match(landing, /referrerPolicy: "no-referrer"/);
  assert.match(landing, /navigator\.globalPrivacyControl !== true/);
  assert.match(landing, /navigator\.doNotTrack !== "1"/);
  assert.doesNotMatch(landing, /localStorage\./);
});

test('public metrics receiver rejects foreign origins, bounds writes and suppresses small installation counts', async () => {
  const source = read('telemetry/worker.js');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const worker = (await import(moduleUrl)).default;
  const statements = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      return {
        bind() { return this; },
        async run() { return { success: true }; }
      };
    },
    async batch() {
      return [
        { results: [{ value: 91 }] },
        { results: [{ value: 3 }] }
      ];
    }
  };
  let pageviewAllowed = true;
  let heartbeatAllowed = true;
  const env = {
    DB: db,
    PUBLIC_ORIGIN: 'https://tagvico.example',
    PAGEVIEW_RATE_LIMITER: {
      async limit({ key }) {
        assert.equal(key, 'landing-pageview');
        return { success: pageviewAllowed };
      }
    },
    HEARTBEAT_RATE_LIMITER: {
      async limit({ key }) {
        assert.equal(key, 'installation-heartbeat');
        return { success: heartbeatAllowed };
      }
    }
  };

  const rejected = await worker.fetch(new Request('https://metrics.example/v1/pageview', {
    method: 'POST',
    headers: { origin: 'https://other.example' }
  }), env);
  assert.equal(rejected.status, 403);

  const accepted = await worker.fetch(new Request('https://metrics.example/v1/pageview', {
    method: 'POST',
    headers: { origin: env.PUBLIC_ORIGIN }
  }), env);
  assert.equal(accepted.status, 202);
  assert.ok(statements.some((sql) => sql.includes('landing_pageviews')));

  const writesBeforeLimit = statements.length;
  pageviewAllowed = false;
  const limited = await worker.fetch(new Request('https://metrics.example/v1/pageview', {
    method: 'POST',
    headers: { origin: env.PUBLIC_ORIGIN }
  }), env);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(statements.length, writesBeforeLimit);

  const unavailable = await worker.fetch(new Request('https://metrics.example/v1/pageview', {
    method: 'POST',
    headers: { origin: env.PUBLIC_ORIGIN }
  }), { DB: db, PUBLIC_ORIGIN: env.PUBLIC_ORIGIN });
  assert.equal(unavailable.status, 503);

  const heartbeatPayload = {
    schema: 1,
    daily_id: 'a'.repeat(64),
    monthly_id: 'b'.repeat(64),
    period: { day: '2026-07-28', month: '2026-07' },
    version: '3.2.0',
    documents_processed: '11-100',
    write_mode: 'review',
    provider_category: 'local',
    features: { ocr_rescue: false, custom_fields: true, controlled_tags: true }
  };
  const heartbeat = () => new Request('https://metrics.example/v1/heartbeat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(heartbeatPayload)
  });
  const acceptedHeartbeat = await worker.fetch(heartbeat(), env);
  assert.equal(acceptedHeartbeat.status, 202);
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO heartbeats')));

  const writesBeforeHeartbeatLimit = statements.length;
  heartbeatAllowed = false;
  const limitedHeartbeat = await worker.fetch(heartbeat(), env);
  assert.equal(limitedHeartbeat.status, 429);
  assert.equal(limitedHeartbeat.headers.get('retry-after'), '60');
  assert.equal(statements.length, writesBeforeHeartbeatLimit);

  const heartbeatLimitUnavailable = await worker.fetch(heartbeat(), {
    DB: db,
    PAGEVIEW_RATE_LIMITER: env.PAGEVIEW_RATE_LIMITER
  });
  assert.equal(heartbeatLimitUnavailable.status, 503);
  assert.equal(statements.length, writesBeforeHeartbeatLimit);

  const summary = await worker.fetch(new Request('https://metrics.example/v1/public-summary', {
    headers: { origin: env.PUBLIC_ORIGIN }
  }), env);
  const body = await summary.json();
  assert.equal(body.landing_pageviews.value, 91);
  assert.equal(body.opted_in_active_installations.value, null);
  assert.equal(body.opted_in_active_installations.publication, 'below_threshold');
  assert.equal(body.opted_in_active_installations.threshold, 5);
  assert.equal(summary.headers.get('access-control-allow-origin'), env.PUBLIC_ORIGIN);

  const monitorSummary = await worker.fetch(
    new Request('https://metrics.example/v1/public-summary'),
    env
  );
  assert.equal(monitorSummary.status, 200);
  assert.equal(monitorSummary.headers.get('access-control-allow-origin'), null);

  const foreignSummary = await worker.fetch(new Request('https://metrics.example/v1/public-summary', {
    headers: { origin: 'https://other.example' }
  }), env);
  assert.equal(foreignSummary.status, 403);
});
