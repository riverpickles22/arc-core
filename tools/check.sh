#!/usr/bin/env bash
# arc-core's one check: everything the briefing lists, stopping at the first
# failure. Every tools/test_*.py runs in its own process — Python treats the
# rest of a glob as arguments and would run only the first.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=.venv/bin/python
if [ ! -x "$PY" ]; then
  echo "check: no .venv here — run ../dev.sh once (the system python3 has no PyYAML)" >&2
  exit 1
fi
echo "check: validate examples/example-story"
"$PY" tools/validate.py examples/example-story
n=0
for t in tools/test_*.py; do
  n=$((n+1))
  echo "check: $t"
  "$PY" "$t"
done
echo "check: $n python suites, one process each"
echo "check: hooks/test-lock-guard.mjs"
node hooks/test-lock-guard.mjs
echo "check: graph"
npm --prefix graph test
echo "check: all green"
