# syntax=docker/dockerfile:1.7

# The API image.
#
# Built on Node rather than Bun: Bun is the workspace's package manager and test
# runner, but the API runs `node dist/index.js` in production, and the runtime a
# deployment is tested on should be the runtime it ships on.
#
# Three stages, so the shipped image carries no compiler, no dev dependency, and
# no source. What reaches production is `dist`, the production dependency tree,
# and the generated Prisma client.

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
FROM oven/bun:1.2.20 AS deps
WORKDIR /repo

# Only the manifests, so this layer is rebuilt when dependencies change and not
# when a source file does.
COPY package.json bun.lock ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY packages/contracts/package.json ./packages/contracts/

RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo

COPY packages/contracts ./packages/contracts
COPY server ./server

# Generates the Prisma client and compiles TypeScript. `DATABASE_URL` is not
# needed: generation reads the schema file, not the database.
RUN bun run --cwd server build

# Reinstall with dev dependencies pruned, so only what production needs is
# copied into the final stage.
RUN bun install --frozen-lockfile --production

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /repo/server

ENV NODE_ENV=production

# `yt-dlp` and `ffmpeg` back the caption-less YouTube import fallback. Installed
# here rather than assumed on the host, because a fallback that silently does not
# exist is worse than one that is switched off deliberately — set
# YOUTUBE_AUDIO_FALLBACK=0 to switch it off.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        ffmpeg \
        python3 \
        tini \
        wget \
    && wget -q -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get purge -y wget \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/packages /repo/packages
COPY --from=build /repo/server/node_modules /repo/server/node_modules
COPY --from=build /repo/server/dist /repo/server/dist
COPY --from=build /repo/server/prisma /repo/server/prisma
COPY --from=build /repo/server/package.json /repo/server/package.json

# Never root. The image installs nothing at runtime, so it does not need to be.
USER node

EXPOSE 8080

# The process must see SIGTERM to shut down gracefully. Without an init, PID 1
# ignores signals it has no handler for, and the platform's SIGKILL arrives
# mid-request instead.
ENTRYPOINT ["/usr/bin/tini", "--"]

# Liveness only. Readiness is `/health/ready`, and it belongs to the load
# balancer: an instance whose database is briefly unreachable should stop
# receiving traffic, not be restarted.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
