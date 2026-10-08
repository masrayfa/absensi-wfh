# attendance-service

TCP microservice: check-in / check-out with photo ref, attendance queries. Owns the `attendance_db` schema.

```bash
pnpm --filter @app/attendance-service dev            # TCP ATTENDANCE_TCP_PORT, default 4003
pnpm --filter @app/attendance-service typecheck
pnpm --filter @app/attendance-service test           # tools/backend-test.cjs --provision attendance
pnpm --filter @app/attendance-service prisma:migrate
pnpm --filter @app/attendance-service seed           # 1 sample row (fixed date, idempotent)
```

- DB: `DATABASE_URL_ATTENDANCE`, schema `prisma/schema.prisma`, model `Attendance` — one row per employee per WIB day (`@@unique([employeeId, date])`)
- Entry: `src/main.ts` → `src/attendance/attendance.controller.ts` → `attendance.service.ts` → `attendance.repository.ts`
- Handles: `ATTENDANCE_CHECK_IN`, `ATTENDANCE_CHECK_OUT`, `ATTENDANCE_LIST`, `ATTENDANCE_GET`
- `date` = WIB business day (`wibDateOf` from `libs/common`), `checkInAt`/`checkOutAt` = UTC instants, `photoUrl` = public path (`/uploads/...`), never filesystem
- `employeeId`/`employeeName`/`userId` are snapshots — joins by id/email, no cross-schema FK
- Docs: [`docs/architecture.md`](../../docs/architecture.md) · [`docs/how-it-works.md`](../../docs/how-it-works.md)

---

Part of the Absensi WFH monorepo. Start at the [root README](../../README.md) and the [documentation index](../../docs/README.md).
