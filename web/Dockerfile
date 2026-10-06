# syntax=docker/dockerfile:1
# Build context is the repo ROOT (see docker-compose.yml): the SPA imports
# @app/contracts, so the pnpm workspace + shared libs must be present.
FROM node:22-bookworm-slim AS build

RUN npm install -g pnpm@11.5.3

WORKDIR /repo

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
COPY web ./web

# API base URL is baked into the bundle at build time (Vite inlines env vars).
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm build:libs \
 && pnpm --filter web build

FROM nginx:alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/web/dist /usr/share/nginx/html

EXPOSE 80
