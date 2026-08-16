#!/usr/bin/env python3
"""Story-shape checks, negative-tested (conventions §9).

A story missing a required canon file, or inventing a directory under
canon/entities/, must be told so — not crash the validator and not pass here
only to 500 the viewer later. Builds a disposable copy of the worked example,
breaks it one way at a time, and asserts the finding; then proves the clean
case stays quiet. Run: python3 tools/test_story_shape.py
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "example-story"
PY = sys.executable


def run(tool, story):
    return subprocess.run([PY, str(ROOT / "tools" / tool), str(story)],
                          capture_output=True, text=True)


def fresh_story(tmp: Path, name: str) -> Path:
    story = tmp / name
    shutil.copytree(EXAMPLE, story)
    return story


def expect(cond: bool, msg: str) -> None:
    if not cond:
        raise SystemExit(f"FAIL: {msg}")
    print(f"  ok — {msg}")


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        base = fresh_story(tmp, "clean")
        r = run("validate.py", base)
        expect(r.returncode == 0, f"baseline example story validates ({r.stdout.strip()[:60]})")

        # Each required canon file, removed one at a time. The validator must
        # NAME it — a story that passes without story.yaml would 500 the viewer.
        for fname in ("story.yaml", "timeline.yaml", "relationships.yaml"):
            s = fresh_story(tmp, f"no-{fname}")
            (s / "canon" / fname).unlink()
            r = run("validate.py", s)
            expect(r.returncode == 1 and f"missing — every story needs canon/{fname}" in r.stdout,
                   f"a story with no canon/{fname} is a finding, naming the file")
            expect("Traceback" not in r.stderr,
                   f"a story with no canon/{fname} reports rather than raising")

        # The export runs behind GET /api/canon: it must fail with a sentence,
        # not a traceback, or the backend log carries a stack and the viewer
        # says only "Failed to load canon".
        for fname, needle in (("story.yaml", "does not exist"),
                              ("timeline.yaml", "does not exist"),
                              ("relationships.yaml", "does not exist")):
            s = fresh_story(tmp, f"export-no-{fname}")
            (s / "canon" / fname).unlink()
            r = run("export-canon.py", s)
            expect(r.returncode != 0 and needle in r.stderr and "Traceback" not in r.stderr,
                   f"export-canon.py names canon/{fname} instead of raising")

        # A file that exists but is empty is the other half of the same bug.
        s = fresh_story(tmp, "empty-story")
        (s / "canon" / "story.yaml").write_text("")
        r = run("export-canon.py", s)
        expect(r.returncode != 0 and "is empty" in r.stderr and "Traceback" not in r.stderr,
               "export-canon.py names an empty required file instead of raising")

        # relationships.yaml present but without its key.
        s = fresh_story(tmp, "keyless-rels")
        (s / "canon" / "relationships.yaml").write_text("# nothing here yet\n")
        r = run("export-canon.py", s)
        expect(r.returncode != 0 and "is empty" in r.stderr,
               "export-canon.py names relationships.yaml with no content")

        # An empty collection is a story with none yet, not a broken one.
        s = fresh_story(tmp, "empty-rels")
        (s / "canon" / "relationships.yaml").write_text("relationships:\n")
        r = run("export-canon.py", s)
        expect(r.returncode == 0, "an empty `relationships:` exports as none, not as a failure")

        # An invented entity directory: the schema is chosen by path, so an
        # unknown one has no mapping. Say so; do not index a dict blindly.
        s = fresh_story(tmp, "dragons")
        d = s / "canon" / "entities" / "dragons"
        d.mkdir(parents=True)
        (d / "smaug.yaml").write_text("id: char.smaug\ntype: character\nname: Smaug\n")
        r = run("validate.py", s)
        expect(r.returncode == 1 and "no schema mapping for this file location" in r.stdout,
               "an invented canon/entities/ subdirectory is a finding, not a KeyError")
        expect("Traceback" not in r.stderr,
               "an invented canon/entities/ subdirectory does not raise")

        # A loose yaml directly under canon/entities/ has no subdirectory at
        # all — the index that used to crash.
        s = fresh_story(tmp, "loose")
        (s / "canon" / "entities" / "loose.yaml").write_text("id: char.loose\n")
        r = run("validate.py", s)
        expect(r.returncode == 1 and "no schema mapping" in r.stdout and "Traceback" not in r.stderr,
               "a loose file under canon/entities/ is a finding, not an IndexError")

    print("story shape: all negative cases caught, clean cases quiet")


if __name__ == "__main__":
    main()
