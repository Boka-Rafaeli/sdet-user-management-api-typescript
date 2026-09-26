import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApiClient, ApiResponse, type ApiRequest } from '../../src/client.js';
import { loadSettings } from '../../src/config.js';
import { loadOperations } from '../../src/generation/schema.js';
import { runGenerated, GenerationEngineError } from '../../src/generation/runner.js';

async function reportDirectory(t: TestContext): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'generated-evidence-'));
  t.after(async () => fs.rm(directory, { force: true, recursive: true }));
  return directory;
}

function controlledClient(
  t: TestContext,
  failure?: (request: ApiRequest) => ApiResponse | undefined,
) {
  const users = new Map<string, { name: string; email: string; age: number }>();
  const requests: ApiRequest[] = [];
  const settings = loadSettings({}, { AUTH_TOKEN: 'private-generated-token' });
  let active = 0;
  let maxActive = 0;
  const client = new ApiClient(settings, async (request) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    requests.push(request);
    await Promise.resolve();
    try {
      const fault = failure?.(request);
      if (fault) return fault;
      const response = (
        status: number,
        body: unknown = { error: 'request rejected' },
        extra: Record<string, string> = {},
      ) =>
        new ApiResponse(
          status,
          { ...(status === 204 ? {} : { 'content-type': 'application/json' }), ...extra },
          status === 204 ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)),
          request,
        );
      const pathname = new URL(request.url).pathname.replace('/dev', '');
      const email = pathname.startsWith('/users/')
        ? decodeURIComponent(pathname.slice(7))
        : undefined;
      const methods = email === undefined ? ['GET', 'POST'] : ['GET', 'PUT', 'DELETE'];
      if (request.method === 'OPTIONS')
        return response(204, undefined, { allow: methods.join(', ') });
      if (!methods.includes(request.method))
        return response(405, undefined, { allow: methods.join(', ') });
      if (request.method === 'GET')
        return email === undefined
          ? response(200, [...users.values()])
          : users.has(email)
            ? response(200, users.get(email))
            : response(404);
      if (request.method === 'DELETE') {
        if (request.headers.authentication !== settings.authToken) return response(401);
        if (!users.has(email!)) return response(404);
        users.delete(email!);
        return response(204);
      }
      let body: any;
      try {
        body = JSON.parse(request.body?.toString('utf8') ?? '');
      } catch {
        return response(400);
      }
      if (
        !body ||
        Array.isArray(body) ||
        typeof body !== 'object' ||
        typeof body.name !== 'string' ||
        typeof body.email !== 'string' ||
        !body.email.includes('@') ||
        !Number.isInteger(body.age) ||
        body.age < 1 ||
        body.age > 150
      )
        return response(400);
      if (request.method === 'POST') {
        if (users.has(body.email)) return response(409);
        users.set(body.email, body);
        return response(201, body);
      }
      if (!users.has(email!)) return response(404);
      if (body.email !== email && users.has(body.email)) return response(409);
      users.delete(email!);
      users.set(body.email, body);
      return response(200, body);
    } finally {
      active -= 1;
    }
  });
  t.after(() => client.close());
  return { client, requests, users, maxActive: () => maxActive };
}

test('all phases integrate across five operations with serial requests and valid scrubbed evidence', async (t) => {
  const { client, requests, users, maxActive } = controlledClient(t);
  const reportDir = await reportDirectory(t);
  const summary = await runGenerated(client, loadOperations(), {
    reportDir,
    seed: 12345,
    runId: 'test-run',
    maxExamples: 5,
    maxShrinks: 5,
  });
  assert.equal(summary.engineError, undefined);
  assert.equal(summary.findings.length, 0);
  assert.equal(maxActive(), 1);
  for (const counts of Object.values(summary.operations)) {
    assert.equal(counts.examples, 1);
    assert.ok(counts.coverage > 0);
    assert.equal(counts.fuzzing, 5);
  }
  assert.ok(
    requests.some(
      (request) => request.method === 'PUT' && request.url.includes('generated-dev-test-run'),
    ),
  );
  assert.equal(users.has('generated-dev-test-run@example.com'), false);
  for (const filename of await fs.readdir(reportDir)) {
    const contents = await fs.readFile(path.join(reportDir, filename), 'utf8');
    assert.equal(contents.includes(client.settings.authToken), false);
  }
  const events = (await fs.readFile(path.join(reportDir, 'events.ndjson'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events[0].type, 'start');
  assert.equal(events.at(-1).type, 'summary');
  assert.match(
    await fs.readFile(path.join(reportDir, 'junit.xml'), 'utf8'),
    /failures="0" errors="0"/,
  );
});

test('API findings are returned, bounded and reported without being converted to engine errors', async (t) => {
  const { client } = controlledClient(t, (request) =>
    request.method === 'GET' && request.url.endsWith('/users')
      ? new ApiResponse(
          500,
          { 'content-type': 'application/json' },
          Buffer.from('{"error":"Internal server error"}'),
          request,
        )
      : undefined,
  );
  const reportDir = await reportDirectory(t);
  const summary = await runGenerated(client, loadOperations(), {
    reportDir,
    runId: 'failure-run',
    maxFailures: 1,
  });
  assert.equal(summary.findings.length, 1);
  assert.equal(summary.stoppedByFailureBudget, true);
  assert.equal(summary.requests, 1);
  assert.equal(summary.engineError, undefined);
  assert.match(
    await fs.readFile(path.join(reportDir, 'junit.xml'), 'utf8'),
    /failures="1" errors="0"/,
  );
});

test('transport/setup failure blocks, retains an error report, and redacts its message', async (t) => {
  const { client } = controlledClient(t, (request) => {
    if (request.method === 'GET' && request.url.endsWith('/users'))
      throw new Error('network failed private-generated-token <unsafe>');
    return undefined;
  });
  const reportDir = await reportDirectory(t);
  await assert.rejects(
    runGenerated(client, loadOperations(), { reportDir, runId: 'engine-run' }),
    (error: unknown) => {
      assert.ok(error instanceof GenerationEngineError);
      assert.equal(error.message.includes('private-generated-token'), false);
      return true;
    },
  );
  const junit = await fs.readFile(path.join(reportDir, 'junit.xml'), 'utf8');
  assert.match(junit, /errors="1"/);
  assert.equal(junit.includes('<unsafe>'), false);
  assert.equal(junit.includes('private-generated-token'), false);
});

test('phase/coverage limits are visible and aborted execution is an operational failure', async (t) => {
  const { client } = controlledClient(t);
  const summary = await runGenerated(client, loadOperations(), {
    phases: ['coverage'],
    maxCoverageCases: 2,
    runId: 'bounded-run',
  });
  for (const counts of Object.values(summary.operations)) {
    assert.equal(counts.examples, 0);
    assert.ok(counts.coverage <= 2);
    assert.equal(counts.fuzzing, 0);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runGenerated(client, loadOperations(), { signal: controller.signal, runId: 'aborted-run' }),
    /aborted/,
  );
  await assert.rejects(
    runGenerated(client, loadOperations(), { replayPath: '0:0' }),
    /requires an operation/,
  );
});
