# User Management API — TypeScript

[![API quality](https://github.com/Boka-Rafaeli/sdet-user-management-api-typescript/actions/workflows/api-tests.yml/badge.svg)](https://github.com/Boka-Rafaeli/sdet-user-management-api-typescript/actions/workflows/api-tests.yml)

TypeScript migration of the supplied Python SDET project: API regression tests,
OpenAPI validation, generated exploration, safe diagnostic reports and GitHub Actions.
The application under test is the supplied Docker image. This repository implements
the testing system; the application server remains external.

## Start here

Install Node.js 24.21.0 (see `.node-version`) and Docker, then:

```sh
npm ci
npm test
```

`npm test` checks types, lint, formatting, unit tests, collection and runner infrastructure,
then executes dev, prod and isolation in fresh containers. Dev/prod also run generated
exploration. Containers use dynamic localhost ports and are removed after execution.
No Python runtime or browser installation is required.

The application has confirmed defects. Full verification explicitly enables the exact
known-defect baseline; passing CI does not mean the application is defect-free.

| Scope     | Verified deterministic result |
| --------- | ----------------------------- |
| dev       | 35 PASS, 20 XFAIL             |
| prod      | 38 PASS, 17 XFAIL             |
| isolation | 1 PASS                        |

These are the same 55 scenario IDs in each environment and the same isolation scenario
as the reference. See [parity evidence](docs/PARITY.md), [defects](BUGS.md), and
[implementation commits](docs/IMPLEMENTATION_STEPS.md).

## Commands

```sh
npm run test:unit
npm run test:infrastructure
npm run test:collect

# Strict API checks: known application defects cause a nonzero exit.
npm run test:dev
npm run test:prod

# Exact-signature baseline and optional diagnostics.
npm run test:dev -- --known-bugs-as-xfail --http-trace --contract-trace
npm run test:prod -- --known-bugs-as-xfail --with-generated
npm run test:isolation -- --http-trace --contract-trace

# Use an already running target (base URL must not contain /dev or /prod).
BASE_URL=http://127.0.0.1:3000 npm run generated:dev
BASE_URL=http://127.0.0.1:3000 npm run generated:prod -- --seed 12345 --run-id investigation

# Repeat a recorded fuzz counterexample against a fresh target.
BASE_URL=http://127.0.0.1:3000 npm run generated:dev -- \
  --seed 12345 --operation createUser --replay-path 0:0 --run-id investigation

# Independently sanitize and verify retained evidence.
AUTH_TOKEN=mysecrettoken npm run scrub -- reports/generated --secret-env AUTH_TOKEN
```

For replay, use the actual operation ID, seed, path and run ID from `summary.json`;
the values above illustrate the syntax. Replay also requires the same schema, generator
and fast-check version. Application state can change whether a counterexample reproduces.

Settings: `BASE_URL`, `TEST_ENV=dev|prod`, `AUTH_TOKEN`, `HTTP_TIMEOUT_SECONDS`,
`HTTP_TRACE=1`, `CONTRACT_TRACE=1`, `KNOWN_BUGS_AS_XFAIL=1` and `APP_IMAGE`.
The default image is pinned by digest. Override `APP_IMAGE` to evaluate a new application
version; a fixed known defect deliberately fails the stale baseline until it is reviewed.
Run against disposable test data: generated requests intentionally include invalid writes.

Reports appear in `reports/generated/<scope>/`: standalone HTML, JUnit, JSON summary,
container logs and image digest. The `generated/` subdirectory contains versioned NDJSON,
JUnit and seed/replay metadata. Generated API findings are informational; schema, setup,
transport, cancellation and report-writing errors block the run.

## Design and navigation

- `src/client.ts`: native Node HTTP transport, exact bytes, bounded timeouts and encoded paths.
- `src/contract.ts`: OpenAPI-derived response assertions with optional decision tracing.
- `src/baseline.ts`: narrowly matched known defects; unexpected failures remain blocking.
- `src/generation/`: schema examples, boundaries, seeded fast-check fuzzing and owned resources.
- `src/reporter.ts`, `src/scrubber.ts`: complete-run evidence and publication safeguards.
- `tests/api/`: Playwright API scenarios and independent expected-case manifest.
- `tests/unit/`, `tests/infrastructure/`: oracle, transport, cleanup, redaction and real runner failure tests.
- `manual/postman/`: original Postman collections, environments and cURL examples.

[Testing strategy](TEST_STRATEGY.md) explains what the infrastructure tests protect.
[Generated-check catalogue](docs/GENERATED_CHECK_PARITY.md) records all 13 reference check
categories, including explicit non-applicability and migration limits.
[Security controls](SECURITY.md) describe evidence handling.

## CI

The workflow runs independent dev/prod/isolation jobs with `fail-fast: false`, plus a
quality job. Generated exploration runs even after deterministic failures. Every job
removes its own container; evidence uploads only after the scrub-and-verify gate succeeds.
Actions are pinned to immutable SHAs, checkout credentials are not retained, repository
permission is `contents: read`, and artifacts expire after 14 days.

Manual workflow inputs select a scope and an optional controlled failure probe. Keep
`probe=none` for normal execution. The deterministic/generator/scrub probes intentionally
produce failed runs to verify continuation, blocking and artifact suppression.

If a process is forcibly killed with SIGKILL, its cleanup cannot execute. Inspect owned
containers with `docker ps --filter label=sdet-ts-owned=true`; remove only the specific
container ID from that interrupted run. Managed manual starts record their ID in
`.runtime/api.json`. Never remove all Docker containers as a recovery shortcut.
