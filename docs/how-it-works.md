# How it works

Step-by-step request flows with the real code paths, the error → HTTP mapping,
the guard model, and the WIB date logic. For routes and payloads see
[api.md](./api.md); for design rationale see [decisions.md](./decisions.md).

[Index](./README.md) · [Architecture](./architecture.md) · [API](./api.md) · [Development](./development.md)

## Guards, decorators, and the global pipeline

Registered in `apps/api-gateway/src/app.module.ts`:

```
APP_GUARD → JwtAuthGuard   (libs/common/src/guards/index.ts)
APP_GUARD → RolesGuard
```

| Decorator | File | Behavior |
|---|---|---|
| `@Public()` | `libs/common/src/decorators/index.ts` | `JwtAuthGuard` skips the route (`GET /health`, `POST /auth/login`) |
| `@Roles(Role.HRD)` / `@Roles(Role.EMPLOYEE)` | same | `RolesGuard` compares `request.user.role` to the metadata; mismatch → 403 `Insufficient role` |
| `@CurrentUser()` / `@CurrentUser('email')` / `@CurrentUser('sub')` | same | Injects the verified JWT payload (or one claim) into the handler |

`JwtAuthGuard` extracts `Authorization: Bearer <token>`, verifies with
`JwtService` (secret `JWT_SECRET`, set in
`apps/api-gateway/src/app.module.ts`), and attaches
`{ sub, email, role }` to `request.user`. Missing token → 401
`Missing bearer token`; bad/expired → 401 `Invalid or expired token`.

Global request pipeline (`apps/api-gateway/src/main.ts`):

- `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false })`
 , unknown body keys are **stripped** (this is why a client-supplied
  `status` on create/update is ignored, see ADR-12).
- `GatewayExceptionFilter`, maps upstream RPC errors to HTTP (below).
- CORS: `origin: config.webOrigin` (default `http://localhost:5173`).

## Error → HTTP mapping

**Services** throw Nest `HttpException`s (e.g. `UnauthorizedException`,
`ConflictException`, `NotFoundException`). Over TCP those would flatten to
"Internal server error", so each service registers
`RpcHttpExceptionFilter`
(`apps/<service>/src/common/rpc-http-exception.filter.ts`) which converts them
to `RpcException({ statusCode, message })`.

**Gateway** receives the deserialized object (not an `RpcException` instance)
and matches it structurally in
`apps/api-gateway/src/common/gateway-exception.filter.ts`:

| Upstream shape | Gateway response |
|---|---|
| `{ statusCode: 4xx/5xx, message }` | Same status, body `{ statusCode, error: 'UpstreamError' \| 'BadGateway', message, path, timestamp }` |
| Any local `HttpException` | Its own status/message via shared `AllExceptionsFilter` (`libs/common/src/filters/index.ts`) |
| Anything else | 500 `{ statusCode: 500, error: 'InternalServerError', message: 'Internal server error', path, timestamp }` |

So a service's 409 `ConflictException` comes back as HTTP 409 with the same
message; a dead TCP service typically surfaces as 502-class upstream errors.

## Flow 1: Login

```
Browser (LoginPage.tsx)
  POST /auth/login { email, password }          [JwtAuthGuard: @Public]
    → apps/api-gateway/src/auth/auth.controller.ts  login()
    → apps/api-gateway/src/auth/auth.service.ts     authClient.send(AUTH_LOGIN, dto)
    → TCP :4001 apps/auth-service/src/auth/auth.controller.ts  @MessagePattern(AUTH_LOGIN)
    → apps/auth-service/src/auth/auth.service.ts    login()
         UserRepository.findByEmail(email)
         if !user || !user.isActive → 401 'Invalid email or password'
         bcrypt.compare(password, user.passwordHash)   // BCRYPT_COST = 12
         if !match → 401 (same message)
         jwt.signAsync({ sub, email, role })           // 8h, JWT_SECRET
  ← { accessToken, user: { id, email, role } }         // HTTP 200 (@HttpCode)

Web: setSession(...) → localStorage 'absensi.session'
     navigate(homePathFor(role))   // HRD → /hrd/karyawan, EMPLOYEE → /absen
```

Notes:

- Uniform error string is defined once as `AUTH_FAILED` in
  `apps/auth-service/src/auth/auth.service.ts` (anti-enumeration).
- Deactivated users fail the `isActive` check with that same message.
- `AUTH_VALIDATE` also exists (token + isActive re-check) but the gateway does
  **not** call it on this path; verification is offline in `JwtAuthGuard`.

## Flow 2: Multipart check-in (photo required)

