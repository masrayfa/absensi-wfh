# Decision log (ADR-style)

Key design choices for the Absensi WFH app, each with Context / Decision /
Consequences (and alternatives considered). Paths cited are real files in this
repo. For the component map see [architecture.md](./architecture.md).

[Index](./README.md) · [Architecture](./architecture.md) · [Security & limitations](./security-and-limitations.md)

---

## ADR-1: TCP transport without a message broker

**Context.** The brief asks for a microservices concept. NestJS supports HTTP,
gRPC, and TCP microservices. A broker (RabbitMQ/Kafka) would add durability and
queueing but also infrastructure, deployment surface, and failure modes that a
take-home test does not need.

**Decision.** Use `@nestjs/microservices` with `Transport.TCP` between the
gateway and the three services. Clients are registered once in
`apps/api-gateway/src/common/tcp-clients.module.ts`; services listen in their
own `src/main.ts` (`NestFactory.createMicroservice`, host `0.0.0.0`, port from
`loadConfig`). Command strings come from `libs/contracts/src/patterns.ts`.

**Consequences.**

- No extra infra; `pnpm dev` or `docker compose up` is the whole system.
- Requests fail fast if a service is down: `client.send(...)` errors surface to
  the gateway filter as a 502-class response, not a queued retry.
- No retries, no DLQ, no at-least-once delivery. Acceptable at this scale.
- Gateway is a thin orchestrator: `firstValueFrom(client.send(pattern, dto))`.

**Alternatives.** RabbitMQ/Kafka/NATS (out of scope); HTTP service-to-service
would mix two transports without buying anything here; a shared DB would defeat
the point of separate services.

---

## ADR-2: Database-per-service (schema-per-service) + why NOT one shared Prisma schema

**Context.** Three domains (users, employees, attendance) need durable storage
on MySQL. A single Prisma schema with all models would be the simplest
starting point, but it couples every service to one data model and one
migration history.

**Decision.** One MySQL schema per service:

| Service | Schema / URL | Prisma file |
|---|---|---|
| auth-service | `auth_db` / `DATABASE_URL_AUTH` | `apps/auth-service/prisma/schema.prisma` |
| employee-service | `employee_db` / `DATABASE_URL_EMPLOYEE` | `apps/employee-service/prisma/schema.prisma` |
| attendance-service | `attendance_db` / `DATABASE_URL_ATTENDANCE` | `apps/attendance-service/prisma/schema.prisma` |

`docker/mysql/init.sql` creates the three schemas on first boot of the MySQL
container; the native path creates them with `CREATE DATABASE IF NOT EXISTS`.
Each service runs its own `prisma migrate deploy` and `prisma/seed.ts`.

**Consequences.**

- Services cannot accidentally join across domains in SQL; cross-service reads
  go through TCP commands.
- Migrations are per-service and deployable independently.
- One physical MySQL instance (see limitations), isolation is logical
  (schemas + credentials in `.env`), not separate servers.
- A cross-service report (HRD monitoring) is assembled by the gateway calling
  attendance-list, not by a cross-schema query.

**Alternatives.** One shared Prisma schema in a single service (monolith); one
database per service on separate MySQL instances (heavier ops than needed);
shared read replicas (YAGNI). The shared-schema option was rejected precisely
because it reintroduces the coupling database-per-service is meant to remove.

---

## ADR-3: Cross-service identity joined by `email` (no cross-DB FK)

**Context.** `User` (auth_db) and `Employee` (employee_db) must refer to the
same human. MySQL foreign keys cannot span schemas the way the services are
deployed (separate schemas, separate Prisma clients), and Prisma cannot model a
cross-database relation.

**Decision.** `email` is the join key: both `User.email` and `Employee.email`
are `@unique`. The gateway resolves attendance callers via
`EMPLOYEE_GET_BY_EMAIL` (`apps/api-gateway/src/attendance/attendance.service.ts`
→ `currentEmployee`). Attendance rows also snapshot `employeeId`,
`employeeName`, and `userId` at check-in time.

**Consequences.**

- No FK means no DB-enforced referential integrity across services. Uniqueness
  is enforced per schema; the join is by convention + service checks.
