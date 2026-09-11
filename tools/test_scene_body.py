#!/usr/bin/env python3
"""A scene holds the prose and its frontmatter, and nothing else (A66).

An agent working the author's notes appended its own report to the end of a
scene file, below a `---` rule. The manuscript rendered every paragraph of it
as prose, with accept and reject buttons, because to arc it WAS prose: the
file said so. arc's own passes cannot do this — they answer in two parts and
the briefing is split off before the write — so the rule belongs at the write
path, where it binds every pen.

Narrow and decidable: the bare rule on its own line. An em-rule in the prose,
a `***` break, and a `---` inside a fenced block are all the book, and must
stay quiet. Run: python3 tools/test_scene_body.py
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "example-story"
PY_EXE = sys.executable

SCENE = "\n".join([
    "---",
    "scene: sc.09-1",
    "chapter: ch.01-ninety-one-stairs",
    "status: proposed",
    "facts: []",
    "events: []",
    "---",
    "",
    "The prose the author wrote, and meant.",
    "",
    "{extra}",
    "",
])


def run(story: Path):
    return subprocess.run([PY_EXE, str(ROOT / "tools" / "validate.py"), str(story)],
                          capture_output=True, text=True)


def story_with(tmp: Path, name: str, extra: str) -> Path:
    story = tmp / name
    shutil.copytree(EXAMPLE, story)
    f = story / "prose" / "ch-01" / "scene-09.md"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(SCENE.format(extra=extra))
    return story


def expect(cond: bool, msg: str) -> None:
    if not cond:
        raise SystemExit(f"FAIL: {msg}")
    print(f"  ok — {msg}")


def main() -> None:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # The case that happened: a report appended under a rule.
        s = story_with(tmp, "report", "---\n\nTwo things for you, not written into the scene:\n\n**The lock.** locks/ is empty in the working tree.")
        r = run(s)
        expect(r.returncode != 0, "a report appended under a rule fails the story")
        expect("scene-09.md" in r.stdout, "the finding names the file")
        expect("line 11" in r.stdout, f"the finding names the line ({r.stdout.strip()[-90:]})")
        expect("report belongs in the terminal" in r.stdout, "the finding says what to do with the report")

        # A bare second frontmatter block is the same fault by another route.
        s = story_with(tmp, "second-fm", "---\nscene: sc.09-2\n---\n\nA second scene pasted in.")
        expect(run(s).returncode != 0, "a second frontmatter block fails the story")

        # The near misses. Each of these is the book, and must stay quiet.
        for name, extra in [
            ("em-rule", "An em-rule — like this one — is prose."),
            ("stars", "***"),
            ("longer-rule", "-----"),
            ("indented-text", "  --- not alone on its line, it has words ---"),
            ("fenced", "```\n---\n```"),
            ("trailing-space", "He went on inland."),
        ]:
            s = story_with(tmp, name, extra)
            r = run(s)
            expect(r.returncode == 0, f"{name} still validates ({r.stdout.strip()[:40]})")

    print("scene body: a report under a rule is refused; em-rules, star breaks and fenced rules are the book")


if __name__ == "__main__":
    main()
