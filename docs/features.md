# Features

What the app delivers for the two briefed use cases, the rules behind each
behavior, and what is deliberately **not** built. Code paths are cited so you
can verify; for request-level flows see [how-it-works.md](./how-it-works.md);
for routes see [api.md](./api.md).

[Index](./README.md) · [How it works](./how-it-works.md) · [API](./api.md) · [Architecture](./architecture.md)

## Roles and permissions

| Capability | EMPLOYEE | HRD |
|---|---|---|
| Login (`POST /auth/login`) | yes | yes |
| Own profile (`GET /auth/me`) | yes | yes |
| Check in with photo (`POST /attendance/check-in`) | yes | no (403) |
| Check out (`POST /attendance/check-out`) | yes | no (403) |
| Own history (`GET /attendance/me`) | yes | no (403) |
| List employees (`GET /employees`) | no (403) | yes |
| Create employee (`POST /employees`) | no (403) | yes |
| Read employee (`GET /employees/{id}`) | no (403) | yes |
| Update employee (`PATCH /employees/{id}`) | no (403) | yes |
| Deactivate employee (`PATCH /employees/{id}/deactivate`) | no (403) | yes |
| Attendance list (`GET /attendance`) | no (403) | yes (view-only) |
| Attendance detail (`GET /attendance/{id}`) | no (403) | yes |

Enforced server-side by `@Roles(...)` + `RolesGuard`
(`libs/common/src/guards/index.ts`, registered as `APP_GUARD` in
`apps/api-gateway/src/app.module.ts`). The SPA mirrors this with
`RequireAuth` / `RequireRole` in `web/src/features/auth/guards.tsx` (UX only;
the API is the authority).

There are no other roles. `auth_db` `User.role` enum is `EMPLOYEE | HRD`
(`apps/auth-service/prisma/schema.prisma`); JWT payload carries `role` and the
gateway reads it for `RolesGuard`.

---

## UC1: Karyawan (employee)

Pages: `/absen` (`web/src/features/attendance/AbsenPage.tsx`), `/riwayat`
(`web/src/features/attendance/RiwayatPage.tsx`).

### Login

- Employee logs in at `/login` with email + password.
- `POST /auth/login` → `{ accessToken, user: { id, email, role } }`; token
  stored in localStorage key `absensi.session` (`web/src/lib/session.ts`).
- Wrong password, unknown email, and deactivated account all return the same
  401 message: `Invalid email or password`
  (`apps/auth-service/src/auth/auth.service.ts`).
- On success the SPA redirects by role: EMPLOYEE → `/absen`
  (`homePathFor` in `web/src/features/auth/guards.tsx`).

### Check-in (`POST /attendance/check-in`)

Rules:

- **Role:** EMPLOYEE only.
- **Photo is required.** Multipart field name: `photo`. Missing file → 400
  `photo is required` (`apps/api-gateway/src/attendance/attendance.controller.ts`).
  The UI disables the submit button without a file
  (`AbsenPage.tsx` / `PhotoUpload.tsx`).
- **Server timestamp.** The server sets `checkInAt` (UTC instant) at insert
  time; the client never sends a clock
  (`apps/attendance-service/src/attendance/attendance.service.ts`).
- **WIB business date.** `date` = `wibDateOf(now)` (Asia/Jakarta, UTC+7),
  stored as SQL `DATE` at UTC midnight
  (`libs/common/src/wib.ts`, `dateOnly` in
  `apps/attendance-service/src/attendance/attendance.repository.ts`).
- **Same-day idempotency.** Unique index `(employeeId, date)`. A second
  check-in on the same WIB day hits P2002 and **returns the existing row**
  (same `id`), not an error. Covered by e2e: "multipart check-in stores the
  photo; same-day re-check-in returns the SAME record".
