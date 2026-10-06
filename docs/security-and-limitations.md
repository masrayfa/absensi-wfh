# Security posture and limitations

An honest read of what this app protects and what it deliberately does not.
This is a take-home implementation against a photo-attendance brief, not a
hardened production system. Paths cited are real files.

[Index](./README.md) · [Decisions](./decisions.md) · [Features](./features.md) · [API](./api.md)

## What IS protected

| Control | Where | What it does |
|---|---|---|
| Password hashing | `apps/auth-service/src/auth/auth.service.ts` | bcrypt cost **12** for seeded and generated passwords (`BCRYPT_COST = 12`) |
| Uniform login error | same file, `AUTH_FAILED` | Unknown email, wrong password, and deactivated user all return `Invalid email or password` (no account enumeration) |
| JWT authn at the edge | `libs/common/src/guards/index.ts` `JwtAuthGuard`; registered `APP_GUARD` in `apps/api-gateway/src/app.module.ts` | Every non-`@Public` route requires a valid bearer JWT |
| Role checks | `RolesGuard` + `@Roles(...)` on gateway controllers | EMPLOYEE vs HRD surfaces are separated server-side (e.g. `GET /attendance` is HRD-only, check-in is EMPLOYEE-only) |
| Employee-scoped attendance | `apps/api-gateway/src/attendance/attendance.service.ts` `listMine` / `currentEmployee` | `/attendance/me`, check-in, and check-out resolve the caller from the JWT email; clients cannot address another employee's rows |
| Deactivation | `apps/api-gateway/src/employee/employee.service.ts` (auth-first) + attendance ACTIVE check | Login disabled via `User.isActive = false`; attendance routes reject non-ACTIVE employees (403) even while an 8h JWT is still signature-valid |
| Email immutability | `apps/employee-service/src/employee/employee.service.ts` update | Rejects a changed `email` (the cross-service identity key); prevents orphaning the login |
| Upload allowlist | `apps/api-gateway/src/attendance/attendance.controller.ts` | Mimetype allowlist `image/png\|jpeg\|webp\|gif` only; `image/svg+xml` excluded (active content); 5 MB cap; stored extension from a fixed map, never the client filename |
| nosniff on uploads | `apps/api-gateway/src/app.module.ts` `ServeStaticModule` | `X-Content-Type-Options: nosniff` on `/uploads/*` so user-supplied bytes are not sniffed into scriptable types |
| Server-owned timestamps | `apps/attendance-service/src/attendance/attendance.service.ts` | `checkInAt` / WIB `date` computed server-side; clients cannot backdate attendance |
| Idempotent check-in | unique `(employeeId, date)` + P2002 handling | Duplicate check-ins cannot create a second row for the same person/day |
| JWT secret via env | `.env.example` `JWT_SECRET`; `loadConfig` | Secret is not hardcoded in source (dev default exists only as a fallback, see below) |
| CORS | `main.ts` `enableCors({ origin: config.webOrigin })` | Only the configured web origin (`WEB_ORIGIN`, default `http://localhost:5173`) |
| Validation pipe | `main.ts` `ValidationPipe({ whitelist: true, transform: true })` | Unknown body keys stripped; DTOs define the contract (e.g. no `status` on employee create/update) |
| Test isolation | `tools/backend-test.cjs` | Tests run on `*_test` schemas with high ports and a temp `UPLOAD_DIR`; dev DB and running dev stack are not touched |

## What is NOT protected (known gaps)

