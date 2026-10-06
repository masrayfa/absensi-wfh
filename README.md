# Absensi WFH Karyawan — Fullstack Skill Test

A WFH attendance app built for the Dexa Group / PT Inertia Utama fullstack brief:
a **NestJS microservices** backend + a **React (Vite + shadcn/ui)** web app on **MySQL**.

Two use cases, exactly as briefed:

1. **Karyawan (employee)** — logs in, checks in for the day with a **required photo**,
   the server records the timestamp (business day Asia/Jakarta / WIB), and the employee
   sees their own attendance history.
2. **HRD (admin)** — logs in, manages master karyawan (create / update / deactivate) and
   views submitted attendance **read-only**, including the photo.

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS 12, TypeScript, `@nestjs/microservices` **TCP** transport |
| DB | MySQL 8, one schema per service, Prisma 6 (migrations + seed) |
| Auth | JWT (8 h) signed by auth-service, verified at the gateway; roles `EMPLOYEE` / `HRD` |
| Frontend | React 19 + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query |
| Tests | Jest (service units + gateway e2e), Vitest + RTL (web) |
| API docs | Swagger UI at `/docs` (OpenAPI JSON at `/docs-json`) |

## Architecture

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

- The gateway owns **no database**; it validates JWT/roles, stores uploaded photos under
  `UPLOAD_DIR` (served at `/uploads/...`) and forwards commands over TCP.
- Each service owns its schema and its Prisma migrations. Services join by id/email, not by
  cross-schema foreign keys.
- Photo files are saved by the gateway; the attendance row stores the public path
  `/uploads/<uuid>.<ext>`.

## Documentation

Deep-dive docs live under [`docs/`](docs/README.md):

| Doc | What it covers |
|---|---|
| [docs/README.md](docs/README.md) | Index, doc map, repo layout |
| [docs/architecture.md](docs/architecture.md) | Components, ports, data model, why it is microservices |
| [docs/decisions.md](docs/decisions.md) | ADR-style decision log (context / decision / consequences) |
| [docs/features.md](docs/features.md) | UC1 employee + UC2 HRD behavior, rules, what is NOT built |
| [docs/how-it-works.md](docs/how-it-works.md) | Request flows through real files, error mapping, guards, WIB dates |
| [docs/development.md](docs/development.md) | Bootstrap (Docker + native), scripts, tests, env vars, adding a TCP command |
| [docs/api.md](docs/api.md) | Full endpoint reference: roles, bodies, error codes |
| [docs/security-and-limitations.md](docs/security-and-limitations.md) | Security posture and honest known limitations |
| [web/README.md](web/README.md) | Frontend app (React + Vite) notes |

## Prerequisites

- **Node.js 20+** and **pnpm** (`corepack enable` or `npm i -g pnpm`)
- **git**
- **MySQL 8** reachable on `127.0.0.1:3306` with the credentials in your `.env` — **or** Docker
  (the compose file provisions MySQL 8 for you). The native path also uses the `mysql` client CLI.

## Bootstrap

### 0. One command — full stack in Docker (authored; not executed on the authoring machine)

```bash
docker compose up -d          # first run builds 5 images; later runs are instant
docker compose ps             # wait until mysql + 3 services + gateway + web are healthy
```

That single command brings up MySQL 8, the three TCP services, the HTTP gateway, and the
nginx-served SPA. Each backend container runs `prisma migrate deploy` + its idempotent seed
at boot, so a fresh volume needs **no manual DB step**.

| URL | What |
|---|---|
| http://localhost:5173 | web (nginx serving the built SPA, published from the container's :80) |
| http://localhost:3000/docs | gateway Swagger |
| http://localhost:3000/health | gateway liveness |

Seeded logins are the same as below (`hrd@dexa.test` / `Password123!`).

Notes:

- **Host/DNS difference:** inside compose the services reach MySQL at host `mysql`, so the
  compose file hardcodes `mysql://root:…@mysql:3306/<schema>`. The root `.env` keeps
  `localhost` for the native path (2b). Compose only reads `.env` for
  `MYSQL_ROOT_PASSWORD` / `JWT_SECRET` interpolation.
- **`VITE_API_URL`** is a Web image **build arg** (default `http://localhost:3000`); Vite bakes
  it into the bundle. Override with
  `VITE_API_URL=https://api.example.com docker compose build web`.
