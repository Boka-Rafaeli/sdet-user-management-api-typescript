# Testing strategy

## Why test the testing infrastructure?

Infrastructure unit tests exercise reusable production logic in this test system: the HTTP
client, OpenAPI oracle, baseline classifier, generator, cleanup and reporter. They are valuable
when they detect a false PASS, swallowed failure, leaked credential or skipped API coverage.
They do not restate each API test's implementation or mock an assertion into always succeeding.

The central rule is an independent expected outcome. Controlled HTTP responses prove both
acceptance and rejection. The known-defect gate sees network errors, changed signatures and
repaired behavior. Scrubber tests inject malformed records and filesystem failures. Actual
Playwright subprocesses prove exit codes and report semantics for setup and teardown failures.
A deliberately broken target is used as a negative control, not as the implementation oracle.

## Layers

1. Unit: configuration boundaries; client encoding/raw/null bodies; schema status/media/JSON
   decisions; exact baseline; ownership and cleanup; independent redaction; readiness deadlines;
   each applicable generated check with passing/failing witnesses; seeded replay and shrinking.
2. Infrastructure: real runner subprocesses verify strict/unaffected/fixed/network/setup/teardown
   failures and secret-safe HTML/JUnit. Docker lifecycle tests exercise startup and idempotent stop.
3. API: all 55 original parameterized scenario IDs per environment, plus one isolation scenario.
   Assertions include persisted state after rejected writes and authenticated deletion.
4. Generated: examples, schema boundaries and seeded fast-check exploration of all five operations.
   Counters and explicit stopping reasons distinguish bounded exploration from missing work.
5. CI: immutable action guards and real controlled-failure workflows verify operational behavior.

`npm test` runs every implemented layer; all scopes are attempted even if one API scope fails.
A collection manifest and reporter completeness gate reject missing, duplicate, skipped or retried
curated scenarios. Generated totals vary with counterexamples and shrinking and are not a coverage KPI.

## Known defects and independent failures

Strict commands fail for the application's defects. Baseline commands first assert the required
contract, then match the exact documented status, body and persisted state. Only the dedicated
KnownDefect result becomes XFAIL. Changed behavior, network failures and successful repaired behavior
remain blocking. Teardown failure takes precedence over an earlier known-defect result.
The custom JUnit encodes XFAIL as a skipped element with `type="xfail"`; HTML and JSON retain XFAIL.

## Generated behavior

The generated adapter preserves the source's applicable check categories, not Schemathesis's
implementation, exact random requests or report format. Unsupported schema features fail preflight.
The deterministic email oracle retains Python FormatChecker behavior; the generated email oracle
has a separate compatibility corpus for the source's jsonschema_rs validator.

The default is 20 fuzz examples per operation, at most 20 unique findings, one worker and bounded
shrinking. A counterexample can stop its property's run early; reaching the failure budget stops
exploration and is explicitly recorded. Fresh state and recorded versions are required for replay.
A run-specific resource is reset, created and verified before eligible PUT/DELETE cases. Negative
paths remain unchanged. Positive PUT bodies reuse the owned email. Candidate negative PUT emails
are tracked for source-compatible cleanup; use an isolated disposable API instance.

Generated API findings appear in JUnit and NDJSON but do not block the known-defect project.
Engine/schema/setup/transport/report failures exit nonzero. Generated cleanup retains the original
best-effort network-error policy; curated cleanup propagates transport failures. Neither policy
suppresses programming errors. Isolation creates the same email in both environments and verifies
that changing/deleting the dev record does not affect prod on the same server.

## Diagnostics and reproducibility

HTTP and contract tracing are independent opt-in flags with correlated request IDs. Authentication
headers are omitted from HTTP traces. Sensitive fields and configured secret variants are redacted
before reports or logs are written; publication additionally validates all supported text evidence.
OpenAPI bytes, npm package integrity hashes, action SHAs and the application digest are pinned.
The step index links small functional commits to cumulative clean-checkout validation.
