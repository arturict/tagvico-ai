const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ExternalApiService,
  parseSelector,
  selectData,
  constants
} = require('../dist/services/externalApiService');

const publicResolver = async () => [{ address: '93.184.216.34', family: 4 }];

function enabledConfig(url, overrides = {}) {
  return {
    enabled: 'yes',
    url,
    method: 'GET',
    headers: '{}',
    body: '{}',
    timeout: 5000,
    ...overrides
  };
}

test('external enrichment rejects non-HTTP(S) and private targets before requesting them', async () => {
  let requestCount = 0;
  const service = new ExternalApiService({
    resolveHostname: publicResolver,
    request: async () => {
      requestCount += 1;
      return { status: 200, data: { unexpected: true } };
    }
  });

  const blockedUrls = [
    'file:///etc/passwd',
    'ftp://example.com/file',
    'http://localhost:3000/private',
    'http://127.0.0.1/private',
    'http://10.0.0.1/private',
    'http://172.16.0.1/private',
    'http://192.168.1.1/private',
    'http://169.254.169.254/latest/meta-data',
    'http://224.0.0.1/private',
    'http://[::1]/private',
    'http://[fc00::1]/private',
    'http://[fe80::1]/private',
    'http://[fec0::1]/private',
    'http://[ff02::1]/private',
    'http://[::ffff:127.0.0.1]/private',
    'http://[::ffff:0:7f00:1]/private',
    'http://[64:ff9b::7f00:1]/private',
    'http://[2002:7f00:1::]/private',
    'http://user:password@example.com/private'
  ];

  for (const url of blockedUrls) {
    assert.equal(await service.fetchData(enabledConfig(url)), null, url);
  }
  assert.equal(requestCount, 0);
});

test('external enrichment rejects DNS answers containing a private address', async () => {
  let requestCount = 0;
  const service = new ExternalApiService({
    resolveHostname: async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.10.10.10', family: 4 }
    ],
    request: async () => {
      requestCount += 1;
      return { status: 200, data: { unexpected: true } };
    }
  });

  assert.equal(await service.fetchData(enabledConfig('https://lookup.example/')), null);
  assert.equal(requestCount, 0);
});

test('external enrichment revalidates DNS for the socket lookup to resist rebinding', async () => {
  let lookups = 0;
  const service = new ExternalApiService({
    resolveHostname: async () => {
      lookups += 1;
      return lookups === 1
        ? [{ address: '93.184.216.34', family: 4 }]
        : [{ address: '127.0.0.1', family: 4 }];
    }
  });

  await service.validateUrl('https://rebind.example/');
  const error = await new Promise((resolve) => {
    service.safeLookup('rebind.example', { family: 4 }, (err) => resolve(err));
  });

  assert.ok(error instanceof Error);
  assert.match(error.message, /blocked/i);
  assert.equal(lookups, 2);
});

test('external enrichment bounds requests, disables redirects, and uses only safe selectors', async () => {
  let requestOptions;
  const payload = {
    result: {
      invoices: [{ vendor: { name: 'Example AG' } }],
      approved: false,
      count: 0,
      secret: 'do-not-evaluate'
    }
  };
  const service = new ExternalApiService({
    resolveHostname: publicResolver,
    request: async (options) => {
      requestOptions = options;
      return { status: 200, data: payload };
    }
  });

  const result = await service.fetchData(enabledConfig('https://lookup.example/', {
    timeout: 999999,
    transformationTemplate: '/result/invoices/0/vendor/name'
  }));

  assert.equal(result, 'Example AG');
  assert.equal(requestOptions.timeout, constants.MAX_TIMEOUT_MS);
  assert.ok(requestOptions.signal instanceof AbortSignal);
  assert.equal(requestOptions.signal.aborted, false);
  assert.equal(requestOptions.maxRedirects, 0);
  assert.equal(requestOptions.maxContentLength, constants.MAX_RESPONSE_BYTES);
  assert.equal(requestOptions.maxBodyLength, constants.MAX_REQUEST_BODY_BYTES);
  assert.equal(requestOptions.proxy, false);
  assert.ok(requestOptions.httpAgent);
  assert.ok(requestOptions.httpsAgent);
  assert.equal(requestOptions.validateStatus(200), true);
  assert.equal(requestOptions.validateStatus(302), false);

  assert.deepEqual(selectData(payload, 'result.invoices[0].vendor.name'), {
    valid: true,
    value: 'Example AG'
  });
  assert.equal(parseSelector('/result/__proto__/polluted'), null);
  assert.equal(parseSelector('return data.result.secret'), null);

  assert.equal(await service.fetchData(enabledConfig('https://lookup.example/', {
    selector: 'result.approved'
  })), false);
  assert.equal(await service.fetchData(enabledConfig('https://lookup.example/', {
    selector: 'result.count'
  })), 0);

  globalThis.__externalApiTransformExecuted = false;
  const noEvalResult = await service.fetchData(enabledConfig('https://lookup.example/', {
    transform: 'globalThis.__externalApiTransformExecuted = true; return data.result.secret'
  }));
  assert.equal(noEvalResult, null);
  assert.equal(globalThis.__externalApiTransformExecuted, false);
  delete globalThis.__externalApiTransformExecuted;

  const missingResult = await service.fetchData(enabledConfig('https://lookup.example/', {
    selector: 'result.missing'
  }));
  assert.equal(missingResult, null);
});

test('external enrichment bounds DNS resolution time', async () => {
  let requestCount = 0;
  const service = new ExternalApiService({
    dnsLookupTimeoutMs: 20,
    resolveHostname: async () => new Promise(() => {}),
    request: async () => {
      requestCount += 1;
      return { status: 200, data: {} };
    }
  });

  const startedAt = Date.now();
  assert.equal(await service.fetchData(enabledConfig('https://never-resolves.example/')), null);
  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(requestCount, 0);
});

test('external enrichment fails closed on malformed request JSON', async () => {
  let requestCount = 0;
  const service = new ExternalApiService({
    resolveHostname: publicResolver,
    request: async () => {
      requestCount += 1;
      return { status: 200, data: {} };
    }
  });

  assert.equal(await service.fetchData(enabledConfig('https://lookup.example/', {
    headers: '{broken'
  })), null);
  assert.equal(await service.fetchData(enabledConfig('https://lookup.example/', {
    method: 'POST',
    body: '{broken'
  })), null);
  assert.equal(requestCount, 0);
});

test('external enrichment treats a redirect response as a failure', async () => {
  let requestOptions;
  const service = new ExternalApiService({
    resolveHostname: publicResolver,
    request: async (options) => {
      requestOptions = options;
      return { status: 302, data: { location: 'http://127.0.0.1/' } };
    }
  });

  assert.equal(await service.fetchData(enabledConfig('https://lookup.example/')), null);
  assert.equal(requestOptions.maxRedirects, 0);
});
