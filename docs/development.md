# Development

How to run, test, and extend the stack. Commands are the real root/package
scripts; paths are real files. For behavior see
[features.md](./features.md); for routes see [api.md](./api.md).

[Index](./README.md) · [Architecture](./architecture.md) · [API](./api.md) · [Security](./security-and-limitations.md)

## Prerequisites

- **Node.js 20+** and **pnpm** (`packageManager: pnpm@11.5.3`; `corepack enable`
  or `npm i -g pnpm`)
- **git**
- **MySQL 8** on `127.0.0.1:3306` (native path uses the `mysql` client CLI) .
  **or** Docker (compose provisions MySQL 8 and the whole stack)

## Bootstrap

### 0. Full stack in Docker (authored; not executed on the authoring machine)

```bash
docker compose up -d          # first run builds 5 images; later runs are instant
docker compose ps             # wait until mysql + 3 services + gateway + web are healthy
```

| URL | What |
|---|---|
| http://localhost:5173 | web (nginx serving the built SPA, container :80 published to 5173) |
| http://localhost:3000/docs | gateway Swagger |
| http://localhost:3000/health | gateway liveness |

Honesty note: Docker was **not installed on the machine this test was authored
on**. The images and compose wiring are authored and statically validated
(YAML parse + Dockerfile structure assertions), but `docker compose up` was
**not executed here**. The native path below is the verified one. Compose
wiring details: containers reach MySQL at host `mysql` (URLs hardcoded in
`docker-compose.yml`, not via the root `.env` localhost URLs); each backend
runs `prisma migrate deploy` + its idempotent seed at boot; `VITE_API_URL` is a
web image build arg; photos live on the named volume `uploads`.

### 1. Environment (both paths)

```bash
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` if your MySQL credentials/ports differ. Every backend script loads
this root file with `dotenv -e ../../.env`.

### 2a. Database: Docker MySQL (authored, not executed here)

```bash
docker compose up -d mysql
docker compose ps             # wait for mysql: healthy
```

`docker/mysql/init.sql` creates `auth_db`, `employee_db`, `attendance_db` on
first boot.

### 2b. Database: native MySQL 8 (verified path)

```bash
mysql -h 127.0.0.1 -u root -proot -e "CREATE DATABASE IF NOT EXISTS auth_db; CREATE DATABASE IF NOT EXISTS employee_db; CREATE DATABASE IF NOT EXISTS attendance_db;"
```

(or on bash: `mysql -h 127.0.0.1 -u root -proot < docker/mysql/init.sql`)

### 3. Install, migrate, seed, run (both paths)

```bash
pnpm install
pnpm -r prisma:migrate        # prisma migrate deploy for each service
pnpm -r seed                  # idempotent: 1 HRD + 3 employees + 1 sample attendance
pnpm dev                      # builds libs, then all four backend apps + web in parallel
```

`pnpm dev` = `pnpm build:libs && pnpm -r --parallel dev` (root
`package.json`). Libs `dist/` is gitignored, so a fresh clone **must** build
them (dev does this for you).

| App | URL |
|---|---|
| api-gateway Swagger | http://localhost:3000/docs |
| api-gateway OpenAPI JSON | http://localhost:3000/docs-json |
| web (React) | http://localhost:5173 |
| auth-service TCP | :4001 |
| employee-service TCP | :4002 |
| attendance-service TCP | :4003 |

Separate terminals: `pnpm --filter @app/auth-service dev` (or
`@app/employee-service`, `@app/attendance-service`, `@app/api-gateway`) and
`pnpm --filter web dev`. The web app reads `VITE_API_URL` from `web/.env.local`
(Vite reads env files next to the web app, not the repo root); default
`http://localhost:3000`.

## Root scripts

| Script | Command (root `package.json`) | Does |
|---|---|---|
| `pnpm dev` | `pnpm build:libs && pnpm -r --parallel dev` | Dev mode: build shared libs, then all apps + web |
| `pnpm build` | `pnpm -r build` | Production build of every package |
| `pnpm test` | `pnpm -r test` | All test suites (backend isolated schemas + web Vitest) |
| `pnpm typecheck` | `pnpm -r typecheck` | `tsc --noEmit` per package (backend also runs `prisma generate`) |
| `pnpm lint` | `eslint .` | ESLint (flat config `eslint.config.js`) |
| `pnpm build:libs` | `pnpm --filter "./libs/*" build` | Build `libs/contracts` + `libs/common` |

Per-package scripts (see each `apps/*/package.json`):
`dev`/`start` (ts-node + dotenv), `build` (tsc), `typecheck`, `test`
(delegates to `tools/backend-test.cjs`), `prisma:generate`, `prisma:migrate`,
`seed`.

Web package scripts (`web/package.json`): `dev` (vite), `build`
(`tsc -b && vite build`), `test` (`vitest run`), `typecheck`, `lint`
(`oxlint`), `preview`.

