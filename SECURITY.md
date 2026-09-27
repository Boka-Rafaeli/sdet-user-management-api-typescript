# Security controls

## SEC-001: Credentials in retained diagnostic evidence

The source's Schemathesis report could retain an authentication value in a serialized case even
when another representation was sanitized. This migration uses producer-side recursive redaction
and a separate fail-closed publication gate.

The NDJSON scrubber parses every record, removes sensitive fields and configured secret variants,
verifies the structure and atomically replaces each file. It rejects malformed JSON/UTF-8, blank
records, links and read/write/rename failures. The final evidence scan covers HTML, XML, JSON,
NDJSON, logs and text; it rejects configured secret variants, unexpected formats and links.
JSON summaries additionally receive structural sensitive-field verification. Unsupported raw
formats such as HAR require a dedicated sanitizer before they may be retained.

Secrets are supplied by environment-variable name, not as CLI values. The challenge token has
only local disposable-container privileges. CI scopes it to API jobs, uses read-only repository
permissions and does not persist checkout credentials. Artifacts are uploaded only after the gate
succeeds, including for isolation; retention is 14 days. Generated errors and application log text
pass through redaction before output. No real service credentials belong in this repository.

Tests exercise nested/case-varied sensitive fields, configured URL-encoded variants, malformed
records, filesystem failures, links and retained non-NDJSON leaks. Real controlled CI failures
verify the upload guard. This is protection for declared secrets and supported formats, not a
claim to recognize arbitrary unknown sensitive text. Review new output producers at this boundary.

## Supply chain and execution

Dependencies are exact-pinned with npm integrity hashes; install with `npm ci`. GitHub Actions use
full immutable SHAs. The API image uses a recorded digest, and test infrastructure binds temporary
ports to localhost. Containers have unique ownership labels and cleanup verifies ownership in CI.
Use generated testing only on disposable authorized targets: invalid writes and deletes are part
of the test workload. Public Postman assets contain only the challenge's intentionally public token.