- Employee email is **immutable** on update
  (`apps/employee-service/src/employee/employee.service.ts` rejects a changed
  value: "Employee email is the cross-service identity key and cannot be
  changed"), otherwise the login would be orphaned.
- Attendance snapshots mean renamed employees keep historical names on old
  rows (intentional: history is what was submitted that day).
- `AUTH_DEACTIVATE_USER` and `EMPLOYEE_DEACTIVATE` both take/lookup by email so
  one key drives both sides.

**Alternatives.** Shared user table (breaks database-per-service); a global
user-id column propagated everywhere (would still be a soft reference);
synchronizing both rows on every write (distributed transaction, rejected).

---

## ADR-4: JWT issued by auth-service, verified offline at the gateway; deactivation enforced in the attendance flow

**Context.** Login must return a bearer token; every protected HTTP route must
check it. Checking each request against the auth-service would make the gateway
depend on auth-service availability for every call.

**Decision.**

- **Issue:** auth-service signs `{sub, email, role}` with `JWT_SECRET`,
  `expiresIn: '8h'` (`apps/auth-service/src/app.module.ts`
  `JwtModule.register`). Login is `AUTH_LOGIN` (`apps/auth-service/src/auth/auth.service.ts`).
- **Verify:** the gateway verifies the signature offline in `JwtAuthGuard`
  (`libs/common/src/guards/index.ts`) using the same secret
  (`apps/api-gateway/src/app.module.ts`). No call to auth-service per request.
- **Deactivation:** because tokens are stateless for 8h, a deactivated
  employee's existing JWT stays *signature-valid*. The attendance gateway path
  therefore resolves the employee on every attendance call and rejects any row
  whose `status !== ACTIVE` with 403
  (`apps/api-gateway/src/attendance/attendance.service.ts` `currentEmployee`).
  Fresh logins are rejected inside auth-service (`isActive` check, uniform
  "Invalid email or password").

**Consequences.**

- Gateway availability does not depend on auth-service for token *verification*.
- No token revocation list, no session store: a valid token works until expiry
  except on attendance routes (which check ACTIVE). HRD employee/attendance
  list routes do not re-check `isActive` of the *caller's* employee row (HRD
  users have no Employee row at all).
- `AUTH_VALIDATE` exists in auth-service (validates token + isActive) but the
  gateway does not call it on the hot path; it is available for future use.
- 8h is long for a shared browser; see
  [security-and-limitations.md](./security-and-limitations.md).

**Alternatives.** Short-lived tokens + refresh (more moving parts); per-request
`AUTH_VALIDATE` (availability coupling); token blacklist in Redis (infra).
Deactivation could have been done by revoking tokens, but stateless JWT made
"check ACTIVE where it matters" the simpler correct fix.

---

## ADR-5: Required photo + local-disk storage + raster allowlist + `nosniff`

**Context.** The brief requires check-in **with photo proof**. Photos must be
stored and served so HRD can preview them. Uploads are user-supplied bytes
served back from the app origin: a content-sniffing or script-capable file
would be an XSS hole.

**Decision.**

- `POST /attendance/check-in` is **multipart**; the gateway's `FileInterceptor('photo')`
  (`apps/api-gateway/src/attendance/attendance.controller.ts`) requires the file
  (`photo is required` → 400 if missing).
- Multer `diskStorage` writes into `uploadRoot`
  (`apps/api-gateway/src/common/uploads.ts`: `UPLOAD_DIR` resolved against the
  repo root, not `process.cwd()`).
- **Allowlist by mimetype only:** `image/png`, `image/jpeg`, `image/webp`,
  `image/gif`. `image/svg+xml` is deliberately absent (SVG is active content).
  The stored extension is looked up from a fixed map, **never** from the client
  filename (e.g. `payload.html` + `image/png` still becomes `.png`).
- Size cap: 5 MB (`MAX_PHOTO_BYTES`).
- The DB stores the public path `/uploads/<uuid>.<ext>`; the filesystem path
  never leaves the gateway.
- `ServeStaticModule` serves `/uploads` with `X-Content-Type-Options: nosniff`
  (`apps/api-gateway/src/app.module.ts`).

**Consequences.**

- No object storage: files live on one disk (named volume `uploads` in
  compose). No CDN, no replication.
- Mimetype allowlist does **not** sniff magic bytes: a crafted file with a
  lying `Content-Type` can still be stored (mitigated by nosniff + raster
  types, but not perfect). See limitations.
- Extension map means the filename is server-controlled (`randomUUID()` +
  allowlisted ext); clients cannot influence the stored name.

**Alternatives.** S3/MinIO (infrastructure); base64 in the DB (bloat); SVG
allowed with sanitization (rejected: scriptable); extension-only filter (client
controls extension, trivially bypassable).

