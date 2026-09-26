import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const execute = promisify(execFile);
export const DEFAULT_IMAGE =
  'ghcr.io/danielsilva-loanpro/sdet-interview-challenge@sha256:c80c42ffafccb6ba9cd9a128421445d308225f09902c03aeadbc99e321176bbc';
export interface ReadinessOptions {
  timeoutMs?: number;
  intervalMs?: number;
  probe?: (remaining: number) => Promise<number>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}
export async function waitForApi(url: string, options: ReadinessOptions = {}): Promise<void> {
  const timeout = options.timeoutMs ?? 45000,
    interval = options.intervalMs ?? 250;
  if (!Number.isFinite(timeout) || timeout <= 0 || interval < 0)
    throw new Error('Invalid readiness timing');
  const now = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const probe =
    options.probe ??
    (async (remaining) =>
      (
        await fetch(url, {
          signal: AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(2000, remaining)))),
          redirect: 'manual',
        })
      ).status);
  const deadline = now() + timeout;
  let last = 'no response';
  while (now() < deadline) {
    try {
      const status = await probe(deadline - now());
      if (status === 200) return;
      last = 'HTTP ' + status;
    } catch {
      last = 'connection error';
    }
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(interval, remaining));
  }
  throw new Error(`API readiness timed out after ${timeout}ms (${last})`);
}
async function docker(args: string[]): Promise<string> {
  return (await execute('docker', args, { maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
}
export interface ManagedApi {
  id: string;
  baseUrl: string;
  digest: string;
  stop: () => Promise<void>;
  logs: () => Promise<string>;
}
export async function startApi(
  image = process.env.APP_IMAGE ?? DEFAULT_IMAGE,
): Promise<ManagedApi> {
  const name = 'sdet-ts-' + randomUUID();
  const id = await docker([
    'run',
    '--detach',
    '--platform',
    'linux/amd64',
    '--name',
    name,
    '--label',
    'sdet-ts-owned=true',
    '--publish',
    '127.0.0.1::3000',
    image,
  ]);
  let stopped = false;
  const stop = async () => {
    if (!stopped) {
      await docker(['rm', '--force', id]);
      stopped = true;
    }
  };
  try {
    const port = await docker([
      'inspect',
      '--format',
      '{{(index (index .NetworkSettings.Ports "3000/tcp") 0).HostPort}}',
      id,
    ]);
    const digest = await docker([
      'image',
      'inspect',
      '--format',
      '{{index .RepoDigests 0}}',
      image,
    ]);
    const baseUrl = 'http://127.0.0.1:' + port;
    await waitForApi(baseUrl + '/dev/users');
    return {
      id,
      baseUrl,
      digest,
      stop,
      logs: async () => {
        const logs = await execute('docker', ['logs', id], { maxBuffer: 16 * 1024 * 1024 });
        return logs.stdout + logs.stderr;
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
