import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { generatedEmailValid } from '../../src/generation/email-format.js';
import { schemaValid } from '../../src/generation/schema.js';

test('generated email format matches the pinned jsonschema_rs golden corpus', () => {
  const corpus = JSON.parse(readFileSync('tests/fixtures/generated-email-corpus.json', 'utf8')) as {
    oracle: string;
    cases: { value: string; valid: boolean }[];
  };
  assert.equal(corpus.oracle, 'jsonschema_rs 0.51.0 Draft4Validator(validate_formats=True)');
  assert.ok(corpus.cases.length > 500);
  for (const entry of corpus.cases)
    assert.equal(generatedEmailValid(entry.value), entry.valid, JSON.stringify(entry.value));
});

test('generated response/request email validation is stricter than deterministic FormatChecker', () => {
  for (const email of ['@', 'a@', '@b', 'a@@b', 'a b@c'])
    assert.equal(schemaValid({ type: 'string', format: 'email' }, email), false);
  for (const email of ['user+tag@example.com', 'user%tag@example.com', 'x@y', 'a@localhost'])
    assert.equal(schemaValid({ type: 'string', format: 'email' }, email), true);
});
