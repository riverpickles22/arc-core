#!/usr/bin/env python3
"""The story format version, negative-tested (STORY-FORMAT.md).

The schemas are additionalProperties: false, so adding a field is a breaking
change for every story that lacks it. `arc_format` is the only thing that
lets arc tell "written before that field existed" from "wrong" — and the
case that matters most is a story from the future, which must stop the run
rather than be checked against a contract it was not written for.

Run: python3 tools/test_format_version.py
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "example-story"
PY = sys.executable

sys.path.insert(0, str(ROOT / "tools"))
from validate import ARC_FORMAT   # noqa: E402  — the version under test


def run(story: Path) -> subprocess.CompletedProcess:
    return subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(story)],
                          capture_output=True, text=True)


def story_with(tmp: Path, name: str, line: str | None) -> Path:
    """A copy of the worked example whose arc_format line is replaced, or
    removed entirely when `line` is None."""
    story = tmp / name
    shutil.copytree(EXAMPLE, story)
    f = story / "canon" / "story.yaml"
    kept = [ln for ln in f.read_text().splitlines()
            if not ln.startswith("arc_format:") and "STORY-FORMAT.md" not in ln]
    f.write_text("\n".join(([line] if line else []) + kept) + "\n")
    return story


def expect(cond: bool, msg: str) -> None:
    if not cond:
        raise SystemExit(f"FAIL: {msg}")
    print(f"  ok — {msg}")


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        r = run(EXAMPLE)
        expect(r.returncode == 0 and "arc_format" not in r.stdout,
               f"the worked example declares format {ARC_FORMAT} and passes without comment")

        # Unversioned: told, never rejected. A story that predates the field —
        # or one a third party wrote — is still a story.
        s = story_with(tmp, "unversioned", None)
        r = run(s)
        expect(r.returncode == 0, "a story declaring no arc_format still validates")
        expect("declares no arc_format" in r.stdout and "⚠" in r.stdout,
               "an unversioned story is warned about, naming the field to add")

        # From the future: the case that must not pass quietly. arc would be
        # checking against the wrong contract, so it stops.
        s = story_with(tmp, "newer", f"arc_format: {ARC_FORMAT + 1}")
        r = run(s)
        expect(r.returncode == 1, "a story from a newer format FAILS rather than being mis-checked")
        expect(f"speaks {ARC_FORMAT}" in r.stdout and "Update arc-core" in r.stdout,
               "the newer-format failure names both versions and what to do")

        # Older than this arc-core: readable, and said so. Unreachable today
        # (1 is the floor) but the branch is the reason the field exists.
        s = story_with(tmp, "older", "arc_format: 0")
        r = run(s)
        expect("arc_format 0" in r.stdout,
               "a story from an older format is reported rather than ignored")

        # The schema types the field: a string or a fraction is not a version.
        for bad in ('arc_format: "1.0"', "arc_format: 1.5"):
            s = story_with(tmp, f"bad-{bad[-3:]}", bad)
            r = run(s)
            expect(r.returncode == 1 and "schema" in r.stdout,
                   f"`{bad}` is a schema failure — the version is a bare integer")

        # A warning must never be a finding in disguise: warnings report and
        # leave the exit code alone, or the distinction stops meaning anything.
        s = story_with(tmp, "warn-only", None)
        r = run(s)
        expect(r.returncode == 0 and "OK —" in r.stdout,
               "a warning does not change the exit code, and the OK line still prints")

    print(f"format version: arc-core speaks {ARC_FORMAT}; older is read, newer is refused")


if __name__ == "__main__":
    main()
