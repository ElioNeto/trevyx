#!/bin/bash
# Trevyx — Production build & Docker image
# Builds everything locally and packages into a minimal Docker image.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VYX_DIR="/mnt/data/dev/projetos/vyx"

echo "🚀 Trevyx Production Build"
echo "=========================="

# 1. Build vyx core
echo ""
echo "1️⃣  Building vyx core (Go)..."
cd "$VYX_DIR"
CGO_ENABLED=0 go build -o "$PROJECT_DIR/docker/vyx-core" -ldflags="-s -w" ./core/cmd/vyx
echo "   ✅ vyx-core: $(du -h "$PROJECT_DIR/docker/vyx-core" | cut -f1)"

# 2. Build frontend
echo ""
echo "2️⃣  Building frontend (React + Vite)..."
cd "$PROJECT_DIR/frontend"
[ -f package-lock.json ] || npm install --package-lock-only
npm run build
echo "   ✅ Frontend built"

# 3. Build backend worker
echo ""
echo "3️⃣  Building backend worker (TypeScript)..."
cd "$PROJECT_DIR/backend/node"
npx tsc
echo "   ✅ Backend compiled"

# 4. Prepare Docker context
echo ""
echo "4️⃣  Preparing Docker context..."
mkdir -p "$PROJECT_DIR/docker/frontend" "$PROJECT_DIR/docker/worker" "$PROJECT_DIR/docker/schemas"

# Copy frontend
cp -r "$PROJECT_DIR/frontend/dist/"* "$PROJECT_DIR/docker/frontend/"

# Copy worker
cp -r "$PROJECT_DIR/backend/node/dist/"* "$PROJECT_DIR/docker/worker/"

# Copy node_modules (merge backend + frontend into one)
rm -rf "$PROJECT_DIR/docker/node_modules"
mkdir -p "$PROJECT_DIR/docker/node_modules"

# Copy backend node_modules
cp -r "$PROJECT_DIR/backend/node/node_modules/"* "$PROJECT_DIR/docker/node_modules/"

# Copy frontend packages that aren't in backend
for pkg in "$PROJECT_DIR/frontend/node_modules/"*/; do
  name=$(basename "$pkg")
  if [ ! -d "$PROJECT_DIR/docker/node_modules/$name" ]; then
    cp -r "$pkg" "$PROJECT_DIR/docker/node_modules/"
  fi
done

echo "   ✅ Docker context prepared:"
echo "      vyx-core    : $(du -h "$PROJECT_DIR/docker/vyx-core" | cut -f1)"
echo "      frontend    : $(du -sh "$PROJECT_DIR/docker/frontend" | cut -f1)"
echo "      worker      : $(du -sh "$PROJECT_DIR/docker/worker" | cut -f1)"
echo "      node_modules: $(du -sh "$PROJECT_DIR/docker/node_modules" | cut -f1)"

# 5. Build Docker image
echo ""
echo "5️⃣  Building Docker image..."
cd "$PROJECT_DIR"
docker build -t trevyx:latest -f Dockerfile .
echo "   ✅ Docker image built: trevyx:latest"

# 6. Cleanup
echo ""
echo "6️⃣  Cleaning up..."
rm -rf "$PROJECT_DIR/docker/vyx-core" \
       "$PROJECT_DIR/docker/frontend" \
       "$PROJECT_DIR/docker/worker" \
       "$PROJECT_DIR/docker/node_modules" \
       "$PROJECT_DIR/docker/schemas"

echo ""
echo "=========================="
echo "✅ Build complete!"
echo ""
echo "Run:"
echo "  docker run -d --name trevyx \\"
echo "    -p 8080:8080 -p 3000:3000 \\"
echo "    -v trevyx-data:/data \\"
echo "    trevyx:latest"
echo ""
echo "Or use docker compose:"
echo "  docker compose up -d"
echo ""
echo "Access:"
echo "  Frontend: http://localhost:3000"
echo "  API:      http://localhost:8080/api/"
