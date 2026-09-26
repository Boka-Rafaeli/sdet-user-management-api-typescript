import * as fc from 'fast-check';
import { coverageCases, exampleCase, requestValid, schemaValid } from './schema.js';
import type { GeneratedCase, Operation, Schema } from './types.js';

export const GENERATOR_VERSION = 'ts-openapi-1';
export const FAST_CHECK_VERSION = fc.__version;

export function positiveArbitrary(schema: Schema): fc.Arbitrary<unknown> {
  switch (schema.type) {
    case 'string':
      return schema.format === 'email' ? fc.emailAddress() : fc.string({ maxLength: 40 });
    case 'integer':
      return fc.integer({
        min: Math.ceil(Number(schema.minimum ?? -1000)),
        max: Math.floor(Number(schema.maximum ?? 1000)),
      });
    case 'number':
      return fc.double({
        min: Number(schema.minimum ?? -1000),
        max: Number(schema.maximum ?? 1000),
        noNaN: true,
        noDefaultInfinity: true,
      });
    case 'boolean':
      return fc.boolean();
    case 'array':
      return fc.array(positiveArbitrary(schema.items as Schema), { maxLength: 3 });
    case 'object': {
      const properties = Object.fromEntries(
        Object.entries((schema.properties ?? {}) as Record<string, Schema>).map(([name, value]) => [
          name,
          positiveArbitrary(value),
        ]),
      );
      return fc.record(properties, { requiredKeys: (schema.required ?? []) as string[] });
    }
    default:
      throw new Error('Unsupported arbitrary schema type');
  }
}

export function caseArbitrary(
  operation: Operation,
  authToken = 'mysecrettoken',
): fc.Arbitrary<GeneratedCase> {
  const base = exampleCase(operation, authToken);
  const inputs: Record<string, fc.Arbitrary<unknown>> = {};
  for (const parameter of operation.parameters)
    if (parameter.in === 'path')
      inputs[`path:${parameter.name}`] = positiveArbitrary(parameter.schema);
  if (operation.body) inputs.body = positiveArbitrary(operation.body);
  const positive = fc.record(inputs).map((input): GeneratedCase => {
    const testCase = structuredClone(base);
    testCase.phase = 'fuzzing';
    testCase.category = 'fuzz-positive';
    for (const [key, value] of Object.entries(input)) {
      if (key === 'body') testCase.body = value;
      else testCase.pathParameters[key.slice(5)] = String(value);
    }
    if (!requestValid(operation, testCase))
      throw new Error('Positive arbitrary violated the request schema');
    return testCase;
  });
  const negativeTemplates = coverageCases(operation, authToken).filter(
    (testCase) =>
      testCase.mode === 'negative' && !testCase.unsupportedMethod && !testCase.missingHeader,
  );
  const alternatives: fc.Arbitrary<GeneratedCase>[] = [positive];
  if (negativeTemplates.length > 0)
    alternatives.push(
      fc.constantFrom(...negativeTemplates).map((template) => ({
        ...structuredClone(template),
        phase: 'fuzzing' as const,
        category: `fuzz-${template.category}`,
      })),
    );
  if (operation.body) {
    const bodySchema = operation.body;
    const invalidBodies = fc
      .jsonValue({ maxDepth: 2 })
      .filter((body) => !schemaValid(bodySchema, body));
    alternatives.push(
      invalidBodies.map((body) => ({
        ...structuredClone(base),
        body,
        mode: 'negative',
        phase: 'fuzzing',
        category: 'fuzz-invalid-json',
      })),
    );
  }
  return fc.oneof(...alternatives);
}

export interface FuzzOptions {
  seed: number;
  numRuns?: number;
  replayPath?: string;
  maxShrinks?: number;
}
export interface FuzzResult {
  failed: boolean;
  seed: number;
  replayPath: string | null;
  numRuns: number;
  numShrinks: number;
  counterexample: GeneratedCase | null;
  generatorVersion: string;
  fastCheckVersion: string;
}

/** Property false means an API finding; an exception always remains an engine/setup error. */
export async function runFuzz(
  arbitrary: fc.Arbitrary<GeneratedCase>,
  predicate: (testCase: GeneratedCase) => Promise<boolean>,
  options: FuzzOptions,
): Promise<FuzzResult> {
  if (!Number.isSafeInteger(options.seed)) throw new Error('Fuzz seed must be an integer');
  const numRuns = options.numRuns ?? 20;
  const maxShrinks = options.maxShrinks ?? 50;
  if (
    !Number.isSafeInteger(numRuns) ||
    numRuns < 1 ||
    !Number.isSafeInteger(maxShrinks) ||
    maxShrinks < 0
  )
    throw new Error('Invalid fuzz limits');
  let operationalError: unknown;
  let operationalFailure = false;
  const property = fc.asyncProperty(fc.limitShrink(arbitrary, maxShrinks), async (testCase) => {
    if (operationalFailure) return true;
    try {
      return await predicate(testCase);
    } catch (error) {
      operationalError = error;
      operationalFailure = true;
      return false;
    }
  });
  const result = await fc.check(property, {
    seed: options.seed,
    numRuns,
    ...(options.replayPath === undefined ? {} : { path: options.replayPath }),
    endOnFailure: options.replayPath !== undefined,
  });
  if (operationalFailure) throw operationalError;
  if (result.interrupted) throw new Error('Generated property run was interrupted');
  return {
    failed: result.failed,
    seed: result.seed,
    replayPath: result.failed ? result.counterexamplePath : null,
    numRuns: result.numRuns,
    numShrinks: result.numShrinks,
    counterexample: result.failed ? (result.counterexample?.[0] ?? null) : null,
    generatorVersion: GENERATOR_VERSION,
    fastCheckVersion: FAST_CHECK_VERSION,
  };
}
