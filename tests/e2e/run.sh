#!/usr/bin/env bash
# Repeatable browser E2E: builds the library, starts the playground dev server,
# loads the unpacked extension in Chrome for Testing, and asserts the panel renders
# both server- and client-side captured calls. Tears down on exit.
#
# Usage:  pnpm e2e        (from repo root)   |   bash tests/e2e/run.sh
# Requires: pnpm install + `npx playwright install chromium` (Chrome for Testing).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGPORT="${PGPORT:-3500}"
DEV_PID=""

is_our_runtime() {
  # True only if the process EXECUTABLE (comm, not argv) is node/pnpm/next.
  # Checking comm avoids the trap that argv contains our path "…/next-…/playground".
  case "$(ps -p "$1" -o comm= 2>/dev/null)" in
    *node*|*pnpm*|*[Nn]ext*) return 0 ;;
    *) return 1 ;;
  esac
}

teardown() {
  # Primary: kill the launcher we started (precise — our own child PID).
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null
  # Kill a process only if BOTH (a) its argv mentions our playground path AND
  # (b) its executable is a node/pnpm/next runtime. An unrelated process that merely
  # has the path string in argv (e.g. /bin/sleep …/playground) is NOT killed.
  for pid in $(ps ax -o pid=,args= 2>/dev/null | grep "next-api-capture/apps/playground" | grep -v grep | awk '{print $1}'); do
    is_our_runtime "$pid" && kill -9 "$pid" 2>/dev/null
  done
  # Backstop: free the test's ports if held by a node/pnpm/next runtime. Our own
  # `next-server` worker does not always carry the playground path in its argv, so
  # we deliberately do NOT also require an argv match here (that would leave the
  # listener alive and the ports held). Scoping note: this E2E OWNS ports
  # $PGPORT and 9477 — do not run an unrelated node/next server on them during the run.
  for p in "$PGPORT" 9477; do
    for pid in $(lsof -ti tcp:"$p" 2>/dev/null); do
      is_our_runtime "$pid" && kill -9 "$pid" 2>/dev/null
    done
  done
}
trap teardown EXIT
teardown

echo "[e2e] building library…"
if ! pnpm -C "$HERE" exec turbo run build --filter=@next-api-capture/library; then
  echo "[e2e] library build failed — aborting" >&2
  exit 1
fi

echo "[e2e] starting playground dev server on :$PGPORT (WS 9477)…"
PORT="$PGPORT" NAC_MODE=dev pnpm -C "$HERE/apps/playground" dev >/tmp/nac-e2e-server.log 2>&1 &
DEV_PID=$!

if ! curl -sf --retry 90 --retry-delay 1 --retry-connrefused -o /dev/null "http://localhost:$PGPORT/"; then
  echo "[e2e] dev server did not become ready; see /tmp/nac-e2e-server.log" >&2
  exit 1
fi

echo "[e2e] running Playwright spec…"
EXT_PATH="$HERE/packages/extension" NAC_TEST_PORT="$PGPORT" node "$HERE/tests/e2e/extension.spec.mjs"
