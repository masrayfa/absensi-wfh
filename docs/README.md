# Documentation

Absensi WFH Karyawan: a WFH attendance app for the Dexa Group / PT Inertia Utama
fullstack brief. NestJS microservices backend (MySQL, Prisma) plus a React
(Vite + shadcn/ui) web app.

Two use cases, exactly as briefed:

1. **Karyawan (employee)**, logs in, checks in for the day with a **required
   photo**, the server records the timestamp on the Asia/Jakarta (WIB) business
   day, and the employee sees their own attendance history.
2. **HRD (admin)**, logs in, manages master karyawan (create / update /
   deactivate) and views submitted attendance **read-only**, including the photo.

Seeded demo logins: `hrd@dexa.test`, `budi@dexa.test`, `siti@dexa.test`,
`andi@dexa.test`, all with password `Password123!`. Employees created from the
HRD UI get the one-time password `Welcome123!`.

## Doc map

| Doc | Read it when |
|---|---|
| [architecture.md](./architecture.md) | You want the big picture: components, ports, data model, why it is microservices |
| [decisions.md](./decisions.md) | You want the *why*: ADR-style decision log with context and consequences |
| [features.md](./features.md) | You want what the app does for each use case, plus what is deliberately NOT built |
| [how-it-works.md](./how-it-works.md) | You want request flows traced through real files: login, check-in, check-out, create, deactivate |
| [development.md](./development.md) | You want to run it: bootstrap, scripts, tests, env vars, how to add a TCP command |
| [api.md](./api.md) | You want the endpoint reference: methods, roles, bodies, error codes |
| [security-and-limitations.md](./security-and-limitations.md) | You want an honest security posture and known gaps |

Each doc links back to this index and to related docs.

## Repo layout

```
dexa-group-takehome-test/
├── apps/
│   ├── api-gateway/          HTTP :3000, auth, employees, attendance, uploads, Swagger
│   ├── auth-service/         TCP :4001, users, bcrypt, JWT issue/validate/deactivate
│   ├── employee-service/     TCP :4002, master karyawan (schema: employee_db)
│   └── attendance-service/   TCP :4003, check-in/out, photo refs (schema: attendance_db)
├── libs/
│   ├── contracts/            TCP patterns, enums, DTOs (single source of truth)
│   └── common/               JwtAuthGuard, RolesGuard, decorators, filters, loadConfig, wibDateOf
├── web/                      React 19 + Vite + Tailwind + shadcn/ui SPA (:5173)
├── docker/                   compose file + mysql/init.sql
├── tools/                    backend-test.cjs (isolated *_test schemas), assert-docs.cjs
├── uploads/                  photo files served at /uploads (gitignored except placeholder.png)
├── docker-compose.yml
├── .env.example              all env vars documented
└── README.md                 quickstart, stack table, deliverable checklist
```

The web app has its own notes in [web/README.md](../web/README.md).

Prisma schemas and migrations live per service under `apps/<service>/prisma/`.
Generated Prisma clients are app-local (`apps/<service>/generated/client`, gitignored).

## Where to start

- New to the code? [architecture.md](./architecture.md), then [how-it-works.md](./how-it-works.md).
- About to change behavior? [decisions.md](./decisions.md) first so you do not undo a deliberate choice.
- Onboarding / running the stack? [development.md](./development.md).
- Contract questions (routes, roles, error codes)? [api.md](./api.md).
- Threat model / what is intentionally weak? [security-and-limitations.md](./security-and-limitations.md).

---

[← Back to root README](../README.md)
