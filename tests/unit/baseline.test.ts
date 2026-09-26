import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkKnownBug, KnownDefect, type KnownBugOptions } from '../../src/baseline.js';
const mismatch = () => assert.fail('contract mismatch');
const defaults: KnownBugOptions = {
  enabled: true,
  environment: 'dev',
  bugId: 'BUG-TEST',
  expected: mismatch,
  signature: () => undefined,
};
test('exact matching signature produces a dedicated known-defect signal', async () =>
  assert.rejects(checkKnownBug(defaults), KnownDefect));
test('restored expected behavior blocks a stale baseline', async () =>
  assert.rejects(
    checkKnownBug({ ...defaults, expected: () => undefined }),
    /remove the known-bug baseline/,
  ));
test('changed signature is not expected failure', async () =>
  assert.rejects(
    checkKnownBug({ ...defaults, signature: () => assert.fail('different') }),
    (error) => error instanceof assert.AssertionError,
  ));
test('asynchronous operational errors propagate unchanged', async () => {
  const failure = new Error('connection lost');
  await assert.rejects(
    checkKnownBug({
      ...defaults,
      expected: async () => {
        throw failure;
      },
    }),
    (error) => error === failure,
  );
});
test('signature operational errors are not swallowed', async () =>
  assert.rejects(
    checkKnownBug({
      ...defaults,
      signature: () => {
        throw new Error('setup failed');
      },
    }),
    /setup failed/,
  ));
for (const options of [
  { enabled: false },
  { environment: 'prod' as const, affected: ['dev' as const] },
])
  test('strict or unaffected mode uses expected behavior ' + JSON.stringify(options), async () =>
    assert.rejects(checkKnownBug({ ...defaults, ...options }), assert.AssertionError),
  );
