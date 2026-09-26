import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
for (const mode of [
  'exact',
  'strict',
  'unaffected',
  'fixed',
  'network',
  'changed',
  'setup',
  'teardown',
  'secret',
])
  test('runner and reports agree for ' + mode, () => {
    const directory = mkdtempSync(join(tmpdir(), 'sdet-gate-'));
    const token = 'control-secret-5927';
    try {
      const result = spawnSync(
        process.execPath,
        ['node_modules/@playwright/test/cli.js', 'test', '-c', 'tests/runner/playwright.config.ts'],
        {
          env: {
            ...process.env,
            GATE_CASE: mode,
            AUTH_TOKEN: token,
            REPORT_DIR: directory,
            SCOPE: '',
          },
          encoding: 'utf8',
        },
      );
      assert.equal(result.status, mode === 'exact' ? 0 : 1, result.stdout + result.stderr);
      const summary = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
      assert.equal(summary.results[0].status, mode === 'exact' ? 'XFAIL' : 'FAIL');
      const html = readFileSync(join(directory, 'report.html'), 'utf8');
      const xml = readFileSync(join(directory, 'junit.xml'), 'utf8');
      for (const output of [result.stdout, result.stderr, html, xml, JSON.stringify(summary)])
        assert.ok(!output.includes(token));
      if (mode === 'secret') {
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&lt;script&gt;'));
      }
      if (mode === 'exact') assert.ok(xml.includes('type="xfail"'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
