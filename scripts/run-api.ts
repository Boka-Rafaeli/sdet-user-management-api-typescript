import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cliSettings } from '../src/config.js';
import { startApi, type ManagedApi } from '../src/runtime.js';
import { redactText } from '../src/redaction.js';
const scope = process.argv[2] ?? 'dev';
if (!['dev', 'prod', 'isolation'].includes(scope))
  throw new Error('Expected dev, prod or isolation');
const withGenerated = process.argv.includes('--with-generated');
const settings = cliSettings([
  '--environment',
  scope === 'prod' ? 'prod' : 'dev',
  ...process.argv.slice(3).filter((arg) => arg !== '--with-generated'),
]);
const reportRoot = process.env.REPORT_ROOT ?? join('reports/generated', scope);
await mkdir(reportRoot, { recursive: true });
let api: ManagedApi | undefined;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    interrupted = true;
    void api?.stop().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  });
const run = (args: string[], env: NodeJS.ProcessEnv) =>
  new Promise<number>((resolve) => {
    const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
let status = 1;
try {
  if (!process.env.BASE_URL) api = await startApi();
  const env = {
    ...process.env,
    BASE_URL: api?.baseUrl ?? settings.baseUrl,
    TEST_ENV: settings.environment,
    AUTH_TOKEN: settings.authToken,
    HTTP_TIMEOUT_SECONDS: String(settings.timeoutMs / 1000),
    HTTP_TRACE: settings.httpTrace ? '1' : '0',
    CONTRACT_TRACE: settings.contractTrace ? '1' : '0',
    KNOWN_BUGS_AS_XFAIL: settings.baseline ? '1' : '0',
    SCOPE: scope,
    REPORT_DIR: join(reportRoot, 'deterministic'),
    IMAGE_DIGEST: api?.digest ?? process.env.IMAGE_DIGEST,
  };
  if (api) await writeFile(join(reportRoot, 'image-digest.txt'), api.digest + '\n');
  status = await run(['node_modules/@playwright/test/cli.js', 'test'], env);
  if (withGenerated && scope !== 'isolation' && existsSync('scripts/generated.ts')) {
    const generatedStatus = await run(
      ['--import', 'tsx', 'scripts/generated.ts', settings.environment],
      { ...env, REPORT_DIR: join(reportRoot, 'generated') },
    );
    if (generatedStatus !== 0) status = 1;
  }
} catch (error) {
  console.error(
    redactText(error instanceof Error ? error.message : String(error), [settings.authToken]),
  );
  status = 1;
} finally {
  if (api) {
    try {
      await writeFile(
        join(reportRoot, 'container.log'),
        redactText(await api.logs(), [settings.authToken]),
      );
    } finally {
      await api.stop();
    }
  }
}
process.exitCode = interrupted ? 1 : status;