- **Photo storage.** Gateway multer writes to `UPLOAD_DIR` (repo-root
  resolved), filename `randomUUID()` + extension from the raster allowlist
  (`image/png|jpeg|webp|gif`; SVG rejected). Row stores
  `/uploads/<uuid>.<ext>`. Served with `X-Content-Type-Options: nosniff`.
- **Identity resolution.** Gateway resolves the caller from the JWT email via
  `EMPLOYEE_GET_BY_EMAIL`; if the employee row is not `ACTIVE` → 403
  `Employee account is deactivated` (attendance flow enforces deactivation
  even when the JWT is still signature-valid; see ADR-4 in
  [decisions.md](./decisions.md)).
- **Snapshot fields.** The row stores `employeeId`, `employeeName` (from
  employee.fullName at that moment), and `userId` (auth user id).

### Check-out (`POST /attendance/check-out`)

- Closes **today's open** attendance only (`checkOutAt: null` filter inside
  an atomic `updateMany`
  (`apps/attendance-service/src/attendance/attendance.repository.ts`
  `checkOutOpen`).
- No open record (never checked in today, or already checked out) → 409
  `No open attendance for today — check in first or already checked out`.
- Second check-out is the same 409 (atomic guard means exactly one winner).

### Own history (`GET /attendance/me`)

- Employee-scoped: gateway forces `employeeId` from the caller's JWT email, so
  a client cannot ask for someone else's rows
  (`apps/api-gateway/src/attendance/attendance.service.ts` `listMine`).
- Optional filters `from` / `to` (ISO date strings, inclusive WIB business-date
  bounds; `ListAttendanceQueryDto`).
- Ordered by `date` desc (newest first).
- UI (`RiwayatPage`): table with WIB date/time, status (derived:
  `CHECKED_IN` if `checkOutAt` is null, else `CHECKED_OUT`), photo thumbnail
  (`API_URL + photoUrl`), range filter, empty/error states.

---

## UC2: HRD (admin)

Pages: `/hrd/karyawan` (`web/src/features/employees/EmployeesPage.tsx`),
`/hrd/monitoring` (`web/src/features/attendance/MonitoringPage.tsx`).

### Master karyawan: list

- `GET /employees?search&status`, HRD only.
- `search` matches `employeeNo`, `fullName`, or `email` (contains);
  `status` defaults to `ACTIVE` when omitted
  (`apps/employee-service/src/employee/employee.repository.ts` `list`).
- UI: debounced search (300 ms), status filter (ACTIVE/INACTIVE), table with
  edit + deactivate actions.

### Master karyawan: create (`POST /employees`)

- Body: `CreateEmployeeDto` = `employeeNo`, `fullName`, `email`, `department`,
  `position`, optional `phone`, `joinDate` (ISO date string). **No `status`
  field** (stripped by validation whitelist; row is born `ACTIVE`).
- Server-side uniqueness: `employeeNo` and `email` must be free; duplicates →
  409 (`assertUnique` + P2002 backstop in
  `apps/employee-service/src/employee/employee.service.ts`).
- **Auto-provisions login:** gateway creates the employee first, then calls
  `AUTH_CREATE_USER {email}`; auth-service hashes the **one-time password
  `Welcome123!`** at bcrypt cost 12 and returns it once as `defaultPassword`
  (`apps/auth-service/src/auth/auth.service.ts` `DEFAULT_PASSWORD`).
- **Compensation:** if auth user creation fails, the gateway best-effort
  deactivates the just-created employee row so no login-less ACTIVE employee
  is left (`compensateCreate` in
  `apps/api-gateway/src/employee/employee.service.ts`). The auth error is what
  the caller sees.
- Response includes the full employee row + `defaultPassword`. The UI shows it
  once (dialog) and never persists it client-side.

### Master karyawan: update (`PATCH /employees/{id}`)

- Mutable: `fullName`, `department`, `position`, `phone`, `joinDate`.
- **Immutable: `email`.** Sending a different value → 400
  `Employee email is the cross-service identity key and cannot be changed`.
  Sending the same value is ignored (not written).
