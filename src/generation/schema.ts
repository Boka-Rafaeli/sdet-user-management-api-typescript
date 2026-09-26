import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { parse } from 'yaml';
import type { GeneratedCase, Operation, Parameter, Schema } from './types.js';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE'];
// Schemathesis 4.25.2 DEFAULT_UNEXPECTED_METHODS; QUERY is intentional, HEAD is implicit.
const UNEXPECTED_METHODS = ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH', 'TRACE', 'QUERY'];
const validator = new Ajv({
  strict: false,
  allErrors: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
validator.addFormat('email', { type: 'string', validate: (value: string) => value.includes('@') });
export const schemaValid = (schema: Schema, value: unknown): boolean =>
  Boolean(validator.validate(schema, value));

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function allowKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key) && !key.startsWith('x-'))
      throw new Error(`Unsupported ${label} keyword: ${key}`);
  }
}

/** Current OpenAPI subset only. Unsupported constraints fail before any network call. */
function resolveSchema(
  value: unknown,
  document: Record<string, unknown>,
  seen = new Set<string>(),
): Schema {
  const schema = object(value, 'Schema');
  if (schema.$ref !== undefined) {
    if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/'))
      throw new Error('Only local OpenAPI references are supported');
    if (seen.has(schema.$ref)) throw new Error('Recursive OpenAPI references are unsupported');
    allowKeys(schema, ['$ref', 'description'], 'reference');
    let target: unknown = document;
    for (const key of schema.$ref.slice(2).split('/'))
      target = object(target, 'Reference')[key.replace(/~1/g, '/').replace(/~0/g, '~')];
    return resolveSchema(target, document, new Set([...seen, schema.$ref]));
  }
  allowKeys(
    schema,
    [
      'type',
      'properties',
      'required',
      'items',
      'minimum',
      'maximum',
      'format',
      'example',
      'description',
      'title',
      'additionalProperties',
    ],
    'schema',
  );
  if (!['object', 'array', 'string', 'integer', 'number', 'boolean'].includes(String(schema.type)))
    throw new Error('Unsupported or missing schema type');
  if (schema.format !== undefined && (schema.type !== 'string' || schema.format !== 'email'))
    throw new Error('Unsupported schema format');
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean')
    throw new Error('Unsupported additionalProperties schema');
  const resolved = { ...schema };
  if (schema.type === 'object') {
    resolved.properties = Object.fromEntries(
      Object.entries(object(schema.properties ?? {}, 'Properties')).map(([key, child]) => [
        key,
        resolveSchema(child, document, seen),
      ]),
    );
    if (
      schema.required !== undefined &&
      (!Array.isArray(schema.required) ||
        !schema.required.every((entry) => typeof entry === 'string'))
    )
      throw new Error('Invalid required properties');
    for (const name of (schema.required ?? []) as string[])
      if (!(name in (resolved.properties as Schema)))
        throw new Error('Required property has no supported schema');
  } else if (schema.type === 'array') resolved.items = resolveSchema(schema.items, document, seen);
  for (const bound of ['minimum', 'maximum']) {
    if (
      schema[bound] !== undefined &&
      (typeof schema[bound] !== 'number' || !Number.isFinite(schema[bound]))
    )
      throw new Error('Invalid numeric bound');
  }
  if (
    typeof schema.minimum === 'number' &&
    typeof schema.maximum === 'number' &&
    schema.minimum > schema.maximum
  )
    throw new Error('Inverted numeric bounds');
  // Ajv compiles every schema now: invalid schema cannot become an informational API finding.
  validator.compile(resolved);
  return resolved;
}

export function loadOperations(file = 'openapi/sdet_challenge_api.yml'): Operation[] {
  return operationsFromDocument(parse(readFileSync(file, 'utf8')) as unknown);
}

