import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { asUsers, assertAbsent, scenario } from './fixtures.js';

scenario(
  'test_dev_and_prod_data_is_independent',
  async (context) => {
    const email = `sdet-dev-prod-isolation-${randomUUID().replaceAll('-', '')}@example.com`;
    const dev = context.makeUser({ name: 'Development User', email, age: 31 });
    const prod = context.makeUser({ name: 'Production User', email, age: 47 });
    context.own(email, 'dev');
    context.own(email, 'prod');
    const { contract, devClient, prodClient } = context;
    assert.deepEqual(
      contract.assertResponse(await devClient.createUser(dev), '/users', 'post', 201),
      dev,
    );
    assert.deepEqual(
      contract.assertResponse(await prodClient.createUser(prod), '/users', 'post', 201),
      prod,
    );
    const update = context.makeUser({ name: 'Updated Dev User', email, age: 32 });
    contract.assertResponse(
      await devClient.updateUser(email, update),
      '/users/{email}',
      'put',
      200,
    );
    assert.deepEqual(
      contract.assertResponse(await prodClient.getUser(email), '/users/{email}', 'get', 200),
      prod,
    );
    contract.assertResponse(await devClient.deleteUser(email), '/users/{email}', 'delete', 204);
    assertAbsent(
      asUsers(contract.assertResponse(await devClient.listUsers(), '/users', 'get', 200)),
      email,
    );
    assert.deepEqual(
      contract.assertResponse(await prodClient.getUser(email), '/users/{email}', 'get', 200),
      prod,
    );
  },
  { isolation: true },
);
