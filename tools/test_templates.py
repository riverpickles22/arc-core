#!/usr/bin/env python3
"""The templates must survive being copied (conventions §9).

templates/ is what a new story is built from — by tools/new-story.py, and by
anyone following the README. A template that fails the validator the moment
it lands is worse than no template: it teaches the author that arc is broken
on their first run. templates/vision.md carried a literal wikilink for
exactly this long, and every copied story inherited an unresolvable id.

Run: python3 tools/test_templates.py
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
EXAMPLE = ROOT / "examples" / "example-story"
PY = sys.executable

sys.path.insert(0, str(ROOT / "tools"))
from validate import WIKILINK_RE, CITE_RE   # noqa: E402  — the rules under test


def expect(cond: bool, msg: str) -> None:
    if not cond:
        raise SystemExit(f"FAIL: {msg}")
    print(f"  ok — {msg}")


def main() -> None:
    md = sorted(TEMPLATES.glob("*.md"))
    expect(bool(md), f"templates/ holds markdown to check ({len(md)} files)")

    # A wikilink in a template cannot resolve: the ids it would name do not
    # exist yet in the story being created. Describe the syntax, never spell it.
    for f in md:
        found = WIKILINK_RE.findall(f.read_text())
        expect(not found, f"{f.name} spells no literal wikilink {found or ''}".strip())

    # Same argument for citation keys: research/sources.yaml starts empty.
    for f in md:
        found = CITE_RE.findall(f.read_text())
        expect(not found, f"{f.name} spells no literal citation key {found or ''}".strip())

    # The proof that matters: copy the templates into a real story exactly as
    # a human following the README would, and validate it.
    with tempfile.TemporaryDirectory() as td:
        story = Path(td) / "copied"
        shutil.copytree(EXAMPLE, story)
        docs = story / "docs"
        for name in ("vision.md", "world.md"):
            shutil.copy(TEMPLATES / name, docs / name)
        r = subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(story)],
                           capture_output=True, text=True)
        expect(r.returncode == 0,
               f"a story with templates/vision.md and world.md copied in validates ({r.stdout.strip()[:50]})")

    # The wrapper a story runs to check itself. Generic by construction — it
    # holds the answer to "where is arc-core" and nothing else.
    wrapper = TEMPLATES / "bin-validate.sh"
    expect(wrapper.exists(), "templates/bin-validate.sh exists")
    text = wrapper.read_text()
    expect(text.startswith("#!/bin/sh"), "bin-validate.sh is a POSIX sh script")
    expect("ARC_CORE_PATH" in text, "bin-validate.sh honours ARC_CORE_PATH")
    expect("exit 2" in text, "bin-validate.sh exits 2 with a message when arc-core is missing")

    # Story-shaped, not arc-shaped: the spec asks about the book, never about
    # the schema. A field here that names an arc concept is the bug this
    # assertion exists to catch.
    spec_file = TEMPLATES / "story-spec.example.yaml"
    expect(spec_file.exists(), "templates/story-spec.example.yaml exists")
    spec = yaml.safe_load(spec_file.read_text())
    banned = {"id", "ids", "slug", "era", "eras", "era_id", "status",
              "filename", "path", "entity_id", "char_id", "place_id"}
    def scan(node, where="spec"):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in banned:
                    raise SystemExit(f"FAIL: {where}.{k} is an arc-schema question, "
                                     "and the spec may only ask story questions")
                scan(v, f"{where}.{k}")
        elif isinstance(node, list):
            for v in node:
                scan(v, where)
    scan(spec)
    expect(True, "the example spec asks only story questions — no id, slug, era or status")

    schema_file = ROOT / "schema" / "new-story-spec.schema.json"
    expect(schema_file.exists(), "schema/new-story-spec.schema.json exists")
    schema = json.loads(schema_file.read_text())
    expect(set(schema["required"]) == {"title", "logline", "period", "protagonist"},
           "the spec requires only the minimum interview: title, logline, period, protagonist")

    try:
        import jsonschema
        from referencing import Registry, Resource
    except ImportError:
        print("  (skipped schema conformance — jsonschema not installed)")
    else:
        resources = []
        for sf in (ROOT / "schema").glob("*.schema.json"):
            data = json.loads(sf.read_text())
            resources.append((data["$id"], Resource.from_contents(data)))
            resources.append((sf.name, Resource.from_contents(data)))
        registry = Registry().with_resources(resources)
        errs = list(jsonschema.Draft202012Validator(schema, registry=registry).iter_errors(spec))
        expect(not errs, f"the example spec conforms to its own schema {[e.message[:60] for e in errs]}")

    # The extra schema must not disturb the canon pass: schema_for() selects by
    # file location, so a schema mapping to no canon path is never reached.
    r = subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(EXAMPLE)],
                       capture_output=True, text=True)
    expect(r.returncode == 0, "the worked example still validates with the spec schema present")

    print("templates: copyable, story-shaped, and the wrapper is generic")


if __name__ == "__main__":
    main()