export function operationsFromDocument(input: unknown): Operation[] {
  const document = object(input, 'OpenAPI document');
  if (typeof document.openapi !== 'string' || !/^3\.0\.\d+$/.test(document.openapi))
    throw new Error('Only OpenAPI 3.0 is supported');
  if (document.security !== undefined)
    throw new Error(
      'Security declarations require an ignored_auth implementation before generation',
    );
  const components = object(document.components ?? {}, 'Components');
  if (components.securitySchemes !== undefined)
    throw new Error('Security schemes are outside the supported generator subset');
  const operations: Operation[] = [];
  for (const [path, rawPath] of Object.entries(object(document.paths, 'Paths'))) {
    const pathItem = object(rawPath, 'Path item');
    allowKeys(
      pathItem,
      [...METHODS.map((method) => method.toLowerCase()), 'parameters', 'description', 'summary'],
      'path',
    );
    const declaredMethods = METHODS.filter(
      (method) => pathItem[method.toLowerCase()] !== undefined,
    );
    for (const method of declaredMethods) {
      const entry = object(pathItem[method.toLowerCase()], 'Operation');
      allowKeys(
        entry,
        [
          'operationId',
          'summary',
          'description',
          'tags',
          'parameters',
          'requestBody',
          'responses',
          'deprecated',
        ],
        'operation',
      );
      const rawParameters = [
        ...((pathItem.parameters ?? []) as unknown[]),
        ...((entry.parameters ?? []) as unknown[]),
      ];
      const parameterMap = new Map<string, Parameter>();
      for (const rawParameter of rawParameters) {
        const parameter = object(rawParameter, 'Parameter');
        allowKeys(parameter, ['name', 'in', 'required', 'schema', 'description'], 'parameter');
        if (
          typeof parameter.name !== 'string' ||
          !['path', 'header'].includes(String(parameter.in))
        )
          throw new Error('Only named path/header parameters are supported');
        const schema = resolveSchema(parameter.schema, document);
        if (schema.type !== 'string')
          throw new Error('Only string path/header parameters are supported');
        const parsed: Parameter = {
          name: parameter.name,
          in: parameter.in as 'path' | 'header',
          required: parameter.required === true,
          schema,
        };
        parameterMap.set(`${parsed.in}:${parsed.name}`, parsed);
      }
      const parameters = [...parameterMap.values()];
      for (const match of path.matchAll(/\{([^}]+)\}/g)) {
        if (
          !parameters.some(
            (parameter) =>
              parameter.in === 'path' && parameter.name === match[1] && parameter.required,
          )
        )
          throw new Error('Path placeholder requires a declared required parameter');
      }
      let body: Schema | undefined;
      let bodyRequired = false;
      if (entry.requestBody !== undefined) {
        const request = object(entry.requestBody, 'Request body');
        allowKeys(request, ['required', 'content', 'description'], 'request body');
        const media = object(request.content, 'Request media');
        if (Object.keys(media).length !== 1 || media['application/json'] === undefined)
          throw new Error('Only application/json request bodies are supported');
        const content = object(media['application/json'], 'Request JSON');
        allowKeys(content, ['schema'], 'request media');
        body = resolveSchema(content.schema, document);
        bodyRequired = request.required === true;
      }
      const responses: Operation['responses'] = {};
      for (const [status, rawResponse] of Object.entries(object(entry.responses, 'Responses'))) {
        if (!/^[1-5]\d{2}$/.test(status))
          throw new Error('Only explicit response status codes are supported');
        const response = object(rawResponse, 'Response');
        allowKeys(response, ['description', 'content', 'headers'], 'response');
        if (
          response.headers !== undefined &&
          Object.keys(object(response.headers, 'Response headers')).length > 0
        )
          throw new Error('Declared response headers require response_headers_conformance support');
        if (response.content === undefined) responses[status] = {};
        else {
          const media = object(response.content, 'Response media');
          if (Object.keys(media).length !== 1 || media['application/json'] === undefined)
            throw new Error('Only application/json response media is supported');
          const content = object(media['application/json'], 'Response JSON');
          allowKeys(content, ['schema'], 'response media');
          responses[status] = {
            mediaType: 'application/json',
            schema: resolveSchema(content.schema, document),
          };
        }
      }
      if (Object.keys(responses).length === 0) throw new Error('Operation must declare responses');
      const id = typeof entry.operationId === 'string' ? entry.operationId : `${method} ${path}`;
      if (operations.some((operation) => operation.id === id))
        throw new Error('Duplicate operation ID');
      operations.push({
        id,
        path,
        method,
        parameters,
        body,
        bodyRequired,
        responses,
        declaredMethods,
      });
    }
  }
  if (operations.length === 0) throw new Error('No OpenAPI operations discovered');
  return operations;
}

export function exampleValue(schema: Schema): unknown {
  if (schema.example !== undefined) {
    if (!schemaValid(schema, schema.example))
      throw new Error('Documented example violates its schema');
    return structuredClone(schema.example);
  }
  switch (schema.type) {
    case 'object':
      return Object.fromEntries(
        Object.entries((schema.properties ?? {}) as Record<string, Schema>).map(([key, child]) => [
          key,
          exampleValue(child),
        ]),
      );
    case 'array':
      return [];
    case 'integer':
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return true;
    case 'string':
      return schema.format === 'email' ? 'generated@example.com' : 'Generated value';
    default:
      throw new Error('Unsupported schema type');
  }
}

