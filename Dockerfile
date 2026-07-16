# Trevyx — Docker runtime image (pre-built artifacts)
# Build: docker build -t trevyx .
# Requires: vyx-core, frontend/dist, backend/node/dist

FROM alpine:3.20

RUN apk add --no-cache nodejs ca-certificates tini curl busybox \
  && addgroup -S app && adduser -S app -G app

RUN mkdir -p /app /data /vyx-sockets && chown app:app /data /vyx-sockets

WORKDIR /app

# Pre-built binaries and artifacts
COPY docker/vyx-core /app/vyx-core
COPY docker/frontend /app/frontend
COPY docker/worker /app/worker
COPY docker/node_modules /app/node_modules
COPY docker/schemas /app/schemas

# Config files
COPY vyx.yaml route_map.json docker/entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh /app/vyx-core

USER app
EXPOSE 8080 3000
VOLUME ["/data"]

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
