#!/usr/bin/env python3
"""What a note can be about (conventions §14), negative-tested.

A note anchors to a passage — scene, paragraph, quote — or to a scene alone.
The second is not a weaker anchor; it is a different claim, and the only
shape available for the most useful reading note there is: the observation
that something is MISSING. "We never reference the tide here" has nothing to
quote, so a schema that demands a quote cannot hold it.

Run: python3 tools/test_annotation_scope.py
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "example-story"
PY = sys.executable

SCENE = """---
scene: sc.01-1
chapter: ch.01-the-arrival
status: proposed
---
The lamp had been lit for an hour before she noticed the wind had turned.

She went down to the rocks anyway, because that was the hour she went.
"""


def story_with_annotation(tmp: Path, name: str, anchor: dict) -> Path:
    story = tmp / name
    shutil.copytree(EXAMPLE, story)
    chapters = story / "canon" / "chapters.yaml"
    text = chapters.read_text()
    scene_id = "ch.01-the-arrival"
    if scene_id not in text:
        first = [ln for ln in text.splitlines() if ln.strip().startswith("- id:")]
        scene_id = first[0].split("- id:")[1].strip() if first else scene_id
    body = SCENE.replace("ch.01-the-arrival", scene_id)
    d = story / "prose" / "ch-01"
    d.mkdir(parents=True, exist_ok=True)
    (d / "scene-01.md").write_text(body)
    ann = story / "annotations"
    ann.mkdir(exist_ok=True)
    note = {"id": "note.001", "anchor": anchor,
            "body": "we never reference the tide in this section", "status": "open"}
    (ann / "note-001.yaml").write_text(json.dumps(note))   # JSON is valid YAML
    return story


def run(story: Path) -> subprocess.CompletedProcess:
    return subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(story)],
                          capture_output=True, text=True)


def expect(cond: bool, msg: str) -> None:
    if not cond:
        raise SystemExit(f"FAIL: {msg}")
    print(f"  ok — {msg}")


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # The passage note: unchanged, still the common case.
        s = story_with_annotation(tmp, "passage", {
            "scene": "sc.01-1", "paragraph": 0,
            "quote": "The lamp had been lit for an hour"})
        r = run(s)
        expect(r.returncode == 0, f"a passage note still validates ({r.stdout.strip()[:40]})")

        # The scene note: the shape this story exists for.
        s = story_with_annotation(tmp, "scene-scoped", {"scene": "sc.01-1"})
        r = run(s)
        expect(r.returncode == 0, "a note anchored to the scene alone validates")

        # A paragraph with no quote was already legal and stays so — the
        # resolver trusts the index and says it is doing that.
        s = story_with_annotation(tmp, "index-only", {"scene": "sc.01-1", "paragraph": 1})
        r = run(s)
        expect(r.returncode == 0, "a paragraph with no quote is still a passage note")

        # A quote with no index is neither shape: it names text but not where
        # the text was, so it could never resolve. Refused at the schema.
        s = story_with_annotation(tmp, "quote-only", {
            "scene": "sc.01-1", "quote": "The lamp had been lit"})
        r = run(s)
        expect(r.returncode == 1 and "is a dependency of 'quote'" in r.stdout,
               "a quote with no paragraph is rejected — an anchor that could never resolve")

        # The scene is still the one thing every note owes.
        s = story_with_annotation(tmp, "no-scene", {"paragraph": 0, "quote": "x"})
        r = run(s)
        expect(r.returncode == 1 and "'scene' is a required property" in r.stdout,
               "an anchor naming no scene is rejected")

        # An anchor pointing at a scene that does not exist is caught by the
        # cross-reference pass, not the schema — and still caught.
        s = story_with_annotation(tmp, "ghost-scene", {"scene": "sc.99-9"})
        r = run(s)
        expect(r.returncode == 1 and "unknown scene" in r.stdout,
               "a scene note naming a scene that does not exist is a finding")

    print("annotation scope: a note is about a passage or about a section, and says which")


if __name__ == "__main__":
    main()