---

## ADR-6: Idempotent check-in via unique `(employeeId, date)` + Prisma `P2002`

**Context.** Double-clicks, retried requests, and parallel tabs must not create
two attendance rows for the same employee/day. The business rule is one row per
person per WIB day.

**Decision.** The `Attendance` model has `@@unique([employeeId, date])`
(`apps/attendance-service/prisma/schema.prisma`). Check-in inserts the row;
on Prisma `P2002` (unique violation) the service **returns the existing row**
instead of erroring
(`apps/attendance-service/src/attendance/attendance.service.ts`). Concurrent
check-ins race the insert; exactly one wins; every loser gets that same row
(covered by the attendance unit test "parallel check-ins ... create exactly ONE row").

**Consequences.**

- Re-check-in is not an error: the client always gets a canonical row for today.
- New photo bytes on a duplicate attempt are written to disk by the gateway but
  the attendance row keeps the **original** photoUrl (the insert never happens).
  Orphan files may accumulate on disk (no cleanup job).
- Race between pre-checks and inserts is handled by the DB, not by application
  locks.

**Alternatives.** Application-level "find then insert" (race-prone);
`SELECT ... FOR UPDATE` (heavier, same goal); upsert (Prisma upsert is not
atomic on all engines the same way; explicit create + P2002 is clearer).

---

## ADR-7: Business day = Asia/Jakarta (WIB) with `@db.Date` + `wibDateOf`

**Context.** "Today" for attendance is a business concept in WIB (UTC+7, no DST
since 1964). Storing timestamps in server-local time or naive UTC dates would
mis-bucket evening check-ins (17:00Z is already the next WIB day).

**Decision.**

- Attendance `date` is a SQL `DATE` (`@db.Date`) holding the **WIB business
  date**; `checkInAt`/`checkOutAt` are UTC instants.
- `wibDateOf(date)` in `libs/common/src/wib.ts` shifts the instant by +7h and
  reads UTC parts to produce `YYYY-MM-DD`.
- attendance-service computes `dateOnly(wibDateOf(new Date()))` at check-in and
  check-out (`apps/attendance-service/src/attendance/attendance.service.ts`);
  `dateOnly()` in `attendance.repository.ts` normalises to UTC midnight so the
  `@db.Date` column and equality queries line up with seed rows.
- The web UI formats server timestamps in `Asia/Jakarta`
  (`Intl.DateTimeFormat` in `AbsenPage.tsx` / `RiwayatPage.tsx`) so everyone
  reads the same clock.

**Consequences.**

- Same-day idempotency keys on WIB day, not UTC day: the unique index and the
  business rule agree.
- `from`/`to` filters on `date` are inclusive WIB business-date bounds.
- If the company ever moved out of WIB, only `wibDateOf` + UI formatters change;
  stored instants stay UTC.

**Alternatives.** Store local server time (breaks if the host TZ differs);
`DateTimeOffset` for `date` (no need; the business day is a date, not a
moment); compute the WIB day only in the UI (server would then be wrong at the
boundary).

---

## ADR-8: App-local generated Prisma client (`apps/*/generated/client`)

**Context.** pnpm dedupes `@prisma/client` to one store path. With the default
generator output, the three services would each run `prisma generate` into the
same shared location and clobber each other's client (schema/model mismatches
at runtime).

**Decision.** Every schema sets
`generator client { provider = "prisma-client-js", output = "../generated/client" }`.
Apps import from their local generated client (e.g.
`apps/auth-service/prisma/seed.ts` imports `../generated/client`).
`apps/*/generated/` is gitignored (`.gitignore`).

**Consequences.**

- Each service's client matches its own schema.
- Fresh clone + `pnpm -r prisma:migrate` / `pnpm -r seed` / `typecheck` must
  generate the client first (the `typecheck` and `seed` scripts already run
  `prisma generate`).
- Test provisioning (`tools/backend-test.cjs`) also runs `prisma generate`
  against the `*_test` schema URLs.

**Alternatives.** Single generated client in a shared package (requires one
schema or hand-written unions); committing generated clients (repo bloat,
merge noise).

---

## ADR-9: pnpm workspace monorepo

**Context.** Four backend apps + web + two shared libraries must share DTOs,
enums, guards, and config without publishing packages.

