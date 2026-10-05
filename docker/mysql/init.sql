-- Initializes the three per-service schemas for the WFH attendance app.
-- Mounted at /docker-entrypoint-initdb.d/init.sql (runs once on first boot).
-- ponytail: only schemas here; each service owns its own Prisma migrations.

CREATE DATABASE IF NOT EXISTS auth_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS employee_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS attendance_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
