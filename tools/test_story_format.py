#!/usr/bin/env python3
"""STORY-FORMAT.md's mapping table is executable, not decorative.

The file-to-schema mapping exists twice on purpose — once as code in
validate.py's schema_for(), once as a table an outside implementer can read —
and twice is only safe if a test holds them together. Same pattern as
date-vectors.json: specified once, every copy checked against it.

Run: python3 tools/test_story_format.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "STORY-FORMAT.md"

sys.path.insert(0, str(ROOT / "tools"))
import importlib.util
spec = importlib.util.spec_from_file_location("validate_mod", ROOT / "tools" / "validate.py")
validate_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validate_mod)

failures = 0


def expect(cond: bool, msg: str) -> None:
    global failures
    if not cond:
        failures += 1
        print(f"FAIL: {msg}", file=sys.stderr)


def table_rows() -> list[tuple[str, str]]:
    """The rows of the marked schema-map table, as (location, schema)."""
    text = DOC.read_text()
    if "arc:schema-map" not in text:
        raise SystemExit("FAIL: STORY-FORMAT.md no longer carries the arc:schema-map marker")
    section = text.split("arc:schema-map")[1]
    rows = []
    for line in section.splitlines():
        m = re.match(r"^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|$", line)
        if m:
            rows.append((m.group(1), m.group(2)))
        elif rows and line.strip() and not line.startswith("|"):
            break   # the table ended
    return rows


def probe(location: str) -> str | None:
    """What schema_for actually answers for a representative path at this
    documented location."""
    story = Path("/story")
    rel = location.replace("canon/", "").replace("**", "x/y.yaml").replace("*", "x.yaml")
    return validate_mod.schema_for(story / "canon" / rel, story)


def main() -> int:
    rows = table_rows()
    expect(len(rows) >= 10, f"the mapping table should hold every canon location (found {len(rows)})")

    documented = {}
    for location, schema in rows:
        documented[location] = schema
        got = probe(location)
        expect(got == schema,
               f"STORY-FORMAT.md maps {location} -> {schema}, but schema_for() answers {got!r}")

    # And the other direction: every mapping the CODE knows is documented —
    # a schema added to validate.py must reach the spec in the same change.
    code_locations = {
        "canon/story.yaml": "story", "canon/timeline.yaml": "timeline",
        "canon/relationships.yaml": "relationship", "canon/chapters.yaml": "chapters",
        "canon/themes.yaml": "themes",
        "canon/entities/characters/*": "character", "canon/entities/places/*": "place",
        "canon/entities/factions/*": "faction", "canon/entities/objects/*": "object",
        "canon/events/**": "event",
    }
    for location, schema in code_locations.items():
        expect(probe(location) == schema, f"self-check: probe({location}) != {schema}")
        expect(documented.get(location) == schema,
               f"validate.py maps {location} -> {schema}, and STORY-FORMAT.md does not document it")

    # An unmapped location answers None — the "no schema mapping" finding.
    expect(validate_mod.schema_for(Path("/story/canon/entities/dragons/x.yaml"), Path("/story")) is None,
           "an invented canon location must map to no schema")

    # The stated format version is the shipping one.
    m = re.search(r"^arc_format: (\d+)$", DOC.read_text(), re.M)
    expect(bool(m) and int(m.group(1)) == validate_mod.ARC_FORMAT,
           "STORY-FORMAT.md's example must declare the ARC_FORMAT validate.py speaks")

    if failures:
        print(f"{failures} FAILURES", file=sys.stderr)
        return 1
    print(f"story format: the documented mapping and schema_for() agree on all {len(rows)} locations, both directions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
