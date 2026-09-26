import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scrubTree, ScrubError, type ScrubFileSystem } from '../../src/scrubber.js';

async function fixture(t: TestContext): Promise<{ root: string; report: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sdet-scrub-test-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  return { root, report: path.join(root, 'events.ndjson') };
}

test('scrubs nested NDJSON records, preserves modes and leaves unrelated files intact', async (t) => {
  const { root } = await fixture(t);
  const nested = path.join(root, 'generated');
  await fs.mkdir(nested);
  const report = path.join(nested, 'events.ndjson');
  const other = path.join(root, 'safe.txt');
  await fs.writeFile(other, 'not NDJSON');
  const token = 'credential /private+123';
  await fs.writeFile(
    report,
    [
      { command: `run --header Authentication:${token}` },
      {
        case: {
          headers: { Authentication: [token] },
          body: { password: 'not the configured token' },
        },
      },
      { url: `https://api.test/${encodeURIComponent(token)}` },
    ]
      .map((record) => JSON.stringify(record))
      .join('\n'),
  );
  await fs.chmod(report, 0o640);
  assert.deepEqual(await scrubTree(root, [token]), { files: 1, records: 3 });
  assert.deepEqual(
    (await fs.readFile(report, 'utf8'))
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line)),
    [
      { command: 'run --header Authentication:<redacted>' },
      { case: { headers: { Authentication: ['<redacted>'] }, body: { password: '<redacted>' } } },
      { url: 'https://api.test/<redacted>' },
    ],
  );
  assert.equal((await fs.stat(report)).mode & 0o777, 0o640);
  assert.equal(await fs.readFile(other, 'utf8'), 'not NDJSON');
  assert.deepEqual(await fs.readdir(nested), ['events.ndjson']);
});

test('accepts a tree without NDJSON and an empty NDJSON file', async (t) => {
  const { root, report } = await fixture(t);
  assert.deepEqual(await scrubTree(root, ['secret-token']), { files: 0, records: 0 });
  await fs.writeFile(report, '');
  assert.deepEqual(await scrubTree(root, ['secret-token']), { files: 1, records: 0 });
  assert.equal(await fs.readFile(report, 'utf8'), '');
});

test('accepts CRLF and a final record without a newline', async (t) => {
  const { root, report } = await fixture(t);
  await fs.writeFile(report, '{"a":1}\r\n{"b":2}');
  assert.deepEqual(await scrubTree(root, []), { files: 1, records: 2 });
  assert.equal(await fs.readFile(report, 'utf8'), '{"a":1}\n{"b":2}\n');
});

for (const [label, bytes] of [
  ['invalid JSON', Buffer.from('{"good":true}\n{"token":\n')],
  ['blank record', Buffer.from('{}\n\n')],
  ['whitespace record', Buffer.from(' \t\n')],
  ['invalid UTF-8', Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d])],
  ['UTF-8 BOM', Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a])],
] as const) {
  test(`rejects ${label} without replacing original or leaving a temporary file`, async (t) => {
    const { root, report } = await fixture(t);
    await fs.writeFile(report, bytes);
    await assert.rejects(scrubTree(root, ['secret-token']), ScrubError);
    assert.deepEqual(await fs.readFile(report), bytes);
    assert.deepEqual(await fs.readdir(root), ['events.ndjson']);
  });
}

test('rejects missing and non-directory evidence roots', async (t) => {
  const { root, report } = await fixture(t);
  await assert.rejects(scrubTree(path.join(root, 'missing'), []), ScrubError);
  await fs.writeFile(report, '{}\n');
  await assert.rejects(scrubTree(report, []), /not a directory/);
});

test('rejects a directory masquerading as an NDJSON file', async (t) => {
  const { root, report } = await fixture(t);
  await fs.mkdir(report);
  await assert.rejects(scrubTree(root, []), /must be a regular file/);
});

test('rejects root and NDJSON symlinks without modifying their targets', async (t) => {
  const { root, report } = await fixture(t);
  const nested = path.join(root, 'evidence');
  await fs.mkdir(nested);
  await fs.writeFile(report, '{"token":"private-token"}\n');
  const rootLink = path.join(root, 'root-link');
  await fs.symlink(nested, rootLink, 'dir');
  await assert.rejects(scrubTree(rootLink, ['private-token']), /symbolic link/);
  await fs.symlink(report, path.join(nested, 'linked.ndjson'));
  await assert.rejects(scrubTree(nested, ['private-token']), /symbolic link/);
  assert.equal(await fs.readFile(report, 'utf8'), '{"token":"private-token"}\n');
});

test('rejects directory symlinks so linked raw evidence cannot bypass verification', async (t) => {
  const { root } = await fixture(t);
  const evidence = path.join(root, 'evidence');
  const outside = path.join(root, 'outside');
  await fs.mkdir(evidence);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'raw.ndjson'), '{"token":"private-token"}\n');
  await fs.symlink(outside, path.join(evidence, 'linked'), 'dir');
  await assert.rejects(scrubTree(evidence, ['private-token']), /symbolic link/);
});