- **Uploads** live on the named volume `uploads` (mounted at `/uploads` in the gateway), so
  photos survive `docker compose down`. Add `-v` to drop it together with `mysql_data`.
- **Honesty note:** Docker was **not installed on the machine this test was authored on**;
  the images and compose wiring are authored and **statically validated** (YAML parse +
  Dockerfile structure assertions, see `.omo/evidence/t20-compose.txt`), but
  `docker compose up` was **not executed here**. The native path (2b + 3) is the verified one.

### 1. Environment (both paths)

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` if your MySQL credentials/ports differ. Every backend script loads this root file
with `dotenv -e ../../.env`.

### 2a. Database — Docker MySQL

```bash
docker compose up -d mysql
docker compose ps             # wait for mysql: healthy
```

`docker/mysql/init.sql` creates `auth_db`, `employee_db`, `attendance_db` on first boot.

> **Note:** Docker was **not installed on the machine this test was authored on**, so this path
> is authored but was not executed here. The native path below is the verified one.
> For the whole stack in one command instead of just MySQL, see **0**.

### 2b. Database — native MySQL 8 (verified path)

```bash
mysql -h 127.0.0.1 -u root -proot -e "CREATE DATABASE IF NOT EXISTS auth_db; CREATE DATABASE IF NOT EXISTS employee_db; CREATE DATABASE IF NOT EXISTS attendance_db;"
```

(or, on bash: `mysql -h 127.0.0.1 -u root -proot < docker/mysql/init.sql`)

### 3. Install, migrate, seed, run (both paths)

```bash
pnpm install
pnpm -r prisma:migrate        # prisma migrate deploy for each service (from .env)
pnpm -r seed                  # idempotent seed: 1 HRD + 3 employees + 1 sample attendance
pnpm dev
```

`pnpm dev` first builds the shared libs (`libs/contracts`, `libs/common` — their `dist/` is
gitignored, so a fresh clone must build them), then starts all four backend apps and the web app
in parallel:

| App | URL |
|---|---|
| api-gateway (Swagger) | http://localhost:3000/docs |
| api-gateway (OpenAPI JSON) | http://localhost:3000/docs-json |
| web (React) | http://localhost:5173 |
| auth-service | TCP :4001 |
| employee-service | TCP :4002 |
| attendance-service | TCP :4003 |

If you prefer separate terminals: `pnpm --filter @app/auth-service dev` (or `@app/employee-service`,
`@app/attendance-service`, `@app/api-gateway`) and `pnpm --filter web dev`.

The web app calls `http://localhost:3000` by default; override with `VITE_API_URL` in `web/.env.local`
(Vite reads env files next to the web app, not the repo root).

## Seeded credentials

| Email | Role | Password |
|---|---|---|
| `hrd@dexa.test` | HRD | `Password123!` |
| `budi@dexa.test` | EMPLOYEE | `Password123!` |
| `siti@dexa.test` | EMPLOYEE | `Password123!` |
| `andi@dexa.test` | EMPLOYEE | `Password123!` |

The seed also inserts one sample attendance row for Budi (2026-01-05, placeholder photo).
Employees created from the HRD UI receive the one-time password `Welcome123!` (returned once
by `POST /employees`).

## API

Interactive docs: **http://localhost:3000/docs** · machine-readable: `/docs-json`.
All protected routes require `Authorization: Bearer <jwt>`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | public | liveness probe |
| POST | `/auth/login` | public | login, returns JWT + role |
| GET | `/auth/me` | any token | current user |
| GET | `/employees` | HRD | list/search employees |
| POST | `/employees` | HRD | create employee + login (returns one-time password) |
| GET | `/employees/{id}` | HRD | employee detail |
| PATCH | `/employees/{id}` | HRD | update employee |
| PATCH | `/employees/{id}/deactivate` | HRD | soft-deactivate employee + disable login |
| POST | `/attendance/check-in` | EMPLOYEE | **multipart** check-in, `photo` field required |
| POST | `/attendance/check-out` | EMPLOYEE | close today's attendance |
| GET | `/attendance/me` | EMPLOYEE | own history (newest first) |
| GET | `/attendance` | HRD | read-only list, filter `employeeId` / `from` / `to` |
| GET | `/attendance/{id}` | HRD | read-only record detail |

