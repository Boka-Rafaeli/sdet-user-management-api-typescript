import { AssertionError } from 'node:assert';
import type { Environment } from './config.js';
export class KnownDefect extends Error {
  constructor(
    readonly bugId: string,
    readonly environment: Environment,
  ) {
    super(`${bugId}: exact defect signature reproduced in ${environment}`);
    this.name = 'KnownDefect';
  }
}
export interface KnownBugOptions {
  enabled: boolean;
  environment: Environment;
  bugId: string;
  affected?: readonly Environment[];
  expected: () => unknown | Promise<unknown>;
  signature: () => unknown | Promise<unknown>;
}
export async function checkKnownBug(options: KnownBugOptions): Promise<void> {
  const affected = options.affected ?? ['dev', 'prod'];
  if (!options.enabled || !affected.includes(options.environment)) {
    await options.expected();
    return;
  }
  try {
    await options.expected();
  } catch (error) {
    if (!(error instanceof AssertionError)) throw error;
    await options.signature();
    throw new KnownDefect(options.bugId, options.environment);
  }
  throw new Error(
    `${options.bugId}: expected behavior now conforms; remove the known-bug baseline`,
  );
}
