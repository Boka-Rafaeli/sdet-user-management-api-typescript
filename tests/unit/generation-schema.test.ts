import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import {
  loadOperations,
  operationsFromDocument,
  coverageCases,
  exampleCase,
  requestValid,
} from '../../src/generation/schema.js';

test('discovers all five operation IDs, shared path parameters and required Authentication', () => {
  const operations = loadOperations();
  assert.deepEqual(
    operations.map((operation) => operation.id),
    ['listUsers', 'createUser', 'getUser', 'updateUser', 'deleteUser'],
  );
  const remove = operations.find((operation) => operation.id === 'deleteUser')!;
  assert.deepEqual(
    remove.parameters.map(({ name, in: location }) => `${location}:${name}`),
    ['path:email', 'header:Authentication'],
  );
  assert.equal(remove.parameters[1]!.required, true);
  assert.deepEqual(remove.declaredMethods, ['GET', 'PUT', 'DELETE']);
});

test('examples and boundary mutations are derived from YAML and independently schema-checked', () => {
  for (const operation of loadOperations()) {
    assert.equal(requestValid(operation, exampleCase(operation)), true);
    for (const testCase of coverageCases(operation)) {
      if (testCase.unsupportedMethod) continue;
      assert.equal(
        requestValid(operation, testCase),
        testCase.mode === 'positive',
        `${operation.id}:${testCase.category}`,
      );
    }
  }
  const create = loadOperations().find((operation) => operation.id === 'createUser')!;
  const cases = coverageCases(create);
  assert.equal(
    cases.some((item) => item.mode === 'positive' && (item.body as { age?: number })?.age === 150),
    true,
  );
  assert.equal(
    cases.some((item) => item.mode === 'negative' && (item.body as { age?: number })?.age === 151),
    true,
  );
  assert.equal(
    cases.some((item) => item.mode === 'positive' && (item.body as { name?: string })?.name === ''),
    true,
  );
  assert.equal(
    cases.some((item) => item.category === 'missing-age'),
    true,
  );
  assert.equal(
    cases.some((item) => item.category === 'additional-property' && item.mode === 'positive'),
    true,
  );
});

test('coverage preserves invalid path metadata and generates missing Authentication and unsupported methods', () => {
  const operations = loadOperations();
  const cases = operations.flatMap((operation) => coverageCases(operation));
  assert.ok(
    cases.some(
      (item) =>
        item.missingHeader === 'Authentication' && item.headers.Authentication === undefined,
    ),
  );
  assert.ok(
    cases.some(
      (item) =>
        item.category === 'invalid-path-email' &&
        !item.positivePath &&
        item.pathParameters.email === 'invalid-email',
    ),
  );
  assert.ok(cases.some((item) => item.unsupportedMethod && item.method === 'OPTIONS'));
  assert.ok(cases.some((item) => item.unsupportedMethod && item.method === 'PATCH'));
});

function document(): any {
  return parse(readFileSync('openapi/sdet_challenge_api.yml', 'utf8'));
}

test('unsupported pattern, response headers, security and external refs fail closed', () => {
  const pattern = document();
  pattern.components.schemas.User.properties.name.pattern = '.+';
  assert.throws(() => operationsFromDocument(pattern), /Unsupported schema keyword/);
  const headers = document();
  headers.paths['/users'].get.responses['200'].headers = {
    'X-Count': { schema: { type: 'integer' } },
  };
  assert.throws(() => operationsFromDocument(headers), /response_headers_conformance/);
  const security = document();
  security.security = [{ bearer: [] }];
  assert.throws(() => operationsFromDocument(security), /ignored_auth/);
  const external = document();
  external.paths['/users'].post.requestBody.content['application/json'].schema.$ref =
    'https://untrusted.example/schema';
  assert.throws(() => operationsFromDocument(external), /Only local/);
});

test('a small changed schema changes examples, required-field cases and numeric boundaries', () => {
  const input = {
    openapi: '3.0.3',
    paths: {
      '/items': {
        post: {
          operationId: 'createItem',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['score'],
                  properties: { score: { type: 'integer', minimum: 4, maximum: 6, example: 5 } },
                },
              },
            },
          },
          responses: { '204': { description: 'okay' } },
        },
      },
    },
  };
  const operation = operationsFromDocument(input)[0]!;
  assert.deepEqual(exampleCase(operation).body, { score: 5 });
  const cases = coverageCases(operation);
  assert.ok(cases.some((item) => item.category === 'missing-score'));
  assert.ok(
    cases.some(
      (item) => item.mode === 'negative' && (item.body as { score?: number })?.score === 7,
    ),
  );
  assert.ok(
    cases.some(
      (item) => item.mode === 'positive' && (item.body as { score?: number })?.score === 4,
    ),
  );
});
