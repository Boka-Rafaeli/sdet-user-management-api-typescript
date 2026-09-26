# Generated check catalogue

Reference: the installed `schemathesis==4.25.2` registry and the original runner's
`--phases examples,coverage,fuzzing --checks all --max-examples 20 --workers 1
--max-failures 20`. The registry has 13 checks. This table records applicability
to the supplied OpenAPI 3.0.3 document; it does not claim identical generated
inputs, shrinking paths, request counts or Schemathesis NDJSON compatibility.

| Reference check                | TypeScript behavior                                                                                                                                                 | Evidence                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `not_a_server_error`           | Only 200–499 pass; server errors remain failures independently of acceptance allowlists.                                                                            | Passing/failing witnesses in `generation-checks.test.ts`     |
| `status_code_conformance`      | Actual status must have an explicit response declaration.                                                                                                           | Passing/failing witnesses                                    |
| `content_type_conformance`     | Declared JSON media type required, ignoring case and parameters. No declaration means not applicable.                                                               | Passing/failing witnesses                                    |
| `response_headers_conformance` | Not applicable: no response headers declared. Adding declarations fails preflight until this capability is implemented.                                             | Schema preflight rejection + explicit SKIP                   |
| `response_schema_conformance`  | Declared response schema validates JSON, required fields, types, bounds and supported format. No declared schema means not applicable.                              | Passing/failing/invalid-JSON witnesses                       |
| `negative_data_rejection`      | Invalid requests accept 400, 401, 403, 404, 405, 406, 409, 422, 428 or 5xx. The separate server-error check still fails 5xx.                                        | Passing/failing witnesses, independent negative-input oracle |
| `positive_data_acceptance`     | Valid requests accept 2xx, 401, 403, 404, 409 or 5xx; separate server-error check still fails 5xx.                                                                  | Passing/failing witnesses                                    |
| `missing_required_header`      | Omitted Authentication in coverage expects 400, 401, 403, 406 or 422. An Authorization header, if added, expects 401.                                               | Required-header witnesses                                    |
| `unsupported_method`           | Requires 405 and nonempty Allow. A parameterized unknown resource may return 404. OPTIONS is excluded from this check.                                              | Method witnesses                                             |
| `allow_header_conformance`     | Present nonempty OPTIONS Allow must match declared methods; implicit HEAD and OPTIONS are allowed. Missing OPTIONS Allow skips this check, as in the reference.     | OPTIONS witnesses                                            |
| `use_after_free`               | Not applicable: the reference runner does not enable the stateful phase.                                                                                            | Explicit catalogue/SKIP                                      |
| `ensure_resource_availability` | Not applicable: the reference runner does not enable the stateful phase.                                                                                            | Explicit catalogue/SKIP                                      |
| `ignored_auth`                 | Not applicable: the document has no OpenAPI security schemes/requirements. Authentication is a required header parameter. New security declarations fail preflight. | Schema preflight rejection + explicit SKIP                   |

Unspecified-method coverage bypasses status, media type, response schema,
response headers, negative rejection and positive acceptance checks. Its
specialized method and Allow checks apply instead. The reference default
unexpected-method candidate set is GET, PUT, POST, DELETE, OPTIONS, PATCH,
TRACE and QUERY; declared methods are removed and each path/method is explored
once. QUERY is intentional, and HEAD is not in that reference default set.

The loader supports the current local-reference, JSON, object/array/string/
integer/number/boolean schema subset. Pattern, composition, external/cyclic
references, non-JSON media, new security declarations and response-header
contracts fail before requests. It never silently ignores such constraints.
The email adapter currently uses the project's original deterministic Python
FormatChecker compatibility rule (contains `@`); this is the agreed migration
oracle, not a claim that every email implementation accepts identical strings.

The three generation phases are separate. Example/coverage cases are finite
and schema-derived; fuzzing uses the configured example count, seed and a
separate shrink limit. A request can execute multiple checks. Reports retain
per-operation phase counters, categories, every check result including SKIP,
and the explicit reason when the unique-finding budget stops exploration.
Resource provisioning and cleanup requests are separate from the reported
generated-case request count. Raw case totals are not a coverage KPI.

API findings remain informational and appear in JUnit/NDJSON/summary evidence.
Schema, setup, transport, cancellation and report-writing failures are engine
errors and must block execution. Replay requires the same schema, generator and
fast-check versions, seed, operation, replay path and run ID on a fresh target.
The reference's best-effort cleanup semantics are retained: HTTP transport
failures and DELETE statuses during cleanup do not change the result; ordinary
programming errors remain operational failures.
