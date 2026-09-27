import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('historical generated case totals cite their actual CI execution', () => {
  const document = readFileSync('BUGS.md', 'utf8');
  const section = document.split('## Execution evidence\n')[1]?.split('\n## ')[0];
  assert.ok(section);
  assert.ok(section.includes('not a stable coverage KPI'));
  for (const paragraph of section.split('\n\n')) {
    if (
      paragraph.includes('Schemathesis') &&
      /(?:\b\d+\s+(?:generated\s+|found\s+)?(?:test\s+)?cases?\b|\b(?:counts?|totals?)\s+(?:of\s+)?\d+)/i.test(
        paragraph,
      )
    )
      assert.match(paragraph, /https:\/\/github\.com\/[^\s)]+\/actions\/runs\/\d+/);
  }
});
