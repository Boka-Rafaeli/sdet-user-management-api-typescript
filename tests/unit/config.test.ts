import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSettings } from '../../src/config.js';
test('configuration defaults and CLI overrides environment without mutation', () => {
  const env = {
    BASE_URL: 'http://example.test/api///',
    TEST_ENV: 'prod',
    AUTH_TOKEN: 'token',
    HTTP_TIMEOUT_SECONDS: '2',
  };
  const settings = loadSettings({ environment: 'dev' }, env);
  assert.equal(settings.environment, 'dev');
  assert.equal(settings.baseUrl, 'http://example.test/api');
  assert.equal(settings.timeoutMs, 2000);
  assert.equal(settings.authToken, 'token');
  assert.equal(env.TEST_ENV, 'prod');
  assert.equal(Object.isFrozen(settings), true);
  assert.equal(loadSettings({}, {}).environment, 'dev');
});
for (const env of [
  { TEST_ENV: 'staging' },
  { BASE_URL: 'invalid' },
  { BASE_URL: 'ftp://test' },
  { BASE_URL: 'http://user:pass@test' },
  { HTTP_TIMEOUT_SECONDS: '0' },
  { HTTP_TIMEOUT_SECONDS: '-1' },
  { HTTP_TIMEOUT_SECONDS: 'oops' },
  { HTTP_TIMEOUT_SECONDS: 'Infinity' },
]) {
  test('invalid settings rejected: ' + JSON.stringify(env), () =>
    assert.throws(() => loadSettings({}, env)),
  );
}
test('dev/prod settings are independent and empty token remains empty', () => {
  const a = loadSettings({ environment: 'dev' }, { AUTH_TOKEN: '' });
  const b = loadSettings({ environment: 'prod' }, {});
  assert.equal(a.environment, 'dev');
  assert.equal(b.environment, 'prod');
  assert.equal(a.authToken, '');
});
