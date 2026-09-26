import { spawnSync } from 'node:child_process';
for (const task of [
  'typecheck',
  'lint',
  'format:check',
  'test:unit',
  'test:collect',
  'test:infrastructure',
]) {
  const result = spawnSync('npm', ['run', task], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
let failed = false;
for (const scope of ['dev', 'prod', 'isolation']) {
  const result = spawnSync(
    'npm',
    ['run', 'test:' + scope, '--', '--known-bugs-as-xfail', '--with-generated'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) failed = true;
}
const scrub = spawnSync(
  'npm',
  ['run', 'scrub', '--', 'reports/generated', '--secret-env', 'AUTH_TOKEN'],
  {
    stdio: 'inherit',
    env: { ...process.env, AUTH_TOKEN: process.env.AUTH_TOKEN ?? 'mysecrettoken' },
  },
);
process.exitCode = failed || scrub.status !== 0 ? 1 : 0;
