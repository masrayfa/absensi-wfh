#!/usr/bin/env python3
"""Static validation for docker-compose.yml + Dockerfiles (plan Todo 20).

Docker is unavailable on the machine this was authored on, so this script
replaces the live `docker compose up` check with structural assertions:
parse the YAML, assert every expected service/volume/port/depends_on/env, and
inspect each Dockerfile/nginx.conf/.dockerignore.

Run: python tools/validate-compose.py
Exits non-zero if any assertion fails; prints one PASS/FAIL line per check.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    suffix = f"  [{detail}]" if detail else ""
    print(f"{'PASS' if ok else 'FAIL'}  {name}{suffix}")
    if not ok:
        failures.append(name)


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


compose_path = ROOT / "docker-compose.yml"
compose_text = read("docker-compose.yml")
compose = yaml.safe_load(compose_text)
services = compose.get("services", {})
volumes = compose.get("volumes", {})

EXPECTED_SERVICES = [
    "mysql",
    "auth-service",
    "employee-service",
    "attendance-service",
    "api-gateway",
    "web",
]
for name in EXPECTED_SERVICES:
    check(f"service '{name}' defined", name in services)

check("exactly the expected services", sorted(services) == sorted(EXPECTED_SERVICES), ",".join(sorted(services)))

# ---- volumes ----------------------------------------------------------------
check("named volume 'mysql_data'", "mysql_data" in volumes)
check("named volume 'uploads'", "uploads" in volumes)
gateway_mounts = services["api-gateway"].get("volumes", [])
check(
    "uploads volume mounted into api-gateway at /uploads",
    "uploads:/uploads" in gateway_mounts,
    ",".join(gateway_mounts),
)

# ---- depends_on: mysql healthy ---------------------------------------------
for name in ("auth-service", "employee-service", "attendance-service"):
    dep = services[name].get("depends_on", {}).get("mysql", {})
    check(f"{name} depends_on mysql service_healthy", dep.get("condition") == "service_healthy")

gw_dep = services["api-gateway"].get("depends_on", {})
for name in ("auth-service", "employee-service", "attendance-service"):
    check(
        f"api-gateway depends_on {name} service_healthy",
        gw_dep.get(name, {}).get("condition") == "service_healthy",
    )
check(
    "web depends_on api-gateway service_healthy",
    services["web"].get("depends_on", {}).get("api-gateway", {}).get("condition") == "service_healthy",
)

# ---- published ports --------------------------------------------------------
check("api-gateway publishes 3000", "3000:3000" in services["api-gateway"].get("ports", []))
check("web publishes 5173 -> container 80", "5173:80" in services["web"].get("ports", []))
check("mysql publishes 3306", "3306:3306" in services["mysql"].get("ports", []))

# ---- environment wiring -----------------------------------------------------
envs = {name: services[name].get("environment", {}) for name in EXPECTED_SERVICES}

for name, var in (
    ("auth-service", "DATABASE_URL_AUTH"),
    ("employee-service", "DATABASE_URL_EMPLOYEE"),
    ("attendance-service", "DATABASE_URL_ATTENDANCE"),
):
    url = envs[name].get(var, "")
    check(f"{name}: {var} targets host 'mysql'", "@mysql:3306/" in url, url)
    check(f"{name}: {var} does not use localhost", "localhost" not in url)

for name, host_var, host_value in (
    ("api-gateway", "AUTH_TCP_HOST", "auth-service"),
    ("api-gateway", "EMPLOYEE_TCP_HOST", "employee-service"),
    ("api-gateway", "ATTENDANCE_TCP_HOST", "attendance-service"),
):
    check(
        f"{name}: {host_var}={host_value}",
        envs[name].get(host_var) == host_value,
        str(envs[name].get(host_var)),
    )

gw = envs["api-gateway"]
check("api-gateway: JWT_SECRET wired", bool(gw.get("JWT_SECRET")))
check("api-gateway: GATEWAY_PORT wired", bool(gw.get("GATEWAY_PORT")))
check("api-gateway: WEB_ORIGIN wired", bool(gw.get("WEB_ORIGIN")))
check("api-gateway: UPLOAD_DIR=/uploads", gw.get("UPLOAD_DIR") == "/uploads", str(gw.get("UPLOAD_DIR")))
for name, var in (
    ("auth-service", "AUTH_TCP_PORT"),
    ("employee-service", "EMPLOYEE_TCP_PORT"),
    ("attendance-service", "ATTENDANCE_TCP_PORT"),
):
    check(f"{name}: {var} wired", bool(envs[name].get(var)), str(envs[name].get(var)))

check("auth-service: JWT_SECRET wired", bool(envs["auth-service"].get("JWT_SECRET")))

web_args = services["web"].get("build", {}).get("args", {})
check(
    "web build arg VITE_API_URL has a default",
    "VITE_API_URL" in web_args and "localhost:3000" in str(web_args["VITE_API_URL"]),
    str(web_args.get("VITE_API_URL")),
)

# ---- every healthcheck present ---------------------------------------------
for name in EXPECTED_SERVICES:
    check(f"{name}: healthcheck defined", bool(services[name].get("healthcheck", {}).get("test")))

# ---- no required .env: every ${VAR} interpolation has a default -------------
for match in re.finditer(r"\$\{([^}]+)\}", compose_text):
    body = match.group(1)
    check(f"interpolation ${{{body}}} has a default", ":-" in body)

# ---- build contexts + Dockerfiles ------------------------------------------
for name in ("auth-service", "employee-service", "attendance-service", "api-gateway", "web"):
    build = services[name].get("build", {})
    check(f"{name}: build.context is repo root", build.get("context") == ".")
    dockerfile = build.get("dockerfile", "")
    check(f"{name}: dockerfile {dockerfile} exists", (ROOT / dockerfile).is_file(), dockerfile)

BACKENDS = {
    "auth-service": ("@app/auth-service", 4001),
    "employee-service": ("@app/employee-service", 4002),
    "attendance-service": ("@app/attendance-service", 4003),
}
for name, (pkg, port) in BACKENDS.items():
    text = read(f"apps/{name}/Dockerfile")
    checks = {
        "has base image": "FROM node:22-bookworm-slim" in text,
        "installs pnpm": "npm install -g pnpm@11.5.3" in text,
        "builds shared libs": "pnpm build:libs" in text,
        f"generates prisma client ({pkg})": f"pnpm --filter {pkg} prisma:generate" in text,
        f"builds app ({pkg})": f"pnpm --filter {pkg} build" in text,
        "copies generated client into dist": f"cp -r apps/{name}/generated apps/{name}/dist/generated" in text,
        "CMD runs prisma migrate deploy": "prisma migrate deploy" in text,
        "CMD runs seed": "tsx prisma/seed.ts" in text,
        "CMD runs compiled app (node, not ts-node)": f"node apps/{name}/dist/src/main.js" in text,
        f"EXPOSE {port}": f"EXPOSE {port}" in text,
    }
    for label, ok in checks.items():
        check(f"apps/{name}/Dockerfile: {label}", ok)

gateway_text = read("apps/api-gateway/Dockerfile")
check("apps/api-gateway/Dockerfile: builds shared libs", "pnpm build:libs" in gateway_text)
check("apps/api-gateway/Dockerfile: builds gateway", "pnpm --filter @app/api-gateway build" in gateway_text)
check(
    "apps/api-gateway/Dockerfile: CMD runs compiled app",
    "apps/api-gateway/dist/src/main.js" in gateway_text,
)
check("apps/api-gateway/Dockerfile: EXPOSE 3000", "EXPOSE 3000" in gateway_text)
check("apps/api-gateway/Dockerfile: no prisma (gateway owns no DB)", "prisma" not in gateway_text.lower())

web_text = read("web/Dockerfile")
check("web/Dockerfile: VITE_API_URL build arg", "ARG VITE_API_URL" in web_text)
check("web/Dockerfile: VITE_API_URL exported at build", "ENV VITE_API_URL=$VITE_API_URL" in web_text)
check("web/Dockerfile: builds web", "pnpm --filter web build" in web_text)
check("web/Dockerfile: nginx runtime stage", "FROM nginx" in web_text)
check("web/Dockerfile: serves built dist", "/repo/web/dist /usr/share/nginx/html" in web_text)
check("web/nginx.conf: SPA fallback", "try_files $uri $uri/ /index.html" in read("web/nginx.conf"))

dockerignore = read(".dockerignore")
for entry in ("node_modules", "dist", "generated", ".git", "uploads", ".omo", "coverage", ".env"):
    check(f".dockerignore excludes {entry}", entry in dockerignore)

# ---- summary ----------------------------------------------------------------
print("-" * 60)
if failures:
    print(f"FAILED: {len(failures)} assertion(s)")
    for name in failures:
        print(f"  - {name}")
    sys.exit(1)
print("ALL CHECKS PASSED")
