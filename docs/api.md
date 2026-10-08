# API reference

Gateway HTTP API (`apps/api-gateway`). Interactive docs: **http://localhost:3000/docs**
(Swagger UI); machine-readable: `/docs-json`. All protected routes require
`Authorization: Bearer <jwt>` (8h, issued by `POST /auth/login`).

Base URL examples use `http://localhost:3000` (default `GATEWAY_PORT`).

[Index](./README.md) · [Features](./features.md) · [How it works](./how-it-works.md) · [Security](./security-and-limitations.md)

## Conventions

- **Roles:** `EMPLOYEE` | `HRD` (JWT `role` claim). Enforced by `RolesGuard`;
  mismatch → **403**. Public routes are marked `@Public()`.
- **Error body** (all failures, shared shape):

  ```json
  {
    "statusCode": 409,
    "error": "UpstreamError",
    "message": "employeeNo EMP-001 already exists",
    "path": "/employees",
    "timestamp": "2026-10-06T12:00:00.000Z"
  }
  ```

  `error` is `UpstreamError` (or `BadGateway` for 502-class) when the failure
  came from a TCP service; local `HttpException`s use Nest's exception name
  (e.g. `ConflictException`) via `AllExceptionsFilter`. `message` may be a
  string or an array of strings (class-validator).
- **Validation:** `ValidationPipe({ whitelist: true, transform: true })` .
  unknown body fields are stripped, not rejected.
- **Timestamps:** ISO-8601 UTC strings. `Attendance.date` is the WIB business
  date at UTC midnight (e.g. `2026-01-05T00:00:00.000Z`).

## Status codes you will see

| Code | When |
|---|---|
| 200 | Success (GET, PATCH, login, login is explicitly `@HttpCode(200)`) |
| 201 | Created (POST create/check-in; Nest default for POST) |
| 400 | Validation failure, missing/invalid photo, immutable email change |
| 401 | Missing/invalid/expired token; wrong password; unknown/inactive user |
| 403 | Wrong role; attendance route used by a deactivated employee |
| 404 | Unknown employee id/email or attendance id |
| 409 | Duplicate employeeNo/email/user email; check-out with no open record |
| 500 | Unexpected server error |
| 502-class | Upstream service failure surfaced through the gateway filter |

---

## Endpoints

### GET /health

| | |
|---|---|
| Role | **public** (`@Public`) |
| Auth | none |
| Body / params | none |

**Response** `200`

```json
{ "status": "ok" }
```

Source: `apps/api-gateway/src/health/health.controller.ts`.

---

### POST /auth/login

| | |
|---|---|
| Role | **public** (`@Public`) |
| Auth | none |
| Body | `{ email, password }` (`LoginDto`) |

**Request example**

```json
{ "email": "hrd@dexa.test", "password": "Password123!" }
```

**Response** `200`

```json
{
  "accessToken": "eyJhbGciOi...",
  "user": { "id": "00000000-...", "email": "hrd@dexa.test", "role": "HRD" }
}
```

JWT claims: `sub` (user id), `email`, `role`; TTL 8h.

**Errors**

| Status | Message |
|---|---|
| 400 | Invalid body (bad email format, missing password) |
| 401 | `Invalid email or password` (unknown email, wrong password, **or** deactivated user, same message) |

Source: `apps/api-gateway/src/auth/auth.controller.ts` → auth-service
`AUTH_LOGIN`.

---

### GET /auth/me

| | |
|---|---|
| Role | any valid token (no `@Roles`; `JwtAuthGuard` only) |
| Auth | bearer |

**Response** `200`

```json
{ "id": "00000000-...", "email": "hrd@dexa.test", "role": "HRD" }
```

Built from the verified JWT payload on the gateway (no service call).

**Errors:** 401 missing/invalid/expired token.

Source: `apps/api-gateway/src/auth/auth.controller.ts` `me()`.

---

### GET /employees

| | |
|---|---|
| Role | **HRD** |
| Auth | bearer |
| Query | `search?` (string, contains-match on employeeNo/fullName/email), `status?` (`ACTIVE` \| `INACTIVE`) |

When `status` is omitted the server defaults to `ACTIVE` (deactivated
employees are excluded unless requested).

**Response** `200`, array of employee rows, ordered by `employeeNo` asc:

```json
[
  {
    "id": "10000000-...",
    "employeeNo": "EMP-001",
    "fullName": "Budi Santoso",
    "email": "budi@dexa.test",
    "department": "Engineering",
    "position": "Backend Engineer",
    "phone": "081200000001",
    "joinDate": "2024-01-15T00:00:00.000Z",
    "status": "ACTIVE",
    "createdAt": "2026-10-05T...",
    "updatedAt": "2026-10-05T..."
  }
]
```

