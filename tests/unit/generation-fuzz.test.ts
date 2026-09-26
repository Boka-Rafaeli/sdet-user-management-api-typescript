import assert from 'node:assert/strict';
import test from 'node:test';
import * as fc from 'fast-check';
import { loadOperations, exampleCase, requestValid } from '../../src/generation/schema.js';
import { caseArbitrary, runFuzz } from '../../src/generation/fuzz.js';
import type { GeneratedCase } from '../../src/generation/types.js';

test('the same seed/config reproduces cases and each advertised mode passes an independent oracle', () => {
  for (const operation of loadOperations()) {
    const arbitrary = caseArbitrary(operation);
    const first = fc.sample(arbitrary, { seed: 98765, numRuns: 20 });
    assert.deepEqual(first, fc.sample(arbitrary, { seed: 98765, numRuns: 20 }));
    for (const testCase of first)
      assert.equal(requestValid(operation, testCase), testCase.mode === 'positive');
  }
});

test('fuzz counterexamples shrink without losing the failure and replay exactly', async () => {
  const operation = loadOperations().find((item) => item.id === 'createUser')!;
  const arbitrary = fc.integer({ min: 0, max: 10000 }).map((age): GeneratedCase => ({
    ...exampleCase(operation),
    phase: 'fuzzing',
    body: { name: 'User', email: 'user@example.com', age },
  }));
  const property = async (testCase: GeneratedCase) => (testCase.body as { age: number }).age < 7;
  const result = await runFuzz(arbitrary, property, { seed: 12345, numRuns: 20, maxShrinks: 100 });
  assert.equal(result.failed, true);
  assert.ok(result.numShrinks > 0);
  assert.equal((result.counterexample!.body as { age: number }).age, 7);
  const replay = await runFuzz(arbitrary, property, {
    seed: result.seed,
    numRuns: 20,
    replayPath: result.replayPath!,
    maxShrinks: 100,
  });
  assert.equal(replay.failed, true);
  assert.deepEqual(replay.counterexample, result.counterexample);
});

test('passing property obeys example count and operational exceptions remain errors', async () => {
  const operation = loadOperations()[0]!;
  let calls = 0;
  const result = await runFuzz(
    caseArbitrary(operation),
    async () => {
      calls += 1;
      return true;
    },
    { seed: 10, numRuns: 7 },
  );
  assert.equal(result.failed, false);
  assert.equal(calls, 7);
  await assert.rejects(
    runFuzz(
      caseArbitrary(operation),
      async () => {
        throw new Error('setup failed');
      },
      { seed: 10 },
    ),
    /setup failed/,
  );
  await assert.rejects(
    runFuzz(caseArbitrary(operation), async () => true, { seed: 1, numRuns: 0 }),
    /Invalid fuzz limits/,
  );
});
