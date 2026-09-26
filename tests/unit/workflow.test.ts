import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
const workflow = parse(readFileSync('.github/workflows/api-tests.yml', 'utf8'));
const jobs = workflow.jobs;
const steps = Object.values(jobs).flatMap((job: any) => job.steps);
test('external actions are immutable and checkout does not retain credentials', () => {
  const actions = steps.filter((step: any) => step.uses) as any[];
  assert.ok(actions.length > 0);
  for (const step of actions) {
    assert.match(step.uses, /@[a-f0-9]{40}$/);
    if (step.uses.startsWith('actions/checkout@'))
      assert.equal(step.with['persist-credentials'], false);
  }
});
test('repository permissions and application credential are narrowly scoped', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.env.AUTH_TOKEN, undefined);
  assert.equal(jobs.quality.env?.AUTH_TOKEN, undefined);
  assert.equal(jobs['api-tests'].env.AUTH_TOKEN, 'mysecrettoken');
});
test('generated operational failures block but still run after deterministic failure', () => {
  const generated = jobs['api-tests'].steps.find(
    (s: any) => s.name === 'Run generated exploration',
  );
  assert.equal(generated['continue-on-error'], undefined);
  assert.ok(generated.if.includes('always()'));
  assert.ok(generated.if.includes("steps.start.outcome == 'success'"));
  assert.equal(jobs['api-tests'].strategy['fail-fast'], false);
});
test('evidence upload follows a successful scrub and retention is bounded', () => {
  const apiSteps = jobs['api-tests'].steps;
  const scrub = apiSteps.findIndex((s: any) => s.id === 'scrub');
  const upload = apiSteps.findIndex((s: any) => s.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(scrub >= 0 && upload > scrub);
  assert.ok(apiSteps[upload].if.includes("steps.scrub.outcome == 'success'"));
  assert.equal(apiSteps[upload].with['retention-days'], 14);
  assert.ok(apiSteps[scrub].run.includes('--secret-env AUTH_TOKEN'));
});
test('container cleanup executes even after failures', () => {
  const cleanup = jobs['api-tests'].steps.at(-1);
  assert.ok(cleanup.if.includes('always()'));
  assert.ok(cleanup.run.includes('stop'));
});

test('every workflow keeps external actions immutable', () => {
  let total = 0;
  for (const filename of readdirSync('.github/workflows').filter((name) => /\.ya?ml$/.test(name))) {
    const document = parse(readFileSync('.github/workflows/' + filename, 'utf8'));
    for (const job of Object.values(document.jobs) as any[]) {
      const uses = [job.uses, ...(job.steps ?? []).map((step: any) => step.uses)].filter(
        Boolean,
      ) as string[];
      for (const reference of uses) {
        if (reference.startsWith('./')) continue;
        total++;
        assert.match(reference, /@[a-f0-9]{40}$/);
      }
    }
  }
  assert.ok(total > 0);
});
