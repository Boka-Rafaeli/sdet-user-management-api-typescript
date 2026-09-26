import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiResponse } from '../../src/client.js';
import {
  GeneratedUserSeeder,
  prepareGeneratedCase,
  type ResourceClient,
} from '../../src/generation/resources.js';
import { exampleCase, coverageCases, loadOperations } from '../../src/generation/schema.js';

const reply = (status: number) =>
  new ApiResponse(status, {}, Buffer.alloc(0), {
    method: 'GET',
    url: 'http://local',
    headers: {},
    timeoutMs: 1000,
  });
function fake(statuses = [204, 201, 200]): { client: ResourceClient; calls: string[] } {
  const calls: string[] = [];
  const client: ResourceClient = {
    deleteUser: async (email) => {
      calls.push(`DELETE ${email}`);
      return reply(statuses[0] ?? 204);
    },
    createUser: async () => {
      calls.push('POST');
      return reply(statuses[1] ?? 201);
    },
    getUser: async (email) => {
      calls.push(`GET ${email}`);
      return reply(statuses[2] ?? 200);
    },
  };
  return { client, calls };
}
const update = loadOperations().find((operation) => operation.id === 'updateUser')!;

test('positive PUT resets, creates, verifies and injects the same owned email into path/body', async () => {
  const { client, calls } = fake();
  const seeder = new GeneratedUserSeeder(client, 'owned@example.com');
  const original = exampleCase(update);
  const prepared = await prepareGeneratedCase(original, seeder);
  assert.deepEqual(calls, ['DELETE owned@example.com', 'POST', 'GET owned@example.com']);
  assert.equal(prepared.pathParameters.email, 'owned@example.com');
  assert.equal((prepared.body as { email: string }).email, 'owned@example.com');
  assert.notEqual(original.pathParameters.email, 'owned@example.com');
  await seeder.close();
  await seeder.close();
  assert.equal(calls.filter((call) => call === 'DELETE owned@example.com').length, 2);
});

test('negative PUT body stays invalid, renamed body email is tracked, invalid paths are not repaired', async () => {
  const { client, calls } = fake();
  const seeder = new GeneratedUserSeeder(client, 'owned@example.com');
  const negative = coverageCases(update).find((item) => item.category === 'missing-age')!;
  (negative.body as { email: string }).email = 'renamed@example.com';
  const prepared = await prepareGeneratedCase(negative, seeder);
  assert.deepEqual(prepared.body, negative.body);
  assert.equal(prepared.pathParameters.email, 'owned@example.com');
  const invalidPath = coverageCases(update).find((item) => !item.positivePath)!;
  const before = calls.length;
  assert.deepEqual(await prepareGeneratedCase(invalidPath, seeder), invalidPath);
  assert.equal(calls.length, before);
  await seeder.close();
  assert.ok(calls.includes('DELETE renamed@example.com'));
});

test('reset, create and verify failures stop preparation at the failed step', async () => {
  for (const [statuses, expectedCalls, label] of [
    [[500, 201, 200], 1, 'reset'],
    [[204, 500, 200], 2, 'create'],
    [[204, 201, 500], 3, 'verify'],
  ] as const) {
    const { client, calls } = fake([...statuses]);
    await assert.rejects(
      new GeneratedUserSeeder(client, 'owned@example.com').prepare(),
      new RegExp(label),
    );
    assert.equal(calls.length, expectedCalls);
  }
});

test('cleanup continues after transport errors, ignores DELETE status, but exposes programming errors', async () => {
  const { client, calls } = fake();
  client.deleteUser = async (email) => {
    calls.push(email);
    if (email.startsWith('a'))
      throw Object.assign(new Error('connection failed'), { code: 'ECONNRESET' });
    return reply(500);
  };
  const seeder = new GeneratedUserSeeder(client, 'a@example.com');
  seeder.trackBody({ email: 'z@example.com' });
  await seeder.close();
  assert.deepEqual(calls, ['a@example.com', 'z@example.com']);
  client.deleteUser = async () => {
    throw new TypeError('programming fault');
  };
  await assert.rejects(
    new GeneratedUserSeeder(client, 'owned@example.com').close(),
    /programming fault/,
  );
});