export function exampleCase(operation: Operation, authToken = 'mysecrettoken'): GeneratedCase {
  const testCase: GeneratedCase = {
    operationId: operation.id,
    method: operation.method,
    path: operation.path,
    pathParameters: {},
    headers: {},
    mode: 'positive',
    positivePath: true,
    phase: 'examples',
    category: 'schema-example',
  };
  for (const parameter of operation.parameters) {
    const value =
      parameter.in === 'header' && parameter.name.toLowerCase() === 'authentication'
        ? authToken
        : String(exampleValue(parameter.schema));
    (parameter.in === 'path' ? testCase.pathParameters : testCase.headers)[parameter.name] = value;
  }
  if (operation.body) testCase.body = exampleValue(operation.body);
  return testCase;
}

/** Independent request oracle used to prove that mutations keep their advertised mode. */
export function requestValid(operation: Operation, testCase: GeneratedCase): boolean {
  if (testCase.unsupportedMethod) return false;
  if (
    operation.body &&
    (!Object.hasOwn(testCase, 'body')
      ? operation.bodyRequired
      : !schemaValid(operation.body, testCase.body))
  )
    return false;
  for (const parameter of operation.parameters) {
    const container = parameter.in === 'path' ? testCase.pathParameters : testCase.headers;
    const entry = Object.entries(container).find(([name]) =>
      parameter.in === 'header'
        ? name.toLowerCase() === parameter.name.toLowerCase()
        : name === parameter.name,
    );
    if ((!entry && parameter.required) || (entry && !schemaValid(parameter.schema, entry[1])))
      return false;
  }
  return true;
}

export function coverageCases(operation: Operation, authToken = 'mysecrettoken'): GeneratedCase[] {
  const base = exampleCase(operation, authToken);
  const cases: GeneratedCase[] = [];
  const add = (
    category: string,
    mutate: (testCase: GeneratedCase) => void,
    mode: GeneratedCase['mode'],
  ) => {
    const testCase = structuredClone(base);
    testCase.phase = 'coverage';
    testCase.category = category;
    testCase.mode = mode;
    mutate(testCase);
    if (requestValid(operation, testCase) !== (mode === 'positive'))
      throw new Error(`Generated ${category} has incorrect validity`);
    cases.push(testCase);
  };
  if (operation.body) {
    const schema = operation.body;
    for (const value of [null, [], '', 42, true]) {
      if (!schemaValid(schema, value))
        add(
          `body-type-${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`,
          (item) => {
            item.body = value;
          },
          'negative',
        );
    }
    if (operation.bodyRequired)
      add(
        'missing-body',
        (item) => {
          delete item.body;
        },
        'negative',
      );
    if (schema.type === 'object') {
      for (const name of (schema.required ?? []) as string[])
        add(
          `missing-${name}`,
          (item) => {
            delete (item.body as Record<string, unknown>)[name];
          },
          'negative',
        );
      for (const [name, child] of Object.entries(
        (schema.properties ?? {}) as Record<string, Schema>,
      )) {
        const candidates: unknown[] = [null, true, false, 0, 1.5, '', [], {}];
        if (child.type === 'integer' || child.type === 'number') {
          for (const boundary of [child.minimum, child.maximum])
            if (typeof boundary === 'number') candidates.push(boundary - 1, boundary, boundary + 1);
        }
        if (child.type === 'string')
          candidates.push('Å user', 'not-an-email', 'user+tag@example.com', 'user%tag@example.com');
        for (const [index, value] of candidates.entries()) {
          const mode = schemaValid(child, value) ? 'positive' : 'negative';
          add(
            `${name}-${mode}-${index}`,
            (item) => {
              (item.body as Record<string, unknown>)[name] = value;
            },
            mode,
          );
        }
      }
      if (schema.additionalProperties !== false)
        add(
          'additional-property',
          (item) => {
            (item.body as Record<string, unknown>).extra = 'allowed';
          },
          'positive',
        );
    }
  }
  for (const parameter of operation.parameters) {
    if (parameter.in === 'header' && parameter.required)
      add(
        `missing-header-${parameter.name}`,
        (item) => {
          delete item.headers[parameter.name];
          item.missingHeader = parameter.name;
        },
        'negative',
      );
    if (parameter.in === 'path' && parameter.schema.format === 'email')
      add(
        `invalid-path-${parameter.name}`,
        (item) => {
          item.pathParameters[parameter.name] = 'invalid-email';
          item.positivePath = false;
        },
        'negative',
      );
  }
  // Explore unsupported verbs once per path, attached to its first declared operation.
  if (operation.method === operation.declaredMethods[0]) {
    for (const method of UNEXPECTED_METHODS.filter(
      (method) => !operation.declaredMethods.includes(method),
    )) {
      const item = structuredClone(base);
      item.method = method;
      item.phase = 'coverage';
      item.mode = 'negative';
      item.category = `unsupported-${method}`;
      item.unsupportedMethod = true;
      delete item.body;
      cases.push(item);
    }
  }
  return cases;
}
