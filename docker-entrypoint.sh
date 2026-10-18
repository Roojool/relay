#!/bin/sh
# FieldProof all-in-one entrypoint: start FalkorDB (internal, port 6379), then Next.js.
# Honors $PORT so one image runs on HF Spaces (7860) and Railway/Zeabur/Render/Fly.io (injected PORT).
set -e

PORT="${PORT:-3000}"
DATA_DIR="${FALKORDB_DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

start_falkordb() {
  REDIS_BIN=""
  for c in /usr/local/bin/redis-server /usr/bin/redis-server; do
    if [ -x "$c" ]; then REDIS_BIN="$c"; break; fi
  done
  if [ -z "$REDIS_BIN" ]; then
    echo "[entrypoint] redis-server binary not found; relying on external FALKORDB_URL"
    return 0
  fi
  if [ ! -f /var/lib/falkordb/bin/falkordb.so ]; then
    echo "[entrypoint] falkordb module missing; relying on external FALKORDB_URL"
    return 0
  fi

  echo "[entrypoint] starting FalkorDB on 127.0.0.1:6379 (data: $DATA_DIR)"
  "$REDIS_BIN" --loadmodule /var/lib/falkordb/bin/falkordb.so --dir "$DATA_DIR" \
    --bind 127.0.0.1 --protected-mode no --save "" --appendonly no --daemonize no &
  REDIS_PID=$!

  # Wait for readiness using the bundled node (no reliance on shell /dev/tcp support).
  i=0
  while [ "$i" -lt 60 ]; do
    if node -e "const net=require('net');const s=net.connect(6379,'127.0.0.1',()=>{s.write('PING\r\n')});s.on('data',d=>process.exit(d.toString().includes('PONG')?0:1));s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),1500);" >/dev/null 2>&1; then
      echo "[entrypoint] FalkorDB ready (PONG)"
      export FALKORDB_URL="redis://127.0.0.1:6379"
      return 0
    fi
    i=$((i + 1))
    sleep 0.5
  done
  echo "[entrypoint] WARNING: FalkorDB did not answer PING in 30s; continuing (app will surface graph_unavailable honestly)"
  return 0
}

if [ "${RUN_FALKORDB:-1}" = "1" ]; then
  start_falkordb
fi

echo "[entrypoint] starting Next.js standalone on 0.0.0.0:$PORT (FALKORDB_URL=${FALKORDB_URL:-unset})"
exec node server.js