**Decision.** `pnpm-workspace.yaml` declares `apps/*`, `libs/*`, and `web`.
Packages reference each other as `workspace:*` (e.g. web depends on
`@app/contracts`; every backend app on `@app/contracts` + `@app/common`).
Root scripts orchestrate: `pnpm dev` = `build:libs` then `pnpm -r --parallel dev`;
`pnpm build|test|typecheck` recurse; `pnpm lint` = `eslint .`.

**Consequences.**

- Shared code is versioned and typechecked with the apps.
- `libs/*/dist` is gitignored: **libs must be built before apps run** (handled
  by `pnpm dev` and `tools/backend-test.cjs` `ensureLibsBuilt`).
- Web mirrors `Role` as a type-only union in `web/src/lib/session.ts` so the
  browser bundle never pulls `class-validator` / server enums (it still
  depends on `@app/contracts` for types).

**Alternatives.** npm/yarn workspaces (same idea, pnpm is stricter and faster);
copy-paste DTOs (drift); publishing private packages (overhead).

---

## ADR-10: Single React SPA with role areas + shadcn/ui

**Context.** The brief asks for a React frontend with screens for both roles.
Two SPAs or a server-rendered app would split auth/session logic for no gain.

**Decision.** One Vite + React 19 SPA in `web/`, routes guarded by role:

| Route | Component | Guard |
|---|---|---|
| `/login` | `LoginPage` | `PublicOnly` (signed-in users bounce to role home) |
| `/absen`, `/riwayat` | `AbsenPage`, `RiwayatPage` | `RequireRole EMPLOYEE` |
| `/hrd/karyawan`, `/hrd/monitoring` | `EmployeesPage`, `MonitoringPage` | `RequireRole HRD` |
| `/`, `*` | `RoleHome` | redirects to `/absen` or `/hrd/karyawan` |

Guards live in `web/src/features/auth/guards.tsx`; session is localStorage
`absensi.session` (`web/src/lib/session.ts`) with a `useSyncExternalStore`
subscription. Axios (`web/src/lib/api.ts`) attaches the bearer token and clears
the session on any 401. UI kit: Tailwind v4 + shadcn/ui components under
`web/src/components/ui/`, custom business components `PhotoUpload`,
`AttendanceTable`, `EmployeeFormDialog`. Data fetching: TanStack Query hooks
per feature (`web/src/features/*/queries.ts`).

**Consequences.**

- One auth story, one HTTP client, one deployable frontend.
- Role enforcement is client-side UX only; the **server** enforces roles with
  `@Roles` + `RolesGuard` (a crafted request with an EMPLOYEE token to
  `/employees` gets 403 regardless of the SPA).
- localStorage sessions are readable by any script on the origin (standard SPA
  trade-off; XSS would steal the token until expiry).

