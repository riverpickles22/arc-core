#!/usr/bin/env python3
"""Provenance-register checks (conventions §13), negative-tested.

Builds a disposable copy of the worked example, plants each failure mode,
and asserts validate.py catches it — then proves the clean case stays
quiet. Run: python3 tools/test_provenance.py
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "example-story"
PY = sys.executable


def run_validate(story: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [PY, str(ROOT / "tools" / "validate.py"), str(story)],
        capture_output=True, text=True,
    )


def fresh_story(tmp: Path, name: str) -> Path:
    story = tmp / name
    shutil.copytree(EXAMPLE, story)
    (story / "research").mkdir(exist_ok=True)
    src = story / "research" / "sources.yaml"
    doc = yaml.safe_load(src.read_text()) if src.exists() else None
    doc = doc or {"sources": []}
    doc["sources"].append({"key": "real-source", "type": "web", "title": "A real source", "reliability": "high"})
    src.write_text(yaml.safe_dump(doc, sort_keys=False))
    return story


def first_event(story: Path) -> Path:
    events = sorted((story / "canon").rglob("*.yaml"))
    for f in events:
        if "/events/" in str(f):
            return f
    raise SystemExit("example story has no event file to test against")


def append(f: Path, text: str) -> None:
    f.write_text(f.read_text().rstrip() + "\n" + text)


def expect(cond: bool, msg: str) -> None:
    if not cond:
        raise SystemExit(f"FAIL: {msg}")
    print(f"  ok — {msg}")


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        base = fresh_story(tmp, "clean")
        r = run_validate(base)
        expect(r.returncode == 0, f"baseline example story validates ({r.stdout.strip()[:60]})")

        # clean case: a fully-specified historical provenance stays quiet
        good = fresh_story(tmp, "good")
        append(first_event(good), "provenance:\n  register: historical\n  sources: [real-source]\n")
        r = run_validate(good)
        expect(r.returncode == 0, "historical provenance with a resolving source is quiet")

        # failure 1: historical with no sources
        bad1 = fresh_story(tmp, "bad1")
        append(first_event(bad1), "provenance:\n  register: historical\n")
        r = run_validate(bad1)
        expect(r.returncode == 1 and "historical provenance requires sources" in r.stdout,
               "historical provenance without sources fails, naming the rule")

        # failure 2: a source key that does not resolve
        bad2 = fresh_story(tmp, "bad2")
        append(first_event(bad2), "provenance:\n  register: historical\n  sources: [no-such-key]\n")
        r = run_validate(bad2)
        expect(r.returncode == 1 and "provenance source not in sources.yaml: no-such-key" in r.stdout,
               "unresolvable source key fails, naming the key")

        # failure 3: inferred with no confidence
        bad3 = fresh_story(tmp, "bad3")
        append(first_event(bad3), "provenance:\n  register: inferred\n")
        r = run_validate(bad3)
        expect(r.returncode == 1 and "inferred provenance requires confidence" in r.stdout,
               "inferred provenance without confidence fails, naming the rule")

        # failure 4: schema rejects an unknown register outright
        bad4 = fresh_story(tmp, "bad4")
        append(first_event(bad4), "provenance:\n  register: legendary\n")
        r = run_validate(bad4)
        expect(r.returncode == 1 and "schema" in r.stdout,
               "unknown register is a schema failure")

    print("provenance: all negative cases caught, clean cases quiet")


if __name__ == "__main__":
    main()
