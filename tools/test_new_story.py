#!/usr/bin/env python3
"""new-story.py builds a conforming story from answers, and only from answers.

The properties that matter (A34-3): the output validates and exports with no
placeholder content; everything technical is derived; a minimal spec produces
the minimum canon and nothing invented; the build is atomic and deterministic;
and NEVER OVERWRITE AN EXISTING STORY ACCIDENTALLY holds against every flag.

Run: python3 tools/test_new_story.py
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "tools" / "new-story.py"
SPEC = ROOT / "templates" / "story-spec.example.yaml"
PY = sys.executable

failures = 0


def expect(cond: bool, msg: str) -> None:
    global failures
    if not cond:
        failures += 1
        print(f"FAIL: {msg}", file=sys.stderr)


def run(*args: str, spec: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([PY, str(TOOL), *args],
                          input=spec, capture_output=True, text=True)


MINIMAL = """
title: The Crossing
logline: A man rows to an island he has been told does not exist.
period: { start: "1848", end: "1849" }
protagonist:
  name: Tomas
  summary: A fisherman who stopped asking permission years ago.
"""


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # 1. The worked spec builds a story that validates and exports, with
        #    the format version declared and no placeholder content anywhere.
        r = run("--into", str(tmp), "--spec", str(SPEC))
        story = tmp / "the-signal-station"
        expect(r.returncode == 0, f"the example spec must build:\n{r.stdout}{r.stderr}")
        v = subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(story)],
                           capture_output=True, text=True)
        expect(v.returncode == 0, f"the built story must validate:\n{v.stdout}{v.stderr}")
        e = subprocess.run([PY, str(ROOT / "tools" / "export-canon.py"), str(story)],
                           capture_output=True, text=True)
        expect(e.returncode == 0, f"export-canon must produce a graph:\n{e.stderr}")
        expect('arc_format: 1' in (story / "canon" / "story.yaml").read_text(),
               "the story declares the format it is written against (A34-9)")
        for f in story.rglob("*"):
            if f.is_file():
                expect(not re.search(r"<[A-Z][^>]*>", f.read_text()),
                       f"placeholder content in {f.relative_to(story)}")

        # 7. Nothing the answers do not justify, and nothing per-machine.
        expect(not (story / "view.yaml").exists(), "no view.yaml is emitted")
        expect(not (story / "assets").exists(), "no assets/ is emitted")
        expect(not (story / ".claude").exists(),
               "no .claude/settings.json — hooks/install-hooks.mjs generates that per-machine")
        expect(not (story / "docs" / "style.md").exists(),
               "no style skeleton — a contract of unfilled markers is placeholder content")

        # bin/validate arrives executable — the story's own gate.
        expect((story / "bin" / "validate").stat().st_mode & 0o111 != 0,
               "bin/validate must be executable")

        # 3. The minimal interview produces the minimum canon: one character,
        #    one state, and nothing invented to fill schema room.
        r = run("--into", str(tmp), "--spec", "-", spec=MINIMAL)
        mini = tmp / "the-crossing"
        expect(r.returncode == 0, f"a minimal spec must build:\n{r.stdout}{r.stderr}")
        chars = list((mini / "canon" / "entities" / "characters").glob("*.yaml"))
        expect(len(chars) == 1, "exactly one character")
        body = chars[0].read_text()
        expect(body.count("- at:") == 1, "exactly one state")
        expect("psychology" not in body and "appearance" not in body and "location:" not in body,
               "no fabricated psychology, appearance or location")
        expect(not (mini / "canon" / "entities" / "places").exists(), "no fabricated places")
        expect("relationships: []" in (mini / "canon" / "relationships.yaml").read_text(),
               "the relationships key is present and empty — nothing fabricated")
        expect("themes: []" in (mini / "canon" / "story.yaml").read_text(),
               "themes the author did not give are an empty list, not inventions")
        v = subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(mini)],
                           capture_output=True, text=True)
        expect(v.returncode == 0, f"the minimal story must validate:\n{v.stdout}{v.stderr}")

        # 4. A birth before page one emits the backstory era by construction.
        with tempfile.TemporaryDirectory() as td4:
            born = MINIMAL.replace("  summary: A fisherman who stopped asking permission years ago.",
                                   "  summary: A fisherman who stopped asking permission years ago.\n  born: \"1820\"")
            r = run("--into", td4, "--spec", "-", spec=born)
            bstory = Path(td4) / "the-crossing"
            expect(r.returncode == 0, f"a pre-story birth must build:\n{r.stderr}")
            tl = (bstory / "canon" / "timeline.yaml").read_text()
            expect("era.backstory" in tl and 'start: "1820"' in tl and 'end: "1847-12-31"' in tl,
                   "the backstory era spans birth to the day before page one")
            expect("era: era.backstory" in (bstory / "canon" / "entities" / "characters" / "tomas.yaml").read_text(),
                   "the birth anchors inside the backstory era")

        # 6a. --dry-run writes nothing.
        with tempfile.TemporaryDirectory() as td2:
            r = run("--into", td2, "--dry-run", "--spec", str(SPEC))
            expect(r.returncode == 0 and "canon/story.yaml" in r.stdout, "--dry-run prints the tree and contents")
            expect(list(Path(td2).iterdir()) == [], "--dry-run writes nothing at all")

        # 6b. A build that fails validation leaves NOTHING behind — the
        #     atomicity negative. An unknown place kind passes the spec checks
        #     and dies at self-validation, which is the deep failure path.
        with tempfile.TemporaryDirectory() as td3:
            bad = MINIMAL + "\nplace: { name: The Hulk, kind: spaceport, summary: A grounded wreck. }\n"
            r = run("--into", td3, "--spec", "-", spec=bad)
            expect(r.returncode != 0, "an invalid emission must fail")
            expect("bug in new-story.py" in r.stderr, "and say whose fault it is")
            expect(list(Path(td3).iterdir()) == [], "a failed run leaves no directory behind")

        # 9. Never overwrite an existing story accidentally.
        # An existing STORY (it has canon/) refuses even --force.
        r = run("--into", str(tmp), "--spec", "-", spec=MINIMAL)
        expect(r.returncode != 0 and "canon/" in r.stderr,
               "an existing story is refused outright, naming the canon/ that makes it one")
        r = run("--into", str(tmp), "--force", "--spec", "-", spec=MINIMAL)
        expect(r.returncode != 0 and "canon/" in r.stderr,
               "--force is still refused when the target holds a canon/ — that is a story")
        # Non-empty scratch (no canon/): refused politely, replaced on --force.
        scratch = tmp / "the-signal-station"
        (scratch / "canon").rename(scratch / "not-canon")   # now scratch, not a story
        r = run("--into", str(tmp), "--spec", str(SPEC))
        expect(r.returncode != 0 and "not empty" in r.stderr,
               "a non-empty non-story target is refused, naming it")
        r = run("--into", str(tmp), "--force", "--spec", str(SPEC))
        expect(r.returncode == 0, f"--force replaces a canon-less scratch directory:\n{r.stderr}")

        # 10. Naming is deterministic, folds accents, and refuses the unusable.
        with tempfile.TemporaryDirectory() as td5:
            accents = MINIMAL.replace("The Crossing", '"Señor Café: A Story!"').replace("Tomas", "José Müller")
            r = run("--into", td5, "--spec", "-", spec=accents)
            expect(r.returncode == 0 and (Path(td5) / "senor-cafe-a-story").exists(),
                   f"accents and punctuation normalise deterministically:\n{r.stderr}")
            expect((Path(td5) / "senor-cafe-a-story" / "canon" / "entities" / "characters" / "jose-muller.yaml").exists(),
                   "entity names normalise the same way")
            r = run("--into", td5, "--spec", "-", spec=MINIMAL.replace("The Crossing", "百年孤独"))
            expect(r.returncode != 0 and "nothing usable" in r.stderr,
                   "a title that normalises to nothing is refused with a request, never guessed at")

        # 10b. A character and a place sharing a slug are told apart.
        with tempfile.TemporaryDirectory() as td6:
            clash = MINIMAL.replace("name: Tomas", "name: The Signal") + \
                "\nplace: { name: The Signal, kind: building, summary: The station itself. }\n"
            r = run("--into", td6, "--spec", "-", spec=clash)
            expect(r.returncode == 0, f"a slug collision must not fail the build:\n{r.stderr}")
            clash_story = Path(td6) / "the-crossing"
            expect((clash_story / "canon" / "entities" / "characters" / "the-signal.yaml").exists()
                   and (clash_story / "canon" / "entities" / "places" / "the-signal-building.yaml").exists(),
                   "the place is disambiguated by its kind, never silently merged")

        # 11. Regeneration from the same answers is byte-identical — the
        #     preview is not a one-way door.
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            run("--into", a, "--spec", str(SPEC))
            run("--into", b, "--spec", str(SPEC))
            fa = sorted(p.relative_to(a) for p in Path(a).rglob("*") if p.is_file())
            fb = sorted(p.relative_to(b) for p in Path(b).rglob("*") if p.is_file())
            expect(fa == fb, "the same answers produce the same tree")
            expect(all((Path(a) / f).read_bytes() == (Path(b) / f).read_bytes() for f in fa),
                   "and the same bytes in every file")

        # The format constant cannot drift from the validator's.
        mine = re.search(r"^ARC_FORMAT = (\d+)", TOOL.read_text(), re.M)
        theirs = re.search(r"^ARC_FORMAT = (\d+)", (ROOT / "tools" / "validate.py").read_text(), re.M)
        expect(bool(mine and theirs) and mine.group(1) == theirs.group(1),
               "new-story.py and validate.py must agree on ARC_FORMAT")

    if failures:
        print(f"{failures} FAILURES", file=sys.stderr)
        return 1
    print("new-story: the worked spec and the minimal spec both build, validate and export; "
          "nothing is invented, nothing is overwritten, and the same answers give the same bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
