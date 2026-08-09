#!/usr/bin/env python3
"""The satisfaction chain (conventions §12), negative-tested.

An obligation's satisfier may be canon, other material, or a scene — and a
scene the author intends but hasn't drafted is the NORMAL state of an
obligation in progress, so it must not fail the build. Every flag in
validate.py is fatal; this pins which shapes are errors and which are not.

Run: python3 tools/test_obligations.py
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "example-story"
PY = sys.executable


def story(tmp, name):
    d = tmp / name
    shutil.copytree(EXAMPLE, d)
    (d / "material").mkdir(exist_ok=True)
    return d


def material(d, name, body):
    (d / "material" / f"{name}.yaml").write_text(body)


def run(d):
    return subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(d)],
                          capture_output=True, text=True)


def expect(cond, msg):
    if not cond:
        raise SystemExit(f"FAIL: {msg}")
    print(f"  ok — {msg}")


OBLIGATION = """id: mat.friend
type: obligation
status: unplaced
body: The keeper needs someone to have lost before the wreck.
"""


def main():
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        base = story(tmp, "clean")
        expect(run(base).returncode == 0, "baseline example story validates")

        # an obligation with no satisfier at all is the normal open state
        d = story(tmp, "open")
        material(d, "friend", OBLIGATION)
        expect(run(d).returncode == 0, "an unsatisfied obligation is not an error — it is the point")

        # satisfied by real canon
        d = story(tmp, "canon-sat")
        material(d, "friend", OBLIGATION + "satisfied_by: [char.ines]\n")
        expect(run(d).returncode == 0, "satisfied_by resolving to canon passes")

        # satisfied by a scene that does not exist yet — an intention, not a defect
        d = story(tmp, "future-scene")
        material(d, "friend", OBLIGATION + "satisfied_by: [sc.04-2]\n")
        expect(run(d).returncode == 0, "satisfied_by naming an undrafted scene passes — obligations in progress must not fail the build")

        # satisfied by nonsense
        d = story(tmp, "bad-sat")
        material(d, "friend", OBLIGATION + "satisfied_by: [char.nobody]\n")
        r = run(d)
        expect(r.returncode == 1 and "satisfied_by does not resolve" in r.stdout,
               "satisfied_by naming an unknown id fails, naming the id")

        # a scene contract discharging a real obligation
        d = story(tmp, "scene-sat")
        material(d, "friend", OBLIGATION)
        (d / "prose" / "ch-01").mkdir(parents=True, exist_ok=True)
        (d / "prose" / "ch-01" / "scene-01.md").write_text(
            "---\nscene: sc.01-1\nchapter: ch.01-ninety-one-stairs\nstatus: proposed\n"
            "contract:\n  satisfies: [mat.friend]\n---\n\nThe lamp room, before dawn.\n")
        r = run(d)
        expect(r.returncode == 0, f"a scene declaring satisfies of a real obligation passes ({r.stdout.strip()[:70]})")

        # a scene discharging an obligation that does not exist
        d = story(tmp, "scene-bad")
        (d / "prose" / "ch-01").mkdir(parents=True, exist_ok=True)
        (d / "prose" / "ch-01" / "scene-01.md").write_text(
            "---\nscene: sc.01-1\nchapter: ch.01-ninety-one-stairs\nstatus: proposed\n"
            "contract:\n  satisfies: [mat.nothing]\n---\n\nBody.\n")
        r = run(d)
        expect(r.returncode == 1 and "satisfies names unknown material" in r.stdout,
               "a scene satisfying unknown material fails — and is not mistaken for a canon binding")

    print("obligations: the chain resolves across canon, material and prose; open obligations stay quiet")


if __name__ == "__main__":
    main()