**Errors:** 401, 403 (EMPLOYEE token).

---

### POST /employees

| | |
|---|---|
| Role | **HRD** |
| Auth | bearer |
| Body | `CreateEmployeeDto` |

| Field | Type | Required | Notes |
|---|---|---|---|
| `employeeNo` | string | yes | unique |
| `fullName` | string | yes | |
| `email` | string (email) | yes | unique; join key to the login user |
| `department` | string | yes | |
| `position` | string | yes | |
| `phone` | string | no | |
| `joinDate` | ISO date string | yes | stored as SQL `DATE` |

There is **no `status` field**, unknown keys are stripped; the row is born
`ACTIVE`.

**Response** `201`, employee row plus the one-time password (returned once,
never stored client-side):

```json
{
  "id": "...",
  "employeeNo": "EMP-004",
  "fullName": "New Hire",
  "email": "new@dexa.test",
  "department": "Ops",
  "position": "Staff",
  "phone": null,
  "joinDate": "2026-01-01T00:00:00.000Z",
  "status": "ACTIVE",
  "createdAt": "...",
  "updatedAt": "...",
  "defaultPassword": "Welcome123!"
}
```

The login user is auto-provisioned in auth-service with bcrypt hash of
`Welcome123!` (cost 12).

**Errors**

| Status | Message (examples) |
|---|---|
| 400 | Body validation (missing fields, bad email/joinDate) |
| 401 | No/invalid HRD token |
| 403 | Non-HRD token |
| 409 | `employeeNo X already exists` / `email Y already exists` / `User Y already exists` |

---

### GET /employees/{id}<!-- attr-guard: trailing {} is parsed as attrs by MPE -->

| | |
|---|---|
| Role | **HRD** |
| Auth | bearer |
| Params | `id` (employee UUID) |

**Response** `200`, single employee row (shape as in `GET /employees`).

**Errors:** 401, 403, 404 `Employee <id> not found`.

---

### PATCH /employees/{id}<!-- attr-guard: trailing {} is parsed as attrs by MPE -->

| | |
|---|---|
| Role | **HRD** |
| Auth | bearer |
| Params | `id` |
| Body | `UpdateEmployeeDto` (all optional) |

| Field | Type | Writable |
|---|---|---|
| `fullName` | string | yes |
| `department` | string | yes |
| `position` | string | yes |
| `phone` | string | yes |
| `joinDate` | ISO date string | yes |
| `email` | string (email) | **only if identical to the current value** (sent or not; a *changed* value is rejected) |
| `employeeNo` | n/a | not in the DTO (immutable) |
| `status` | n/a | not in the DTO; stripped if sent |

**Response** `200`, updated employee row.

**Errors**

| Status | Message |
|---|---|
| 400 | `Employee email is the cross-service identity key and cannot be changed` (email differs); body validation |
| 401 / 403 | auth/role |
| 404 | `Employee <id> not found` |
| 409 | unique conflict on other mutable fields (rare; e.g. joinDate races) |

---

### PATCH /employees/{id}/deactivate

| | |
|---|---|
| Role | **HRD** |
| Auth | bearer |
| Params | `id` |
| Body | none (ignored if sent) |

Soft-deletes the employee (`status → INACTIVE`) and disables the login
(`User.isActive → false`, auth-first ordering).

**Response** `200`, employee row with `status: "INACTIVE"`.

**Errors**

| Status | When |
|---|---|
| 401 / 403 | auth/role |
| 404 | unknown employee id |
| 409 / 502-class | auth-service failure during login deactivation (employee row untouched; retryable) |

There is **no reactivation endpoint**.

---

### DELETE /employees/{id}

| | |
|---|---|
| Role | **HRD** |
| Auth | bearer |
| Params | `id` |
| Body | none (ignored if sent) |

Hard-deletes an **INACTIVE** employee: deletes the auth login
(`AUTH_DELETE_USER`, auth-first), then the employee row
(`EMPLOYEE_HARD_DELETE`). An **ACTIVE** employee is rejected before any
side effect: soft-delete with `PATCH /employees/{id}/deactivate` first.

**Response** `200`, the deleted employee row.

**Errors**

| Status | When |
|---|---|
| 400 | `Deactivate the employee before deleting` (employee still ACTIVE) |
| 401 / 403 | auth/role |
| 404 | unknown employee id |
| 502-class | auth-service failure during login deletion (employee row untouched; retryable) |

Notes:

- The email is freed after a successful delete; a new `POST /employees` may reuse it.
- Attendance snapshots remain readable; DELETE never touches attendance rows.
- A still-valid token from the deleted employee keeps working until expiry:
  `/auth/me` → 200 (JWT claims are offline), `/attendance/*` → 404
  (employee lookup fails).