```
Browser (AbsenPage.tsx → useCheckIn in web/src/features/attendance/queries.ts)
  POST /attendance/check-in   multipart field "photo"   [RolesGuard: EMPLOYEE]
    → apps/api-gateway/src/attendance/attendance.controller.ts  checkIn()
         FileInterceptor('photo', { diskStorage → uploadRoot,
            filename: randomUUID() + PHOTO_EXTENSIONS[mimetype],
            limits: { fileSize: 5MB },
            fileFilter: raster allowlist only })        // png/jpeg/webp/gif
         if (!photo) throw BadRequestException('photo is required')
         photoUrl = `/uploads/${photo.filename}`
    → apps/api-gateway/src/attendance/attendance.service.ts  checkIn(email, userId, photoUrl)
         currentEmployee(email):
           EMPLOYEE_GET_BY_EMAIL → employee-service
           if employee.status !== ACTIVE → 403 'Employee account is deactivated'
         ATTENDANCE_CHECK_IN { employeeId, employeeName, userId, photoUrl }
    → TCP :4003 apps/attendance-service/... attendance.controller.ts @MessagePattern
    → apps/attendance-service/src/attendance/attendance.service.ts  checkIn(dto)
         require photoUrl (empty/whitespace → 400)
         date = dateOnly(wibDateOf(new Date()))          // WIB business day
         attendance.create({ ..., checkInAt: new Date(), photoUrl })
         catch P2002 → findByEmployeeAndDate(employeeId, date)   // idempotent
  ← AttendanceRecord { id, employeeId, employeeName, userId, date,
                       checkInAt, checkOutAt: null, photoUrl, note }
```

File safety (gateway):

- Extension comes from the fixed `PHOTO_EXTENSIONS` map, never the client
  filename (`apps/api-gateway/src/attendance/attendance.controller.ts`).
- `image/svg+xml` is not in the map (active content).
- `/uploads` static serving adds `X-Content-Type-Options: nosniff`
  (`apps/api-gateway/src/app.module.ts`).
- `uploadRoot` is resolved in `apps/api-gateway/src/common/uploads.ts` by
  walking up to `pnpm-workspace.yaml`, so relative `UPLOAD_DIR=./uploads`
  always lands at the repo root (matches the seeded
  `/uploads/placeholder.png`).

## Flow 3: Check-out

```
POST /attendance/check-out   [RolesGuard: EMPLOYEE]   (no body needed)
  → gateway attendance.controller.ts  checkOut(@CurrentUser('email'))
  → gateway attendance.service.ts
       currentEmployee(email)   // same ACTIVE check as check-in
       ATTENDANCE_CHECK_OUT { employeeId }
  → attendance-service checkOut({ employeeId })
       date = dateOnly(wibDateOf(new Date()))
       repository.checkOutOpen(employeeId, date, new Date()):
         prisma.attendance.updateMany({
           where: { employeeId, date, checkOutAt: null },   // atomic guard
           data:  { checkOutAt: at },
         })
         count === 0 → null
       if !closed → 409 'No open attendance for today — check in first or already checked out'
  ← AttendanceRecord (checkOutAt set)
```

`updateMany` with the `checkOutAt: null` filter means concurrent check-outs
cannot both "win": the second matches zero rows and gets the 409.

## Flow 4: Employee create (orchestrated across services)

```
POST /employees   [RolesGuard: HRD]   CreateEmployeeDto
  → apps/api-gateway/src/employee/employee.service.ts  create(dto)
       EMPLOYEE_CREATE dto
         → employee-service create():
              assertUnique(employeeNo, email)     // pre-flight 409s
              employees.create(...)               // P2002 backstop → 409
       AUTH_CREATE_USER { email }
         → auth-service createUser():
              bcrypt.hash(DEFAULT_PASSWORD='Welcome123!', 12)
              users.create({ email, passwordHash })  // role defaults EMPLOYEE
              P2002 → 409 `User <email> already exists`
       on auth failure:
              compensateCreate(employee.id)   // best-effort EMPLOYEE_DEACTIVATE
              rethrow auth error
  ← CreatedEmployee { ...employee, defaultPassword: 'Welcome123!' }   // HTTP 201
```

Compensation is best-effort and never masks the original error
(`compensateCreate` swallows its own failures). Rationale: email uniqueness
means a retry of the same request would otherwise hit the employee conflict
first; deactivating the orphan row leaves a retryable state.

## Flow 5: Deactivate (auth-first)

```
PATCH /employees/{id}/deactivate   [RolesGuard: HRD]
  → gateway employee.service.ts  deactivate(id)
       1. EMPLOYEE_GET_BY_ID { id }        → 404 if missing
       2. AUTH_DEACTIVATE_USER { email }   → User.updateMany({ isActive: false })  // idempotent
       3. EMPLOYEE_DEACTIVATE { id }       → status = INACTIVE (soft delete)
       order is asserted by apps/api-gateway/test/employee.service.spec.ts
  ← Employee row (status INACTIVE)
```

