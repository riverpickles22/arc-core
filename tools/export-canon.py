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


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    story_dir = Path(sys.argv[1]).resolve()
    canon = story_dir / "canon"
    if not canon.is_dir():
        sys.exit(f"not a story directory (no canon/): {story_dir}")
    out_arg = sys.argv[2] if len(sys.argv) > 2 else "-"

    chapters_file = canon / "chapters.yaml"
    themes_file = canon / "themes.yaml"
    doc = {
        "story": yaml.safe_load((canon / "story.yaml").read_text()),
        "timeline": yaml.safe_load((canon / "timeline.yaml").read_text()),
        "entities": {},
        "events": {},
        "relationships": yaml.safe_load((canon / "relationships.yaml").read_text())["relationships"],
        "chapters": yaml.safe_load(chapters_file.read_text())["chapters"] if chapters_file.exists() else [],
        "themes": yaml.safe_load(themes_file.read_text())["themes"] if themes_file.exists() else [],
        "generated_from": f"{story_dir.name}/canon",
    }
    for f in sorted((canon / "entities").rglob("*.yaml")):
        e = yaml.safe_load(f.read_text())
        doc["entities"][e["id"]] = e
    for f in sorted((canon / "events").rglob("*.yaml")):
        e = yaml.safe_load(f.read_text())
        doc["events"][e["id"]] = e

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
