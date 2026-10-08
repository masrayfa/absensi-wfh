# employee-service

TCP microservice: master karyawan (create / list / get / update / deactivate / hard delete, INACTIVE only). Owns the `employee_db` schema.

```bash
pnpm --filter @app/employee-service dev            # TCP EMPLOYEE_TCP_PORT, default 4002
pnpm --filter @app/employee-service typecheck
pnpm --filter @app/employee-service test           # tools/backend-test.cjs --provision employee
pnpm --filter @app/employee-service prisma:migrate
```

- DB: `DATABASE_URL_EMPLOYEE`, schema `prisma/schema.prisma`, model `Employee` (employeeNo, fullName, email unique, department, position, status)
- Entry: `src/main.ts` → `src/employee/employee.controller.ts` → `employee.service.ts` → `employee.repository.ts`
- Handles: `EMPLOYEE_CREATE`, `EMPLOYEE_LIST`, `EMPLOYEE_GET_BY_ID`, `EMPLOYEE_GET_BY_EMAIL`, `EMPLOYEE_UPDATE`, `EMPLOYEE_DEACTIVATE`, `EMPLOYEE_HARD_DELETE`
- `email` is the identity join key to `auth_db` — no cross-schema FK. DTOs have no `status` field (see [`docs/decisions.md`](../../docs/decisions.md)).
- Docs: [`docs/architecture.md`](../../docs/architecture.md) · [`docs/features.md`](../../docs/features.md)

---

Part of the Absensi WFH monorepo. Start at the [root README](../../README.md) and the [documentation index](../../docs/README.md).
