import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userFactory, OwnedUsers } from '../../src/test-data.js';
test('factory supplies unique environment-labelled emails and preserves overrides', () => {
  const factory = userFactory('dev');
  const a = factory(),
    b = factory();
  assert.notEqual(a.email, b.email);
  assert.match(String(a.email), /^sdet-dev-/);
  assert.deepEqual(factory({ email: 'chosen', age: 1 }), {
    name: 'SDET Candidate',
    email: 'chosen',
    age: 1,
  });
});
test('cleanup only deletes registered resources in their own environments', async () => {
  const seen: string[] = [];
  const owned = new OwnedUsers({
    dev: { deleteUser: async (email) => seen.push('dev:' + email) },
    prod: { deleteUser: async (email) => seen.push('prod:' + email) },
  });
  owned.add('same', 'dev');
  owned.add('same', 'prod');
  owned.add('same', 'dev');
  await owned.cleanup();
  assert.deepEqual(seen, ['dev:same', 'prod:same']);
});
test('curated cleanup transport errors propagate', async () => {
  const owned = new OwnedUsers({
    dev: {
      deleteUser: async () => {
        throw new Error('network lost');
      },
    },
    prod: { deleteUser: async () => undefined },
  });
  owned.add('a', 'dev');
  await assert.rejects(owned.cleanup(), /network lost/);
});
