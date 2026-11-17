#!/bin/sh
set -e

# Start extmcp-runtime in background
extmcp-runtime &
RUNTIME_PID=$!

# If Next.js web console server is present, start it
WEB_PID=""
if [ -f /app/web/apps/web/server.js ]; then
  echo "Starting Axiom Web Console on port ${PORT:-3000}..."
  node /app/web/apps/web/server.js &
  WEB_PID=$!
fi

# Graceful termination handler
trap "kill -TERM $RUNTIME_PID $WEB_PID 2>/dev/null || true; wait $RUNTIME_PID $WEB_PID 2>/dev/null || true" SIGTERM SIGINT

if [ -n "$WEB_PID" ]; then
  wait -n $RUNTIME_PID $WEB_PID
else
  wait $RUNTIME_PID
fi

EXIT_CODE=$?
echo "Axiom service exited with code $EXIT_CODE. Shutting down."
kill -TERM $RUNTIME_PID $WEB_PID 2>/dev/null || true
exit $EXIT_CODE
