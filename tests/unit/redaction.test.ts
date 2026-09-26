import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REDACTED,
  redact,
  redactText,
  secretVariants,
  verifyRedacted,
} from '../../src/redaction.js';

test('recursively redacts normalized sensitive keys without mutating source', () => {
  const original = {
    headers: { Authentication: ['first', 'second'], 'X-A.P.I_Key': 'credential' },
    entries: [{ password: { nested: 'secret' }, safe: 'diagnostic' }],
    TOKEN: [1, { nested: 'value' }, ['another']],
  };
  const copy = structuredClone(original);
  assert.deepEqual(redact(original), {
    headers: { Authentication: [REDACTED, REDACTED], 'X-A.P.I_Key': REDACTED },
    entries: [{ password: REDACTED, safe: 'diagnostic' }],
    TOKEN: [REDACTED, REDACTED, [REDACTED]],
  });
  assert.deepEqual(original, copy);
});

test('raw, percent-encoded and plus-encoded secrets disappear from keys and values', () => {
  const secret = "secret value/+!'()*";
  const encoded = 'secret%20value%2F%2B%21%27%28%29%2A';
  const plus = 'secret+value%2F%2B%21%27%28%29%2A';
  assert.deepEqual(new Set(secretVariants([secret])), new Set([secret, encoded, plus]));
  const result = redact({ [`prefix-${secret}`]: [secret, encoded, plus] }, [secret]);
  assert.deepEqual(result, { [`prefix-${REDACTED}`]: [REDACTED, REDACTED, REDACTED] });
  assert.equal(verifyRedacted(result, [secret]), true);
});

test('text redaction covers URLs and diagnostic error strings', () => {
  const token = 'my/private credential';
  const output = redactText(`https://api.test/${encodeURIComponent(token)} error=${token}`, [
    token,
  ]);
  assert.equal(output, `https://api.test/${REDACTED} error=${REDACTED}`);
});

test('overlapping secrets are replaced longest first and empty secrets are ignored', () => {
  assert.equal(
    redactText('prefix-credential-long credential', ['', 'credential', 'credential-long']),
    `prefix-${REDACTED} ${REDACTED}`,
  );
  assert.equal(redactText('normal text', []), 'normal text');
});

test('JSON primitives, shared values and prototype-named keys remain safe', () => {
  const value = JSON.parse('{"__proto__":{"password":"private"},"safe":42}') as unknown;
  const result = redact(value);
  assert.equal(Object.prototype.hasOwnProperty.call(result, '__proto__'), true);
  assert.deepEqual(result, JSON.parse('{"__proto__":{"password":"<redacted>"},"safe":42}'));
  assert.equal(redact(null), null);
  assert.equal(redact(42), 42);
  assert.equal(redact(false), false);
  const shared = { message: 'safe' };
  assert.deepEqual(redact([shared, shared]), [{ message: 'safe' }, { message: 'safe' }]);
});

test('diagnostic cycles do not cause infinite recursion', () => {
  const value: { safe: string; cycle?: unknown } = { safe: 'okay' };
  value.cycle = value;
  assert.deepEqual(redact(value), { safe: 'okay', cycle: '[Circular]' });
  const sensitiveCycle: unknown[] = [];
  sensitiveCycle.push(sensitiveCycle);
  assert.deepEqual(redact({ token: sensitiveCycle }), { token: [REDACTED] });
});

test('independent verifier rejects both surviving values and sensitive structures', () => {
  assert.equal(verifyRedacted({ error: 'contains retained-secret' }, ['retained-secret']), false);
  assert.equal(verifyRedacted({ 'retained-secret': 'safe' }, ['retained-secret']), false);
  assert.equal(verifyRedacted({ Authentication: ['unfiltered'] }, []), false);
  assert.equal(verifyRedacted({ authentication: [[REDACTED]], safe: true }), true);
});

test('raw redaction remains available for malformed Unicode diagnostic input', () => {
  assert.equal(redactText('prefix-\ud800-private', ['\ud800-private']), `prefix-${REDACTED}`);
});
