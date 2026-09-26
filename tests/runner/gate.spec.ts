test.beforeEach(() => {
  if (process.env.GATE_CASE === 'setup') throw new Error('setup failed');
});
test.afterEach(() => {
  if (process.env.GATE_CASE === 'teardown') throw new Error('teardown failed');
});
import { test } from '@playwright/test';
import assert from 'node:assert/strict';
import { KnownDefect, checkKnownBug } from '../../src/baseline.js';
test('controlled gate', async ({}, info) => {
  const mode = process.env.GATE_CASE ?? 'exact';
  if (mode === 'secret') {
    console.log('control ' + process.env.AUTH_TOKEN);
    assert.fail('secret ' + process.env.AUTH_TOKEN + ' <script>alert(1)</script>');
  }
  try {
    await checkKnownBug({
      enabled: mode !== 'strict',
      environment: mode === 'unaffected' ? 'prod' : 'dev',
      bugId: 'BUG-CONTROL',
      affected: ['dev'],
      expected: async () => {
        if (mode === 'fixed') return;
        if (mode === 'network') throw new Error('network unavailable');
        assert.fail('contract mismatch');
      },
      signature: async () => {
        if (mode === 'changed') assert.fail('new defect');
      },
    });
  } catch (error) {
    if (!(error instanceof KnownDefect)) throw error;
    if (mode === 'teardown') throw new Error('teardown failed');
    info.annotations.push({ type: 'known-defect', description: error.bugId });
  }
});