## Testing model

```bash
pnpm -r test          # backend Jest + web Vitest
```

| Suite | Runner | What it covers | Count (verified) |
|---|---|---|---|
| `apps/auth-service/test/auth.spec.ts` | Jest | login, JWT claims, uniform 401, create_user hash cost 12, deactivate | 5 |
| `apps/employee-service/test/employee.spec.ts` | Jest | CRUD, unique conflicts, soft-delete list filter, immutable email, 404s | 6 |
| `apps/attendance-service/test/attendance.spec.ts` | Jest | parallel check-in idempotency, check-out conflicts, WIB date, filters | 5 |
| `apps/api-gateway/test/app.e2e-spec.ts` | Jest + Supertest | real gateway + real TCP services in-process | 13 (incl. `it.each` cases) |
| `apps/api-gateway/test/employee.service.spec.ts` | Jest | deactivate ordering + auth-failure propagation (mocked clients) | 2 |
| `web/src/features/**\/*.test.tsx` | Vitest + RTL | login redirects, check-in/out UI, employee CRUD UI, monitoring filters/preview | 23 |

Gateway total: **17 across 2 suites** (15 e2e cases including `it.each`
expansions, plus 2 unit tests in `employee.service.spec.ts`). `pnpm -r test`
runs backend suites serialized and web in parallel (separate processes).

### Backend test isolation (`tools/backend-test.cjs`)

Every backend `test` script runs:

```bash
node ../../tools/backend-test.cjs --provision auth            # or employee, attendance
node ../../tools/backend-test.cjs --provision auth,employee,attendance   # gateway e2e
```

What the runner does:

1. **Locks** backend test runs (atomic mkdir in the OS tmpdir) so concurrent
   `pnpm -r test` packages cannot clobber each other's schema resets.
2. **Provisions isolated schemas**: `auth_test` / `employee_test` /
   `attendance_test` (never the dev `*_db` schemas). It clones the dev
   `DATABASE_URL_*` (or `root:root@localhost:3306` fallback) and swaps only the
   schema name, then runs `prisma migrate reset --force --skip-seed --skip-generate`,
   `prisma generate`, and `tsx prisma/seed.ts` against that URL.
3. **Points Jest at the test schemas** and uses **high test ports**
   (`AUTH_TCP_PORT=4101`, `EMPLOYEE_TCP_PORT=4102`, `ATTENDANCE_TCP_PORT=4103`,
   `GATEWAY_PORT=3100`) plus a test `JWT_SECRET` and a tmp `UPLOAD_DIR`, so a
   running dev stack on 3000/4001-4003 is never disturbed.
4. **Builds libs if needed** (`ensureLibsBuilt`) because `libs/*/dist` is
   gitignored.
5. Runs Jest with `--runInBand`.

Gateway e2e (`apps/api-gateway/test/app.e2e-spec.ts`) boots all four Nest apps
**in-process** (three TCP microservices first, then the HTTP gateway) and
drives the gateway with Supertest on an ephemeral HTTP server, the dev ports
are never bound.

### Web tests

Vitest + React Testing Library (`web/src/test/setup.ts`). Axios is mocked at
the module seam (`web/src/lib/api.ts`), so tests assert UI behavior against
expected API calls, not a live server.

### Docs assertion tool

```bash
node tools/assert-docs.cjs            # gateway must be running
node tools/assert-docs.cjs --base-url http://localhost:3000 --timeout 60
```

Fetches `/docs-json` and asserts all 13 expected operations exist, are tagged,
have summaries, and declare bearer auth unless deliberately public
(`tools/assert-docs.cjs` `EXPECTED` list). Exits non-zero on any miss.

## Environment variables

From `.env.example` (copy to `.env` at the repo root):

| Variable | Default in example | Used by | Purpose |
|---|---|---|---|
| `MYSQL_ROOT_PASSWORD` | `root` | docker-compose | MySQL container root password |
| `DATABASE_URL_AUTH` | `mysql://root:root@localhost:3306/auth_db` | auth-service | Prisma URL, schema `auth_db` |
| `DATABASE_URL_EMPLOYEE` | `.../employee_db` | employee-service | Prisma URL, schema `employee_db` |
| `DATABASE_URL_ATTENDANCE` | `.../attendance_db` | attendance-service | Prisma URL, schema `attendance_db` |
| `JWT_SECRET` | `change-me-in-production-please-use-a-long-random-string` | auth-service (sign), gateway (verify) | Shared JWT secret |
| `AUTH_TCP_PORT` | `4001` | auth-service, gateway | TCP port |
| `EMPLOYEE_TCP_PORT` | `4002` | employee-service, gateway | TCP port |
| `ATTENDANCE_TCP_PORT` | `4003` | attendance-service, gateway | TCP port |
| `AUTH_TCP_HOST` | (commented; code default `127.0.0.1`) | gateway | Host the gateway dials (compose: `auth-service`) |
| `EMPLOYEE_TCP_HOST` | (commented; default `127.0.0.1`) | gateway | Compose: `employee-service` |
| `ATTENDANCE_TCP_HOST` | (commented; default `127.0.0.1`) | gateway | Compose: `attendance-service` |
| `GATEWAY_PORT` | `3000` | gateway | HTTP port |
| `WEB_ORIGIN` | `http://localhost:5173` | gateway | CORS allowed origin |
| `UPLOAD_DIR` | `./uploads` | gateway | Photo storage dir (relative paths resolve against repo root) |

