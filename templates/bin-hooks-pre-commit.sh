#!/bin/sh
# Refuse a commit that rewrites settled prose. In arc a commit is the author
# ratifying, so this is where a manual edit to locked prose meets the wall —
# whatever tool held the pen. The gate itself lives in arc-core (one shared
# constitution, same reasoning as bin/validate); this wrapper only finds it.
#
# Committing a lock file's REMOVAL alongside the edit is the unlock flow and
# passes: the staged lock set decides.
#
# If arc-core is missing the gate cannot check — it warns loudly and lets the
# commit through rather than making the story repo uncommittable on a machine
# without arc-core. bin/validate remains the backstop for paragraph locks.

set -eu

story_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
arc_core=${ARC_CORE_PATH:-"$story_root/../arc-core"}

if [ ! -f "$arc_core/tools/lock-gate.py" ]; then
	echo "pre-commit: no arc-core at $arc_core — the lock gate CANNOT check this commit" >&2
	echo "  Clone arc-core alongside this repo, or point ARC_CORE_PATH at your checkout." >&2
	exit 0
fi

python="$arc_core/.venv/bin/python"
[ -x "$python" ] || python=python3

exec "$python" "$arc_core/tools/lock-gate.py" "$story_root"
