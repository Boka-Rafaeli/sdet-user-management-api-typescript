import { spawnSync } from 'node:child_process';
for (const task of ['typecheck', 'lint', 'format:check', 'test:unit', 'test:infrastructure']) {
  const result = spawnSync('npm', ['run', task], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
