import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForApi } from '../../src/runtime.js';
test('readiness retries operational errors and non-200 until ready', async () => {
  let clock = 0,
    calls = 0;
  await waitForApi('unused', {
    timeoutMs: 20,
    intervalMs: 5,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    probe: async () => {
      calls++;
      if (calls === 1) throw new Error('connection');
      return calls === 2 ? 503 : 200;
    },
  });
  assert.equal(calls, 3);
});
test('readiness fails within deadline with bounded sleeps', async () => {
  let clock = 0;
  await assert.rejects(
    waitForApi('unused', {
      timeoutMs: 7,
      intervalMs: 5,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      probe: async () => 503,
    }),
    /timed out/,
  );
  assert.equal(clock, 7);
});
