#!/usr/bin/env python3
"""The validator goes red when settled prose has been overwritten (A46-1).

A paragraph lock's quote is its durable anchor, and "orphaned" is the
resolver's word for overwritten: a working tree where an active lock's quote
no longer appears in its scene must not pass the gate. The properties
pinned: a removed quote is an error naming the lock and the scene; the
intact quote is green, and whitespace differences alone never orphan;
absorption exempts exactly while the absorber exists; a chapter anchor must
name a chapter some scene's frontmatter declares.

Run: python3 tools/test_lock_gate.py
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

QUOTE = "The lamp had been lit for an hour."

SCENE = f"""---
scene: sc.01-1
chapter: CHAPTER_ID
status: proposed
---
{QUOTE}

She went down to the rocks anyway.
"""

failures = 0


def expect(cond: bool, msg: str) -> None:
    global failures
    if not cond:
        failures += 1
        print(f"FAIL: {msg}", file=sys.stderr)


def story_with(tmp: Path, name: str, scene_body: str, *locks: dict) -> Path:
    story = tmp / name
    shutil.copytree(EXAMPLE, story, ignore=shutil.ignore_patterns(".claude"))
    chapters = (story / "canon" / "chapters.yaml").read_text()
    first = [ln for ln in chapters.splitlines() if ln.strip().startswith("- id:")]
    chapter_id = first[0].split("- id:")[1].strip() if first else "ch.01"
    d = story / "prose" / "ch-01"
    d.mkdir(parents=True, exist_ok=True)
    (d / "scene-01.md").write_text(scene_body.replace("CHAPTER_ID", chapter_id))
    ld = story / "locks"
    ld.mkdir(exist_ok=True)
    for i, lock in enumerate(locks):
        (ld / f"lock-{i:03d}.yaml").write_text(
            json.dumps(lock).replace("CHAPTER_ID", chapter_id))   # JSON is valid YAML
    return story


def run(story: Path) -> subprocess.CompletedProcess:
    return subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(story)],
                          capture_output=True, text=True)


PARA_LOCK = {"id": "lock.001",
             "anchor": {"scene": "sc.01-1", "paragraph": 0, "quote": QUOTE}}


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # The quote present: green.
        r = run(story_with(tmp, "intact", SCENE, PARA_LOCK))
        expect(r.returncode == 0, f"an intact quote must validate:\n{r.stdout}{r.stderr}")

        # The quote gone — settled prose overwritten: red, naming lock and scene.
        r = run(story_with(tmp, "orphaned",
                           SCENE.replace(QUOTE, "The lamp had gone out."), PARA_LOCK))
        expect(r.returncode != 0, "an overwritten quote must fail the gate")
        out = r.stdout + r.stderr
        expect("lock.001" in out and "sc.01-1" in out,
               f"the finding must name the lock and the scene:\n{out}")

        # Whitespace alone never orphans: rewrap the quote across lines and
        # double an internal space. The prose is byte-different, word-identical.
        rewrapped = SCENE.replace(QUOTE, "The lamp had  been lit\nfor an hour.")
        r = run(story_with(tmp, "rewrapped", rewrapped, PARA_LOCK))
        expect(r.returncode == 0,
               f"whitespace differences alone must not orphan a lock:\n{r.stdout}{r.stderr}")

        # Absorption exempts — a paragraph lock under a live scene lock does
        # not fire even though its quote is gone (the scene lock owns the
        # scene now; the record is dormant, exactly as the runtime treats it).
        gone = SCENE.replace(QUOTE, "The lamp had gone out.")
        r = run(story_with(tmp, "absorbed", gone,
                           dict(PARA_LOCK, absorbed_by="lock.002"),
                           {"id": "lock.002", "anchor": {"scene": "sc.01-1"}}))
        expect(r.returncode == 0,
               f"an absorbed lock must not fire the quote check:\n{r.stdout}{r.stderr}")

        # ...and only while the absorber exists: same story minus lock.002.
        # The dangling absorbed_by un-absorbs (a warning), and the quote
        # check fires again (an error).
        r = run(story_with(tmp, "unabsorbed", gone,
                           dict(PARA_LOCK, absorbed_by="lock.002")))
        expect(r.returncode != 0, "with the absorber gone, the lock enforces again")

        # A chapter lock must name a chapter some scene declares.
        r = run(story_with(tmp, "chapter-known", SCENE,
                           {"id": "lock.001", "anchor": {"chapter": "CHAPTER_ID"}}))
        expect(r.returncode == 0,
               f"a chapter lock on a declared chapter must validate:\n{r.stdout}{r.stderr}")
        r = run(story_with(tmp, "chapter-unknown", SCENE,
                           {"id": "lock.001", "anchor": {"chapter": "ch.99-nowhere"}}))
        expect(r.returncode != 0 and "no scene declares" in r.stdout + r.stderr,
               "a chapter lock on a chapter no scene declares is an error")

    if failures:
        print(f"{failures} FAILURES", file=sys.stderr)
        return 1
    print("lock gate: an overwritten quote goes red naming lock and scene, "
          "whitespace never orphans, absorption exempts exactly while the "
          "absorber exists, and a chapter lock must name a declared chapter")
    return 0


if __name__ == "__main__":
    sys.exit(main())
