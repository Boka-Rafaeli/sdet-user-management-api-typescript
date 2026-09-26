import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ApiClient, encodeEmail, type RawOptions } from '../client.js';
import { redact, redactText } from '../redaction.js';
import { CHECK_CATALOG, runChecks } from './checks.js';
import {
  caseArbitrary,
  runFuzz,
  GENERATOR_VERSION,
  FAST_CHECK_VERSION,
  type FuzzResult,
} from './fuzz.js';
import { coverageCases, exampleCase } from './schema.js';
import { GeneratedUserSeeder, prepareGeneratedCase } from './resources.js';
import type { CaseResult, CheckName, GeneratedCase, Operation, Phase } from './types.js';

export interface RunOptions {
  seed?: number;
  maxExamples?: number;
  maxFailures?: number;
  maxCoverageCases?: number;
  maxShrinks?: number;
  phases?: Phase[];
  runId?: string;
  operationId?: string;
  replayPath?: string;
  reportDir?: string;
  signal?: AbortSignal;
}
export interface Finding {
  operationId: string;
  check: CheckName;
  status: number;
  category: string;
}
export interface GeneratedSummary {
  schemaVersion: 1;
  generatorVersion: string;
  fastCheckVersion: string;
  seed: number;
  runId: string;
  requests: number;
  findings: Finding[];
  stoppedByFailureBudget: boolean;
  operations: Record<
    string,
    { examples: number; coverage: number; fuzzing: number; categories: string[] }
  >;
  fuzz: Record<string, FuzzResult>;
  engineError?: string;
  limits: {
    maxExamples: number;
    maxFailures: number;
    maxCoverageCases: number;
    maxShrinks: number;
  };
}
export class GenerationEngineError extends Error {
  override name = 'GenerationEngineError';
  constructor(
    message: string,
    readonly summary?: GeneratedSummary,
  ) {
    super(message);
  }
}
class BudgetReached extends Error {}

