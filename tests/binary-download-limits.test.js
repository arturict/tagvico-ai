const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../dist/config/config');
const paperlessService = require('../dist/services/paperlessService');
const ocrService = require('../dist/services/ocrService');

test('thumbnail downloads enforce their byte ceiling before buffering', async () => {
  const originalClient = paperlessService.client;
  let requestOptions;
  paperlessService.client = { get: async (_url, options) => { requestOptions = options; return { data: Buffer.from('thumb') }; } };
  try {
    assert.deepEqual(await paperlessService.getThumbnailImage(7), Buffer.from('thumb'));
    assert.equal(requestOptions.responseType, 'arraybuffer');
    assert.equal(requestOptions.maxContentLength, 10 * 1024 * 1024);
    assert.equal(requestOptions.timeout, 30_000);
  } finally { paperlessService.client = originalClient; }
});

test('OCR original downloads enforce the configured byte ceiling before buffering', async () => {
  const originalClient = paperlessService.client;
  const originalLimit = config.ocr.maxFileBytes;
  let requestOptions;
  config.ocr.maxFileBytes = 123456;
  paperlessService.client = { get: async (_url, options) => { requestOptions = options; return { data: Buffer.from('pdf'), headers: { 'content-type': 'application/pdf' } }; } };
  try {
    assert.deepEqual((await ocrService.downloadDocument(9)).data, Buffer.from('pdf'));
    assert.equal(requestOptions.responseType, 'arraybuffer');
    assert.equal(requestOptions.maxContentLength, 123456);
  } finally { config.ocr.maxFileBytes = originalLimit; paperlessService.client = originalClient; }
});
