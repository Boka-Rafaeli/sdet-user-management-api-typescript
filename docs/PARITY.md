# Migration parity

Source: supplied Python project (local snapshot; no source Git commits exist in the provided checkout).

- 55 parameterized API cases per environment; 1 cross-environment case; 37 infrastructure cases.
- Same OpenAPI YAML, five operations, dev/prod prefixes.
- Exact known defects retain their identifiers and status/body/state expectations.
- Generated exploration preserves applicable check categories, not identical Schemathesis internals or random cases.
- Deliberate improvements: state after rejected writes, generated infrastructure errors block CI, complete-run manifest, all-output redaction.
- Reference image digest: `sha256:c80c42ffafccb6ba9cd9a128421445d308225f09902c03aeadbc99e321176bbc`.

The original 35/20 and 38/17 PASS/XFAIL counts are historical until independently reproduced. Python is required only to run the reference outside this TypeScript repository.
