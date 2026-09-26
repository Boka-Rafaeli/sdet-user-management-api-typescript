import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiResponse } from '../../src/client.js';
import { loadOperations, exampleCase, coverageCases } from '../../src/generation/schema.js';
import { CHECK_CATALOG, runChecks } from '../../src/generation/checks.js';
import { CHECK_NAMES, type CheckName, type GeneratedCase } from '../../src/generation/types.js';

const operations = loadOperations();
const create = operations.find((operation) => operation.id === 'createUser')!;
const list = operations.find((operation) => operation.id === 'listUsers')!;
const remove = operations.find((operation) => operation.id === 'deleteUser')!;
function response(
  status: number,
  body: unknown = { name: 'User', email: 'user@example.com', age: 30 },
  headers: Record<string, string> = { 'content-type': 'application/json' },
): ApiResponse {
  return new ApiResponse(
    status,
    headers,
    Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    { method: 'POST', url: 'http://127.0.0.1/dev/users', headers: {}, timeoutMs: 1000 },
  );
}
const check = (
  name: CheckName,
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
  testCase = exampleCase(create),
) =>
  runChecks(create, testCase, response(status, body, headers)).find(
    (result) => result.name === name,
  )!.status;

test('catalog accounts for all 13 registry checks and four explicit N/A checks', () => {
  assert.equal(CHECK_NAMES.length, 13);
  assert.deepEqual(Object.keys(CHECK_CATALOG).sort(), [...CHECK_NAMES].sort());
  const results = runChecks(create, exampleCase(create), response(201));
  for (const name of [
    'response_headers_conformance',
    'use_after_free',
    'ensure_resource_availability',
    'ignored_auth',
  ])
    assert.equal(results.find((result) => result.name === name)!.status, 'SKIP');
});

test('server/status/media/schema checkers have independent passing and failing witnesses', () => {
  assert.equal(check('not_a_server_error', 201), 'PASS');
  assert.equal(check('not_a_server_error', 500), 'FAIL');
  assert.equal(check('not_a_server_error', 100), 'FAIL');
  assert.equal(check('status_code_conformance', 201), 'PASS');
  assert.equal(check('status_code_conformance', 202), 'FAIL');
  assert.equal(check('content_type_conformance', 201), 'PASS');
  assert.equal(
    check('content_type_conformance', 201, {}, { 'content-type': 'text/plain' }),
    'FAIL',
  );
  assert.equal(check('response_schema_conformance', 201), 'PASS');
  assert.equal(
    check('response_schema_conformance', 201, { name: 'User', email: 'invalid', age: true }),
    'FAIL',
  );
  assert.equal(check('response_schema_conformance', 201, 'not JSON'), 'FAIL');
});

test('positive acceptance and negative rejection retain source status allowlists', () => {
  assert.equal(check('positive_data_acceptance', 201), 'PASS');
  assert.equal(check('positive_data_acceptance', 400), 'FAIL');
  assert.equal(check('positive_data_acceptance', 500), 'PASS');
  const negative = coverageCases(create).find((item) => item.category === 'missing-age')!;
  assert.equal(check('negative_data_rejection', 400, undefined, undefined, negative), 'PASS');
  assert.equal(check('negative_data_rejection', 201, undefined, undefined, negative), 'FAIL');
  assert.equal(check('negative_data_rejection', 500, undefined, undefined, negative), 'PASS');
  assert.equal(check('negative_data_rejection', 402, undefined, undefined, negative), 'FAIL');
});

test('missing required Authentication has passing and failing witnesses', () => {
  const omitted = coverageCases(remove).find((item) => item.missingHeader === 'Authentication')!;
  const evaluate = (status: number) =>
    runChecks(remove, omitted, response(status)).find(
      (result) => result.name === 'missing_required_header',
    )!.status;
  assert.equal(evaluate(401), 'PASS');
  assert.equal(evaluate(400), 'PASS');
  assert.equal(evaluate(204), 'FAIL');
  assert.equal(evaluate(404), 'FAIL');
});

test('unsupported verb requires 405 + Allow and bypasses documented response checks', () => {
  const unsupported = coverageCases(list).find((item) => item.method === 'PATCH')!;
  const evaluate = (status: number, headers: Record<string, string>) =>
    runChecks(list, unsupported, response(status, '', headers));
  assert.equal(
    evaluate(405, { allow: 'GET, POST' }).find((result) => result.name === 'unsupported_method')!
      .status,
    'PASS',
  );
  assert.equal(
    evaluate(405, {}).find((result) => result.name === 'unsupported_method')!.status,
    'FAIL',
  );
  assert.equal(
    evaluate(200, {}).find((result) => result.name === 'unsupported_method')!.status,
    'FAIL',
  );
  for (const name of [
    'status_code_conformance',
    'content_type_conformance',
    'response_schema_conformance',
    'negative_data_rejection',
    'positive_data_acceptance',
  ])
    assert.equal(evaluate(405, {}).find((result) => result.name === name)!.status, 'SKIP');
  const pathCase: GeneratedCase = { ...unsupported, path: '/users/{email}' };
  assert.equal(
    runChecks(remove, pathCase, response(404)).find(
      (result) => result.name === 'unsupported_method',
    )!.status,
    'PASS',
  );
});

test('OPTIONS Allow checker permits implicit HEAD/OPTIONS and rejects missing/extra methods', () => {
  const options = coverageCases(list).find((item) => item.method === 'OPTIONS')!;
  const evaluate = (allow?: string) =>
    runChecks(list, options, response(200, '', allow === undefined ? {} : { allow })).find(
      (result) => result.name === 'allow_header_conformance',
    )!.status;
  assert.equal(evaluate('GET, POST, HEAD, OPTIONS'), 'PASS');
  assert.equal(evaluate('GET, PATCH'), 'FAIL');
  assert.equal(evaluate(undefined), 'SKIP');
});
