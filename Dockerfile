# Trevyx — Render.com Dockerfile
# Self-contained build for production deployment.

# ─── Stage 1: Build vyx core from GitHub ────────────────────────────────
FROM golang:1.25-alpine AS go-builder
RUN apk add --no-cache git
RUN go install github.com/ElioNeto/vyx/core/cmd/vyx@latest

# ─── Stage 2: Build @vyx/worker SDK ─────────────────────────────────────
FROM node:20-alpine AS worker-sdk-builder
WORKDIR /sdk
COPY packages/worker/ ./
RUN npm install --no-audit --no-fund 2>/dev/null || true
RUN npx tsc 2>/dev/null || true

# ─── Stage 3: Build frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# ─── Stage 4: Build backend worker ──────────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY backend/node/package*.json ./
COPY --from=worker-sdk-builder /sdk /packages/worker
RUN rm -f package-lock.json && npm install --no-audit --no-fund
COPY backend/node/tsconfig.json /app/
COPY backend/node/src /app/src
RUN npx tsc

# ─── Stage 5: Runtime ───────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache \
    nodejs \
    ca-certificates \
    tini \
    curl \
  && addgroup -S app \
  && adduser -S app -G app

# Create necessary directories with app ownership
RUN mkdir -p /app /data /vyx-sockets /app/.vyx \
  && chown -R app:app /data /vyx-sockets /app/.vyx

WORKDIR /app

# Core binary
COPY --from=go-builder --chown=app:app /go/bin/vyx /app/vyx-core

# Frontend static files
COPY --from=frontend-builder --chown=app:app /app/dist /app/frontend

# Backend worker
COPY --from=backend-builder --chown=app:app /app/dist /app/worker
COPY --from=backend-builder --chown=app:app /app/node_modules /app/node_modules
COPY --from=backend-builder --chown=app:app /app/src /app/src

# Config
COPY schemas /app/schemas
COPY vyx.yaml /app/vyx.yaml

RUN chmod +x /app/vyx-core

EXPOSE 8080
VOLUME ["/data"]

# Entrypoint: starts core (which spawns the node worker) and a node static file server for frontend
RUN printf '#!/bin/sh\n\
set -e\n\
export JWT_SECRET="${JWT_SECRET:-trevyx-render-secret-32-bytes-long!!}"\n\
export TREVYX_DB_PATH="${TREVYX_DB_PATH:-/data/trevyx.db}"\n\
export VYX_CONFIG="/app/vyx.yaml"\n\
export VYX_DIR="/app/.vyx"\n\
export HOME="/app"\n\
mkdir -p "$(dirname "$TREVYX_DB_PATH")" "$VYX_DIR/sockets" "$VYX_DIR/runtimes"\n\
echo "🚀 Starting vyx core..."\n\
/app/vyx-core > /tmp/core.log 2>&1 &\n\
CORE_PID=$!\n\
for i in $(seq 1 30); do\n\
  if curl -sf http://localhost:8080/api/auth/me > /dev/null 2>&1; then\n\
    echo "✅ Core ready"; break\n\
  fi\n\
  sleep 1\ndone\n\
echo "🎨 Serving frontend on :3000..."\n\
cd /app/frontend && node -e "require('http').createServer((r,s)=>{s.end(require('fs').readFileSync(r.url==='/'?'index.html':'.'+r.url))}).listen(3000)" &\n\
echo "✅ Trevyx running (API: :8080, Frontend: :3000)"\n\
wait $CORE_PID\n' > /entrypoint.sh && chmod +x /entrypoint.sh

USER app
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
