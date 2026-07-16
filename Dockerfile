# Trevyx — Render.com Dockerfile
# Builds everything from source, no pre-built artifacts needed.

# ─── Stage 1: Build vyx core from GitHub ────────────────────────────────
FROM golang:1.25-alpine AS go-builder
RUN apk add --no-cache git
RUN go install github.com/ElioNeto/vyx/core/cmd/vyx@latest

# ─── Stage 2: Build frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN rm -f package-lock.json && npm install --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# ─── Stage 3: Build backend worker ──────────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY backend/node/package*.json ./
COPY packages/worker /packages/worker
RUN rm -f package-lock.json && npm install --no-audit --no-fund
COPY backend/node/tsconfig.json backend/node/src/ ./
RUN npx tsc --outDir ./dist

# ─── Stage 4: Runtime ───────────────────────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache nodejs ca-certificates tini curl busybox \
  && addgroup -S app && adduser -S app -G app

WORKDIR /app

# Core binary (from go install)
COPY --from=go-builder --chown=app:app /go/bin/vyx /app/vyx-core

# Frontend
COPY --from=frontend-builder --chown=app:app /app/dist /app/frontend

# Backend worker
COPY --from=backend-builder --chown=app:app /app/dist /app/worker
COPY --from=backend-builder --chown=app:app /app/node_modules /app/node_modules

# Config
COPY schemas /app/schemas
COPY vyx.yaml /app/vyx.yaml

RUN chmod +x /app/vyx-core

EXPOSE 8080 3000
VOLUME ["/data"]

# Entrypoint script
RUN printf '#!/bin/sh\n\
set -e\n\
export JWT_SECRET="${JWT_SECRET:-trevyx-render-secret-32-bytes-long!!}"\n\
export TREVYX_DB_PATH="${TREVYX_DB_PATH:-/data/trevyx.db}"\n\
export VYX_CONFIG="/app/vyx.yaml"\n\
mkdir -p "$(dirname "$TREVYX_DB_PATH")"\n\
echo "🚀 Starting vyx core..."\n\
/app/vyx-core &\n\
CORE_PID=$!\n\
for i in $(seq 1 15); do\n\
  if curl -sf http://localhost:8080/api/auth/me > /dev/null 2>&1; then\n\
    echo "✅ Core ready"; break\n\
  fi\n\
  sleep 1\ndone\n\
echo "🎨 Serving frontend on :3000..."\n\
cd /app/frontend && busybox httpd -f -p 3000 &\n\
echo "✅ Trevyx running (API: :8080, Frontend: :3000)"\n\
wait $CORE_PID\n' > /entrypoint.sh && chmod +x /entrypoint.sh

USER app
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
