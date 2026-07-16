#!/bin/sh
# Trevyx — Docker entrypoint (production)

set -e

echo "🚀 Trevyx starting..."

export JWT_SECRET="${JWT_SECRET:-trevyx-docker-secret-at-least-32-bytes!!}"
export VYX_CONFIG="${VYX_CONFIG:-/app/vyx.yaml}"
export VYX_ADDR="${VYX_ADDR:-:8080}"
export VYX_ENV="${VYX_ENV:-production}"
export TREVYX_DB_PATH="${TREVYX_DB_PATH:-/data/trevyx.db}"

APP_PORT=8080
FE_PORT=3000

mkdir -p "$(dirname "$TREVYX_DB_PATH")"

echo "🔧 Starting vyx core (API :${APP_PORT})..."
/app/vyx-core &
CORE_PID=$!

# Wait for core to be ready
echo "⏳ Waiting for core..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:${APP_PORT}/api/auth/me > /dev/null 2>&1; then
    echo "✅ Core ready"
    break
  fi
  sleep 1
done

# Serve frontend with busybox httpd
if [ -d /app/frontend ]; then
  echo "🎨 Serving frontend on :${FE_PORT}..."
  cd /app/frontend
  busybox httpd -f -p ${FE_PORT} &
fi

echo ""
echo "📋 Trevyx running!"
echo "   Frontend: http://localhost:${FE_PORT}/"
echo "   API:      http://localhost:${APP_PORT}/api/"
echo "   DB:       ${TREVYX_DB_PATH}"
echo ""

wait $CORE_PID
