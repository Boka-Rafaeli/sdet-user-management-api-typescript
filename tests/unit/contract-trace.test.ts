import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Contract } from '../../src/contract.js';
import { ApiResponse } from '../../src/client.js';
const request = {
  method: 'GET',
  url: 'http://test/dev/users',
  headers: {},
  timeoutMs: 1,
  id: 'dev-7',
};
function capture(run: () => void): string[] {
  const messages: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => messages.push(args.join(' '));
  try {
    run();
  } finally {
    console.log = original;
  }
  return messages;
}
test('contract trace explains success and correlates with HTTP request', () => {
  const messages = capture(() =>
    new Contract(undefined, true).assertResponse(
      new ApiResponse(200, { 'content-type': 'application/json' }, Buffer.from('[]'), request),
      '/users',
      'get',
      200,
    ),
  );
  assert.equal(messages.length, 5);
  assert.ok(messages.every((m) => m.includes('request=dev-7')));
  assert.ok(messages[0]!.includes('check=status'));
  assert.ok(messages.at(-1)!.includes('check=response-schema'));
});
for (const [name, status, body, media, path, method, expected, last] of [
  ['status', 500, '{}', 'application/json', '/users', 'get', 200, 'status'],
  ['operation', 200, '[]', 'application/json', '/unknown', 'get', 200, 'operation-declared'],
  ['response', 201, '[]', 'application/json', '/users', 'get', 201, 'response-declared'],
  ['media', 200, '[]', 'text/plain', '/users', 'get', 200, 'content-type'],
  ['json', 200, 'invalid', 'application/json', '/users', 'get', 200, 'json-body'],
  ['schema', 200, '[{"name":"only"}]', 'application/json', '/users', 'get', 200, 'response-schema'],
  ['nonempty', 204, '{}', 'application/json', '/users/{email}', 'delete', 204, 'empty-body'],
] as const)
  test('contract trace explains ' + name + ' failure', () => {
    const messages = capture(() =>
      assert.throws(() =>
        new Contract(undefined, true).assertResponse(
          new ApiResponse(status, { 'content-type': media }, Buffer.from(body), request),
          path,
          method,
          expected,
        ),
      ),
    );
    assert.ok(messages.at(-1)!.includes('CONTRACT FAIL'));
    assert.ok(messages.at(-1)!.includes('check=' + last));
    if (name === 'status') assert.equal(messages.length, 1);
  });
test('empty response has a successful trace', () => {
  const messages = capture(() =>
    new Contract(undefined, true).assertResponse(
      new ApiResponse(204, {}, Buffer.alloc(0), request),
      '/users/{email}',
      'delete',
      204,
    ),
  );
  assert.ok(messages.at(-1)!.includes('PASS'));
  assert.ok(messages.at(-1)!.includes('empty-body'));
});
test('contract trace is opt-in', () =>
  assert.deepEqual(
    capture(() =>
      new Contract().assertResponse(
        new ApiResponse(200, { 'content-type': 'application/json' }, Buffer.from('[]'), request),
        '/users',
        'get',
        200,
      ),
    ),
    [],
  ));
test('unexpected-status errors redact structured and configured secrets', () => {
  assert.throws(
    () =>
      new Contract(undefined, false, ['configured-secret']).assertResponse(
        new ApiResponse(
          500,
          {},
          Buffer.from('{"password":"body-secret","message":"configured-secret"}'),
          request,
        ),
        '/users',
        'get',
        200,
      ),
    (error) =>
      error instanceof Error &&
      !error.message.includes('body-secret') &&
      !error.message.includes('configured-secret'),
  );
});
