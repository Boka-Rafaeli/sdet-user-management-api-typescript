import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const manifest = JSON.parse(readFileSync('tests/api/manifest.json', 'utf8')) as Record<
  string,
  string[]
>;
for (const [key, scope] of [
  ['api', 'dev'],
  ['isolation', 'isolation'],
] as const) {
  const child = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--list', '--reporter=json'],
    { env: { ...process.env, SCOPE: scope }, encoding: 'utf8' },
  );
  assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout);
  const found: string[] = [];
  function walk(suite: any): void {
    for (const spec of suite.specs ?? []) found.push(spec.title);
    for (const nested of suite.suites ?? []) walk(nested);
  }
  walk(result);
  assert.deepEqual(found.sort(), [...manifest[key]!].sort());
  assert.equal(new Set(found).size, found.length);
  console.log(scope + ': verified ' + found.length + ' expected test IDs');
}
