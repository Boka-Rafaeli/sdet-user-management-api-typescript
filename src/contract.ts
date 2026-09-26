import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import { parse } from 'yaml';
import type { ApiResponse } from './client.js';
export class Contract {
  readonly document: any;
  private readonly validator = new Ajv({
    allErrors: true,
    strict: false,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });
  constructor(
    path = 'openapi/sdet_challenge_api.yml',
    private readonly trace = false,
  ) {
    this.document = parse(readFileSync(path, 'utf8'));
    // Compatibility with jsonschema 4.26 FormatChecker email; API constraints remain in YAML.
    this.validator.addFormat('email', {
      type: 'string',
      validate: (value: string) => value.includes('@'),
    });
  }
  assertResponse(response: ApiResponse, path: string, method: string, status: number): any {
    const operation = method.toUpperCase() + ' ' + path;
    this.check(
      operation,
      'status',
      response.status === status,
      `Expected HTTP ${status}, got ${response.status}`,
    );
    const spec = this.document.paths[path]?.[method.toLowerCase()];
    this.check(
      operation,
      'operation-declared',
      !!spec,
      `Operation ${operation} is absent from OpenAPI`,
    );
    const entry = spec.responses[String(status)];
    this.check(
      operation,
      'response-declared',
      !!entry,
      `Status ${status} is not declared for ${operation}`,
    );
    if (!entry.content) {
      this.check(
        operation,
        'empty-body',
        response.body.length === 0,
        `Expected an empty response body for ${status}`,
      );
      return undefined;
    }
    this.check(
      operation,
      'content-type',
      (response.headers['content-type'] ?? '').split(';')[0] === 'application/json',
      'Expected Content-Type application/json',
    );
    let body: any;
    try {
      body = response.json();
    } catch {
      this.check(operation, 'json-body', false, 'Expected a JSON response body');
    }
    const schema = this.resolve(entry.content['application/json'].schema);
    const valid = this.validator.validate(schema, body);
    this.check(
      operation,
      'response-schema',
      valid,
      `OpenAPI response schema violations: ${this.validator.errors?.map((e) => e.instancePath + ' ' + e.message).join('; ')}`,
    );
    return body;
  }
  resolve(value: any): any {
    if (Array.isArray(value)) return value.map((v) => this.resolve(v));
    if (!value || typeof value !== 'object') return value;
    if (value.$ref) {
      assert.ok(
        typeof value.$ref === 'string' && value.$ref.startsWith('#/'),
        'Only local OpenAPI references are supported',
      );
      let item = this.document;
      for (const part of value.$ref.slice(2).split('/'))
        item = item[part.replace(/~1/g, '/').replace(/~0/g, '~')];
      assert.ok(item, 'Unresolved OpenAPI reference');
      return this.resolve(item);
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, this.resolve(item)]),
    );
  }
  private check(
    operation: string,
    check: string,
    passed: boolean | undefined,
    message: string,
  ): void {
    if (this.trace)
      console.log(`CONTRACT ${passed ? 'PASS' : 'FAIL'} operation=${operation} check=${check}`);
    assert.ok(passed, message);
  }
}
