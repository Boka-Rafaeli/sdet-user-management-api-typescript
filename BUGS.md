> Migrated reference defect catalogue. All nine curated defect signatures were reproduced
> by the TypeScript suite against the same pinned image. Historical generated observations
> below refer to Schemathesis; current exploration uses the documented TypeScript adapter.
> Exact scenario IDs are preserved; see `tests/api/manifest.json` for their TypeScript files.

# Verified API Defects

The findings below compare the supplied OpenAPI 3.0.3 contract with the behavior of
`ghcr.io/danielsilva-loanpro/sdet-interview-challenge:latest` at image digest
`sha256:c80c42ffafccb6ba9cd9a128421445d308225f09902c03aeadbc99e321176bbc`.

## Summary

| ID      | Severity | Environments  | Finding                                                  |
| ------- | -------- | ------------- | -------------------------------------------------------- |
| BUG-001 | Critical | `dev` only    | DELETE authorization can be bypassed                     |
| BUG-002 | High     | `dev`, `prod` | PUT reports success but does not persist the update      |
| BUG-003 | Medium   | `dev`, `prod` | Duplicate POST returns `500` instead of `409`            |
| BUG-004 | Medium   | `dev`, `prod` | GET for an absent user returns `500` instead of `404`    |
| BUG-005 | Medium   | `dev`, `prod` | POST accepts an email that violates the OpenAPI format   |
| BUG-006 | High     | `dev`, `prod` | POST/PUT do not enforce string types for name and email  |
| BUG-007 | Medium   | `dev`, `prod` | POST/PUT return `500` for non-object JSON bodies         |
| BUG-008 | Medium   | `dev`, `prod` | POST/PUT accept `text/plain` request bodies as JSON      |
| BUG-009 | Medium   | `dev`, `prod` | POST/PUT reject an empty name allowed by OpenAPI         |
| OBS-001 | Low      | `dev`, `prod` | Unsupported TRACE requests return `500` instead of `405` |

## Execution evidence

Deterministic suite results against one local container:

| Scope                       |               Result | Interpretation                                         |
| --------------------------- | -------------------: | ------------------------------------------------------ |
| `dev`                       | 35 passed, 20 failed | Three auth variants plus seventeen shared defect cases |
| `prod`                      | 38 passed, 17 failed | Seventeen shared defect cases; DELETE auth works       |
| Cross-environment isolation |             1 passed | The `dev` and `prod` data stores are independent       |

These are strict local results. GitHub Actions applies the environment-aware, exact-signature
known-defect gate, so the same cases appear as 20 DEV and 17 PROD `XFAIL` results. A different failure
signature, an operational error, or restored expected behavior is blocking rather than being hidden
by the baseline.

Schemathesis also exercises all five operations and independently reproduces server errors, the
missing header check in `dev`, and unsupported-method failures. Exact generated-case totals are
run-scoped diagnostic evidence, not a stable coverage KPI. They remain in each GitHub Actions run's
console summary and JUnit/NDJSON artifacts; any count copied into this document must cite that
specific run URL.

## BUG-001: DELETE authorization can be bypassed in dev

**Severity:** Critical  
**Environment:** `dev` only  
**Contract:** `DELETE /users/{email}` requires the `Authentication` header and documents
`401` for a missing or invalid token.

### Steps

1. Create a user with `POST /dev/users`.
2. Delete that user without an `Authentication` header, with an empty token, or with an
   incorrect token.
3. Attempt to retrieve the user.

### Expected

- DELETE returns `401` with an `ErrorResponse`.
- The user remains stored.

### Actual

- DELETE returns `204`.
- The user is deleted.
- The same checks work correctly in `prod`, where DELETE returns `401` and preserves the
  user.

### Impact

An unauthenticated caller can irreversibly delete development-environment data. The
environment difference also indicates configuration or routing drift.

**Automated evidence:**
`tests/api/authentication.spec.ts::test_delete_rejects_missing_or_invalid_authentication`

