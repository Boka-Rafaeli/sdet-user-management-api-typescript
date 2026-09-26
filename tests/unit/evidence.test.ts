import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyEvidenceTree } from '../../src/scrubber.js';

test('retained HTML/XML/log/JSON reject secret leaks independently of NDJSON', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const extension of ['html', 'xml', 'log', 'json']) {
    const file = join(root, 'report.' + extension);
    await writeFile(
      file,
      extension === 'json'
        ? JSON.stringify({ error: 'control-private-token' })
        : 'control-private-token',
    );
    await assert.rejects(verifyEvidenceTree(root, ['control-private-token']), /secret survived/);
    await rm(file);
  }
  await writeFile(join(root, 'report.html'), '<html>safe</html>');
  assert.equal(await verifyEvidenceTree(root, ['control-private-token']), 1);
  await writeFile(
    join(root, 'summary.json'),
    JSON.stringify({ Authentication: 'unexpected-credential' }),
  );
  await assert.rejects(verifyEvidenceTree(root, []), /Sensitive field/);
});
test('unsupported binary formats and symlinks cannot bypass the artifact gate', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'raw.har');
  await writeFile(file, '{}');
  await assert.rejects(verifyEvidenceTree(root, []), /Unsupported/);
  await rm(file);
  await symlink('/tmp', join(root, 'external'));
  await assert.rejects(verifyEvidenceTree(root, []), /symbolic/);
});
