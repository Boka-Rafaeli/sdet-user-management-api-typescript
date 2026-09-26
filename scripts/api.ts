import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { startApi, waitForApi } from '../src/runtime.js';
const command = process.argv[2];
const state = '.runtime/api.json';
if (command === 'start') {
  try {
    await readFile(state);
    throw new Error('Managed API state already exists; stop it first');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const api = await startApi();
  try {
    await mkdir('.runtime', { recursive: true });
    await writeFile(
      state,
      JSON.stringify({ id: api.id, baseUrl: api.baseUrl, digest: api.digest }),
    );
  } catch (error) {
    await api.stop();
    throw error;
  }
  console.log(`API ready: BASE_URL=${api.baseUrl}`);
} else if (command === 'stop') {
  const data = JSON.parse(await readFile(state, 'utf8'));
  const label = execFileSync(
    'docker',
    ['inspect', '--format', '{{index .Config.Labels "sdet-ts-owned"}}', data.id],
    { encoding: 'utf8' },
  ).trim();
  if (label !== 'true') throw new Error('Container is not owned by this project');
  execFileSync('docker', ['rm', '--force', data.id]);
  await unlink(state);
} else if (command === 'wait') {
  await waitForApi(process.argv[3] ?? 'http://127.0.0.1:3000/dev/users');
} else {
  throw new Error('Usage: api.ts start|stop|wait [URL]');
}
