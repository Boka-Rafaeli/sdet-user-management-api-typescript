/** Output-boundary sanitization for diagnostics and retained evidence. */
export const REDACTED = '<redacted>';

const sensitiveKeys = new Set(
  [
    'access_token',
    'api_key',
    'authentication',
    'authorization',
    'client_secret',
    'cookie',
    'credential',
    'credentials',
    'password',
    'private_key',
    'proxy_authorization',
    'refresh_token',
    'secret',
    'session_token',
    'set_cookie',
    'token',
    'x_api_key',
    'x_auth_token',
  ].map(normalizeKey),
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  return sensitiveKeys.has(normalizeKey(key));
}

/** Match Python quote(..., safe='') as well as form-style quote_plus. */
export function secretVariants(secrets: readonly string[] = []): readonly string[] {
  const variants = new Set<string>();
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    variants.add(secret);
    // Environment strings may contain lone surrogates in unit/in-process callers.
    // Retain raw redaction even when URI encoding cannot represent that string.
    try {
      const encoded = encodeURIComponent(secret).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      variants.add(encoded);
      variants.add(encoded.replace(/%20/g, '+'));
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
    }
  }
  return [...variants].sort((left, right) => right.length - left.length);
}

function replaceSecrets(text: string, variants: readonly string[]): string {
  let result = text;
  for (const secret of variants) result = result.split(secret).join(REDACTED);
  return result;
}

export function redactText(value: string, secrets: readonly string[] = []): string {
  return replaceSecrets(value, secretVariants(secrets));
}

export const safeText = redactText;

function redactSensitiveStructure(value: unknown, active = new WeakSet<object>()): unknown {
  if (!Array.isArray(value) || active.has(value)) return REDACTED;
  active.add(value);
  try {
    return value.map((item) => redactSensitiveStructure(item, active));
  } finally {
    active.delete(value);
  }
}

/** Does not mutate the input. Object keys are sanitized as well as values. */
export function redact(value: unknown, secrets: readonly string[] = []): unknown {
  const variants = secretVariants(secrets);
  const active = new WeakSet<object>();
  function visit(item: unknown): unknown {
    if (typeof item === 'string') return replaceSecrets(item, variants);
    if (item === null || typeof item !== 'object') return item;
    // JSON evidence cannot contain cycles, but diagnostic objects sometimes do.
    if (active.has(item)) return '[Circular]';
    active.add(item);
    try {
      if (Array.isArray(item)) return item.map(visit);
      return Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [
          replaceSecrets(key, variants),
          isSensitiveKey(key) ? redactSensitiveStructure(entry) : visit(entry),
        ]),
      );
    } finally {
      active.delete(item);
    }
  }
  return visit(value);
}

/** Independently verify a sanitized JSON value before publishing it. */
export function verifyRedacted(value: unknown, secrets: readonly string[] = []): boolean {
  const variants = secretVariants(secrets);
  function fullyRedacted(item: unknown): boolean {
    if (Array.isArray(item)) return item.every(fullyRedacted);
    if (item !== null && typeof item === 'object') {
      return Object.values(item).every(fullyRedacted);
    }
    return item === REDACTED;
  }
  function verify(item: unknown): boolean {
    if (typeof item === 'string') return !variants.some((secret) => item.includes(secret));
    if (Array.isArray(item)) return item.every(verify);
    if (item !== null && typeof item === 'object') {
      return Object.entries(item).every(
        ([key, entry]) =>
          !variants.some((secret) => key.includes(secret)) &&
          (isSensitiveKey(key) ? fullyRedacted(entry) : verify(entry)),
      );
    }
    return true;
  }
  return verify(value);
}
