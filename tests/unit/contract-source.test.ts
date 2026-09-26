import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
test('source contract retains five operations and both environments', () => {
  const spec = parse(readFileSync('openapi/sdet_challenge_api.yml', 'utf8'));
  assert.deepEqual(
    spec.servers.map((server: { url: string }) => server.url),
    ['/dev', '/prod'],
  );
  const operations = Object.values(spec.paths).flatMap((path: any) =>
    Object.values(path)
      .filter((value: any) => value?.operationId)
      .map((value: any) => value.operationId),
  );
  assert.deepEqual(operations.sort(), [
    'createUser',
    'deleteUser',
    'getUser',
    'listUsers',
    'updateUser',
  ]);
});
