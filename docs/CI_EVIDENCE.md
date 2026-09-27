# Verified CI behavior

The following executions tested workflow commit `8f979035532b03364080c6dbb3cc6668352ecba0`.
They are real GitHub Actions executions, not conclusions inferred from YAML. Machine-readable
step outcomes are in `ci-probes.json`.

| Execution                                                                                                             | Observed result                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [Normal all-scope run](https://github.com/Boka-Rafaeli/sdet-user-management-api-typescript/actions/runs/36278382852)  | Quality, dev, prod and isolation passed; three evidence artifacts uploaded                                                        |
| [Deterministic failure](https://github.com/Boka-Rafaeli/sdet-user-management-api-typescript/actions/runs/36292970163) | Strict dev suite failed on application defects; generation still succeeded; upload and cleanup succeeded; job stayed failed       |
| [Generator failure](https://github.com/Boka-Rafaeli/sdet-user-management-api-typescript/actions/runs/36292971915)     | Real generator rejected a missing schema with exit 2; deterministic tests passed; upload and cleanup succeeded; job stayed failed |
| [Scrubber failure](https://github.com/Boka-Rafaeli/sdet-user-management-api-typescript/actions/runs/36292973283)      | Malformed NDJSON failed the gate; upload was skipped; API returned zero artifacts for this run; cleanup succeeded                 |

The three failed runs are intentional negative controls. They do not represent unresolved
regressions. Release validation additionally runs the normal workflow on the final release
commit; see the release notes for that exact run and SHA.

## Required infrastructure improvements

| Plan requirement                                     | Automated evidence                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| U01 file failures and secret variants                | `tests/unit/scrubber.test.ts`, `redaction.test.ts`, `evidence.test.ts`                      |
| U02 HTTP semantics                                   | `tests/unit/client.test.ts`, `tests/unit/native-transport.test.ts` and `http-trace.test.ts` |
| U03 configuration                                    | `tests/unit/config.test.ts`                                                                 |
| U04 contract oracle                                  | `tests/unit/contract.test.ts`, `contract-trace.test.ts`, `generation-email.test.ts`         |
| U05 generated resource errors and cleanup            | `tests/unit/generation-resources.test.ts`                                                   |
| U06 generation, replay, shrinking and bounds         | `tests/unit/generation-{schema,checks,fuzz,runner}.test.ts`                                 |
| I01 actual runner and report failures                | `tests/infrastructure/gate.test.ts` and `tests/runner/gate.spec.ts`                         |
| I02 CI failure continuation and artifact suppression | The three linked negative-control runs above                                                |
