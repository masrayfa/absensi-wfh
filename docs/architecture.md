# Architecture

NestJS microservices behind an HTTP gateway, MySQL schemas per service, one
React SPA. This page describes what exists today; for the reasoning behind each
choice see [decisions.md](./decisions.md).

[Index](./README.md) · [Decisions](./decisions.md) · [How it works](./how-it-works.md) · [Development](./development.md)

## Components

| Component | Path | Transport | Port (env default) | Owns |
|---|---|---|---|---|
| api-gateway | `apps/api-gateway` | HTTP | `GATEWAY_PORT` = 3000 | No DB. JWT/roles, photo upload + static `/uploads`, Swagger `/docs`, forwards TCP commands |
| auth-service | `apps/auth-service` | TCP | `AUTH_TCP_PORT` = 4001 | `auth_db` schema: `User` (email, passwordHash, role, isActive), JWT issue |
| employee-service | `apps/employee-service` | TCP | `EMPLOYEE_TCP_PORT` = 4002 | `employee_db` schema: `Employee` (master karyawan) |
| attendance-service | `apps/attendance-service` | TCP | `ATTENDANCE_TCP_PORT` = 4003 | `attendance_db` schema: `Attendance` (one row per employee per WIB day) |
| web | `web` | HTTP (browser → gateway) | Vite :5173 | React SPA; axios base URL `VITE_API_URL` (default `http://localhost:3000`) |

TCP hosts default to `127.0.0.1` (`AUTH_TCP_HOST` / `EMPLOYEE_TCP_HOST` /
`ATTENDANCE_TCP_HOST` in `libs/common/src/config/index.ts`); `docker-compose.yml`
overrides them with the compose service names (`auth-service`, etc.).

## Diagram

```
                       http://localhost:5173
  ┌────────────┐        (React SPA)         ┌───────────────────────────────┐
  │   web      │ ─────────────────────────▶ │        api-gateway            │
  │  (Vite)    │ ◀───────────────────────── │      HTTP :3000               │
  └────────────┘        JSON + JWT          │  JWT guard, roles, uploads,   │
                                            │  Swagger /docs                │
                                            └──────┬─────┬──────┬───────────┘
                                 TCP :4001         │     │      │  TCP :4003
                                   ┌───────────────┘     │      └───────────────┐
                                   ▼         TCP :4002  ▼                      ▼
                            ┌────────────┐  ┌────────────────┐  ┌────────────────────┐
                            │auth-service│  │employee-service│  │attendance-service  │
                            │ users,JWT  │  │ master karyawan│  │ check-in/out,photo │
                            └─────┬──────┘  └───────┬────────┘  └─────────┬──────────┘
                                  ▼                 ▼                     ▼
                             auth_db           employee_db          attendance_db
                            └─────────────── MySQL 8 :3306 ────────────────┘
```

- The gateway owns **no database**. It validates JWT/roles, stores uploaded
  photos under `UPLOAD_DIR` (served at `/uploads/...`), and forwards commands
  over TCP.
- Each service owns its schema and its Prisma migrations. Services join by
  id/email, never by cross-schema foreign keys.
- Photo files are written by the gateway; the attendance row stores the public
  path `/uploads/<uuid>.<ext>`.

## Gateway internals (`apps/api-gateway/src`)

| Piece | File | Role |
|---|---|---|
| Bootstrap | `main.ts` | `ValidationPipe({whitelist:true, transform:true})`, global `GatewayExceptionFilter`, CORS from `WEB_ORIGIN`, Swagger at `/docs` (`/docs-json` is the machine-readable twin), listens on `GATEWAY_PORT` |
| Guards | `app.module.ts` | `JwtAuthGuard` + `RolesGuard` registered as `APP_GUARD`; `JwtModule.register` signs nothing here but verifies with `JWT_SECRET`, `expiresIn: '8h'` |
| Static uploads | `app.module.ts` + `common/uploads.ts` | `ServeStaticModule` serves `uploadRoot` at `/uploads` with `X-Content-Type-Options: nosniff`; `uploadRoot` resolves `UPLOAD_DIR` against the repo root (walks up to `pnpm-workspace.yaml`) |
| TCP clients | `common/tcp-clients.module.ts`, `common/clients.ts` | `@Global()` module registers `ClientProxy` tokens `AUTH` / `EMPLOYEE` / `ATTENDANCE` (TCP, host/port from config) |
| Feature services | `auth/auth.service.ts`, `employee/employee.service.ts`, `attendance/attendance.service.ts` | Thin orchestrators: `client.send(TCP_PATTERNS.X, dto)` + `firstValueFrom` |
| Exception mapping | `common/gateway-exception.filter.ts` | Maps serialized RPC `{statusCode,message}` from services to real HTTP responses; falls back to `AllExceptionsFilter` from `@app/common` |

Feature controllers:

- `auth/auth.controller.ts`, `POST /auth/login` (`@Public`), `GET /auth/me`
- `employee/employee.controller.ts`, `@Roles(HRD)` on the whole controller
- `attendance/attendance.controller.ts`, check-in/check-out/me with `@Roles(EMPLOYEE)`, list/get with `@Roles(HRD)`
- `health/health.controller.ts`, `GET /health` (`@Public`)

## Shared libraries

### `libs/contracts` (`@app/contracts`)

Single source of truth for cross-service payloads:

