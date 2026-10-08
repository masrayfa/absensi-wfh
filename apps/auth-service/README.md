# auth-service

TCP microservice: users, bcrypt hashing, JWT issue/validate/deactivate. Owns the `auth_db` schema.

```bash
pnpm --filter @app/auth-service dev            # TCP AUTH_TCP_PORT, default 4001
pnpm --filter @app/auth-service typecheck
pnpm --filter @app/auth-service test           # tools/backend-test.cjs --provision auth
pnpm --filter @app/auth-service prisma:migrate
pnpm --filter @app/auth-service seed           # demo logins (hrd@dexa.test / Password123!)
```

- DB: `DATABASE_URL_AUTH`, schema `prisma/schema.prisma`, model `User` (email, passwordHash, role, isActive)
- Entry: `src/main.ts` → `src/auth/auth.controller.ts` (MessagePattern handlers) → `src/user/user.repository.ts`
- Handles: `AUTH_LOGIN`, `AUTH_VALIDATE`, `AUTH_CREATE_USER`, `AUTH_DEACTIVATE_USER`, `AUTH_DELETE_USER` (patterns in `libs/contracts`)
- Errors serialize to `{statusCode, message}` via `src/common/rpc-http-exception.filter.ts`
- Docs: [`docs/architecture.md`](../../docs/architecture.md) · [`docs/how-it-works.md`](../../docs/how-it-works.md)

---

Part of the Absensi WFH monorepo. Start at the [root README](../../README.md) and the [documentation index](../../docs/README.md).