**Alternatives.** Next.js SSR (heavier, no SSR need); separate admin SPA
(duplicate auth/session); pure MUI/AntD (shadcn/ui keeps Tailwind-native
styling with the brief's "custom components" expectation).

---

## ADR-11: Auth-first deactivation ordering

**Context.** Deactivating an employee must disable their login. The operation
spans two services (auth + employee) with no distributed transaction. The
dangerous failure mode is the opposite order: flipping the employee row first
and failing auth leaves an **active login** on a deactivated-looking record.

**Decision.** `EmployeeService.deactivate` in the gateway
(`apps/api-gateway/src/employee/employee.service.ts`) runs:

1. `EMPLOYEE_GET_BY_ID`, load the row (404 if unknown)
2. `AUTH_DEACTIVATE_USER` `{email}`, set `User.isActive = false` (idempotent
   `updateMany`, never throws on missing email)
3. `EMPLOYEE_DEACTIVATE`, flip `Employee.status` to `INACTIVE`

If step 2 fails, step 3 never runs: the employee row is untouched and the
caller can retry safely. If step 3 fails after step 2 succeeded, the login is
already disabled, the account is locked out, which is the safe direction.
Errors propagate (not best-effort like create compensation). Covered by
`apps/api-gateway/test/employee.service.spec.ts`.

**Consequences.**

- A half-finished deactivate can leave an INACTIVE employee whose login is
  still active only in one case: employee row deactivated first, which cannot
  happen with this order.
- The reverse half-state (login disabled, employee still ACTIVE in the list)
  is possible only if step 3 fails; the user cannot log in and HRD can retry.
- Because JWT verification is offline, attendance still 403s deactivated
  accounts via the ACTIVE check (ADR-4), even with a pre-deactivation token.

**Alternatives.** Employee-first (unsafe); saga with an explicit compensating
re-activate (more code, same end state); single service owning both tables
(contradicts ADR-2/3).

---

## ADR-12: `status` removed from create/update DTOs (deactivation only via its dedicated route)

**Context.** `Employee.status` is a lifecycle field. If create/update DTOs
accepted `status`, HRD could create an "INACTIVE" employee that never had a
usable login, or reactivate accounts by PATCHing status, bypassing the
auth-first deactivation flow (ADR-11) and password hashing in auth-service.

**Decision.**

- `CreateEmployeeDto` and `UpdateEmployeeDto` in `libs/contracts/src/dto/index.ts`
  have **no `status` field**.
- Repository create/update data types omit it too
  (`apps/employee-service/src/employee/employee.repository.ts`
  `EmployeeCreateData` / `EmployeeUpdateData`: "status is absent by design").
- Gateway `ValidationPipe({ whitelist: true })` strips unknown keys, so a
  client sending `status: "INACTIVE"` on create is ignored; the row is born
  `ACTIVE` (schema default).
- Deactivation happens only via `PATCH /employees/{id}/deactivate` (gateway
  orchestration, ADR-11). Reactivation is not implemented at all.

**Consequences.**

- Covered by e2e: "ignores status on create/update; deactivation stays on its
  own route" (`apps/api-gateway/test/app.e2e-spec.ts`).
- No API path to reactivate an account; that would need a new deliberate
  feature (auth-side `isActive: true` + employee `status: ACTIVE`).
- API consumers must not expect a `status` write field; they read it, they do
  not set it.

**Alternatives.** Allow status on update only (still bypasses auth-first);
separate `PATCH .../reactivate` (not needed for the brief); keeping status in
the DTO and validating in the service (more rules, same outcome, weaker
contract).

---

## ADR-13: Hard delete for INACTIVE employees only (login deleted too)

**Context.** ADR-11/12 keep master karyawan soft-deleted: deactivation flips
`Employee.status` to `INACTIVE` and disables the login, and the row is never
removed. The brief asks for full CRUD including delete, so a real hard delete
is needed — but deleting an ACTIVE employee, or deleting the employee row while
leaving an active login, would be unsafe.

**Decision.**

- `DELETE /employees/{id}` (HRD only) hard-deletes the employee.
- **INACTIVE gate:** the employee must already be INACTIVE; an ACTIVE employee
  is rejected with 400 `Deactivate the employee before deleting` before any
  side effect. Enforced in the gateway (`EmployeeService.remove`) and re-checked
  in employee-service `remove()` as a backstop.
- **Auth-first order:** `EMPLOYEE_GET_BY_ID` → INACTIVE gate →
  `AUTH_DELETE_USER { email }` (auth-service `deleteMany`, idempotent) →
  `EMPLOYEE_HARD_DELETE { id }`. If the row delete fails after the login
  delete, the employee stays INACTIVE with no login — locked out and retryable,
  never an active login left behind.
- A concurrent double-delete (row vanishes between read and delete, Prisma
  `P2025`) maps to 404, never an unhandled 500.
- Attendance snapshots (`employeeId`, `employeeName`) are never touched;
  `DELETE` does not cascade into `attendance_db`, and HRD still reads the
  deleted employee's history.
- The login row is gone, so the email is freed for a new employee.
- **No JWT revocation:** tokens are stateless for 8h. A deleted employee's
  still-valid token gives `/auth/me` → 200 (offline claims) but `/attendance/*`
  → 404 (employee lookup fails).

**Consequences.**

- Covered by gateway unit tests (`employee.service.spec.ts`: ordering, INACTIVE
  gate, auth-failure) and e2e (`app.e2e-spec.ts`: ACTIVE 400,
  deactivate→delete 200, login 401, email re-creatable, unknown 404, EMPLOYEE
  403, `/attendance/me` 404, `/auth/me` 200, attendance snapshots survive).
- Recovery from a half-finished delete (login gone, row present) is **retrying
  DELETE**, not re-creating the employee.
- `docs/api.md` documents the route; `tools/assert-docs.cjs` asserts it.

**Alternatives.** Allow deleting any employee (loses the soft-delete safety
step); delete the employee row only and leave the login (orphan login, email
never reusable); cascade-delete attendance (destroys the audit-like history).

---

[Index](./README.md) · [Architecture](./architecture.md) · [Features](./features.md) · [Security & limitations](./security-and-limitations.md)
