import assert from 'node:assert/strict';
import {
  assertAbsent,
  assertInternalServerError,
  assertUnchanged,
  assertUserIn,
  createOwned,
  listUsers,
  readUser,
  scenario,
} from './fixtures.js';

scenario('test_list_users_matches_contract', async (context) => {
  await listUsers(context);
});

scenario('test_create_get_and_list_user', async (context) => {
  const original = await createOwned(context);
  assert.deepEqual(await readUser(context, String(original.email)), original);
  assertUserIn(await listUsers(context), original);
});

scenario('test_delete_user_returns_no_content_and_removes_record', async (context) => {
  const payload = await createOwned(context);
  const email = String(payload.email);
  context.contract.assertResponse(
    await context.client.deleteUser(email),
    '/users/{email}',
    'delete',
    204,
  );
  assertAbsent(await listUsers(context), email);
});

scenario(
  'test_duplicate_email_returns_conflict',
  async (context) => {
    const payload = await createOwned(context);
    const response = await context.client.createUser(payload);
    // Additional state protection runs outside the known-bug gate: matching an
    // old response defect must not hide corruption of the original record.
    await assertUnchanged(context, payload);
    assertUserIn(await listUsers(context), payload);
    await context.checkBug(
      () => context.contract.assertResponse(response, '/users', 'post', 409),
      () => assertInternalServerError(response),
    );
  },
  { bugId: 'BUG-003' },
);

scenario(
  'test_get_unknown_user_returns_not_found',
  async (context) => {
    const email = String(context.makeUser().email);
    const response = await context.client.getUser(email);
    await context.checkBug(
      () => context.contract.assertResponse(response, '/users/{email}', 'get', 404),
      () => assertInternalServerError(response),
    );
  },
  { bugId: 'BUG-004' },
);
