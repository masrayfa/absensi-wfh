# syntax=docker/dockerfile:1
# Build context is the repo ROOT (see docker-compose.yml), because the image
# needs the pnpm workspace: shared libs first, then this app.
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL; ca-certificates for the engine download.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@11.5.3

WORKDIR /repo
ENV NODE_ENV=production

# Manifests first: the dependency layer is cached until the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY libs/contracts/package.json libs/contracts/
COPY libs/common/package.json libs/common/
COPY apps/auth-service/package.json apps/auth-service/
COPY apps/employee-service/package.json apps/employee-service/
COPY apps/attendance-service/package.json apps/attendance-service/
COPY apps/api-gateway/package.json apps/api-gateway/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile

COPY libs ./libs
COPY apps/auth-service ./apps/auth-service

# libs -> dist/; Prisma client -> app-local generated/; app -> dist/.
# The generated client is copied into dist/ so the compiled relative import
# (dist/src/prisma/prisma.service.js -> ../../generated/client) resolves at runtime.
RUN pnpm build:libs \
 && pnpm --filter @app/auth-service prisma:generate \
 && pnpm --filter @app/auth-service build \
 && cp -r apps/auth-service/generated apps/auth-service/dist/generated

EXPOSE 4001

# prisma migrate deploy + idempotent seed + app. Exits non-zero if MySQL is
# unreachable (the compose healthcheck gate makes that a clear dependency error).
CMD ["sh", "-c", "pnpm --filter @app/auth-service exec prisma migrate deploy --schema prisma/schema.prisma && pnpm --filter @app/auth-service exec tsx prisma/seed.ts && node apps/auth-service/dist/src/main.js"]