- `src/patterns.ts`, `TCP_PATTERNS`: `AUTH_LOGIN`, `AUTH_VALIDATE`,
  `AUTH_CREATE_USER`, `AUTH_DEACTIVATE_USER`, `EMPLOYEE_CREATE`, `EMPLOYEE_LIST`,
  `EMPLOYEE_GET_BY_ID`, `EMPLOYEE_GET_BY_EMAIL`, `EMPLOYEE_UPDATE`,
  `EMPLOYEE_DEACTIVATE`, `ATTENDANCE_CHECK_IN`, `ATTENDANCE_CHECK_OUT`,
  `ATTENDANCE_LIST`, `ATTENDANCE_GET`
- `src/enums/index.ts`, `Role` (`EMPLOYEE`/`HRD`), `EmployeeStatus`
  (`ACTIVE`/`INACTIVE`), `AttendanceStatus` (`CHECKED_IN`/`CHECKED_OUT`, derived
  from the row: open record vs closed)
- `src/dto/index.ts`, `LoginDto`, `CreateEmployeeDto`, `UpdateEmployeeDto`,
  `CheckInDto`, `CheckOutDto`, `ListEmployeesQueryDto`, `ListAttendanceQueryDto`.
  Note: **no `status` field** on create/update DTOs (see
  [decisions.md](./decisions.md)).

### `libs/common` (`@app/common`)

| Export | File | Purpose |
|---|---|---|
| `JwtAuthGuard`, `RolesGuard` | `src/guards/index.ts` | Gateway-wide authn/authz; honor `@Public()` / `@Roles()` |
| `@Public`, `@Roles`, `@CurrentUser`, `JwtPayload` | `src/decorators/index.ts` | Route metadata + verified-payload injection |
| `AllExceptionsFilter` | `src/filters/index.ts` | One JSON error shape: `{statusCode, error, message, path, timestamp}` |
| `loadConfig` | `src/config/index.ts` | Reads env with local-dev defaults (ports, hosts, `JWT_SECRET`, `WEB_ORIGIN`, `UPLOAD_DIR`) |
| `wibDateOf` | `src/wib.ts` | WIB (UTC+7, no DST since 1964) business date `YYYY-MM-DD` for an instant |

`libs/*/dist` is gitignored, so a fresh clone must run `pnpm build:libs` (or
`pnpm dev`, which builds libs first) before the apps can import them.

## Data model

Three Prisma models, one MySQL schema (database) per service. The join key
across services is **`email`**, carried on both `User` and `Employee` rows;
attendance stores snapshots (`employeeId`, `employeeName`, `userId`) at write
time. There are **no cross-database foreign keys**.

### auth_db: `apps/auth-service/prisma/schema.prisma`

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(EMPLOYEE)   // enum: EMPLOYEE | HRD
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### employee_db: `apps/employee-service/prisma/schema.prisma`

```prisma
model Employee {
  id         String         @id @default(uuid())
  employeeNo String         @unique
  fullName   String
  email      String         @unique        // join key to auth_db User.email
  department String
  position   String
  phone      String?
  joinDate   DateTime       @db.Date
  status     EmployeeStatus @default(ACTIVE) // ACTIVE | INACTIVE (soft delete)
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt
}
```

### attendance_db: `apps/attendance-service/prisma/schema.prisma`

```prisma
model Attendance {
  id           String    @id @default(uuid())
  employeeId   String
  employeeName String    // snapshot at check-in
  userId       String    // auth User.id snapshot
  date         DateTime  @db.Date           // WIB business date
  checkInAt    DateTime                     // UTC instant
  checkOutAt   DateTime?                    // null = still open
  photoUrl     String                       // "/uploads/<uuid>.<ext>"
  note         String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@unique([employeeId, date])
}
```

### Unique indexes and why they matter

| Index | Where | Enforced by |
|---|---|---|
| `User.email` unique | auth_db | Login lookup + `AUTH_CREATE_USER` conflict on duplicates |
| `Employee.employeeNo` unique, `Employee.email` unique | employee_db | HRD create rejects duplicates (409); email immutability protects the join key |
| `Attendance(employeeId, date)` unique | attendance_db | Same-day check-in idempotency: a second insert hits P2002 and the service returns the existing row |

## Why this is genuinely microservices (not a distributed monolith)

| Microservice property | Present here |
|---|---|
| Independent deployables | Four apps + web, four Docker images in `docker-compose.yml` |
| Own data store | Each service owns one MySQL schema and its own Prisma migrations |
| No shared ORM access | Services never open another service's database; cross-service calls go over TCP commands |
| Contract-first IPC | Command names live only in `libs/contracts/src/patterns.ts`; DTOs shared, rows not |
| Independent scaling (in principle) | TCP services can be scaled separately; gateway is stateless w.r.t. data |
| Failure isolation | If attendance-service is down, login/employee routes still work (the failing call fails fast) |

What keeps it from being a distributed monolith in disguise: the gateway has
**no repository layer and no DB**; it only orchestrates `ClientProxy.send`
calls. Domain rules (uniqueness, idempotency, WIB dates, soft-delete) live in
the owning services, not in shared tables or shared SQL.

What it is *not*: no broker, no retries/queues, no service-to-service auth, one
MySQL instance for the three schemas. Those trade-offs are recorded in
[decisions.md](./decisions.md) and
[security-and-limitations.md](./security-and-limitations.md).

---

[Index](./README.md) · [Decisions](./decisions.md) · [How it works](./how-it-works.md) · [Features](./features.md)
