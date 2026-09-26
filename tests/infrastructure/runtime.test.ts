import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from '../../src/runtime.js';
import { ApiClient } from '../../src/client.js';
import { loadSettings } from '../../src/config.js';
test('managed Docker API starts on a private port and stops idempotently', async () => {
  const api = await startApi();
  const client = new ApiClient(loadSettings({ baseUrl: api.baseUrl }));
  try {
    assert.equal((await client.listUsers()).status, 200);
    assert.ok(api.digest.includes('sha256:'));
  } finally {
    client.close();
    await api.stop();
    await api.stop();
  }
});
