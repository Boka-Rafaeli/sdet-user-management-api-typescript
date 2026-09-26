import assert from 'node:assert/strict';
import { assertAbsent, listUsers, scenario } from './fixtures.js';
import { mutations } from './validation-cases.js';

for (const mutation of mutations) {
  scenario(
    `test_create_rejects_payloads_outside_openapi_schema[${mutation.id}]`,
    async (context) => {
      const payload = context.makeUser();
      const originalEmail = String(payload.email);
      context.own(originalEmail);
      mutation.apply(payload);
      if (payload.email !== null && payload.email !== undefined) context.own(String(payload.email));
      const response = await context.client.createUser(payload);
      // New safeguard only when rejected: an apparently correct error must not
      // leave behind a user. Accepted known defects have their own exact state oracle.
      if (response.status === 400) {
        const users = await listUsers(context);
        assertAbsent(users, originalEmail);
        if (payload.email !== null && payload.email !== undefined) {
          assertAbsent(users, String(payload.email));
        }
      }
      await context.checkBug(
        () => context.contract.assertResponse(response, '/users', 'post', 400),
        async () => {
          assert.equal(response.status, 201);
          assert.equal(response.headers['content-type']?.split(';')[0], 'application/json');
          assert.deepEqual(response.json(), payload);
          const persisted = await context.client.getUser(String(payload.email));
          assert.equal(persisted.status, 200);
          assert.equal(persisted.headers['content-type']?.split(';')[0], 'application/json');
          const expected = { ...payload };
          if (expected.name === 42) expected.name = '42';
          if (expected.email === 42) expected.email = '42';
          assert.deepEqual(persisted.json(), expected);
        },
      );
    },
    mutation.postBug ? { bugId: mutation.postBug } : {},
  );
}

for (const boundary of [
  { id: 'minimum', age: 1 },
  { id: 'maximum', age: 150 },
]) {
  scenario(`test_create_accepts_documented_age_boundaries[${boundary.id}]`, async (context) => {
    const payload = context.makeUser({ age: boundary.age });
    context.own(String(payload.email));
    const response = await context.client.createUser(payload);
    assert.deepEqual(context.contract.assertResponse(response, '/users', 'post', 201), payload);
  });
}

scenario(
  'test_create_accepts_empty_name_allowed_by_contract',
  async (context) => {
    const payload = context.makeUser({ name: '' });
    const email = String(payload.email);
    context.own(email);
    const response = await context.client.createUser(payload);
    if (response.status === 400) assertAbsent(await listUsers(context), email);
    await context.checkBug(
      () =>
        assert.deepEqual(context.contract.assertResponse(response, '/users', 'post', 201), payload),
      () =>
        assert.deepEqual(context.contract.assertResponse(response, '/users', 'post', 400), {
          error: 'name is required',
        }),
    );
  },
  { bugId: 'BUG-009' },
);
