# Trevyx — Dockerfile para produção (todos os workers)
# Build auto-contido para Render / Docker Hub.

# ─── Stage 1: Build vyx core from GitHub (branch com fixes) ──────────────
FROM golang:1.25-alpine AS go-builder
RUN apk add --no-cache git ca-certificates
    RUN go install github.com/ElioNeto/vyx/core/cmd/vyx@fix-all-remaining
COPY backend/go/go.mod backend/go/main.go /build/
RUN cd /build && CGO_ENABLED=0 go build -o /out/vyx-worker-go .

# ─── Stage 2: Build @vyx/worker SDK (ESM only — backend imports as ESM) ──
FROM node:20-alpine AS worker-sdk-builder
WORKDIR /sdk
COPY .vyx/deps/ts-js/vyx-worker/ ./
RUN npm install --no-audit --no-fund
RUN npx -p typescript tsc

# ─── Stage 3: Build frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# ─── Stage 4: Build backend worker (Node.js) ────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY backend/node/package*.json ./
# Copy @vyx/worker directly (avoid symlink issues with TypeScript)
COPY --from=worker-sdk-builder /sdk /packages/worker
RUN rm -f package-lock.json && npm install --no-audit --no-fund 2>/dev/null; \
    rm -rf /app/node_modules/@vyx/worker && \
    cp -r /packages/worker /app/node_modules/@vyx/worker && \
    ls -la /app/node_modules/@vyx/worker/dist/esm/ 2>/dev/null || echo "No ESM dist" && \
    ls /app/node_modules/@vyx/worker/dist/cjs/ 2>/dev/null || echo "No CJS dist"
COPY backend/node/tsconfig.json /app/
COPY backend/node/src /app/src
RUN npx -p typescript tsc

# ─── Stage 5: Runtime (Alpine + Node + Go + Python) ─────────────────────
FROM alpine:3.20

# Instalar Node.js, Go, Python e utilitários
RUN apk add --no-cache \
    nodejs \
    npm \
    go \
    python3 \
    py3-pip \
    ca-certificates \
    tini \
    curl \
    gcc \
    musl-dev \
  && addgroup -S app \
  && adduser -S app -G app

# Criar diretórios com permissões corretas
RUN mkdir -p /app /data /vyx-sockets /app/.vyx /app/.vyx/sockets /app/.vyx/runtimes \
  && chown -R app:app /data /vyx-sockets /app/.vyx /app

WORKDIR /app

# ─── Core (Go binary) ──────────────────────────────────────────────────
COPY --from=go-builder --chown=app:app /go/bin/vyx /app/vyx-core

# ─── Frontend ──────────────────────────────────────────────────────────
COPY --from=frontend-builder --chown=app:app /app/dist /app/frontend

# ─── Worker Node.js ────────────────────────────────────────────────────
COPY --from=backend-builder --chown=app:app /app/dist /app/worker
# package.json with "type":"module" so Node treats .js files as ESM
COPY backend/node/package.json /app/worker/package.json
# node_modules from backend-builder already has a real copy of @vyx/worker (not a symlink)
COPY --from=backend-builder --chown=app:app /app/node_modules /app/node_modules

# ─── Worker Go ─────────────────────────────────────────────────────────

# ─── Worker Python ─────────────────────────────────────────────────────
COPY backend/python/main.py /app/worker-python/

# ─── Config ────────────────────────────────────────────────────────────
COPY schemas /app/schemas
COPY vyx.yaml /app/vyx.yaml

COPY route_map.json /app/route_map.json
RUN chmod +x /app/vyx-core

# Go worker binary (compiled in go-builder stage)
COPY --from=go-builder --chown=app:app /out/vyx-worker-go /app/vyx-worker-go

EXPOSE 8080
VOLUME ["/data"]

# Frontend proxy: serves static files AND proxies /api/* to vyx core
RUN printf '%s\n' \
  'const http=require("http"),fs=require("fs");' \
  'const m={"js":"application/javascript","css":"text/css","html":"text/html","png":"image/png","svg":"image/svg+xml","ico":"image/x-icon","json":"application/json"};' \
  'http.createServer((q,s)=>{' \
  '  if(q.url==="/healthz"){s.writeHead(200);return s.end("OK")}' \
  '  if(q.url.startsWith("/api/")){' \
  '    const o={hostname:"localhost",port:8080,path:q.url,method:q.method,headers:q.headers};' \
  '    const r=http.request(o,p=>{s.writeHead(p.statusCode,p.headers);p.pipe(s)});' \
  '    r.on("error",()=>{s.writeHead(502,{"Content-Type":"application/json"});s.end(JSON.stringify({error:"upstream unreachable"}))});' \
  '    return q.pipe(r)' \
  '  }' \
  '  try{let f=q.url==="/"?"index.html":"."+q.url.split("?")[0];s.writeHead(200,{"Content-Type":m[f.split(".").pop()]||"text/plain"});s.end(fs.readFileSync(f))}' \
  '  catch{s.writeHead(404,{"Content-Type":"application/json"});s.end(JSON.stringify({error:"not found"}))}' \
  '}).listen(3000)' > /app/serve-frontend.js

# Entrypoint
RUN printf '#!/bin/sh\n\
set -e\n\
export JWT_SECRET="${JWT_SECRET:-trevyx-render-secret-32-bytes-long!!}"\n\
export TREVYX_DB_PATH="${TREVYX_DB_PATH:-/data/trevyx.db}"\n\
export VYX_CONFIG="/app/vyx.yaml"\n\
export VYX_DIR="/app/.vyx"\n\
export HOME="/app"\n\
export PATH="$PATH:/usr/lib/go/bin:$HOME/.local/bin"\n\
mkdir -p "$(dirname "$TREVYX_DB_PATH")" /tmp/vyx "$VYX_DIR/sockets" "$VYX_DIR/runtimes"\n\
# Start frontend proxy first so Render detects its port\n\
echo "Starting frontend proxy on :3000..."\n\
cd /app/frontend && node /app/serve-frontend.js &\n\
PROXY_PID=$!\n\
for i in $(seq 1 15); do\n\
  if curl -sf http://localhost:3000/healthz > /dev/null 2>&1; then\n\
    echo "Proxy ready"; break\n\
  fi\n\
  sleep 1\ndone\n\
echo "Starting vyx core on :8080..."\n\
/app/vyx-core 2>&1 &\n\
CORE_PID=$!\n\
for i in $(seq 1 30); do\n\
  if curl -s http://localhost:8080/api/auth/me > /dev/null 2>&1; then\n\
    echo "Core ready"; break\n\
  fi\n\
  sleep 1\ndone\n\
echo "Trevyx running (Frontend+Proxy: :3000, Core: :8080, Workers: node+go+python)"\n\
wait $CORE_PID $PROXY_PID\n' > /entrypoint.sh && chmod +x /entrypoint.sh

USER app
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
