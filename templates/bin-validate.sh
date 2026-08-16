#!/bin/sh
# Validate this story's canon: schemas, ID and wikilink referential integrity,
# era containment of timerefs, citation keys.
#
# The validator itself lives in arc-core, not here, and stays there on purpose:
# every arc story checks against one shared constitution, so a copy vendored
# into this repo would drift into its own private dialect of "valid". This
# wrapper holds nothing but the answer to "where is it".

set -eu

story_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
arc_core=${ARC_CORE_PATH:-"$story_root/../arc-core"}

if [ ! -f "$arc_core/tools/validate.py" ]; then
	echo "validate: no arc-core at $arc_core" >&2
	echo "  Clone it alongside this repo, or point ARC_CORE_PATH at your checkout." >&2
	exit 2
fi

python=$arc_core/.venv/bin/python
if [ ! -x "$python" ]; then
	echo "validate: arc-core has no virtualenv at $arc_core/.venv" >&2
	echo "  Create it and install requirements — see arc-core's README." >&2
	exit 2
fi

exec "$python" "$arc_core/tools/validate.py" "$story_root" "$@"
