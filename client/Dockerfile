# syntax=docker/dockerfile:1.7

# The web client image.
#
# Uses Next's standalone output, so the runtime stage carries a traced bundle
# and its own minimal `server.js` rather than the whole dependency tree. File
# tracing is rooted at the workspace root — see `outputFileTracingRoot` in
# `next.config.ts` — because this app imports the contracts package, and a bundle
# that omits it starts fine and then fails on the first render.

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
FROM oven/bun:1.2.20 AS deps
WORKDIR /repo

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
COPY client ./client

# The publishable key is inlined into the client bundle at build time, so it has
# to be present here rather than only at runtime. It is publishable by
# definition; the secret key is a runtime variable and is deliberately not a
# build argument, so it can never end up in an image layer.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG API_URL=http://api:8080
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    API_URL=$API_URL \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1

RUN bun run --cwd client build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# The standalone bundle mirrors the workspace layout, so the app's own server
# lives under `client/`.
COPY --from=build /repo/client/.next/standalone ./
COPY --from=build /repo/client/.next/static ./client/.next/static
COPY --from=build /repo/client/public ./client/public

USER node

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "client/server.js"]
