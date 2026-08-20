# syntax=docker/dockerfile:1.7

# The migration runner.
#
# A separate image from the API on purpose. Migrations must run exactly once per
# deploy, before the new API starts, and never concurrently from every replica —
# so they are a job with its own lifecycle, not something the API does on boot.
# An API that migrates at startup races itself the moment it scales past one.
#
# It also carries the Prisma CLI, which the API image deliberately does not: the
# thing serving traffic has no business being able to alter the schema.

FROM oven/bun:1.2.20 AS deps
WORKDIR /repo

COPY package.json bun.lock ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY packages/contracts/package.json ./packages/contracts/

RUN bun install --frozen-lockfile

FROM deps AS runtime
WORKDIR /repo/server

COPY packages/contracts /repo/packages/contracts
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./prisma.config.ts

ENV NODE_ENV=production

# `migrate deploy` applies pending migrations and nothing else. It never
# generates, never resets, and never prompts — which is what makes it the only
# migration command that belongs in an automated deploy.
CMD ["bun", "x", "prisma", "migrate", "deploy"]
