import assert from 'node:assert/strict';
import { assertAbsent, assertUnchanged, createOwned, listUsers, scenario } from './fixtures.js';

for (const variant of [
  { id: 'missing-header', token: null },
  { id: 'empty-token', token: '' },
  { id: 'invalid-token', token: 'wrong-token' },
]) {
  scenario(
    `test_delete_rejects_missing_or_invalid_authentication[${variant.id}]`,
    async (context) => {
      const original = await createOwned(context);
      const email = String(original.email);
      const response = await context.client.deleteUser(email, variant.token);
      // Strengthened full-record preservation is outside the gate, so a 401 that
      // corrupts the record cannot be reported as restored expected behavior.
      if (response.status === 401) await assertUnchanged(context, original);
      await context.checkBug(
        async () => {
          context.contract.assertResponse(response, '/users/{email}', 'delete', 401);
          const persisted = context.contract.assertResponse(
            await context.client.getUser(email),
            '/users/{email}',
            'get',
            200,
          );
          assert.deepEqual(persisted, original);
        },
        async () => {
          context.contract.assertResponse(response, '/users/{email}', 'delete', 204);
          assertAbsent(await listUsers(context), email);
        },
      );
    },
    { bugId: 'BUG-001', affected: ['dev'] },
  );
}

scenario('test_delete_unknown_user_with_valid_token_returns_not_found', async (context) => {
  const email = String(context.makeUser().email);
  const response = await context.client.deleteUser(email);
  context.contract.assertResponse(response, '/users/{email}', 'delete', 404);
});
