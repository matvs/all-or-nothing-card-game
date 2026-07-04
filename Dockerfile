# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# All or Nothing — single Node service that serves the built frontend AND the
# REST + WebSocket API on one port (default 8462).
#
# Multi-stage: the builder compiles the frontend bundle and the native
# better-sqlite3 addon (needs python3/make/g++); the slim runtime carries only
# node_modules + built dist/ + the TypeScript sources (run on the fly by tsx).
# Both stages share node:20-alpine so the musl-linked native addon matches.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS builder
WORKDIR /app

# Toolchain for node-gyp (better-sqlite3). Removed with the whole stage.
RUN apk add --no-cache python3 make g++

# Install dependencies against a cached layer (only re-runs when the lockfile
# changes). npm ci needs the lockfile to be in sync with package.json.
COPY package.json package-lock.json ./
RUN npm ci

# Build the frontend into dist/.
COPY . .
RUN npm run build

# Drop dev-only dependencies from node_modules so the runtime stage stays lean,
# while keeping the compiled better-sqlite3 binary and tsx.
RUN npm prune --omit=dev

# ---------------------------------------------------------------------------

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8462 \
    DB_PATH=/data/allornothing.sqlite3

# tini for correct signal handling (graceful shutdown on SIGTERM).
RUN apk add --no-cache tini \
    && mkdir -p /data \
    && chown -R node:node /data

# Copy the pruned dependency tree (incl. native better-sqlite3) and the app.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/shared ./shared
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json

USER node
EXPOSE 8462
VOLUME ["/data"]

# Lightweight liveness probe against the health endpoint.
HEALTHCHECK --interval=30s --timeout=4s --start-period=8s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||8462) +'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "server/index.ts"]
