import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Contract } from '../../src/contract.js';
import { ApiResponse } from '../../src/client.js';
const request = { url: 'http://example.test/dev/users', method: 'GET', headers: {}, timeoutMs: 10 };
const response = (status: number, body: string, contentType = 'application/json') =>
  new ApiResponse(status, { 'content-type': contentType }, Buffer.from(body), request);
const contract = new Contract();
const valid = { name: '', email: 'a@b', age: 1, extra: true };
test('contract returns data unchanged and permits schema-valid empty name/additional fields', () => {
  const result = contract.assertResponse(
    response(200, JSON.stringify([valid])),
    '/users',
    'get',
    200,
  );
  assert.deepEqual(result, [valid]);
});
for (const [title, res, path, method, status, pattern] of [
  ['status first', response(500, '{}'), '/unknown', 'get', 200, /Expected HTTP/],
  ['undeclared operation', response(200, '[]'), '/unknown', 'get', 200, /absent/],
  ['undeclared response', response(201, '[]'), '/users', 'get', 201, /not declared/],
  ['media type', response(200, '[]', 'text/plain'), '/users', 'get', 200, /Content-Type/],
  ['invalid JSON', response(200, 'broken'), '/users', 'get', 200, /JSON response/],
  [
    'incomplete schema',
    response(200, '[{"name":"only"}]'),
    '/users',
    'get',
    200,
    /schema violations/,
  ],
  ['nonempty 204', response(204, '{}'), '/users/{email}', 'delete', 204, /empty response/],
] as const)
  test(title, () =>
    assert.throws(() => contract.assertResponse(res, path, method, status), pattern),
  );
test('empty 204 passes', () =>
  assert.equal(
    contract.assertResponse(response(204, ''), '/users/{email}', 'delete', 204),
    undefined,
  ));
for (const age of ['42', true, 0, 151, 42.5])
  test('age is not coerced: ' + JSON.stringify(age), () =>
    assert.throws(
      () =>
        contract.assertResponse(
          response(200, JSON.stringify([{ ...valid, age }])),
          '/users',
          'get',
          200,
        ),
      /schema violations/,
    ),
  );
for (const email of ['a@b', '@', 'a+b%tag@example.com'])
  test('Python email format compatibility: ' + email, () =>
    contract.assertResponse(
      response(200, JSON.stringify([{ ...valid, email }])),
      '/users',
      'get',
      200,
    ),
  );
test('invalid email rejected', () =>
  assert.throws(() =>
    contract.assertResponse(
      response(200, JSON.stringify([{ ...valid, email: 'missing-at' }])),
      '/users',
      'get',
      200,
    ),
  ));
test('external references are rejected', () =>
  assert.throws(() => contract.resolve({ $ref: 'https://test/schema' }), /local/));
