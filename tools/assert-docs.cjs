/**
 * Asserts that the running api-gateway's Swagger document (/docs-json) exposes
 * every expected route, and that each operation is tagged, has a summary, and
 * carries bearer auth unless it is deliberately public.
 *
 * Usage:
 *   node tools/assert-docs.cjs [--base-url http://localhost:3000] [--timeout 60]
 *
 * Node built-ins only (global fetch). Exits 0 when all assertions pass.
 */
'use strict';

const EXPECTED = [
  { method: 'get', path: '/health', public: true },
  { method: 'post', path: '/auth/login', public: true },
  { method: 'get', path: '/auth/me' },
  { method: 'get', path: '/employees' },
  { method: 'post', path: '/employees' },
  { method: 'get', path: '/employees/{id}' },
  { method: 'patch', path: '/employees/{id}' },
  { method: 'patch', path: '/employees/{id}/deactivate' },
  { method: 'post', path: '/attendance/check-in' },
  { method: 'post', path: '/attendance/check-out' },
  { method: 'get', path: '/attendance/me' },
  { method: 'get', path: '/attendance' },
  { method: 'get', path: '/attendance/{id}' },
];

function arg(name, fallback) {
  const flag = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!flag) return fallback;
  return flag.includes('=') ? flag.slice(flag.indexOf('=') + 1) : process.argv[process.argv.indexOf(flag) + 1];
}

const BASE_URL = (arg('base-url', process.env.BASE_URL) ?? 'http://localhost:3000').replace(/\/+$/, '');
const TIMEOUT_MS = Number(arg('timeout', '60')) * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchDocsJson() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError = 'no attempt made';
  for (;;) {
    try {
      const res = await fetch(`${BASE_URL}/docs-json`);
      if (res.ok) return res.json();
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (Date.now() >= deadline) {
      throw new Error(`gateway not reachable at ${BASE_URL}/docs-json within ${TIMEOUT_MS / 1000}s (last: ${lastError})`);
    }
    await sleep(1000);
  }
}

function main(doc) {
  const failures = [];
  if (!doc || typeof doc !== 'object' || !doc.paths) {
    failures.push('document has no `paths` object');
  } else {
    for (const { method, path, public: isPublic } of EXPECTED) {
      const operation = doc.paths[path]?.[method];
      const label = `${method.toUpperCase()} ${path}`;
      if (!operation) {
        failures.push(`${label}: MISSING`);
        continue;
      }
      const tags = operation.tags ?? [];
      const summary = operation.summary;
      const security = operation.security ?? [];
      if (tags.length === 0) failures.push(`${label}: has no tag`);
      if (typeof summary !== 'string' || summary.trim() === '') failures.push(`${label}: has no summary`);
      const hasBearer = security.some((s) => Object.prototype.hasOwnProperty.call(s, 'bearer'));
      if (!isPublic && !hasBearer) failures.push(`${label}: missing bearer security`);
      if (isPublic && hasBearer) failures.push(`${label}: is public but declares bearer security`);
      if (!failures.some((f) => f.startsWith(label))) {
        console.log(`  ok  ${label.padEnd(45)} tag=${tags.join(',')}${isPublic ? ' [public]' : ' [bearer]'}`);
      }
    }
  }

  const covered = EXPECTED.length;
  if (failures.length > 0) {
    console.error(`\nassert-docs: FAIL (${failures.length} problem(s) over ${covered} expected operations)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nassert-docs: PASS — ${covered}/${covered} expected operations present, tagged, summarized, auth-correct`);
}

fetchDocsJson()
  .then(main)
  .catch((err) => {
    console.error(`assert-docs: FAIL — ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
