const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../dist/config/config');
const scheduler = require('../dist/services/scanScheduler');

test.afterEach(() => scheduler.reset());

test('automatic scan scheduler reflects disabled, invalid and valid runtime settings', () => {
  config.disableAutomaticProcessing = 'yes';
  config.scanInterval = '*/30 * * * *';
  assert.deepEqual(scheduler.register(async () => {}), {
    scheduled: false,
    reason: 'disabled'
  });

  config.disableAutomaticProcessing = 'no';
  config.scanInterval = 'not-a-cron';
  assert.deepEqual(scheduler.refresh(), {
    scheduled: false,
    reason: 'invalid-interval'
  });

  config.scanInterval = '*/30 * * * *';
  assert.deepEqual(scheduler.refresh(), {
    scheduled: true,
    expression: '*/30 * * * *'
  });
});