## BUG-002: PUT reports success but does not persist the update

**Severity:** High
**Environments:** `dev`, `prod`
**Contract:** A successful `PUT /users/{email}` returns `200` and the updated `User`.

### Steps

1. Create a user.
2. PUT a complete valid body with a changed `name` and `age`.
3. GET the same user.

### Expected

The GET response contains the updated `name` and `age`.

### Actual

PUT returns `200` and echoes the updated body, but the following GET returns the original
values. Changing the body email behaves similarly: the original key remains unchanged and
the new key is not created.

### Impact

Clients receive false confirmation of a successful write, causing silent data loss and
incorrect downstream decisions.

**Automated evidence:**

- `tests/api/update.spec.ts::test_update_persists_changes`
- `tests/api/update.spec.ts::test_update_persists_email_change`

## BUG-003: Duplicate POST returns 500 instead of 409

**Severity:** Medium  
**Environments:** `dev`, `prod`  
**Contract:** Duplicate email must return `409` with an `ErrorResponse`.

### Steps

1. Create a valid user.
2. Repeat POST with the same email.

### Expected

`409 Conflict`.

### Actual

`500 Internal Server Error` with `{"error": "Internal server error"}`.

### Impact

A normal business conflict is reported as a service failure, preventing clients from
handling the condition correctly and polluting operational error metrics.

**Automated evidence:** `tests/api/crud.spec.ts::test_duplicate_email_returns_conflict`

## BUG-004: GET for an absent user returns 500 instead of 404

**Severity:** Medium  
**Environments:** `dev`, `prod`  
**Contract:** An unknown email must return `404` with an `ErrorResponse`.

### Steps

Request `GET /{environment}/users/<unique-unknown-email>`.

### Expected

`404 Not Found`.

### Actual

`500 Internal Server Error` with `{"error": "Internal server error"}`.

### Impact

Clients cannot distinguish absent data from a platform incident. Monitoring will also
overstate server failures.

**Automated evidence:** `tests/api/crud.spec.ts::test_get_unknown_user_returns_not_found`

## BUG-005: POST accepts an invalid email

**Severity:** Medium  
**Environments:** `dev`, `prod`  
**Contract:** `CreateUserRequest.email` has `format: email`; invalid input is documented as
`400`.

### Steps

POST a complete body with `"email": "not-an-email"`.

### Expected

`400` with an `ErrorResponse` and no persisted record.

### Actual

`201` with a persisted user whose email is `not-an-email`.

### Impact

Invalid primary keys enter the database and may break integrations that assume valid email
addresses.

**Automated evidence:**
`tests/api/create-validation.spec.ts::test_create_rejects_payloads_outside_openapi_schema[invalid-email]`

## BUG-006: POST and PUT do not enforce string field types

**Severity:** High

**Environments:** `dev`, `prod`

**Contract:** `CreateUserRequest` and `UpdateUserRequest` declare `name` and `email` as strings;
schema-invalid types must be rejected with the documented `400` response.

### Steps

Send otherwise valid POST and PUT payloads with integer `name` or integer `email` values.

### Expected

Each request returns `400` with an `ErrorResponse`, and no invalid user data is stored.

### Actual

| Operation and mutation | Actual result                                                        |
| ---------------------- | -------------------------------------------------------------------- |
| POST with `name: 42`   | `201` echoes the integer; a later GET returns `name: "42"`           |
| POST with `email: 42`  | `201` echoes the integer; a later GET returns the invalid key `"42"` |
| PUT with `name: 42`    | `200` and an invalid `User` response                                 |
| PUT with `email: 42`   | `500` with `{"error": "Internal server error"}`                      |

### Impact

The API can persist responses that violate its own `User` schema, while another variant turns a
client validation error into a server incident. Downstream clients cannot safely rely on documented
field types or distinguish malformed input from an operational failure.

**Automated evidence:**
`tests/api/create-validation.spec.ts::test_create_rejects_payloads_outside_openapi_schema[name-integer]`,
`[email-integer]`, and the corresponding
`test_update_rejects_payloads_outside_openapi_schema` variants.