| Gap | Detail |
|---|---|
| **No rate limiting** | Login, check-in, and employee create can be hammered; no throttling at the gateway or in front of it |
| **`/uploads` is unauthenticated** | `ServeStaticModule` serves photos by URL. Anyone who knows or guesses a file URL can fetch it (capability-URL style). No per-photo authorization |
| **TCP services trust the gateway** | Services listen on `0.0.0.0:4001-4003` with no service-to-service auth or mTLS. Anyone who can reach those ports can invoke any TCP command directly |
| **Stateless JWT, 8h, no revocation** | Tokens stay signature-valid until expiry. Deactivation is enforced only where the code checks `isActive`/`status` (login + attendance routes), not by revoking tokens. `AUTH_VALIDATE` exists in auth-service but is not on the gateway hot path |
| **Single shared default password** | Every HRD-created employee gets `Welcome123!`; all seeded demo accounts share `Password123!`. No forced rotation, no self-service reset |
| **No magic-byte / image-content check** | Allowlist trusts the client-declared mimetype. A crafted file with a lying `Content-Type: image/png` can be stored (mitigated by nosniff + raster types, not eliminated) |
| **No helmet / CSP / security headers** | Beyond `nosniff` on `/uploads`, no CSP, HSTS, frame options, etc. |
| **Dev JWT fallback** | `loadConfig` defaults `JWT_SECRET` to `dev-insecure-secret-change-me` if the env var is missing. Compose also interpolates a dev default. Production must set a strong secret |
| **localStorage session** | SPA stores the bearer token in `localStorage` (`absensi.session`); any XSS on the origin can read it until expiry |
| **No password policy** | No complexity/expiry rules beyond the fixed defaults |

## Operational limitations

| Limitation | Detail |
|---|---|
| **Photos on local disk** | `UPLOAD_DIR` (repo-root `./uploads` natively; named volume `uploads` in compose, mounted at `/uploads` in the gateway). Single instance's disk; no S3/CDN; no replication; duplicate check-ins may leave orphan photo files (insert is skipped on P2002 but multer already wrote the file) |
| **One MySQL instance** | Three schemas (`auth_db` / `employee_db` / `attendance_db`) on one server, logical isolation (per-service Prisma clients + credentials), not physically separate databases |
| **No message broker** | TCP transport without RabbitMQ/Kafka: if a service is down the request fails fast; no retries, queues, or dead-letter handling |
| **No pagination** | Employee and attendance lists return full result sets (fine at demo scale) |
| **No reactivation API** | Deactivate exists; the inverse (bring back an account) does not |
| **No geolocation / anti-spoofing / biometrics** | Brief asked for photo proof only |
| **HRD attendance is view-only** | No edit/delete/approval workflow for submitted records |
| **Docker path authored, not executed here** | `docker-compose.yml`, per-service `Dockerfile`s, and `docker/mysql/init.sql` are authored and statically validated, but Docker was not installed on the authoring machine, so `docker compose up` was **not run**. The native-MySQL bootstrap in [development.md](./development.md) is the verified path |

## Threat notes worth keeping in mind

1. **Deactivated accounts with live tokens.** An 8h JWT issued before
   deactivation still verifies at the gateway. Attendance routes close this
   hole by checking `Employee.status === ACTIVE` per call
   (`currentEmployee` in `apps/api-gateway/src/attendance/attendance.service.ts`).
   HRD employee/attendance list routes do not re-check the *caller's* employee
   row (HRD users have no Employee row at all), which is correct for role but
   means any future HRD-only sensitive route should think about auth-user
   `isActive` too.
2. **Upload XSS residual risk.** Raster allowlist + nosniff is the defense; a
   future change that allows SVG or serves uploads without nosniff would open
   script execution on the app origin.
3. **Trust boundary at TCP ports.** In production, services must not be
   reachable except from the gateway (network policy / private network / mTLS).
   Compose puts them on the default network; native dev binds `0.0.0.0`.
4. **Secrets.** `.env` is gitignored; `.env.example` carries safe placeholders.
   Rotate `JWT_SECRET` before any real deployment.

## Hardening backlog (not implemented)

If this went to production, in rough priority order:

1. Rate-limit login and check-in; add helmet/CSP and standard security headers.
2. Network-isolate TCP services (or move to a broker with auth) so only the
   gateway can invoke commands.
3. Auth-protect or sign `/uploads` URLs (short-lived tokens), or move photos
   to object storage with private buckets.
4. Shorten token TTL + refresh, or add revocation for deactivation.
5. Force password change on first login for `Welcome123!` accounts; unique
   per-user passwords at creation.
6. Magic-byte sniffing on uploads; virus scanning if uploads become untrusted.
7. Re-check auth-user `isActive` on every request (or use short-lived tokens
   only) if revocation becomes a hard requirement.

---

[Index](./README.md) · [Decisions](./decisions.md) · [API](./api.md) · [Development](./development.md)
