#!/usr/bin/env bash
# Helper to manage the local wrangler dev server on :8799.
# Usage: ./dev-server.sh start | stop | restart | log
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$DIR/.dev-server.pid"
LOG="$DIR/.dev-server.log"
PORT=8799

stop_all() {
  if [[ -f "$PIDFILE" ]]; then
    local pid
    pid="$(cat "$PIDFILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
    fi
  fi
  for i in 1 2 3 4 5; do
    ss -ltn 2>/dev/null | grep -q ":$PORT " || break
    sleep 1
  done
  # nuke any lingering workerd/wrangler from this project
  for p in $(pgrep -f "workerd serve.*8799|node_modules/.bin/wrangler dev"); do
    [[ -n "$p" ]] && kill -9 "$p" 2>/dev/null || true
  done
  rm -f "$PIDFILE"
}

case "${1:-start}" in
  start)
    stop_all
    nohup npx wrangler dev --local --port "$PORT" > "$LOG" 2>&1 &
    echo $! > "$PIDFILE"
    for i in $(seq 1 40); do
      if curl -s -m 2 -o /dev/null "http://localhost:$PORT/health"; then
        echo "up after ${i}s (pid $(cat "$PIDFILE"))"
        exit 0
      fi
      sleep 1
    done
    echo "FAILED to start; see $LOG"; tail -20 "$LOG"; exit 1
    ;;
  stop)
    stop_all
    echo "stopped"
    ;;
  restart)
    stop_all
    exec "$0" start
    ;;
  log)
    tail -40 "$LOG"
    ;;
  *)
    echo "usage: $0 start|stop|restart|log"; exit 1
    ;;
esac
