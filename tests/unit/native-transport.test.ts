import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { ApiClient } from '../../src/client.js';
import { loadSettings } from '../../src/config.js';

test('native transport preserves raw bytes and returns redirects without following them', async (t) => {
  const seen: { path: string; body: string; media: string | undefined }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    seen.push({
      path: request.url ?? '',
      body: Buffer.concat(chunks).toString(),
      media: request.headers['content-type'],
    });
    response.writeHead(302, { Location: '/redirect-destination', 'Content-Type': 'text/plain' });
    response.end('move');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const client = new ApiClient(
    loadSettings({ baseUrl: `http://127.0.0.1:${address.port}`, environment: 'prod' }),
  );
  t.after(async () => {
    client.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const result = await client.rawRequest('POST', '/users', {
    content: '{"literal":null}',
    headers: { 'Content-Type': 'text/plain' },
  });
  assert.equal(result.status, 302);
  assert.equal(result.text(), 'move');
  assert.deepEqual(seen, [{ path: '/prod/users', body: '{"literal":null}', media: 'text/plain' }]);
});

test('native transport deadline terminates a server that never responds', async (t) => {
  const server = createServer(() => {});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const client = new ApiClient(
    loadSettings({ baseUrl: `http://127.0.0.1:${address.port}`, timeoutMs: 50 }),
  );
  t.after(async () => {
    client.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  await assert.rejects(client.listUsers(), /timed out/);
});
