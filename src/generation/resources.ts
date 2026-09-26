import type { ApiClient } from '../client.js';
import { redactText } from '../redaction.js';
import type { GeneratedCase } from './types.js';

function isTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = 'code' in error ? String(error.code) : '';
  return (
    [
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ETIMEDOUT',
      'EPIPE',
      'ERR_NETWORK',
    ].includes(code) || ['HTTP request timed out', 'socket hang up'].includes(error.message)
  );
}

export class GeneratedResourceError extends Error {
  override name = 'GeneratedResourceError';
}

export interface ResourceClient {
  createUser: ApiClient['createUser'];
  getUser: ApiClient['getUser'];
  deleteUser: ApiClient['deleteUser'];
}

export class GeneratedUserSeeder {
  private readonly cleanupEmails: Set<string>;
  private closed = false;
  constructor(
    readonly client: ResourceClient,
    readonly email: string,
    private readonly secrets: readonly string[] = [],
  ) {
    this.cleanupEmails = new Set([email]);
  }
  async prepare(): Promise<void> {
    if (this.closed) throw new GeneratedResourceError('Generated resource seeder is closed');
    const reset = await this.client.deleteUser(this.email);
    if (![204, 404].includes(reset.status))
      throw new GeneratedResourceError(
        `Generated resource reset expected 204/404, got ${reset.status}`,
      );
    const created = await this.client.createUser({
      name: 'Generated Resource',
      email: this.email,
      age: 42,
    });
    if (created.status !== 201)
      throw new GeneratedResourceError(
        `Generated resource create expected 201, got ${created.status}`,
      );
    const read = await this.client.getUser(this.email);
    if (read.status !== 200)
      throw new GeneratedResourceError(
        `Generated resource verify expected 200, got ${read.status}`,
      );
  }
  trackBody(body: unknown): void {
    if (
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      'email' in body &&
      typeof body.email === 'string' &&
      body.email
    )
      this.cleanupEmails.add(body.email);
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const email of [...this.cleanupEmails].sort()) {
      try {
        await this.client.deleteUser(email);
      } catch (error) {
        // Preserve the source best-effort cleanup policy; never print a raw transport error.
        if (!isTransportError(error)) throw error;
        void redactText(
          error instanceof Error ? error.message : 'Cleanup transport failure',
          this.secrets,
        );
      }
    }
  }
}

/** Returns a copy; caller's negative body/path values remain unchanged. */
export async function prepareGeneratedCase(
  input: GeneratedCase,
  seeder: GeneratedUserSeeder,
): Promise<GeneratedCase> {
  const testCase = structuredClone(input);
  if (
    !['PUT', 'DELETE'].includes(testCase.method) ||
    !testCase.positivePath ||
    !Object.hasOwn(testCase.pathParameters, 'email')
  )
    return testCase;
  await seeder.prepare();
  testCase.pathParameters.email = seeder.email;
  if (testCase.method === 'PUT') {
    if (
      testCase.mode === 'positive' &&
      testCase.body &&
      typeof testCase.body === 'object' &&
      !Array.isArray(testCase.body)
    )
      testCase.body = { ...testCase.body, email: seeder.email };
    else seeder.trackBody(testCase.body);
  }
  return testCase;
}
