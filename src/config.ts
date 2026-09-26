export type Environment = 'dev' | 'prod';
export interface Settings {
  baseUrl: string;
  environment: Environment;
  authToken: string;
  timeoutMs: number;
  httpTrace: boolean;
  contractTrace: boolean;
  baseline: boolean;
}
export function loadSettings(
  overrides: Partial<Settings> = {},
  env: NodeJS.ProcessEnv = process.env,
): Settings {
  const settings: Settings = {
    baseUrl: (env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    environment: (env.TEST_ENV ?? 'dev') as Environment,
    authToken: env.AUTH_TOKEN ?? 'mysecrettoken',
    timeoutMs: Number(env.HTTP_TIMEOUT_SECONDS ?? 5) * 1000,
    httpTrace: env.HTTP_TRACE === '1',
    contractTrace: env.CONTRACT_TRACE === '1',
    baseline: env.KNOWN_BUGS_AS_XFAIL === '1',
    ...overrides,
  };
  settings.baseUrl = settings.baseUrl.replace(/\/+$/, '');
  if (!['dev', 'prod'].includes(settings.environment))
    throw new Error('Unsupported environment; expected dev or prod');
  let url: URL;
  try {
    url = new URL(settings.baseUrl);
  } catch {
    throw new Error('BASE_URL must be a valid HTTP(S) URL');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('BASE_URL must use HTTP(S) without credentials, query or fragment');
  if (!Number.isFinite(settings.timeoutMs) || settings.timeoutMs <= 0)
    throw new Error('HTTP timeout must be finite and positive');
  return Object.freeze(settings);
}
export function cliSettings(args: readonly string[]): Settings {
  const overrides: Partial<Settings> = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--environment':
        overrides.environment = args[++i] as Environment;
        if (!overrides.environment) throw new Error('Missing environment');
        break;
      case '--http-trace':
        overrides.httpTrace = true;
        break;
      case '--contract-trace':
        overrides.contractTrace = true;
        break;
      case '--known-bugs-as-xfail':
        overrides.baseline = true;
        break;
      default:
        throw new Error('Unknown test option');
    }
  }
  return loadSettings(overrides);
}
