import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, ApiResponse, type ApiRequest } from '../../src/client.js';
import { loadSettings } from '../../src/config.js';
function fixture() {
  const requests: ApiRequest[] = [];
  const client = new ApiClient(
    loadSettings({
      baseUrl: 'http://example.test/base',
      environment: 'prod',
      authToken: 'valid',
      timeoutMs: 123,
    }),
    async (r) => {
      requests.push(r);
      return new ApiResponse(200, {}, Buffer.from('{}'), r);
    },
  );
  return { client, requests };
}
for (const json of [null, [], 'text'])
  test('raw JSON shape ' + JSON.stringify(json), async () => {
    const { client, requests } = fixture();
    await client.rawRequest('POST', '/users', { json });
    assert.deepEqual(JSON.parse(requests[0]!.body!.toString()), json);
    assert.equal(requests[0]!.headers['content-type'], 'application/json');
    client.close();
  });
test('raw bytes retain custom media type and reject conflicting body before transport', async () => {
  const { client, requests } = fixture();
  await client.rawRequest('POST', '/users', {
    content: 'raw',
    headers: { 'Content-Type': 'text/plain' },
  });
  assert.equal(requests[0]!.body!.toString(), 'raw');
  assert.equal(requests[0]!.headers['content-type'], 'text/plain');
  await assert.rejects(
    client.rawRequest('POST', '/users', { json: null, content: 'raw' }),
    /mutually exclusive/,
  );
  assert.equal(requests.length, 1);
  client.close();
});
test('all helpers retain environment, methods and percent encoding', async () => {
  const { client, requests } = fixture();
  await client.listUsers();
  await client.createUser({});
  await client.getUser("a+%!'()*@example.com");
  await client.updateUser('a@example.com', {});
  await client.deleteUser('a@example.com');
  assert.deepEqual(
    requests.map((r) => r.method),
    ['GET', 'POST', 'GET', 'PUT', 'DELETE'],
  );
  assert.ok(requests.every((r) => r.url.startsWith('http://example.test/base/prod/users')));
  assert.ok(requests[2]!.url.endsWith('a%2B%25%21%27%28%29%2A%40example.com'));
  assert.equal(requests[0]!.timeoutMs, 123);
  client.close();
});
test('default, missing, empty and incorrect authentication remain distinct', async () => {
  const { client, requests } = fixture();
  await client.deleteUser('a');
  await client.deleteUser('a', null);
  await client.deleteUser('a', '');
  await client.deleteUser('a', 'wrong');
  assert.deepEqual(
    requests.map((r) => r.headers.authentication),
    ['valid', undefined, '', 'wrong'],
  );
  client.close();
});
test('omitted JSON body has no content and no content-type', async () => {
  const { client, requests } = fixture();
  await client.rawRequest('POST', '/users');
  assert.equal(requests[0]!.body, undefined);
  assert.equal(requests[0]!.headers['content-type'], undefined);
  client.close();
});
test('transport errors propagate and closed client rejects', async () => {
  const error = new Error('network lost');
  const client = new ApiClient(loadSettings(), async () => {
    throw error;
  });
  await assert.rejects(client.listUsers(), (e) => e === error);
  client.close();
  await assert.rejects(client.listUsers(), /closed/);
});