Config is read centrally by `loadConfig()`
(`libs/common/src/config/index.ts`) with the defaults shown above. Missing
`.env` makes Prisma fail at startup with `Environment variable not found:
DATABASE_URL_*` (see root README troubleshooting).

## How to add a new TCP command

The pattern used by every existing command (contracts → handler → gateway
client):

1. **Contract**, add the pattern string to `TCP_PATTERNS` in
   `libs/contracts/src/patterns.ts` (single source of truth; never inline a
   command literal elsewhere). Add any DTO to `libs/contracts/src/dto/index.ts`
   if the payload is new.
2. **Service handler**, in the owning service, add a
   `@MessagePattern(TCP_PATTERNS.YOUR_COMMAND)` method to its controller
   (see `apps/<service>/src/<domain>/<domain>.controller.ts`), calling a
   service method that does the domain work and throws Nest HTTP exceptions for
   domain errors. The service's global `RpcHttpExceptionFilter` turns those
   into `{ statusCode, message }` for the gateway.
3. **Gateway client call**, in `apps/api-gateway/src/<domain>/<domain>.service.ts`,
   inject the existing `ClientProxy` (`@Inject(CLIENT_...)`) and
   `return firstValueFrom(client.send<Out>(TCP_PATTERNS.YOUR_COMMAND, payload))`.
   Add a controller method with the right `@Roles`/`@Public` and Swagger
   decorators (`@ApiTags`, `@ApiOperation`, `@ApiBearerAuth`).
4. **Tests**, service Jest unit against the `*_test` schema; gateway e2e in
   `apps/api-gateway/test/app.e2e-spec.ts` (in-process apps); web Vitest if the
   SPA gains a surface. If the command is a new HTTP route, extend
   `tools/assert-docs.cjs` `EXPECTED` so the docs assertion covers it.

## Lint notes

- Root lint is ESLint flat config (`eslint.config.js`): JS recommended +
  `typescript-eslint` recommended for `**/*.{ts,tsx}`, with CJS globals for
  `eslint.config.js` / `**/*.cjs`.
- **Generated code is ignored**: `**/generated/**` (app-local Prisma clients)
  alongside `**/dist/**`, `**/node_modules/**`, `**/coverage/**`.
- Web also has its own `lint` script (`oxlint`, config `web/.oxlintrc.json`).
- Prettier config `.prettierrc` / `.prettierignore` (`node_modules`, `dist`,
  `coverage`, `pnpm-lock.yaml`).

## Project layout (quick reference)

```
apps/api-gateway/src/
  main.ts                 HTTP bootstrap, ValidationPipe, Swagger /docs
  app.module.ts           APP_GUARD (Jwt+Roles), JwtModule 8h, /uploads static
  auth/ employee/ attendance/ health/   controllers + orchestrator services
  common/
    clients.ts            CLIENT_AUTH/EMPLOYEE/ATTENDANCE DI tokens
    tcp-clients.module.ts @Global TCP ClientProxy registration
    uploads.ts            uploadRoot resolution (repo-root walk-up)
    gateway-exception.filter.ts
apps/auth-service/src/
  main.ts                 TCP bootstrap + RpcHttpExceptionFilter
  auth/auth.service.ts    bcrypt cost 12, Welcome123!, uniform 401, JWT sign
  user/user.repository.ts
apps/employee-service/src/employee/   service + repository (soft delete, email immutability)
apps/attendance-service/src/attendance/  WIB date, P2002 idempotency, atomic check-out
libs/contracts/src/       patterns.ts, enums, dto
libs/common/src/          guards, decorators, filters, config, wib.ts
web/src/
  lib/api.ts session.ts   axios + bearer + 401 clear; localStorage session
  features/auth|employees|attendance/
  components/app/         PhotoUpload, AttendanceTable, AppLayout
tools/backend-test.cjs    isolated *_test schema provisioning + Jest
tools/assert-docs.cjs     Swagger surface assertion
docker/mysql/init.sql     creates the three schemas
```

---

[Index](./README.md) · [How it works](./how-it-works.md) · [API](./api.md) · [Decisions](./decisions.md)
