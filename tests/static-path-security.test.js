const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const {
  blockLegacyPublicImages,
  isLegacyPublicImagePath,
  removeLegacyPublicThumbnailCache
} = require('../dist/services/staticPathSecurity');

test('legacy public thumbnails are blocked after decoding and normalization', () => {
  const blockedPaths = [
    '/images/42.png',
    '/images%2F42.png',
    '/%69mages/42.png',
    '/im%61ges/42.png',
    '//images/42.png',
    '/assets/../images/42.png',
    '/assets/%2e%2e/images/42.png',
    '/images%5c42.png',
    '/IMAGES/42.png',
    'http://tagvico.example/images/42.png',
    'http://tagvico.example/images%2F42.png',
    'ftp://tagvico.example/images/42.png',
    'foo://tagvico.example/images/42.png',
    'foo:/images/42.png',
    'http:///images/42.png',
    'http:////images/42.png'
  ];

  for (const path of blockedPaths) {
    assert.equal(isLegacyPublicImagePath(path), true, path);
  }

  assert.equal(isLegacyPublicImagePath('/styles/images.css'), false);
  assert.equal(isLegacyPublicImagePath('/image/42.png'), false);
});

test('legacy thumbnail guard fails closed on malformed paths', () => {
  let nextCalls = 0;
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      return this;
    }
  };

  blockLegacyPublicImages({ originalUrl: '/images%2F42.png' }, response, () => { nextCalls += 1; });
  assert.equal(response.statusCode, 404);
  assert.equal(nextCalls, 0);

  response.statusCode = 200;
  blockLegacyPublicImages({ originalUrl: '/bad%escape' }, response, () => { nextCalls += 1; });
  assert.equal(response.statusCode, 400);
  assert.equal(nextCalls, 0);

  response.statusCode = 200;
  blockLegacyPublicImages({ originalUrl: '/styles/app.css' }, response, () => { nextCalls += 1; });
  assert.equal(response.statusCode, 200);
  assert.equal(nextCalls, 1);
});

test('legacy thumbnail guard blocks parser variants before express.static', async () => {
  const publicDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tagvico-public-'));
  await fs.mkdir(path.join(publicDirectory, 'images'));
  await fs.writeFile(path.join(publicDirectory, 'images', 'secret.png'), 'PRIVATE_THUMBNAIL');
  await fs.writeFile(path.join(publicDirectory, 'safe.txt'), 'SAFE_ASSET');

  const app = express();
  app.use(blockLegacyPublicImages);
  app.use(express.static(publicDirectory));
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer));
  });
  const { port } = server.address();

  const request = (target) => new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    });
    let response = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { response += chunk; });
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });

  try {
    const safeResponse = await request('/safe.txt');
    assert.match(safeResponse, /^HTTP\/1\.1 200 /);
    assert.equal(safeResponse.includes('SAFE_ASSET'), true);

    for (const target of [
      '/images%2Fsecret.png',
      '/%69mages/secret.png',
      'http://tagvico.example/images/secret.png',
      'ftp://tagvico.example/images/secret.png',
      'foo:/images/secret.png',
      'http:///images/secret.png',
      'http:////images/secret.png'
    ]) {
      const response = await request(target);
      assert.match(response, /^HTTP\/1\.1 40[04] /, target);
      assert.equal(response.includes('PRIVATE_THUMBNAIL'), false, target);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(publicDirectory, { recursive: true, force: true });
  }
});

test('startup cleanup removes only generated legacy thumbnail files', async () => {
  const publicDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tagvico-cleanup-'));
  const imagesDirectory = path.join(publicDirectory, 'images');
  await fs.mkdir(imagesDirectory);
  await fs.writeFile(path.join(imagesDirectory, '42.png'), 'PRIVATE_THUMBNAIL');
  await fs.writeFile(path.join(imagesDirectory, 'logo.png'), 'USER_ASSET');

  try {
    assert.equal(await removeLegacyPublicThumbnailCache(publicDirectory), 1);
    await assert.rejects(fs.access(path.join(imagesDirectory, '42.png')));
    assert.equal(await fs.readFile(path.join(imagesDirectory, 'logo.png'), 'utf8'), 'USER_ASSET');
  } finally {
    await fs.rm(publicDirectory, { recursive: true, force: true });
  }
});
