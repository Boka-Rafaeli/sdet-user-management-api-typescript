import type { ApiResponse } from '../client.js';
import { schemaValid } from './schema.js';
import {
  CHECK_NAMES,
  type CheckName,
  type CheckResult,
  type GeneratedCase,
  type Operation,
} from './types.js';

const negativeAccepted = new Set([400, 401, 403, 404, 405, 406, 409, 422, 428]);
const positiveAccepted = new Set([401, 403, 404, 409]);
export const CHECK_CATALOG: Readonly<Record<CheckName, string>> = {
  not_a_server_error: 'Active: only 2xx/3xx/4xx satisfy this check',
  status_code_conformance: 'Active: status must be declared; unspecified-method cases skipped',
  content_type_conformance: 'Active: declared JSON media type; unspecified-method cases skipped',
  response_headers_conformance:
    'N/A: no response headers declared; new declarations fail schema loading',
  response_schema_conformance:
    'Active: declared JSON response schema; unspecified-method cases skipped',
  negative_data_rejection:
    'Active: proven invalid requests must receive configured 4xx/5xx statuses',
  positive_data_acceptance:
    'Active: valid requests accept 2xx/401/403/404/409/5xx, with server check separate',
  missing_required_header: 'Active: missing Authentication expects 400/401/403/406/422',
  unsupported_method: 'Active: 405 and Allow required except OPTIONS or 404 on parameterized paths',
  allow_header_conformance:
    'Active: OPTIONS Allow, when present, matches documented methods allowing HEAD/OPTIONS',
  use_after_free: 'N/A: original runner disables stateful phase',
  ensure_resource_availability: 'N/A: original runner disables stateful phase',
  ignored_auth:
    'N/A: no OpenAPI security definitions; Authentication is a required header parameter',
};

export function runChecks(
  operation: Operation,
  testCase: GeneratedCase,
  response: ApiResponse,
): CheckResult[] {
  const output = new Map<CheckName, CheckResult>();
  const set = (name: CheckName, valid: boolean, message: string) =>
    output.set(name, { name, status: valid ? 'PASS' : 'FAIL', message });
  const skip = (name: CheckName, reason: string) =>
    output.set(name, { name, status: 'SKIP', message: reason });
  set(
    'not_a_server_error',
    response.status >= 200 && response.status < 500,
    `HTTP ${response.status}`,
  );
  const declaration = operation.responses[String(response.status)];
  for (const name of [
    'response_headers_conformance',
    'use_after_free',
    'ensure_resource_availability',
    'ignored_auth',
  ] as const)
    skip(name, CHECK_CATALOG[name]);
  if (testCase.unsupportedMethod) {
    for (const name of [
      'status_code_conformance',
      'content_type_conformance',
      'response_schema_conformance',
    ] as const)
      skip(name, 'Unspecified-method coverage has its own oracle');
  } else {
    set(
      'status_code_conformance',
      declaration !== undefined,
      `HTTP ${response.status} must be declared`,
    );
    if (declaration?.mediaType) {
      const mediaType = (response.headers['content-type'] ?? '')
        .split(';')[0]!
        .trim()
        .toLowerCase();
      set(
        'content_type_conformance',
        mediaType === declaration.mediaType,
        'Response media type must match OpenAPI',
      );
    } else skip('content_type_conformance', 'No media type declared for this status');
    if (declaration?.schema) {
      let valid = false;
      try {
        valid = schemaValid(declaration.schema, response.json());
      } catch {
        valid = false;
      }
      set(
        'response_schema_conformance',
        valid,
        'Response JSON must match declared schema and formats',
      );
    } else skip('response_schema_conformance', 'No response schema declared for this status');
  }
  if (testCase.mode === 'negative' && !testCase.unsupportedMethod)
    set(
      'negative_data_rejection',
      negativeAccepted.has(response.status) || (response.status >= 500 && response.status < 600),
      `Negative data returned HTTP ${response.status}`,
    );
  else skip('negative_data_rejection', 'Positive case or unspecified-method coverage');
  if (testCase.mode === 'positive' && !testCase.unsupportedMethod)
    set(
      'positive_data_acceptance',
      (response.status >= 200 && response.status < 300) ||
        positiveAccepted.has(response.status) ||
        (response.status >= 500 && response.status < 600),
      `Positive data returned HTTP ${response.status}`,
    );
  else skip('positive_data_acceptance', 'Negative case or unspecified-method coverage');
  if (testCase.phase === 'coverage' && testCase.missingHeader && !testCase.unsupportedMethod) {
    const statuses =
      testCase.missingHeader.toLowerCase() === 'authorization' ? [401] : [400, 401, 403, 406, 422];
    set(
      'missing_required_header',
      statuses.includes(response.status),
      'Missing required header must be rejected',
    );
  } else skip('missing_required_header', 'Not a required-header omission case');
  if (testCase.unsupportedMethod && testCase.method !== 'OPTIONS') {
    const accepted404 = response.status === 404 && operation.path.includes('{');
    set(
      'unsupported_method',
      accepted404 || (response.status === 405 && Boolean(response.headers.allow)),
      'Unsupported method requires 405 + Allow (parameterized unknown resource may return 404)',
    );
  } else skip('unsupported_method', 'Not an unspecified verb or request is OPTIONS');
  if (testCase.method === 'OPTIONS' && response.headers.allow?.trim()) {
    const advertised = new Set(
      response.headers.allow
        .split(',')
        .map((method) => method.trim().toUpperCase())
        .filter(Boolean),
    );
    const implicit = new Set(['HEAD', 'OPTIONS']);
    const missing = operation.declaredMethods.filter(
      (method) => !advertised.has(method) && !implicit.has(method),
    );
    const extra = [...advertised].filter(
      (method) => !operation.declaredMethods.includes(method) && !implicit.has(method),
    );
    set(
      'allow_header_conformance',
      missing.length === 0 && extra.length === 0,
      'OPTIONS Allow must match documented methods',
    );
  } else
    skip('allow_header_conformance', 'OPTIONS Allow header is absent or method is not OPTIONS');
  return CHECK_NAMES.map((name) => output.get(name)!);
}
