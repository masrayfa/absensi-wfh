# api-gateway

HTTP entry point. Validates JWT + roles, stores photo uploads, serves them at `/uploads`, exposes Swagger at `/docs`, forwards TCP commands to the three services. **Owns no database.**

```bash
pnpm --filter @app/api-gateway dev        # GATEWAY_PORT, default 3000
pnpm --filter @app/api-gateway typecheck
pnpm --filter @app/api-gateway test       # e2e via tools/backend-test.cjs (provisions all 3 services)
```

- Entry: `src/main.ts` (ValidationPipe, `GatewayExceptionFilter`, CORS, Swagger), `src/app.module.ts` (`JwtAuthGuard` + `RolesGuard` as `APP_GUARD`, static uploads)
- TCP clients: `src/common/tcp-clients.module.ts` — `ClientProxy` tokens `AUTH` / `EMPLOYEE` / `ATTENDANCE`
- Routes: `auth` (login `@Public`, me), `employees` (HRD), `attendance` (check-in/out/me = EMPLOYEE, list/get = HRD), `health` (`@Public`)
- Thin orchestrators: each `*.service.ts` is `client.send(TCP_PATTERNS.X, dto)` + `firstValueFrom`
- Docs: [`docs/architecture.md`](../../docs/architecture.md) · [`docs/api.md`](../../docs/api.md)

---

Part of the Absensi WFH monorepo. Start at the [root README](../../README.md) and the [documentation index](../../docs/README.md).