Why auth-first (ADR-11 in [decisions.md](./decisions.md)): if step 2 fails the
row is untouched (safe retry). If step 3 fails after step 2, the login is
already disabled, the dangerous state (active login on a deactivated record)
cannot occur.

Effect after deactivation (even with a still-valid 8h JWT):

- Fresh login → 401.
- Attendance routes → 403 via `currentEmployee` ACTIVE check
  (`apps/api-gateway/src/attendance/attendance.service.ts`).
- Employee list: excluded by default (`status` filter defaults to ACTIVE);
  visible with `?status=INACTIVE`.

## Flow 5b: Hard delete (INACTIVE only)

```
DELETE /employees/{id}   [RolesGuard: HRD]
  → gateway employee.service.ts  remove(id)
       1. EMPLOYEE_GET_BY_ID { id }      → 404 if missing
       2. INACTIVE gate                  → 400 `Deactivate the employee before deleting`
                                           (only when status is not INACTIVE)
       3. AUTH_DELETE_USER { email }     → user.deleteMany({ email })  // idempotent
       4. EMPLOYEE_HARD_DELETE { id }    → row delete; concurrent vanish → 404
  ← deleted Employee row
```

Order is asserted by `apps/api-gateway/test/employee.service.spec.ts`
(`EmployeeService.remove` block). employee-service `remove()` re-checks the
INACTIVE gate itself and maps a concurrent P2025 row vanish to 404.

The INACTIVE gate runs before the login delete (same auth-first posture as
Flow 5): if step 3 fails the row is untouched (safe retry). If step 4 fails
after step 3, the employee stays INACTIVE with no login, locked out and
retryable, never an active login left behind.

## Flow 6: HRD monitoring list / get

```
GET /attendance?employeeId&from&to   [RolesGuard: HRD]
  → gateway attendance.controller.ts  list(@Query() ListAttendanceQueryDto)
  → gateway attendance.service.ts     list(query)
       ATTENDANCE_LIST query
  → attendance-service list({ employeeId, from, to })
       where: employeeId?, date gte dateOnly(from) / lte dateOnly(to)
       orderBy: { date: 'desc' }
  ← AttendanceRecord[]

GET /attendance/{id}   [RolesGuard: HRD]
  → ATTENDANCE_GET { id } → findUnique; missing → 404 `Attendance <id> not found`
```

`GET /attendance/me` is the same list path but the gateway overwrites
`employeeId` with the caller's resolved employee id (`listMine`), so an
EMPLOYEE token can never widen the filter. HRD tokens get 403 on `/attendance/me`
(`@Roles(EMPLOYEE)`) and EMPLOYEE tokens get 403 on `/attendance`
(`@Roles(HRD)`).

## WIB date logic (end to end)

```
instant (UTC)                    business date (WIB, UTC+7)
────────────────────────────────────────────────────────────
new Date()                 →    wibDateOf()  →  'YYYY-MM-DD'
                                   │
libs/common/src/wib.ts:             │  WIB_OFFSET_MS = 7h; read UTC parts
                                   │  16:30Z → same WIB day; 17:30Z → next WIB day
                                   ▼
attendance-service:          dateOnly(wibDateOf(now))  →  Date at UTC midnight
attendance.repository.ts:    new Date(`${value.slice(0,10)}T00:00:00.000Z`)
                                   │
                                   ▼
Prisma @db.Date column `Attendance.date`     (unique with employeeId)
```

Check-in and check-out both derive the date the same way, so "today's open
record" and "today's idempotency key" agree. Inclusive `from`/`to` filters use
the same `dateOnly` normalisation. The web UI formats display times with
`Intl.DateTimeFormat(..., { timeZone: 'Asia/Jakarta' })`
(`AbsenPage.tsx`, `RiwayatPage.tsx`) so users read server times in WIB.

## Web request path (common)

```
feature component
  → TanStack Query hook (web/src/features/*/queries.ts)
  → api client (web/src/lib/api.ts)
       baseURL = VITE_API_URL || 'http://localhost:3000'
       request interceptor: Authorization: Bearer <session.accessToken>
       response interceptor: on 401 → clearSession() (localStorage 'absensi.session')
  → gateway route (guards above)
```

401 anywhere clears the session; the router then bounces the user to `/login`
via `RequireAuth`.

---

[Index](./README.md) · [Architecture](./architecture.md) · [Features](./features.md) · [API](./api.md)
