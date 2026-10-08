# AGENTS.md

Read this before touching code. Human docs live in [`docs/`](docs/README.md).

## Start here

1. [`docs/README.md`](docs/README.md) — doc map (which doc for which question).
2. [`docs/architecture.md`](docs/architecture.md) — components, ports, data model.
3. [`docs/decisions.md`](docs/decisions.md) — deliberate choices. Read before changing behavior so you don't undo a decision.
4. [`docs/development.md`](docs/development.md) — run, test, env vars, how to add a TCP command.

## Service map

| Folder | Role | Port | DB |
|---|---|---|---|
| `apps/api-gateway` | HTTP entry: JWT/roles, uploads, Swagger, TCP forwarder | 3000 | none |
| `apps/auth-service` | users, bcrypt, JWT issue/validate/deactivate | TCP 4001 | `auth_db` |
| `apps/employee-service` | master karyawan | TCP 4002 | `employee_db` |
| `apps/attendance-service` | check-in/out, photo refs | TCP 4003 | `attendance_db` |
| `web` | React SPA | 5173 | none |

Each `apps/*` folder has its own `README.md` with patterns, schema, and commands. `web/README.md` too.

## Rules

- Cross-service payloads live in `libs/contracts` (`TCP_PATTERNS`, enums, DTOs). Never redefine them locally.
- Guards, decorators, filters, `loadConfig`, `wibDateOf` live in `libs/common`. Reuse, don't reimplement.
- One schema per service. Services join by `id`/`email` — never cross-schema foreign keys.
- Attendance `date` is the WIB business day (`wibDateOf`), `checkInAt`/`checkOutAt` are UTC instants. Don't mix them.
- `photoUrl` is a public path (`/uploads/...`), never a filesystem path.

## Commands (repo root)

```bash
pnpm dev          # build libs + all services + web
pnpm test         # all tests
pnpm typecheck    # all packages
pnpm lint         # eslint
```