- **Immutable: `employeeNo`**, not in `UpdateEmployeeDto` at all.
- **`status` is not writable** (see ADR-12 in
  [decisions.md](./decisions.md)).
- Unknown id → 404.

### Master karyawan: deactivate (`PATCH /employees/{id}/deactivate`)

- **Auth-first order** (ADR-11): load employee → disable login
  (`AUTH_DEACTIVATE_USER` by email, `User.isActive = false`) → flip
  `Employee.status` to `INACTIVE` (soft delete, row is never removed).
- If the auth step fails, the employee row is untouched (safe retry). If the
  row step fails after auth succeeded, the login is already disabled (safe
  direction).
- Effect on the deactivated employee:
  - Fresh login → 401 (uniform message).
  - Existing JWT: still signature-valid up to 8h, but **attendance routes
    return 403** because the gateway checks `status === ACTIVE` per call.
  - Employee disappears from the default list (`status` filter defaults to
    ACTIVE); HRD can still list them by `status=INACTIVE`.

### Attendance monitoring (view-only) (`GET /attendance`, `GET /attendance/{id}`)

- **HRD only.** There is **no** create/update/delete attendance route for
  anyone: HRD cannot edit or delete submitted records; employees cannot see
  anyone else's.
- `GET /attendance?employeeId&from&to`, filters; ordered `date` desc.
- `GET /attendance/{id}`, single record; unknown id → 404.
- UI (`MonitoringPage`): employee dropdown (ACTIVE employees), date range,
  table via `AttendanceTable`, **photo preview dialog** (thumbnail → dialog
  with full image from `API_URL + photoUrl`).
- The attendance row includes `employeeName` snapshot, so HRD sees the name as
  it was at check-in.

---

## Seeded demo data

`pnpm -r seed` (idempotent upserts):

| Email | Role | Password | Notes |
|---|---|---|---|
| `hrd@dexa.test` | HRD | `Password123!` | `apps/auth-service/prisma/seed.ts` |
| `budi@dexa.test` | EMPLOYEE | `Password123!` | Employee `EMP-001`, Engineering |
| `siti@dexa.test` | EMPLOYEE | `Password123!` | Employee `EMP-002`, People |
| `andi@dexa.test` | EMPLOYEE | `Password123!` | Employee `EMP-003`, Finance |

One sample attendance row for Budi: date `2026-01-05`, photo
`/uploads/placeholder.png` (`apps/attendance-service/prisma/seed.ts`; fixed
date keeps the seed idempotent across days).

Employees created from the HRD UI always get `Welcome123!`, returned once by
`POST /employees`.

---

## NOT built (out of scope for this brief)

| Not built | Note |
|---|---|
| Payroll / salary / payslip | Brief is attendance only |
| Leave, overtime, correction, approval workflow | HRD attendance is explicitly view-only; no PATCH/DELETE on `/attendance` |
| Geolocation / anti-spoofing | No GPS, IP check, or device attestation; brief asked for photo proof |
| Biometrics | N/A |
| Message broker / queues / retries | TCP without broker (ADR-1); fail-fast on downtime |
| Object storage (S3/CDN) for photos | Local disk `UPLOAD_DIR` (ADR-5) |
| Reactivation of employees | No API route; only deactivate exists |
| Password reset / self-service | Accounts are seeded or created by HRD with a one-time password |
| Multi-company / multi-tenant | Single tenant |
| Pagination | Lists return full result sets (small demo scale) |
| Audit log / activity trail | Not required by the brief |
| Service-to-service authentication | TCP services trust the gateway (see limitations) |
| Rate limiting / helmet / CSP | See [security-and-limitations.md](./security-and-limitations.md) |
| Magic-byte image validation | Allowlist is by mimetype header only (see limitations) |

---

[Index](./README.md) · [How it works](./how-it-works.md) · [API](./api.md) · [Decisions](./decisions.md)
