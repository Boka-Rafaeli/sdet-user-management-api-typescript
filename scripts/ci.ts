import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile, appendFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { startApi } from '../src/runtime.js';
import { redactText } from '../src/redaction.js';
const run = promisify(execFile);
const command = process.argv[2];
const root = process.env.REPORT_ROOT ?? 'reports/generated/ci';
const state = '.runtime/ci-api.json';
const secrets = [process.env.AUTH_TOKEN ?? 'mysecrettoken'];
await mkdir(root, { recursive: true });
async function readState(): Promise<{ id: string; baseUrl: string; digest: string } | undefined> {
  try {
    return JSON.parse(await readFile(state, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
async function ownedId(): Promise<string | undefined> {
  const data = await readState();
  if (!data) return undefined;
  if (!/^[a-f0-9]{64}$/.test(data.id)) throw new Error('Invalid owned container ID');
  const checked = await run('docker', [
    'inspect',
    '--format',
    '{{index .Config.Labels "sdet-ts-owned"}}',
    data.id,
  ]);
  if (checked.stdout.trim() !== 'true') throw new Error('Container ownership verification failed');
  return data.id;
}
try {
  if (command === 'start') {
    if (await readState()) throw new Error('CI container state already exists');
    const api = await startApi();
    try {
      await mkdir('.runtime', { recursive: true });
      await writeFile(
        state,
        JSON.stringify({ id: api.id, baseUrl: api.baseUrl, digest: api.digest }),
      );
      await writeFile(join(root, 'image-digest.txt'), api.digest + '\n');
      if (process.env.GITHUB_ENV)
        await appendFile(
          process.env.GITHUB_ENV,
          `BASE_URL=${api.baseUrl}\nIMAGE_DIGEST=${api.digest}\n`,
        );
      console.log('Isolated API is ready');
    } catch (error) {
      await api.stop();
      throw error;
    }
  } else if (command === 'logs') {
    const id = await ownedId();
    if (id) {
      const logs = await run('docker', ['logs', id], { maxBuffer: 16 * 1024 * 1024 });
      await writeFile(join(root, 'container.log'), redactText(logs.stdout + logs.stderr, secrets));
    }
  } else if (command === 'stop') {
    const id = await ownedId();
    if (id) {
      await run('docker', ['rm', '--force', id]);
      await unlink(state);
    }
  } else if (command === 'fault') {
    const phase = process.argv[3];
    if (process.env.CI_PROBE === phase) {
      if (phase === 'scrub') await writeFile(join(root, 'controlled-invalid.ndjson'), '{"broken":');
      else throw new Error('Intentional CI control: ' + phase + ' failure');
    }
  } else throw new Error('Usage: ci.ts start|logs|stop|fault <phase>');
} catch (error) {
  console.error(redactText(error instanceof Error ? error.message : String(error), secrets));
  process.exitCode = 1;
}
