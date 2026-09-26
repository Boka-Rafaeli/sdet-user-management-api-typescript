import assert from 'node:assert/strict';
import {
  asUsers,
  assertAbsent,
  assertInternalServerError,
  assertUnchanged,
  assertUserIn,
  createOwned,
  listUsers,
  readUser,
  scenario,
} from './fixtures.js';

scenario(
  'test_update_persists_changes',
  async (context) => {
    const original = await createOwned(context);
    const email = String(original.email);
    const updated = context.makeUser({ name: 'Updated Candidate', email, age: 43 });
    const response = await context.client.updateUser(email, updated);
    assert.deepEqual(
      context.contract.assertResponse(response, '/users/{email}', 'put', 200),
      updated,
    );
    const persisted = await readUser(context, email);
    await context.checkBug(
      () => assert.deepEqual(persisted, updated),
      () => assert.deepEqual(persisted, original),
    );
  },
  { bugId: 'BUG-002' },
);

scenario(
  'test_update_persists_email_change',
  async (context) => {
    const original = await createOwned(context);
    const originalEmail = String(original.email);
    const updated = context.makeUser({ name: 'Renamed Candidate', age: 43 });
    const updatedEmail = String(updated.email);
    context.own(updatedEmail);
    const response = await context.client.updateUser(originalEmail, updated);
    assert.deepEqual(
      context.contract.assertResponse(response, '/users/{email}', 'put', 200),
      updated,
    );
    const oldKey = await context.client.getUser(originalEmail);
    const newKey = await context.client.getUser(updatedEmail);
    const listed = await context.client.listUsers();
    await context.checkBug(
      () => {
        assert.deepEqual(
          context.contract.assertResponse(newKey, '/users/{email}', 'get', 200),
          updated,
        );
        context.contract.assertResponse(oldKey, '/users/{email}', 'get', 404);
        const users = asUsers(context.contract.assertResponse(listed, '/users', 'get', 200));
        assertUserIn(users, updated);
        assertAbsent(users, originalEmail);
      },
      () => {
        assert.deepEqual(
          context.contract.assertResponse(oldKey, '/users/{email}', 'get', 200),
          original,
        );
        assertInternalServerError(newKey);
        const users = asUsers(context.contract.assertResponse(listed, '/users', 'get', 200));
        assertUserIn(users, original);
        assertAbsent(users, updatedEmail);
      },
    );
  },
  { bugId: 'BUG-002' },
);

scenario('test_update_unknown_user_returns_not_found', async (context) => {
  const email = String(context.makeUser().email);
  context.own(email);
  const response = await context.client.updateUser(email, context.makeUser({ email }));
  context.contract.assertResponse(response, '/users/{email}', 'put', 404);
  assertAbsent(await listUsers(context), email);
});

scenario('test_update_to_duplicate_email_returns_conflict', async (context) => {
  const first = await createOwned(context, { name: 'First User' });
  const second = await createOwned(context, { name: 'Second User' });
  const response = await context.client.updateUser(
    String(first.email),
    context.makeUser({ name: 'Changed User', email: second.email }),
  );
  context.contract.assertResponse(response, '/users/{email}', 'put', 409);
  await assertUnchanged(context, first);
  await assertUnchanged(context, second);
});
