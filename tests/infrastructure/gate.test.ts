import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const mode of ['exact', 'strict', 'unaffected', 'fixed', 'network', 'changed', 'teardown'])
  test('runner exit status for ' + mode, () => {
    const result = spawnSync(
      process.execPath,
      ['node_modules/@playwright/test/cli.js', 'test', '-c', 'tests/runner/playwright.config.ts'],
      { env: { ...process.env, GATE_CASE: mode }, encoding: 'utf8' },
    );
    assert.equal(result.status, mode === 'exact' ? 0 : 1, result.stdout + result.stderr);
  });
