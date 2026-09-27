# Migration parity and limits

The source snapshot is identified by `source-sha256.json`; the supplied local source checkout
had no Git commits. The OpenAPI file was copied unchanged. A fresh Python reference execution
on 2026-09-26 reproduced 37 unit passes, dev 35 PASS/20 XFAIL, prod 38 PASS/17 XFAIL,
and isolation 1 PASS. The TypeScript suite independently reproduced these API results.
The digest is `sha256:c80c42ffafccb6ba9cd9a128421445d308225f09902c03aeadbc99e321176bbc`.

`parity-matrix.json` maps every original parameterized API ID and each of the 37 infrastructure
cases to TypeScript evidence. API IDs are identical. Infrastructure tests are regrouped and
expanded, so raw unit-test counts are not a one-to-one compatibility assertion.

| Source capability                      | TypeScript implementation                                            |
| -------------------------------------- | -------------------------------------------------------------------- |
| pytest API scenarios and fixtures      | Playwright API runner and owned-user fixtures                        |
| HTTPX transport                        | Native Node HTTP/HTTPS with raw bytes, timeout and path encoding     |
| OpenAPI/jsonschema oracle              | Ajv, same status/media/schema assertion order                        |
| Narrow runtime XFAIL gate              | Dedicated KnownDefect signal and custom reporter                     |
| HTML/JUnit                             | Self-contained HTML, JUnit and complete-run JSON summary             |
| Schemathesis examples/coverage/fuzzing | Schema-derived cases and seeded fast-check shrinking/replay          |
| Stateful generated resource hook       | Verified seed before valid-path PUT/DELETE and tracked cleanup       |
| HTTP/contract traces                   | Independent safe correlated diagnostics                              |
| NDJSON scrubber and upload guard       | Atomic NDJSON scrub plus retained text evidence verification         |
| CI scopes and always-run evidence      | Independent matrix, generated continuation, gated upload and cleanup |
| Postman/cURL                           | Original manual assets under `manual/postman/`                       |

## Deliberate improvements

Missing/duplicate/skipped/retried curated cases fail the completeness gate. Rejected writes
receive additional state checks. Tests cover invalid configuration, operational failures,
stale known-defect baselines, real setup/teardown failures, cleanup ownership, bounded readiness,
check witnesses and secret-bearing reports. Generated operational failures block CI even while
API findings remain informational. All scopes are attempted; artifact verification includes
isolation. npm integrity hashes and an image digest improve reproducibility.

## Compatibility boundaries

This migrates the testing project, not the external application server. Python package APIs,
pytest CLI syntax, Schemathesis NDJSON fields, exact generated inputs/counts and shrinking paths
are not retained. TypeScript provides equivalent task commands and documented versioned evidence.
The generator supports the supplied OpenAPI subset and rejects unsupported new constraints before
network activity. Its 13-category applicability table records active and inapplicable checks.
Email compatibility has separate deterministic and generated validators because the source used
different validators. The checked generated corpus is explicit; it is not a proof of universal
RFC implementation equivalence. Configuration rejects malformed/ambiguous URLs and non-finite
limits more strictly than the source. The default image is pinned instead of floating `latest`.

Known-defect XFAIL means the exact documented defect was reproduced. A green baseline does not
certify a defect-free application. Historical Schemathesis findings in BUGS.md retain their
original run links; current TypeScript reports must be interpreted through their own provenance.
