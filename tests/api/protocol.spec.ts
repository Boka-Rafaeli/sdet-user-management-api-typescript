import assert from 'node:assert/strict';
import {
  assertAbsent,
  assertInternalServerError,
  assertUnchanged,
  createOwned,
  listUsers,
  readUser,
  scenario,
  userPath,
} from './fixtures.js';

for (const shape of [
  { id: 'array', value: [] },
  { id: 'string', value: 'text' },
]) {
  scenario(
    `test_create_rejects_non_object_json_body[${shape.id}]`,
    async (context) => {
      const response = await context.client.rawRequest('POST', '/users', { json: shape.value });
      await context.checkBug(
        () => context.contract.assertResponse(response, '/users', 'post', 400),
        () => assertInternalServerError(response),
      );
    },
    { bugId: 'BUG-007' },
  );

  scenario(
    `test_update_rejects_non_object_json_body[${shape.id}]`,
    async (context) => {
      const original = await createOwned(context);
      const response = await context.client.rawRequest('PUT', userPath(String(original.email)), {
        json: shape.value,
      });
      await assertUnchanged(context, original);
      await context.checkBug(
        () => context.contract.assertResponse(response, '/users/{email}', 'put', 400),
        () => assertInternalServerError(response),
      );
    },
    { bugId: 'BUG-007' },
  );
}

scenario(
  'test_create_rejects_unsupported_request_media_type',
  async (context) => {
    const payload = context.makeUser();
    const email = String(payload.email);
    context.own(email);
    const response = await context.client.rawRequest('POST', '/users', {
      content: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' },
    });
    if (response.status === 400) assertAbsent(await listUsers(context), email);
    await context.checkBug(
      () => context.contract.assertResponse(response, '/users', 'post', 400),
      async () => {
        assert.deepEqual(context.contract.assertResponse(response, '/users', 'post', 201), payload);
        assert.deepEqual(await readUser(context, email), payload);
      },
    );
  },
  { bugId: 'BUG-008' },
);

scenario(
  'test_update_rejects_unsupported_request_media_type',
  async (context) => {
    const original = await createOwned(context);
    const email = String(original.email);
    const updated = context.makeUser({ name: 'Wrong Media Type', email, age: 43 });
    const response = await context.client.rawRequest('PUT', userPath(email), {
      content: JSON.stringify(updated),
      headers: { 'Content-Type': 'text/plain' },
    });
    await assertUnchanged(context, original);
    await context.checkBug(
      () => context.contract.assertResponse(response, '/users/{email}', 'put', 400),
      () =>
        assert.deepEqual(
          context.contract.assertResponse(response, '/users/{email}', 'put', 200),
          updated,
        ),
    );
  },
  { bugId: 'BUG-008' },
);

for (const reserved of [
  { id: 'plus', suffix: '+tag', encoded: '%2B' },
  { id: 'percent', suffix: '%tag', encoded: '%25' },
]) {
  scenario(
    `test_email_reserved_character_round_trips_through_encoded_path[${reserved.id}]`,
    async (context) => {
      const payload = context.makeUser();
      const address = String(payload.email);
      const at = address.lastIndexOf('@');
      const email = `${address.slice(0, at)}${reserved.suffix}${address.slice(at)}`;
      payload.email = email;
      context.own(email);
      assert.deepEqual(
        context.contract.assertResponse(
          await context.client.createUser(payload),
          '/users',
          'post',
          201,
        ),
        payload,
      );
      const read = await context.client.getUser(email);
      assert.ok(new URL(read.requestUrl).pathname.includes(reserved.encoded));
      assert.deepEqual(
        context.contract.assertResponse(read, '/users/{email}', 'get', 200),
        payload,
      );
      const deleted = await context.client.deleteUser(email);
      assert.ok(new URL(deleted.requestUrl).pathname.includes(reserved.encoded));
      context.contract.assertResponse(deleted, '/users/{email}', 'delete', 204);
      assertAbsent(await listUsers(context), email);
    },
  );
}
