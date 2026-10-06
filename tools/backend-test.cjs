/**
 * Backend test runner with per-run schema isolation.
 *
 * Every service test run gets its own MySQL schema (`auth_test`,
 * `employee_test`, `attendance_test`): the schema is dropped and recreated,
 * migrated, and seeded before Jest starts, and the service under test is
 * pointed at it via DATABASE_URL_*. The dev schemas (`*_db`) are never used.
 *
 * Usage (from a package dir):
 *   node ../../tools/backend-test.cjs --provision auth
 *   node ../../tools/backend-test.cjs --provision auth,employee,attendance
 *
 * No `.env` is required: connection URLs fall back to the local dev default
 * (root:root@localhost:3306) and can be overridden through DATABASE_URL_*.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const SERVICES = {
  auth: {
    dir: path.join(ROOT, 'apps', 'auth-service'),
    envVar: 'DATABASE_URL_AUTH',
    devUrl: 'mysql://root:root@localhost:3306/auth_db',
    testDb: 'auth_test',
  },
  employee: {
    dir: path.join(ROOT, 'apps', 'employee-service'),
    envVar: 'DATABASE_URL_EMPLOYEE',
    devUrl: 'mysql://root:root@localhost:3306/employee_db',
    testDb: 'employee_test',
  },
  attendance: {
    dir: path.join(ROOT, 'apps', 'attendance-service'),
    envVar: 'DATABASE_URL_ATTENDANCE',
    devUrl: 'mysql://root:root@localhost:3306/attendance_db',
    testDb: 'attendance_test',
  },
};

/** High ports so a running dev stack (3000/4001-4003) is never disturbed. */
const TEST_ENV = {
  AUTH_TCP_PORT: '4101',
  EMPLOYEE_TCP_PORT: '4102',
  ATTENDANCE_TCP_PORT: '4103',
  GATEWAY_PORT: '3100',
  JWT_SECRET: 't17-backend-test-secret',
};

const UPLOAD_DIR = path.join(
  os.tmpdir(),
  `dexa-t17-uploads-${process.pid}-${Date.now()}`,
);

/**
 * `pnpm -r test` runs packages concurrently, so backend packages must
 * serialize: one package's `migrate reset` would otherwise drop the schema
 * another is seeding/testing. An atomic mkdir is the lock; a crashed holder
 * is discarded after LOCK_TIMEOUT_MS.
 */
const LOCK_DIR = path.join(os.tmpdir(), 'dexa-t17-backend-test.lock');
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock() {
  const start = Date.now();
  let waited = false;
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (!waited) {
        console.log('[backend-test] waiting for another backend test run to finish...');
        waited = true;
      }
      if (Date.now() - start > LOCK_TIMEOUT_MS) {
        console.error('[backend-test] lock wait timed out; discarding a stale lock');
        rmSync(LOCK_DIR, { recursive: true, force: true });
      }
      sleep(1000);
    }
  }
}

function releaseLock() {
  rmSync(LOCK_DIR, { recursive: true, force: true });
}

function parseProvision() {
  const argv = process.argv.slice(2);
  const flag = argv.find((a) => a === '--provision' || a.startsWith('--provision='));
  if (!flag) {
    console.error('[backend-test] missing --provision auth[,employee,attendance]');
    process.exit(2);
  }
  const value = flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : argv[argv.indexOf(flag) + 1];
  const names = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const name of names) {
    if (!SERVICES[name]) {
      console.error(`[backend-test] unknown service "${name}" (expected auth|employee|attendance)`);
      process.exit(2);
    }
  }
  if (names.length === 0) {
    console.error('[backend-test] --provision needs at least one service');
    process.exit(2);
  }
  return names;
}

/** A cloned dev URL with only the schema name swapped for the test schema. */
function testUrlFor(service) {
  const raw = process.env[service.envVar] ?? service.devUrl;
  const url = new URL(raw);
  url.pathname = `/${service.testDb}`;
  return url.toString();
}

function packageDir(fromDir, name) {
  const dir = path.join(fromDir, 'node_modules', name);
  if (!existsSync(path.join(dir, 'package.json'))) {
    throw new Error(`[backend-test] cannot find package "${name}" in ${fromDir}`);
  }
  return dir;
}

function binIn(fromDir, pkg, binName) {
  const pkgDir = packageDir(fromDir, pkg);
  const json = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const bin = json.bin;
  const rel = typeof bin === 'string' ? bin : bin && bin[binName];
  if (!rel) throw new Error(`[backend-test] package "${pkg}" has no bin "${binName}"`);
  return path.join(pkgDir, rel);
}

function run(command, args, opts) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...opts });
  if (result.status !== 0) {
    throw new Error(
      `[backend-test] FAILED (exit ${result.status ?? 'signal'}): ${command} ${args.join(' ')}`,
    );
  }
}

/** libs/dist is gitignored, so a fresh clone must build the shared libs first. */
function ensureLibsBuilt() {
  const tsc = binIn(ROOT, 'typescript', 'tsc');
  for (const lib of ['libs/contracts', 'libs/common']) {
    if (!existsSync(path.join(ROOT, lib, 'dist', 'index.js'))) {
      console.log(`[backend-test] building ${lib}`);
      run(process.execPath, [tsc, '-p', path.join(ROOT, lib)], { cwd: ROOT });
    }
  }
}

function provisionService(name) {
  const service = SERVICES[name];
  const url = testUrlFor(service);
  const env = { ...process.env, [service.envVar]: url };

  console.log(`[backend-test] provisioning ${name} -> ${url}`);
  const prisma = binIn(service.dir, 'prisma', 'prisma');
  run(
    process.execPath,
    [prisma, 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate', '--schema', 'prisma/schema.prisma'],
    { cwd: service.dir, env },
  );
  run(process.execPath, [prisma, 'generate', '--schema', 'prisma/schema.prisma'], {
    cwd: service.dir,
    env,
  });
  const tsx = binIn(service.dir, 'tsx', 'tsx');
  run(process.execPath, [tsx, 'prisma/seed.ts'], { cwd: service.dir, env });
}

function runJest() {
  const jest = binIn(process.cwd(), 'jest', 'jest');
  const env = {
    ...process.env,
    DATABASE_URL_AUTH: testUrlFor(SERVICES.auth),
    DATABASE_URL_EMPLOYEE: testUrlFor(SERVICES.employee),
    DATABASE_URL_ATTENDANCE: testUrlFor(SERVICES.attendance),
    ...TEST_ENV,
    UPLOAD_DIR,
  };
  const result = spawnSync(
    process.execPath,
    ['--experimental-vm-modules', jest, '--runInBand'],
    { cwd: process.cwd(), env, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function main() {
  const services = parseProvision();
  acquireLock();
  let exitCode = 0;
  try {
    ensureLibsBuilt();
    for (const name of services) provisionService(name);

    mkdirSync(UPLOAD_DIR, { recursive: true });
    try {
      exitCode = runJest();
    } finally {
      rmSync(UPLOAD_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`\n${err instanceof Error ? err.message : String(err)}`);
    exitCode = 1;
  } finally {
    releaseLock();
  }
  process.exitCode = exitCode;
}

main();
