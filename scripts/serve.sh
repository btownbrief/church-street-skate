#!/bin/sh
# keep a static server alive on :8765 for headless playtests
cd "$(dirname "$0")/.." || exit 1
while true; do python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1; sleep 1; done
