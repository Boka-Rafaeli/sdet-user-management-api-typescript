import assert from 'node:assert/strict';
import { userFactory, OwnedUsers } from '../../src/test-data.js';
import { test as base } from '@playwright/test';
import { ApiClient, type ApiResponse } from '../../src/client.js';
import { loadSettings, type Settings } from '../../src/config.js';
import { Contract } from '../../src/contract.js';
import { checkKnownBug, KnownDefect } from '../../src/baseline.js';

export type Payload = Record<string, unknown>;
type Environment = Settings['environment'];
type Assertion = () => unknown | Promise<unknown>;
interface Runtime {
  settings: Settings;
  contract: Contract;
  clients: Record<Environment, ApiClient>;
}
interface ScenarioMeta {
  bugId?: string;
  affected?: Environment[];
  isolation?: boolean;
}
export interface ScenarioContext {
  settings: Settings;
  contract: Contract;
  client: ApiClient;
  devClient: ApiClient;
  prodClient: ApiClient;
  makeUser(overrides?: Payload): Payload;
  own(email: string, environment?: Environment): void;
  checkBug(expected: Assertion, signature: Assertion): Promise<void>;
}

const test = base.extend<object, { runtime: Runtime }>({
  runtime: [
    async ({}, use) => {
      const settings = loadSettings();
      const clients = {
        dev: new ApiClient({ ...settings, environment: 'dev' }),
        prod: new ApiClient({ ...settings, environment: 'prod' }),
      };
      const contract = new Contract(undefined, settings.contractTrace);
      try {
        await use({ settings, clients, contract });
      } finally {
        await clients.dev.close();
        await clients.prod.close();
      }
    },
    { scope: 'worker' },
  ],
});

// Use one worker in the runner configuration. Default mode continues to the next
// scenario after a failure; Playwright's serial suite mode would skip later cases.
test.describe.configure({ mode: 'default' });

export function scenario(
  id: string,
  body: (context: ScenarioContext) => Promise<void>,
  meta: ScenarioMeta = {},
): void {
  test(id, { tag: meta.isolation ? '@isolation' : '@api' }, async ({ runtime }, info) => {
    info.annotations.push({ type: 'source-id', description: id });
    if (meta.bugId) info.annotations.push({ type: 'bug-id', description: meta.bugId });
    const { settings, clients, contract } = runtime;
    const owned = new OwnedUsers(clients);
    const context: ScenarioContext = {
      settings,
      contract,
      client: clients[settings.environment],
      devClient: clients.dev,
      prodClient: clients.prod,
      makeUser: userFactory(settings.environment),
      own: (email, environment = settings.environment) => owned.add(email, environment),
      checkBug: async (expected, signature) => {
        if (!meta.bugId) {
          await expected();
          return;
        }
        await checkKnownBug({
          enabled: settings.baseline,
          environment: settings.environment,
          bugId: meta.bugId,
          ...(meta.affected ? { affected: meta.affected } : {}),
          expected,
          signature,
        });
      },
    };
    let defect: KnownDefect | undefined;
    try {
      await body(context);
    } catch (error: unknown) {
      if (!(error instanceof KnownDefect)) throw error;
      defect = error;
    } finally {
      // Preserve curated cleanup semantics: ignore DELETE status, propagate
      // transport failures. A teardown failure can never become a known defect.
      await owned.cleanup();
    }
    if (defect) {
      info.annotations.push({
        type: 'known-defect',
        description: `${defect.bugId}: ${defect.message}`,
      });
    }
  });
}

export function asPayload(value: unknown): Payload {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Payload;
}

export function asUsers(value: unknown): Payload[] {
  assert.ok(Array.isArray(value));
  return value.map(asPayload);
}

export function assertInternalServerError(response: ApiResponse): void {
  assert.equal(response.status, 500);
  assert.equal(response.headers['content-type']?.split(';')[0], 'application/json');
  assert.deepEqual(response.json(), { error: 'Internal server error' });
}

export async function createOwned(
  context: ScenarioContext,
  overrides: Payload = {},
): Promise<Payload> {
  const payload = context.makeUser(overrides);
  context.own(String(payload.email));
  const response = await context.client.createUser(payload);
  assert.deepEqual(context.contract.assertResponse(response, '/users', 'post', 201), payload);
  return payload;
}

export async function readUser(context: ScenarioContext, email: string): Promise<Payload> {
  return asPayload(
    context.contract.assertResponse(
      await context.client.getUser(email),
      '/users/{email}',
      'get',
      200,
    ),
  );
}

export async function listUsers(context: ScenarioContext): Promise<Payload[]> {
  return asUsers(
    context.contract.assertResponse(await context.client.listUsers(), '/users', 'get', 200),
  );
}

export function assertUserIn(users: Payload[], expected: Payload): void {
  const matches = users.filter((user) => user.email === expected.email);
  assert.equal(matches.length, 1, 'Owned email must identify exactly one listed user');
  assert.deepEqual(matches[0], expected);
}

export function assertAbsent(users: Payload[], email: string): void {
  assert.ok(
    users.every((user) => user.email !== email),
    `Unexpected persisted user ${email}`,
  );
}

export async function assertUnchanged(context: ScenarioContext, expected: Payload): Promise<void> {
  assert.deepEqual(await readUser(context, String(expected.email)), expected);
}

export function userPath(email: string): string {
  // Match urllib.parse.quote(..., safe=''), including characters encodeURIComponent leaves literal.
  return `/users/${encodeURIComponent(email).replace(
    /[!'()*]/g,
    (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
  )}`;
}
