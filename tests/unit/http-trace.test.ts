import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpTracer } from '../../src/http-trace.js';
import { ApiResponse, type ApiRequest } from '../../src/client.js';
test('HTTP tracing hides headers, nested secrets and URL credentials', () => {
  const messages: string[] = [];
  const tracer = new HttpTracer(true, ['control /secret'], (message) => messages.push(message));
  const request: ApiRequest = {
    method: 'POST',
    url: 'http://test/dev/users?token=other&x=control%20%2Fsecret',
    headers: { Authentication: 'header-only' },
    body: Buffer.from(
      JSON.stringify({ profile: { accessToken: 'nested' }, note: 'control /secret' }),
    ),
    timeoutMs: 1,
    id: 'dev-1',
  };
  tracer.request(request);
  tracer.response(new ApiResponse(401, {}, Buffer.from('Rejected control /secret'), request));
  const text = messages.join('\n');
  for (const secret of [
    'header-only',
    'nested',
    'control /secret',
    'control%20%2Fsecret',
    'token=other',
  ])
    assert.ok(!text.includes(secret));
  assert.ok(text.includes('HTTP request method=POST'));
  assert.ok(text.includes('status=401'));
  assert.ok(text.includes('id=dev-1'));
});
test('tracing is silent by default and handles empty response', () => {
  const messages: string[] = [];
  const request: ApiRequest = { method: 'GET', url: 'http://test', headers: {}, timeoutMs: 1 };
  new HttpTracer(false, [], (m) => messages.push(m)).request(request);
  assert.equal(messages.length, 0);
  new HttpTracer(true, [], (m) => messages.push(m)).response(
    new ApiResponse(204, {}, Buffer.alloc(0), request),
  );
  assert.ok(messages[0]!.includes('<empty>'));
});
