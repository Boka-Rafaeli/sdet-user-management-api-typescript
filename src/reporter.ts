import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
  TestError,
} from '@playwright/test/reporter';
import { redactText } from './redaction.js';
export interface ResultRow {
  id: string;
  status: 'PASS' | 'FAIL' | 'XFAIL';
  durationMs: number;
  reason: string;
}
export const escapeMarkup = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export class EvidenceReporter implements Reporter {
  private rows: ResultRow[] = [];
  private expected: string[] = [];
  private errors: string[] = [];
  private readonly secrets = [process.env.AUTH_TOKEN ?? 'mysecrettoken'];
  private readonly directory = process.env.REPORT_DIR ?? 'reports/generated/api';
  private safe(text: string): string {
    return redactText(text, this.secrets);
  }
  onBegin(_config: FullConfig, suite: Suite): void {
    this.expected = suite.allTests().map((t) => t.title);
    if (this.expected.length === 0) this.errors.push('No tests collected');
    if (new Set(this.expected).size !== this.expected.length)
      this.errors.push('Duplicate test IDs');
    if (process.env.SCOPE && existsSync('tests/api/manifest.json')) {
      const manifest = JSON.parse(readFileSync('tests/api/manifest.json', 'utf8')) as {
        api: string[];
        isolation: string[];
      };
      const required = process.env.SCOPE === 'isolation' ? manifest.isolation : manifest.api;
      if (JSON.stringify([...required].sort()) !== JSON.stringify([...this.expected].sort()))
        this.errors.push('Collected tests differ from expected scope manifest');
    }
  }
  onStdOut(chunk: string | Buffer): void {
    process.stdout.write(this.safe(chunk.toString()));
  }
  onStdErr(chunk: string | Buffer): void {
    process.stderr.write(this.safe(chunk.toString()));
  }
  onError(error: TestError): void {
    this.errors.push(this.safe(error.message ?? 'Runner error'));
  }
  onTestEnd(test: TestCase, result: TestResult): void {
    const known = test.annotations.find((a) => a.type === 'known-defect');
    const status = result.status === 'passed' ? (known ? 'XFAIL' : 'PASS') : 'FAIL';
    if (result.retry > 0) this.errors.push('Retries are forbidden for deterministic parity');
    this.rows.push({
      id: test.title,
      status,
      durationMs: result.duration,
      reason: this.safe(
        result.errors.map((e) => e.message ?? 'Error').join('\n') || known?.description || '',
      ),
    });
    console.log(`${status} ${test.title}`);
  }
  async onEnd(result: FullResult): Promise<{ status: FullResult['status'] }> {
    const executed = this.rows.map((r) => r.id);
    if (JSON.stringify([...executed].sort()) !== JSON.stringify([...this.expected].sort()))
      this.errors.push('Execution incomplete or repeated');
    const failed =
      result.status !== 'passed' ||
      this.errors.length > 0 ||
      this.rows.some((r) => r.status === 'FAIL');
    mkdirSync(this.directory, { recursive: true });
    const summary = {
      schemaVersion: 1,
      scope: process.env.SCOPE ?? 'controlled',
      environment: process.env.TEST_ENV ?? 'dev',
      imageDigest: process.env.IMAGE_DIGEST ?? null,
      status: failed ? 'failed' : 'passed',
      counts: {
        total: this.rows.length,
        pass: this.rows.filter((r) => r.status === 'PASS').length,
        xfail: this.rows.filter((r) => r.status === 'XFAIL').length,
        fail: this.rows.filter((r) => r.status === 'FAIL').length,
      },
      errors: this.errors,
      results: this.rows,
    };
    writeFileSync(join(this.directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    const escape = (text: string) => escapeMarkup(this.safe(text));
    const cases = this.rows
      .map(
        (row) =>
          `<testcase name="${escape(row.id)}" time="${row.durationMs / 1000}">${row.status === 'FAIL' ? `<failure message="${escape(row.reason)}"/>` : row.status === 'XFAIL' ? `<skipped type="xfail" message="${escape(row.reason)}"/>` : ''}</testcase>`,
      )
      .join('');
    const infrastructure = this.errors
      .map(
        (message) =>
          `<testcase name="execution-integrity"><error message="${escape(message)}"/></testcase>`,
      )
      .join('');
    writeFileSync(
      join(this.directory, 'junit.xml'),
      `<?xml version="1.0" encoding="UTF-8"?><testsuites><testsuite name="${escape(summary.scope)}" tests="${this.rows.length + this.errors.length}" failures="${summary.counts.fail}" errors="${this.errors.length}" skipped="${summary.counts.xfail}">${cases}${infrastructure}</testsuite></testsuites>\n`,
    );
    writeFileSync(
      join(this.directory, 'report.html'),
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>API quality — ${escape(summary.scope)}</title><style>body{font:16px system-ui;margin:40px auto;padding:0 24px;max-width:1100px;color:#172b45;background:#f5f7fa}h1{font-size:28px}table{width:100%;border-collapse:collapse;background:white}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}.PASS{color:#166534}.FAIL{color:#b91c1c}.XFAIL{color:#92400e}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{overflow-wrap:anywhere}</style><h1>User Management API · ${escape(summary.scope)}</h1><p>${summary.counts.pass} PASS · ${summary.counts.xfail} XFAIL · ${summary.counts.fail} FAIL</p><p>XFAIL means an exact reviewed defect was reproduced. It does not mean API conformance.</p><small>Image: ${escape(summary.imageDigest ?? 'controlled test')}</small>${this.errors.map((e) => `<p class="FAIL">${escape(e)}</p>`).join('')}<table><thead><tr><th>Scenario</th><th>Result</th><th>Duration</th></tr></thead><tbody>${this.rows.map((row) => `<tr><td>${escape(row.id)}${row.reason ? `<details><summary>Evidence</summary><pre>${escape(row.reason)}</pre></details>` : ''}</td><td class="${row.status}">${row.status}</td><td>${row.durationMs} ms</td></tr>`).join('')}</tbody></table></html>`,
    );
    console.log(
      `Results: ${summary.counts.pass} PASS / ${summary.counts.xfail} XFAIL / ${summary.counts.fail} FAIL`,
    );
    return { status: failed ? 'failed' : 'passed' };
  }
}
export default EvidenceReporter;
