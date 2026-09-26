import assert from 'node:assert/strict';
import { assertUnchanged, createOwned, scenario } from './fixtures.js';
import { mutations } from './validation-cases.js';

for (const mutation of mutations) {
  scenario(
    `test_update_rejects_payloads_outside_openapi_schema[${mutation.id}]`,
    async (context) => {
      const original = await createOwned(context);
      const email = String(original.email);
      const update = context.makeUser({ email });
      mutation.apply(update);
      if (update.email !== null && update.email !== undefined) context.own(String(update.email));
      const response = await context.client.updateUser(email, update);
      // Strengthening outside the gate: error responses and matching BUG-006
      // responses must not mask an additional persisted-state regression.
      await assertUnchanged(context, original);
      await context.checkBug(
        () => context.contract.assertResponse(response, '/users/{email}', 'put', 400),
        () => {
          assert.equal(response.headers['content-type']?.split(';')[0], 'application/json');
          if (update.email === 42) {
            assert.equal(response.status, 500);
            assert.deepEqual(response.json(), { error: 'Internal server error' });
          } else {
            assert.equal(update.name, 42);
            assert.equal(response.status, 200);
            assert.deepEqual(response.json(), update);
          }
        },
      );
    },
    mutation.putBug ? { bugId: mutation.putBug } : {},
  );
}

scenario(
  'test_update_accepts_empty_name_allowed_by_contract',
  async (context) => {
    const original = await createOwned(context);
    const email = String(original.email);
    const update = context.makeUser({ name: '', email, age: 43 });
    const response = await context.client.updateUser(email, update);
    if (response.status === 400) await assertUnchanged(context, original);
    await context.checkBug(
      () =>
        assert.deepEqual(
          context.contract.assertResponse(response, '/users/{email}', 'put', 200),
          update,
        ),
      () =>
        assert.deepEqual(context.contract.assertResponse(response, '/users/{email}', 'put', 400), {
          error: 'name is required',
        }),
    );
  },
  { bugId: 'BUG-009' },
);
