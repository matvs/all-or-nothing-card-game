# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# All or Nothing (SET) — one Node service serving the built frontend AND the
# REST + native-WebSocket API (the `ws` library; no Socket.IO) on a single port
# (default 8462), same-origin. WebRTC voice signalling rides that same socket.
#
# glibc base (node:22-bookworm-slim) per the WSL2 deployment doctrine. There is
# NO native module and NO database: multiplayer rooms live in memory and solo
# high scores live in the browser's localStorage, so the image is stateless and
# needs no volume or chown dance.
# ---------------------------------------------------------------------------

# Build the shared @matvs/core-realtime dist in-image. The app depends on it via a `file:` path
# into the sibling `core` repo, provided as the `matvs_core` build context (docker-compose.yml:
# additional_contexts). Self-contained on purpose: `rebuild-all.sh` runs `docker compose up -d
# --build` and never pre-builds core on the host (core/**/dist is gitignored and absent).
FROM node:22-bookworm-slim AS core-realtime
WORKDIR /core/realtime
COPY --from=matvs_core realtime/package.json ./
COPY --from=matvs_core realtime/tsconfig.json ./
COPY --from=matvs_core realtime/src ./src
RUN npm install --no-audit --no-fund --legacy-peer-deps
# @matvs/tsconfig is referenced by the tsconfig `extends` bare specifier but is NOT a declared
# dependency (the core workspace normally symlinks it); provide it so the isolated build resolves.
COPY --from=matvs_core config/typescript ./node_modules/@matvs/tsconfig
RUN npm run build

# Same treatment for @matvs/core-node — the shared auth helpers behind real credential sign-in
# (`file:../core/auth/backend/node`). It is a SECOND file: dependency, and every one of them must
# be vendored below: npm installs them as symlinks pointing outside /app, and a symlink whose
# target was never copied in is accepted silently at build time and only explodes at startup
# (ERR_MODULE_NOT_FOUND). `server/__tests__/dockerfile-vendoring.test.ts` enforces the pairing.
FROM node:22-bookworm-slim AS core-node
WORKDIR /core/auth/backend/node
COPY --from=matvs_core auth/backend/node/package.json ./
COPY --from=matvs_core auth/backend/node/tsconfig.json ./
COPY --from=matvs_core auth/backend/node/src ./src
RUN npm install --no-audit --no-fund --legacy-peer-deps
COPY --from=matvs_core config/typescript ./node_modules/@matvs/tsconfig
RUN npm run build

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Vendor the in-image-built @matvs/core-realtime so the app's `file:../core/realtime` dependency
# resolves during install (from /app that path points at /core/realtime).
COPY --from=core-realtime /core/realtime/package.json /core/realtime/package.json
COPY --from=core-realtime /core/realtime/dist /core/realtime/dist

# …and @matvs/core-node (`file:../core/auth/backend/node` → /core/auth/backend/node).
COPY --from=core-node /core/auth/backend/node/package.json /core/auth/backend/node/package.json
COPY --from=core-node /core/auth/backend/node/dist /core/auth/backend/node/dist

# Install deps against a cached layer (re-runs only when the lockfile changes).
COPY package.json package-lock.json ./
# `npm install` (not `npm ci`): the committed lockfile carries the `file:` core link unresolved, so
# `npm ci`'s strict lockfile check fails; install reconciles it against the vendored /core above.
RUN npm install

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

# node_modules carries symlinks `@matvs/core-realtime` -> /core/realtime and `@matvs/core-node`
# -> /core/auth/backend/node (the file: dependencies); vendor their compiled output here too so
# the server resolves them at runtime (via tsx). Copying node_modules alone only copies the
# symlinks — the targets must come along or every import of them fails at startup.
COPY --from=core-realtime /core/realtime/package.json /core/realtime/package.json
COPY --from=core-realtime /core/realtime/dist /core/realtime/dist
COPY --from=core-node /core/auth/backend/node/package.json /core/auth/backend/node/package.json
COPY --from=core-node /core/auth/backend/node/dist /core/auth/backend/node/dist

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