Swagger documents every route with a tag, summary, and bearer auth where protected. To assert
the whole surface mechanically against a running gateway:

```bash
node tools/assert-docs.cjs            # exits non-zero if any expected route is missing
```

## Tests

```bash
pnpm -r test          # backend Jest suites (serialized, isolated *_test schemas) + web Vitest
pnpm -r typecheck
pnpm build            # builds every package (libs, backend apps, web)
```

Backend tests use `tools/backend-test.cjs`, which recreates `auth_test` / `employee_test` /
`attendance_test` schemas on the local MySQL and **never touches the dev schemas**.
Web tests run with Vitest + React Testing Library (axios mocked at the module seam).

## Known limitations

- **No geolocation / anti-spoofing** (no GPS, IP, or device attestation) — the brief asked for
  photo proof only.
- **No leave / overtime / correction / approval workflow** — HRD is explicitly view-only for
  attendance.
- **TCP transport without a broker** — fine for this scale; no retries/queues if a service is
  down (the request fails fast). A message broker was intentionally out of scope.
- **Photos live on local disk** (`UPLOAD_DIR`, served by the gateway) — a single instance's disk;
  no S3/CDN, and files are not replicated.
- **One MySQL instance** shared by the three schemas — schema-per-service isolation, but not
  physically separate databases.
- Business day is **Asia/Jakarta (WIB)**; timestamps are stored as UTC instants, the attendance
  `date` as a SQL `DATE` in WIB.
- No password self-service / reset flow; accounts are seeded or created by HRD.

## Deliverable checklist (brief → implementation)

| Brief item | Where |
|---|---|
| 1a Backend JS/TS | TypeScript across `apps/*` and `libs/*` |
| 1a Framework NestJS | `apps/api-gateway` (HTTP), `apps/auth-service`, `apps/employee-service`, `apps/attendance-service` (TCP microservices) |
| 1a Database (MySQL) | `apps/*/prisma/schema.prisma` + `prisma/migrations` |
| 1b.i Frontend React | `web/` (React 19 + Vite + TS + Tailwind + shadcn/ui) |
| 2a.i Proper DB structure | 3 per-service schemas, Prisma migrations, unique indexes (`User.email`, `Employee.employeeNo/email`, `Attendance(employeeId,date)`) |
| 2a.ii DB connectivity | Prisma Client per service, `DATABASE_URL_*` from `.env` |
| 2a.iii Microservices concept | gateway → auth/employee/attendance over TCP; contracts in `libs/contracts` |
| 2a.iv CRUD via API | employee CRUD + deactivate (gateway `/employees`), attendance create/read (`/attendance`), users managed by auth-service |
| 2b.i Screens | `/login`, `/absen`, `/riwayat`, `/hrd/karyawan`, `/hrd/monitoring` (`web/src/features/*`) |
| 2b.ii Frontend calls API | axios client `web/src/lib/api.ts` + TanStack Query hooks per feature |
| 2b.iii Custom components | `web/src/components/app/PhotoUpload.tsx`, `web/src/components/app/AttendanceTable.tsx`, `web/src/features/employees/EmployeeFormDialog.tsx` |
| 3.1 Employee: login, absen with server date/time + **required photo**, own history | `POST /attendance/check-in` (multipart), `GET /attendance/me`, pages `/absen`, `/riwayat` |
| 3.2 HRD: login, master karyawan create/update (+deactivate), view-only attendance | `/employees*` routes, `GET /attendance` (read-only), pages `/hrd/karyawan`, `/hrd/monitoring` |

## Troubleshooting

- **`Environment variable not found: DATABASE_URL_AUTH` / `DATABASE_URL_EMPLOYEE` /
  `DATABASE_URL_ATTENDANCE` at startup** — you did not create `.env`. Run
  `cp .env.example .env` from the repo root (see step 1). The service exits with
  `PrismaClientInitializationError ... errorCode: 'P1012'`.
- **`P1003` / “database does not exist” during `prisma:migrate`** — the three schemas are
  missing; run the database step (2a or 2b).
- **`EADDRINUSE` on 3000/4001-4003/5173** — a previous run is still alive; stop it by port and
  retry.
- **Login returns 401 for a seeded account** — migrations/seed were not run, or `.env` points at
  a different MySQL instance. Run `pnpm -r prisma:migrate && pnpm -r seed` again (both are
  idempotent).
