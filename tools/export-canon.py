#!/usr/bin/env python3
"""Export a story's canon YAML into one JSON graph for the arc viewer.

Usage: python3 tools/export-canon.py <path-to-story> [out.json]

Omit out.json (or pass "-") to write the graph to stdout; the summary line
then goes to stderr, so the output can be piped or captured directly. This is
how the arc-backend serves GET /api/canon.

Output shape (the contract between canon and any app):
{
  "story": {...},               # story.yaml
  "timeline": {...},            # timeline.yaml
  "entities": { id: {...} },    # all characters/places/factions/objects
  "events": { id: {...} },
  "relationships": [ {...} ],   # objective edges
  "themes":        [ {...} ],   # what the book is about, with carriers
  "generated_from": "<story>/canon"
}
"""
import json
import sys
from pathlib import Path

import yaml


def read_required(path, key=None):
    """A canon file the export cannot do without. Missing or malformed, it
    exits with one sentence naming the file and pointing at the validator —
    this runs behind GET /api/canon, so the alternative is a traceback in the
    backend log and 'Failed to load canon' in the viewer."""
    if not path.exists():
        sys.exit(f"canon is incomplete: {path} does not exist.\n"
                 f"  run validate.py on this story — it names every missing piece.")
    doc = yaml.safe_load(path.read_text())
    if doc is None:
        sys.exit(f"canon is incomplete: {path} is empty.")
    if key is not None and key not in doc:
        sys.exit(f"canon is malformed: {path} has no `{key}:` key.")
    # A present-but-empty collection (`relationships:` with nothing under it)
    # is a story with none yet, not a broken one — the apps want [].
    return (doc[key] or []) if key else doc


def read_optional(path, key):
    """A canon file a story may not have yet. Absent or empty is [], not a crash."""
    if not path.exists():
        return []
    return (yaml.safe_load(path.read_text()) or {}).get(key) or []


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    story_dir = Path(sys.argv[1]).resolve()
    canon = story_dir / "canon"
    if not canon.is_dir():
        sys.exit(f"not a story directory (no canon/): {story_dir}")
    out_arg = sys.argv[2] if len(sys.argv) > 2 else "-"

    doc = {
        "story": read_required(canon / "story.yaml"),
        "timeline": read_required(canon / "timeline.yaml"),
        "entities": {},
        "events": {},
        "relationships": read_required(canon / "relationships.yaml", "relationships"),
        "chapters": read_optional(canon / "chapters.yaml", "chapters"),
        "themes": read_optional(canon / "themes.yaml", "themes"),
        "generated_from": f"{story_dir.name}/canon",
    }
    for kind in ("entities", "events"):
        for f in sorted((canon / kind).rglob("*.yaml")):
            e = yaml.safe_load(f.read_text())
            if not isinstance(e, dict) or "id" not in e:
                sys.exit(f"canon is malformed: {f} has no `id:`.")
            doc[kind][e["id"]] = e

    payload = json.dumps(doc, ensure_ascii=False, indent=1)
    summary = (f"{len(doc['entities'])} entities, {len(doc['events'])} events, "
               f"{len(doc['relationships'])} edges, "
               f"{len(doc['themes'])} themes")
    if out_arg == "-":
        sys.stdout.write(payload)
        print(f"exported {story_dir.name} — {summary}", file=sys.stderr)
    else:
        out_path = Path(out_arg)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload)
        print(f"wrote {out_path} — {summary}")


if __name__ == "__main__":
    main()
