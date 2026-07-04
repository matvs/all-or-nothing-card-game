# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# All or Nothing (SET) — one Node service serving the built frontend AND the
# REST + Socket.IO API on a single port (default 8462), same-origin.
#
# glibc base (node:22-bookworm-slim) per the WSL2 deployment doctrine. There is
# NO native module and NO database: multiplayer rooms live in memory and solo
# high scores live in the browser's localStorage, so the image is stateless and
# needs no volume or chown dance.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install deps against a cached layer (re-runs only when the lockfile changes).
COPY package.json package-lock.json ./
RUN npm ci

# Build the frontend bundle into dist/.
COPY . .
RUN npm run build

# Drop dev-only dependencies; keep tsx (used to run the TS server at runtime).
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8462

# tini for correct signal handling (graceful shutdown on SIGTERM).
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# Copy the pruned dependency tree and the app (server + shared TS run via tsx).
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/shared ./shared
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json

USER node
EXPOSE 8462

HEALTHCHECK --interval=30s --timeout=4s --start-period=8s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8462)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "server/index.ts"]