const xml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Serial execution intentionally preserves state ownership and source worker=1 behavior. */
export async function runGenerated(
  client: ApiClient,
  operations: Operation[],
  options: RunOptions = {},
): Promise<GeneratedSummary> {
  const limits = {
    maxExamples: options.maxExamples ?? 20,
    maxFailures: options.maxFailures ?? 20,
    maxCoverageCases: options.maxCoverageCases ?? 80,
    maxShrinks: options.maxShrinks ?? 50,
  };
  for (const [name, limit] of Object.entries(limits))
    if (!Number.isSafeInteger(limit) || limit < (name === 'maxShrinks' ? 0 : 1))
      throw new GenerationEngineError(`Invalid limit: ${name}`);
  const seed = options.seed ?? 20260926;
  if (!Number.isSafeInteger(seed)) throw new GenerationEngineError('Seed must be an integer');
  if (options.replayPath !== undefined && !options.operationId)
    throw new GenerationEngineError('Replay requires an operation ID');
  if (options.operationId && !operations.some((operation) => operation.id === options.operationId))
    throw new GenerationEngineError('Unknown operation ID');
  const selected = options.operationId
    ? operations.filter((operation) => operation.id === options.operationId)
    : operations;
  const phases =
    options.replayPath !== undefined
      ? (['fuzzing'] as Phase[])
      : (options.phases ?? ['examples', 'coverage', 'fuzzing']);
  if (
    phases.length === 0 ||
    phases.some((phase) => !['examples', 'coverage', 'fuzzing'].includes(phase))
  )
    throw new GenerationEngineError('Unknown or empty phase selection');
  const runId = options.runId ?? `local-${process.pid}`;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(runId))
    throw new GenerationEngineError('Run ID must contain 1–80 letters, digits or hyphens');
  const summary: GeneratedSummary = {
    schemaVersion: 1,
    generatorVersion: GENERATOR_VERSION,
    fastCheckVersion: FAST_CHECK_VERSION,
    seed,
    runId,
    requests: 0,
    findings: [],
    stoppedByFailureBudget: false,
    operations: Object.fromEntries(
      selected.map((operation) => [
        operation.id,
        { examples: 0, coverage: 0, fuzzing: 0, categories: [] },
      ]),
    ),
    fuzz: {},
    limits,
  };
  const secrets = [client.settings.authToken];
  const events: unknown[] = [
    {
      schemaVersion: 1,
      type: 'start',
      seed,
      runId,
      generatorVersion: GENERATOR_VERSION,
      fastCheckVersion: FAST_CHECK_VERSION,
      phases,
      limits,
      checks: CHECK_CATALOG,
    },
  ];
  const results: CaseResult[] = [];
  const fingerprints = new Set<string>();
  const seeder = new GeneratedUserSeeder(
    client,
    `generated-${client.environment}-${runId}@example.com`,
    secrets,
  );

  const execute = async (operation: Operation, input: GeneratedCase): Promise<boolean> => {
    if (summary.stoppedByFailureBudget) throw new BudgetReached();
    if (options.signal?.aborted) throw new GenerationEngineError('Generated run was aborted');
    const testCase = await prepareGeneratedCase(input, seeder);
    const resolvedPath = testCase.path.replace(/\{([^}]+)\}/g, (_match, name: string) => {
      if (testCase.pathParameters[name] === undefined)
        throw new GenerationEngineError('Missing generated path parameter');
      return encodeEmail(testCase.pathParameters[name]);
    });
    const request: RawOptions = { headers: testCase.headers };
    if (Object.hasOwn(testCase, 'body')) request.json = testCase.body;
    const response = await client.rawRequest(testCase.method, resolvedPath, request);
    const checks = runChecks(operation, testCase, response);
    const result = { testCase, response, checks };
    results.push(result);
    summary.requests += 1;
    const operationSummary = summary.operations[operation.id]!;
    operationSummary[testCase.phase] += 1;
    if (!operationSummary.categories.includes(testCase.category))
      operationSummary.categories.push(testCase.category);
    let responseBody: unknown;
    try {
      responseBody = response.json();
    } catch {
      responseBody = response.text();
    }
    events.push({
      schemaVersion: 1,
      type: 'case',
      testCase,
      response: { status: response.status, headers: response.headers, body: responseBody },
      checks,
    });
    const failures = checks.filter((check) => check.status === 'FAIL');
    for (const failure of failures) {
      const fingerprint = `${operation.id}|${failure.name}|${response.status}`;
      if (fingerprints.has(fingerprint) || summary.findings.length >= limits.maxFailures) continue;
      fingerprints.add(fingerprint);
      summary.findings.push({
        operationId: operation.id,
        check: failure.name,
        status: response.status,
        category: testCase.category,
      });
    }
    if (summary.findings.length >= limits.maxFailures) summary.stoppedByFailureBudget = true;
    return failures.length === 0;
  };

  let engineError: unknown;
  let engineFailed = false;
  try {
    for (const phase of phases) {
      if (phase === 'fuzzing') {
        for (const operation of selected) {
          summary.fuzz[operation.id] = await runFuzz(
            caseArbitrary(operation, client.settings.authToken),
            (testCase) => execute(operation, testCase),
            {
              seed,
              numRuns: limits.maxExamples,
              maxShrinks: limits.maxShrinks,
              ...(options.replayPath === undefined ? {} : { replayPath: options.replayPath }),
            },
          );
        }
      } else {
        const queues = selected.map((operation) => ({
          operation,
          cases:
            phase === 'examples'
              ? [exampleCase(operation, client.settings.authToken)]
              : coverageCases(operation, client.settings.authToken).slice(
                  0,
                  limits.maxCoverageCases,
                ),
        }));
        // Round-robin operations so a bounded failure budget cannot hide later paths entirely.
        while (queues.some((queue) => queue.cases.length > 0)) {
          for (const queue of queues) {
            const testCase = queue.cases.shift();
            if (testCase) await execute(queue.operation, testCase);
          }
        }
      }
    }
  } catch (error) {
    if (!(error instanceof BudgetReached)) {
      engineError = error;
      engineFailed = true;
    }
  } finally {
    try {
      await seeder.close();
    } catch (error) {
      engineError = error;
      engineFailed = true;
    }
  }
  if (engineFailed)
    summary.engineError = redactText(
      engineError instanceof Error ? engineError.message : 'Unknown generation engine failure',
      secrets,
    );
  events.push({ schemaVersion: 1, type: 'summary', summary });
  if (options.reportDir) {
    try {
      await writeGeneratedEvidence(options.reportDir, events, results, summary, secrets);
    } catch (error) {
      throw new GenerationEngineError(
        redactText(
          error instanceof Error ? error.message : 'Could not write generation evidence',
          secrets,
        ),
        summary,
      );
    }
  }
  if (engineFailed) throw new GenerationEngineError(summary.engineError!, summary);
  return summary;
}

async function writeGeneratedEvidence(
  directory: string,
  events: unknown[],
  results: CaseResult[],
  summary: GeneratedSummary,
  secrets: readonly string[],
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'events.ndjson'),
    events.map((event) => JSON.stringify(redact(event, secrets))).join('\n') + '\n',
    'utf8',
  );
  await writeFile(
    path.join(directory, 'summary.json'),
    JSON.stringify(redact(summary, secrets), null, 2) + '\n',
    'utf8',
  );
  const cases = results.map(({ testCase, checks }) => {
    const failures = checks.filter((check) => check.status === 'FAIL');
    const name = xml(
      redactText(`${testCase.operationId}: ${testCase.phase}/${testCase.category}`, secrets),
    );
    const body =
      failures.length === 0
        ? ''
        : `<failure message="API contract finding">${xml(redactText(failures.map((failure) => `${failure.name}: ${failure.message}`).join('\n'), secrets))}</failure>`;
    return `<testcase classname="generated" name="${name}">${body}</testcase>`;
  });
  if (summary.engineError)
    cases.push(
      `<testcase classname="generated" name="engine"><error message="Generation engine failed">${xml(redactText(summary.engineError, secrets))}</error></testcase>`,
    );
  const failures = results.filter((result) =>
    result.checks.some((check) => check.status === 'FAIL'),
  ).length;
  await writeFile(
    path.join(directory, 'junit.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="OpenAPI generated exploration" tests="${cases.length}" failures="${failures}" errors="${summary.engineError ? 1 : 0}">${cases.join('')}</testsuite>\n`,
    'utf8',
  );
}
