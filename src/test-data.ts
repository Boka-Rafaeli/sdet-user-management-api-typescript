import { randomUUID } from 'node:crypto';
import type { Environment } from './config.js';
export type UserPayload = Record<string, unknown>;
export function userFactory(environment: string): (overrides?: UserPayload) => UserPayload {
  return (overrides = {}) => ({
    name: 'SDET Candidate',
    email: `sdet-${environment}-${randomUUID().replaceAll('-', '')}@example.com`,
    age: 42,
    ...overrides,
  });
}
export class OwnedUsers {
  private readonly emails: Record<Environment, Set<string>> = { dev: new Set(), prod: new Set() };
  constructor(
    private readonly clients: Record<
      Environment,
      { deleteUser: (email: string) => Promise<unknown> }
    >,
  ) {}
  add(email: string, environment: Environment): void {
    this.emails[environment].add(email);
  }
  async cleanup(): Promise<void> {
    for (const environment of ['dev', 'prod'] as const)
      for (const email of this.emails[environment])
        await this.clients[environment].deleteUser(email);
  }
}
