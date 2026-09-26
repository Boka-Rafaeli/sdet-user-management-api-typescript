import type { ApiResponse } from '../client.js';

export type Schema = Record<string, unknown>;
export type Phase = 'examples' | 'coverage' | 'fuzzing';
export interface Parameter {
  name: string;
  in: 'path' | 'header';
  required: boolean;
  schema: Schema;
}
export interface Operation {
  id: string;
  path: string;
  method: string;
  parameters: Parameter[];
  body?: Schema;
  bodyRequired: boolean;
  responses: Record<string, { schema?: Schema; mediaType?: string }>;
  declaredMethods: string[];
}
export interface GeneratedCase {
  operationId: string;
  method: string;
  path: string;
  pathParameters: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
  mode: 'positive' | 'negative';
  positivePath: boolean;
  phase: Phase;
  category: string;
  unsupportedMethod?: boolean;
  missingHeader?: string;
}
export const CHECK_NAMES = [
  'not_a_server_error',
  'status_code_conformance',
  'content_type_conformance',
  'response_headers_conformance',
  'response_schema_conformance',
  'negative_data_rejection',
  'positive_data_acceptance',
  'missing_required_header',
  'unsupported_method',
  'allow_header_conformance',
  'use_after_free',
  'ensure_resource_availability',
  'ignored_auth',
] as const;
export type CheckName = (typeof CHECK_NAMES)[number];
export interface CheckResult {
  name: CheckName;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
}
export interface CaseResult {
  testCase: GeneratedCase;
  response: ApiResponse;
  checks: CheckResult[];
}
