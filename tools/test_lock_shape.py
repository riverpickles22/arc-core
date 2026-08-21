#!/usr/bin/env python3
"""Locks get a schema, which they have never had (A40-5), negative-tested.

The records that decide whether the author's settled prose can be
overwritten were the one kind of committed story state nothing checked.
The properties pinned: exactly three anchor shapes validate, every blend is
refused, the absorption link is checked, and a dangling absorption is a
warning — the runtime un-absorbs it — never an error.

Run: python3 tools/test_lock_shape.py
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
The lamp had been lit for an hour.

She went down to the rocks anyway.
"""

failures = 0


def expect(cond: bool, msg: str) -> None:
    global failures
    if not cond:
        failures += 1
        print(f"FAIL: {msg}", file=sys.stderr)


def story_with(tmp: Path, name: str, *locks: dict) -> Path:
    story = tmp / name
    shutil.copytree(EXAMPLE, story, ignore=shutil.ignore_patterns(".claude"))
    # Bind the scene to a chapter the example actually defines, the way
    # test_keypoint_shape.py does — an invented id would fail for the wrong
    # reason and prove nothing about locks.
    chapters = (story / "canon" / "chapters.yaml").read_text()
    first = [ln for ln in chapters.splitlines() if ln.strip().startswith("- id:")]
    chapter_id = first[0].split("- id:")[1].strip() if first else "ch.01-the-arrival"
    d = story / "prose" / "ch-01"
    d.mkdir(parents=True, exist_ok=True)
    (d / "scene-01.md").write_text(SCENE.replace("ch.01-the-arrival", chapter_id))
    ld = story / "locks"
    ld.mkdir(exist_ok=True)
    for i, lock in enumerate(locks):
        (ld / f"lock-{i:03d}.yaml").write_text(json.dumps(lock))   # JSON is valid YAML
    return story


def run(story: Path) -> subprocess.CompletedProcess:
    return subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(story)],
                          capture_output=True, text=True)


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # The three coherent shapes, together, with an absorption chain.
        r = run(story_with(tmp, "coherent",
            {"id": "lock.001", "anchor": {"scene": "sc.01-1", "paragraph": 0, "quote": "The lamp had been lit for an hour."}, "absorbed_by": "lock.002"},
            {"id": "lock.002", "anchor": {"scene": "sc.01-1"}},
            {"id": "lock.003", "anchor": {"chapter": "ch.01-the-arrival"}}))   # any ch.* id; locks do not bind chapters to canon yet
        expect(r.returncode == 0, f"the three shapes and a real absorption must validate:\n{r.stdout}{r.stderr}")

        # Every blend refused.
        for n, (bad, why) in enumerate([
            ({"id": "lock.001", "anchor": {"chapter": "ch.01", "paragraph": 1}}, "a chapter lock naming a paragraph"),
            ({"id": "lock.001", "anchor": {"chapter": "ch.01", "scene": "sc.01-1"}}, "a chapter lock naming a scene"),
            ({"id": "lock.001", "anchor": {"scene": "sc.01-1", "quote": "x"}}, "a quote without its paragraph"),
            ({"id": "lock.001", "anchor": {"scene": "sc.01-1", "paragraph": 0}}, "a paragraph without its quote"),
            ({"id": "lock.001", "anchor": {}}, "an anchor naming nothing"),
            ({"id": "not-a-lock-id", "anchor": {"scene": "sc.01-1"}}, "a malformed id"),
        ]):
            r = run(story_with(tmp, f"bad-{n}", bad))
            expect(r.returncode != 0, f"{why} must be refused")

        # References the schema cannot see: an unknown scene is an error...
        r = run(story_with(tmp, "unknown-scene", {"id": "lock.001", "anchor": {"scene": "sc.99-9"}}))
        expect(r.returncode != 0 and "unknown scene" in r.stdout + r.stderr,
               "a lock on a scene that does not exist is an error")

        # ...and a dangling absorption is a WARNING — the runtime un-absorbs
        # it, so the story still behaves; the author is told, not blocked.
        r = run(story_with(tmp, "dangling",
            {"id": "lock.001", "anchor": {"scene": "sc.01-1"}, "absorbed_by": "lock.999"}))
        expect(r.returncode == 0, f"a dangling absorption must not fail the story:\n{r.stdout}{r.stderr}")
        expect("enforces again" in r.stdout + r.stderr, "but the author is told it enforces again")

    if failures:
        print(f"{failures} FAILURES", file=sys.stderr)
        return 1
    print("lock shape: three coherent anchors validate, every blend refused, "
          "absorption checked, and a dangling parent warns instead of blocking")
    return 0


if __name__ == "__main__":
    sys.exit(main())
