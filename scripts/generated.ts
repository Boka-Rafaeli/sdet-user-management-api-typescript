import { ApiClient } from '../src/client.js';
import { loadSettings, type Environment } from '../src/config.js';
import { redactText } from '../src/redaction.js';
import { loadOperations } from '../src/generation/schema.js';
import { runGenerated, type RunOptions } from '../src/generation/runner.js';

const settings = loadSettings();
const options: RunOptions = {};
let environment: Environment = settings.environment;
let schemaPath = 'openapi/sdet_challenge_api.yml';
let client: ApiClient | undefined;
const controller = new AbortController();
const abort = () => controller.abort();
process.on('SIGINT', abort);
process.on('SIGTERM', abort);
try {
  const args = process.argv.slice(2);
  if (args[0] === 'dev' || args[0] === 'prod') environment = args.shift() as Environment;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new Error('Every generated CLI option requires a value');
    switch (flag) {
      case '--environment':
        environment = value as Environment;
        break;
      case '--seed':
        options.seed = Number(value);
        break;
      case '--max-examples':
        options.maxExamples = Number(value);
        break;
      case '--max-failures':
        options.maxFailures = Number(value);
        break;
      case '--max-shrinks':
        options.maxShrinks = Number(value);
        break;
      case '--run-id':
        options.runId = value;
        break;
      case '--operation':
        options.operationId = value;
        break;
      case '--replay-path':
        options.replayPath = value;
        break;
      case '--report-dir':
        options.reportDir = value;
        break;
      case '--schema':
        schemaPath = value;
        break;
      default:
        throw new Error('Unknown generated CLI option');
    }
  }
  const configured = loadSettings({ environment });
  client = new ApiClient(configured);
  options.reportDir ??= process.env.REPORT_DIR ?? `reports/generated/${environment}/generated`;
  options.signal = controller.signal;
  const summary = await runGenerated(client, loadOperations(schemaPath), options);
  process.stdout.write(
    redactText(
      `Generated: requests=${summary.requests} findings=${summary.findings.length} seed=${summary.seed} runId=${summary.runId}\n`,
      [configured.authToken],
    ),
  );
  process.exitCode = 0; // Findings are represented in evidence; operational failures exit 2.
} catch (error) {
  process.stderr.write(
    `Generated engine failed: ${redactText(error instanceof Error ? error.message : 'Unknown failure', [settings.authToken])}\n`,
  );
  process.exitCode = 2;
} finally {
  client?.close();
  process.off('SIGINT', abort);
  process.off('SIGTERM', abort);
}