## BUG-007: POST and PUT return 500 for non-object JSON bodies

**Severity:** Medium

**Environments:** `dev`, `prod`

**Contract:** `CreateUserRequest` and `UpdateUserRequest` are object schemas. Requests outside
those schemas must be rejected with the documented `400` validation response.

### Steps

1. Send `POST /users` with a JSON array (`[]`) or string (`"text"`).
2. Create a valid user and send the same non-object bodies to `PUT /users/{email}`.

### Expected

Each request returns `400` with an `ErrorResponse`. PUT leaves the existing user unchanged.

### Actual

All four variants return `500` with `{"error": "Internal server error"}`. The failed PUT requests
leave the existing user unchanged.

### Impact

Schema-invalid client input is misclassified as a service incident, polluting reliability metrics
and preventing clients from correcting their request based on a validation response.

**Automated evidence:**

- `tests/api/protocol.spec.ts::test_create_rejects_non_object_json_body`
- `tests/api/protocol.spec.ts::test_update_rejects_non_object_json_body`

## BUG-008: POST and PUT accept text/plain request bodies as JSON

**Severity:** Medium

**Environments:** `dev`, `prod`

**Contract:** Both request bodies declare only `application/json`. Under the current contract,
unsupported request media must be rejected through the documented `400` response. If the API is
intended to return `415 Unsupported Media Type`, that response must first be added to OpenAPI.

### Steps

1. Serialize a valid user object as JSON text.
2. Send it to POST and PUT with `Content-Type: text/plain`.

### Expected

Each request is rejected with `400` and an `ErrorResponse`; no user state is created or changed.

### Actual

- POST returns `201`, echoes the payload, and persists the user.
- PUT returns `200` and echoes the update. The update is not persisted because of BUG-002.

### Impact

The service ignores its declared media-type boundary. Clients, gateways, and security controls
cannot rely on content negotiation to determine how a request will be parsed.

**Automated evidence:**

- `tests/api/protocol.spec.ts::test_create_rejects_unsupported_request_media_type`
- `tests/api/protocol.spec.ts::test_update_rejects_unsupported_request_media_type`

## BUG-009: POST and PUT reject an empty name allowed by OpenAPI

**Severity:** Medium
**Environments:** `dev`, `prod`

**Contract:** `CreateUserRequest.name` and `UpdateUserRequest.name` require a string but define no
`minLength` or pattern. An empty string therefore satisfies the supplied OpenAPI schemas.

### Steps

1. Send a valid POST body with `name: ""`.
2. Create a valid user and send a complete PUT body with `name: ""`.

### Expected

POST returns `201` and PUT returns `200`, each with a contract-valid `User` response.

### Actual

Both operations return `400` with `{"error": "name is required"}`.

### Impact

Clients that conform to the published schema can be rejected by an undocumented validation rule.
If empty names are not permitted, the OpenAPI schemas should declare `minLength: 1`.

**Automated evidence:**

- `tests/api/create-validation.spec.ts::test_create_accepts_empty_name_allowed_by_contract`
- `tests/api/update-validation.spec.ts::test_update_accepts_empty_name_allowed_by_contract`

## OBS-001: Unsupported TRACE requests return 500

**Severity:** Low robustness observation  
**Environments:** `dev`, `prod`

Schemathesis found that `TRACE /users` and `TRACE /users/{email}` return `500`. A route that
does not support TRACE should normally return `405 Method Not Allowed`. The OpenAPI document
does not declare a TRACE operation, so this is recorded separately from direct contract
discrepancies.

## Specification observations

- Request schemas do not declare `additionalProperties: false`; therefore extra JSON fields
  are valid according to the current document. Tests must not assume that extra fields are
  rejected unless the contract is tightened.
- OpenAPI `format: email` permits some unusual RFC-valid values that the implementation
  rejects. The product team should either align validation or document the intended format
  more narrowly, for example with an explicit pattern.