test('rejects resolved paths that escape the evidence root', async (t) => {
  const { root, report } = await fixture(t);
  await fs.writeFile(report, '{}\n');
  const resolvedReport = await fs.realpath(report);
  await assert.rejects(
    scrubTree(root, [], {
      fs: {
        realpath: async (file) =>
          file === resolvedReport
            ? path.join(path.dirname(root), 'outside.ndjson')
            : fs.realpath(file),
      },
    }),
    /escapes its root/,
  );
});

for (const failure of ['readFile', 'writeFile', 'chmod', 'rename'] as const) {
  test(`${failure} failure preserves original, removes temporary file and hides unsafe OS details`, async (t) => {
    const { root, report } = await fixture(t);
    const original = '{"token":"private-token"}\n';
    await fs.writeFile(report, original);
    const fault: Partial<ScrubFileSystem> = {};
    if (failure === 'writeFile') {
      fault.writeFile = async (file) => {
        await fs.writeFile(file, 'partial output');
        throw new Error('sensitive OS details private-token');
      };
    } else if (failure === 'readFile') {
      fault.readFile = async () => {
        throw new Error('sensitive OS details private-token');
      };
    } else if (failure === 'chmod') {
      fault.chmod = async () => {
        throw new Error('sensitive OS details private-token');
      };
    } else {
      fault.rename = async () => {
        throw new Error('sensitive OS details private-token');
      };
    }
    await assert.rejects(scrubTree(root, ['private-token'], { fs: fault }), (error: unknown) => {
      assert.ok(error instanceof ScrubError);
      assert.equal(error.message.includes('private-token'), false);
      assert.equal(error.message.includes('sensitive OS details'), false);
      return true;
    });
    assert.equal(await fs.readFile(report, 'utf8'), original);
    assert.deepEqual(await fs.readdir(root), ['events.ndjson']);
  });
}

test('atomicity applies to each file; later bad file still blocks the whole tree', async (t) => {
  const { root } = await fixture(t);
  const first = path.join(root, 'a.ndjson');
  const second = path.join(root, 'b.ndjson');
  await fs.writeFile(first, '{"token":"private-token"}\n');
  await fs.writeFile(second, 'invalid\n');
  await assert.rejects(scrubTree(root, ['private-token']), /Invalid NDJSON/);
  assert.equal(await fs.readFile(first, 'utf8'), '{"token":"<redacted>"}\n');
  assert.equal(await fs.readFile(second, 'utf8'), 'invalid\n');
});

test('exclusive temporary-file collision never deletes an unowned file', async (t) => {
  const { root, report } = await fixture(t);
  await fs.writeFile(report, '{}\n');
  let unownedFile = '';
  await assert.rejects(
    scrubTree(root, [], {
      fs: {
        writeFile: async (file) => {
          unownedFile = file;
          await fs.writeFile(file, 'belongs to another writer');
          const collision = Object.assign(new Error('already exists'), { code: 'EEXIST' });
          throw collision;
        },
      },
    }),
    ScrubError,
  );
  assert.equal(await fs.readFile(unownedFile, 'utf8'), 'belongs to another writer');
  assert.equal(await fs.readFile(report, 'utf8'), '{}\n');
});

test('CLI reads env secrets, returns truthful exit codes and never prints their values', async (t) => {
  const { root, report } = await fixture(t);
  const script = fileURLToPath(new URL('../../scripts/scrub.ts', import.meta.url));
  // Reuse the tsx loader injected into this node:test process, avoiding globals.
  const command = [...process.execArgv, script, root, '--secret-env', 'SDET_SCRUB_TEST_TOKEN'];
  const token = 'private-cli-token';
  await fs.writeFile(report, `{"token":"${token}"}\n`);
  const success = spawnSync(process.execPath, command, {
    env: { ...process.env, SDET_SCRUB_TEST_TOKEN: token },
    encoding: 'utf8',
  });
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /files=1 records=1/);
  assert.equal(`${success.stdout}${success.stderr}`.includes(token), false);
  assert.equal(await fs.readFile(report, 'utf8'), '{"token":"<redacted>"}\n');

  const missing = spawnSync(process.execPath, command, {
    env: { ...process.env, SDET_SCRUB_TEST_TOKEN: '' },
    encoding: 'utf8',
  });
  assert.equal(missing.status, 1, missing.stderr);
  assert.match(missing.stderr, /Required secret environment variable is empty/);

  await fs.writeFile(report, 'bad JSON\n');
  const invalid = spawnSync(process.execPath, command, {
    env: { ...process.env, SDET_SCRUB_TEST_TOKEN: token },
    encoding: 'utf8',
  });
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.match(invalid.stderr, /Invalid NDJSON record/);
});