- Half-state (login deleted, employee row still present) is recovered by
  **retrying DELETE**, not by re-creating the employee.

---

### POST /attendance/check-in

| | |
|---|---|
| Role | **EMPLOYEE** |
| Auth | bearer |
| Content-Type | `multipart/form-data` |
| Form field | **`photo`** (file, required) |

Photo rules (enforced by the gateway before any service call):

- Accepted mimetypes only: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
- Max size: 5 MB.
- Missing file → 400 `photo is required`; bad mimetype → 400
  `photo must be a PNG, JPEG, WebP, or GIF image`.
- Stored filename is server-generated: `randomUUID()` + extension from the
  allowlist (never the client filename).
- Stored path: `/uploads/<uuid>.<ext>`; served with
  `X-Content-Type-Options: nosniff`.

Server sets `checkInAt` (UTC instant) and `date` (WIB business day). Same-day
re-check-in is **idempotent**: returns the existing record for that
`(employeeId, date)` (HTTP 201, same `id`).

**Response** `201`, attendance record:

```json
{
  "id": "....",
  "employeeId": "10000000-...",
  "employeeName": "Budi Santoso",
  "userId": "00000000-...",
  "date": "2026-10-06T00:00:00.000Z",
  "checkInAt": "2026-10-06T03:15:00.000Z",
  "checkOutAt": null,
  "photoUrl": "/uploads/0dafa652-....png",
  "note": null
}
```

**Errors**

| Status | When |
|---|---|
| 400 | missing photo / disallowed mimetype / over 5 MB / empty photoUrl on the internal path |
| 401 | no/invalid token |
| 403 | non-EMPLOYEE token, **or** employee account deactivated (checked per request) |
| 502-class | employee-service or attendance-service unreachable |

---

### POST /attendance/check-out

| | |
|---|---|
| Role | **EMPLOYEE** |
| Auth | bearer |
| Body | none required |

Closes today's open attendance (`checkOutAt: null` guard, atomic). No open
record (never checked in today, or already checked out) → **409**.

**Response** `201`, attendance record with `checkOutAt` set.

**Errors:** 401, 403 (role or deactivated employee), 409
`No open attendance for today — check in first or already checked out`.

---

### GET /attendance/me

| | |
|---|---|
| Role | **EMPLOYEE** |
| Auth | bearer |
| Query | `from?`, `to?` (ISO date strings; inclusive WIB business-date bounds) |

Returns **only** the caller's rows (gateway forces `employeeId` from the JWT
email), ordered `date` desc.

**Response** `200`, array of attendance records (shape as in check-in).

**Errors:** 401, 403 (HRD token or deactivated employee), 502-class.

---

### GET /attendance

| | |
|---|---|
| Role | **HRD** |
| Auth | bearer |
| Query | `employeeId?`, `from?`, `to?` (`ListAttendanceQueryDto`) |

View-only list of all attendance. Ordered `date` desc.

**Response** `200`, array of attendance records.

**Errors:** 401, 403 (EMPLOYEE token), 502-class.

There is no POST/PATCH/DELETE on attendance for any role.

---

### GET /attendance/{id}<!-- attr-guard: trailing {} is parsed as attrs by MPE -->

| | |
|---|---|
| Role | **HRD** |
| Auth | bearer |
| Params | `id` (attendance UUID) |

**Response** `200`, single attendance record.

**Errors:** 401, 403, 404 `Attendance <id> not found`.

---

## Route summary

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/health` | public | liveness |
| POST | `/auth/login` | public | JWT + user |
| GET | `/auth/me` | any token | from JWT claims |
| GET | `/employees` | HRD | `search`, `status` |
| POST | `/employees` | HRD | + auto login, returns `defaultPassword` |
| GET | `/employees/{id}` | HRD | |
| PATCH | `/employees/{id}` | HRD | email immutable; no status |
| PATCH | `/employees/{id}/deactivate` | HRD | soft delete + disable login |
| DELETE | `/employees/{id}` | HRD | hard delete (INACTIVE only) + delete login |
| POST | `/attendance/check-in` | EMPLOYEE | multipart `photo` required |
| POST | `/attendance/check-out` | EMPLOYEE | 409 if nothing open |
| GET | `/attendance/me` | EMPLOYEE | own history |
| GET | `/attendance` | HRD | read-only, filters |
| GET | `/attendance/{id}` | HRD | read-only |

This list is asserted mechanically by `node tools/assert-docs.cjs` against a
running gateway's `/docs-json`.

---

[Index](./README.md) · [Features](./features.md) · [How it works](./how-it-works.md) · [Security](./security-and-limitations.md)
