# syntax=docker/dockerfile:1
# Build context is the repo ROOT (see docker-compose.yml), because the image
# needs the pnpm workspace: shared libs first, then the gateway.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
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
COPY apps/api-gateway ./apps/api-gateway

# libs -> dist/ (workspace deps resolve via node_modules symlinks), gateway -> dist/.
RUN pnpm build:libs \
 && pnpm --filter @app/api-gateway build

EXPOSE 3000

CMD ["node", "apps/api-gateway/dist/src/main.js"]
