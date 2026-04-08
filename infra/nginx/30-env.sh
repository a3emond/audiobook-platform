#!/bin/sh
# Runs as part of /docker-entrypoint.d/ — generates env.js from container env vars.
# This allows runtime OAuth client IDs without rebuilding the Angular app.
set -e

ENV_FILE=/usr/share/nginx/html/env.js

cat > "$ENV_FILE" <<EOF
window.__env__ = {
  GOOGLE_CLIENT_ID: '${GOOGLE_CLIENT_ID:-}',
  APPLE_CLIENT_ID: '${APPLE_CLIENT_ID:-}',
};
EOF

echo "[entrypoint] env.js written (GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:+set}, APPLE_CLIENT_ID=${APPLE_CLIENT_ID:+set})"
