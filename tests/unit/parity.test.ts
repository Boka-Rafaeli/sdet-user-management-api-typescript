import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
test('every reference scenario maps to an existing TypeScript case and file', () => {
  const matrix = read('docs/parity-matrix.json');
  const manifest = read('tests/api/manifest.json');
  const reference = read('docs/reference-results.json');
  for (const scope of ['api', 'isolation']) {
    const rows = matrix.api.filter((row: any) => row.scope === scope);
    const expected = reference.scopes[scope === 'api' ? 'dev' : 'isolation'].cases
      .map((row: any) => row.id)
      .sort();
    assert.deepEqual(rows.map((row: any) => row.typescriptId).sort(), expected);
    assert.deepEqual([...manifest[scope]].sort(), expected);
    assert.equal(new Set(expected).size, expected.length);
    for (const row of rows) assert.ok(existsSync(row.typescriptFile), row.typescriptFile);
  }
  assert.equal(matrix.infrastructure.length, 37);
  for (const row of matrix.infrastructure)
    for (const file of row.typescriptEvidence) assert.ok(existsSync(file), file);
  assert.deepEqual(reference.scopes.dev.counts, { PASS: 35, XFAIL: 20, FAIL: 0 });
  assert.deepEqual(reference.scopes.prod.counts, { PASS: 38, XFAIL: 17, FAIL: 0 });
  assert.deepEqual(reference.scopes.isolation.counts, { PASS: 1, XFAIL: 0, FAIL: 0 });
});
test('the supplied OpenAPI bytes remain unchanged and published sample provenance is explicit', () => {
  const source = read('docs/source-sha256.json');
  assert.equal(
    createHash('sha256').update(readFileSync('openapi/sdet_challenge_api.yml')).digest('hex'),
    source['openapi/sdet_challenge_api.yml'],
  );
  const provenance = read('reports/sample/provenance.json');
  assert.match(
    provenance.runUrl,
    /github\.com\/Boka-Rafaeli\/sdet-user-management-api-typescript\/actions\/runs\/\d+$/,
  );
  for (const scope of ['dev', 'prod', 'isolation']) {
    const summary = read('reports/sample/' + scope + '-summary.json');
    assert.equal(summary.status, 'passed');
    assert.ok(summary.imageDigest.endsWith(provenance.imageDigest));
    const html = readFileSync('reports/sample/' + scope + '-report.html', 'utf8');
    assert.equal(/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html), false);
  }
});
