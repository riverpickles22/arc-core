#!/usr/bin/env python3
"""The commit gate: git refuses to ratify an edit to locked prose (A46-2).

Proven in a scratch git repo, end to end: a body edit inside a scene lock is
refused at commit while a frontmatter-only change to the same file commits
(ratifying settled prose stays legal); a paragraph lock refuses only the
staged scene that dropped its quote; a chapter lock covers every member
scene; deleting a locked scene's file is refused; an absorbed lock enforces
nothing; and unlocking — the lock file's removal staged alongside the edit —
commits. The install is proven too: bin/validate sets core.hooksPath when
unset, changes nothing the second time, and never overrides the author's own.

Run: python3 tools/test_commit_gate.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable

SCENE_1 = """---
scene: sc.01-1
chapter: ch.01
status: proposed
---
The lamp had been lit for an hour.

She went down to the rocks anyway.
"""

SCENE_2 = """---
scene: sc.01-2
chapter: ch.01
status: proposed
---
The tide argued with the pilings all night.
"""

failures = 0


def expect(cond: bool, msg: str) -> None:
    global failures
    if not cond:
        failures += 1
        print(f"FAIL: {msg}", file=sys.stderr)


def sh(root: Path, *args: str, env=None) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=root, capture_output=True, text=True, env=env)


def story(tmp: Path, name: str) -> Path:
    """A minimal git story: two scenes, no locks yet, everything committed."""
    root = tmp / name
    (root / "prose" / "ch-01").mkdir(parents=True)
    (root / "locks").mkdir()
    (root / "prose" / "ch-01" / "scene-01.md").write_text(SCENE_1)
    (root / "prose" / "ch-01" / "scene-02.md").write_text(SCENE_2)
    sh(root, "git", "init", "-q")
    sh(root, "git", "config", "user.email", "gate@test")
    sh(root, "git", "config", "user.name", "gate")
    sh(root, "git", "add", "-A")
    sh(root, "git", "commit", "-qm", "baseline")
    return root


def lock(root: Path, name: str, body: str) -> None:
    (root / "locks" / name).write_text(body)
    sh(root, "git", "add", "locks")
    sh(root, "git", "commit", "-qm", f"lock: {name}")


def gate(root: Path) -> subprocess.CompletedProcess:
    return subprocess.run([PY, str(ROOT / "tools" / "lock-gate.py"), str(root)],
                          capture_output=True, text=True)


def stage(root: Path, rel: str, text) -> None:
    p = root / rel
    if text is None:
        sh(root, "git", "rm", "-q", rel)
        return
    p.write_text(text)
    sh(root, "git", "add", rel)


def unstage_all(root: Path) -> None:
    sh(root, "git", "reset", "-q", "--hard", "HEAD")


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # --- scene lock: body refused, frontmatter-only allowed ---
        root = story(tmp, "scene-lock")
        lock(root, "lock-001.yaml", "id: lock.001\nanchor:\n  scene: sc.01-1\n")

        stage(root, "prose/ch-01/scene-01.md",
              SCENE_1.replace("an hour", "two hours"))
        r = gate(root)
        expect(r.returncode != 0, "a body edit inside a scene lock must be refused")
        expect("lock.001" in r.stderr and "scene-01.md" in r.stderr,
               f"the refusal must name the lock and the file:\n{r.stderr}")
        unstage_all(root)

        stage(root, "prose/ch-01/scene-01.md",
              SCENE_1.replace("status: proposed", "status: canon"))
        r = gate(root)
        expect(r.returncode == 0,
               f"a frontmatter-only change (ratification) must commit:\n{r.stderr}")
        unstage_all(root)

        stage(root, "prose/ch-01/scene-01.md", None)
        r = gate(root)
        expect(r.returncode != 0, "deleting a locked scene's file must be refused")
        unstage_all(root)

        # A staged edit to the OTHER, unlocked scene costs nothing.
        stage(root, "prose/ch-01/scene-02.md", SCENE_2 + "\nA gull inspected the rope.\n")
        r = gate(root)
        expect(r.returncode == 0, f"an unlocked scene must commit freely:\n{r.stderr}")
        unstage_all(root)

        # Unlock flow: the lock file's removal staged WITH the edit commits.
        stage(root, "locks/lock-001.yaml", None)
        stage(root, "prose/ch-01/scene-01.md", SCENE_1.replace("an hour", "two hours"))
        r = gate(root)
        expect(r.returncode == 0,
               f"removing the lock alongside the edit is the unlock, ratified:\n{r.stderr}")
        unstage_all(root)

        # --- paragraph lock: only the quote is settled ---
        root = story(tmp, "para-lock")
        lock(root, "lock-001.yaml",
             'id: lock.001\nanchor:\n  scene: sc.01-1\n  paragraph: 0\n'
             '  quote: The lamp had been lit for an hour.\n')

        stage(root, "prose/ch-01/scene-01.md",
              SCENE_1.replace("The lamp had been lit for an hour.",
                              "The lamp had gone out."))
        r = gate(root)
        expect(r.returncode != 0, "dropping a paragraph lock's quote must be refused")
        unstage_all(root)

        stage(root, "prose/ch-01/scene-01.md",
              SCENE_1.replace("She went down to the rocks anyway.",
                              "She stayed on the porch."))
        r = gate(root)
        expect(r.returncode == 0,
               f"an edit elsewhere in the scene must commit:\n{r.stderr}")
        unstage_all(root)

        # --- chapter lock: every member scene, staged-or-HEAD membership ---
        root = story(tmp, "chapter-lock")
        lock(root, "lock-001.yaml", "id: lock.001\nanchor:\n  chapter: ch.01\n")

        stage(root, "prose/ch-01/scene-02.md", SCENE_2 + "\nNew paragraph.\n")
        r = gate(root)
        expect(r.returncode != 0, "a body edit to any scene of a locked chapter must be refused")
        unstage_all(root)

        # Rebinding the scene to another chapter does not slip the lock:
        # membership counts in HEAD or staged.
        stage(root, "prose/ch-01/scene-02.md",
              SCENE_2.replace("chapter: ch.01", "chapter: ch.02") + "\nNew paragraph.\n")
        r = gate(root)
        expect(r.returncode != 0, "rebinding the chapter must not slip a chapter lock")
        unstage_all(root)

        # --- absorption: an absorbed lock enforces nothing ---
        root = story(tmp, "absorbed")
        lock(root, "lock-001.yaml",
             'id: lock.001\nanchor:\n  scene: sc.01-2\n  paragraph: 0\n'
             '  quote: The tide argued with the pilings all night.\n'
             'absorbed_by: lock.002\n')
        lock(root, "lock-002.yaml", "id: lock.002\nanchor:\n  scene: sc.01-1\n")
        stage(root, "prose/ch-01/scene-02.md",
              SCENE_2.replace("The tide argued with the pilings all night.",
                              "The tide went quiet."))
        r = gate(root)
        expect(r.returncode == 0,
               f"a lock absorbed by an existing lock must not fire:\n{r.stderr}")
        unstage_all(root)

        # --- the settling commit: a scene lock born alongside the edits ---
        # The author edits, settles, locks from the viewer, then commits the
        # lot. The newborn lock blesses the staged text (there is no HEAD
        # baseline to defend yet); once committed, it binds.
        root = story(tmp, "settling")
        stage(root, "prose/ch-01/scene-01.md", SCENE_1.replace("an hour", "two hours"))
        stage(root, "locks/lock-001.yaml", "id: lock.001\nanchor:\n  scene: sc.01-1\n")
        r = gate(root)
        expect(r.returncode == 0,
               f"a lock born in this commit must bless the staged text:\n{r.stderr}")
        sh(root, "git", "commit", "-qm", "settle and lock sc.01-1")
        stage(root, "prose/ch-01/scene-01.md",
              SCENE_1.replace("an hour", "three hours"))
        r = gate(root)
        expect(r.returncode != 0, "from the next commit on, the newborn lock binds")
        unstage_all(root)

        # --- end to end: the hook actually refuses `git commit` ---
        root = story(tmp, "end-to-end")
        lock(root, "lock-001.yaml", "id: lock.001\nanchor:\n  scene: sc.01-1\n")
        hooks = root / "bin" / "hooks"
        hooks.mkdir(parents=True)
        pre = hooks / "pre-commit"
        pre.write_text((ROOT / "templates" / "bin-hooks-pre-commit.sh").read_text())
        pre.chmod(0o755)
        sh(root, "git", "config", "core.hooksPath", "bin/hooks")
        stage(root, "prose/ch-01/scene-01.md", SCENE_1.replace("an hour", "two hours"))
        env = {"PATH": "/usr/bin:/bin", "ARC_CORE_PATH": str(ROOT)}
        r = sh(root, "git", "commit", "-qm", "try to rewrite settled prose", env=env)
        expect(r.returncode != 0 and "lock.001" in r.stderr,
               f"git commit itself must be refused by the hook:\n{r.stdout}{r.stderr}")
        unstage_all(root)

        # --- the install: bin/validate wires hooksPath, idempotently ---
        root = story(tmp, "install")
        hooks = root / "bin" / "hooks"
        hooks.mkdir(parents=True)
        (hooks / "pre-commit").write_text("#!/bin/sh\nexit 0\n")
        (hooks / "pre-commit").chmod(0o755)
        binv = root / "bin" / "validate"
        binv.write_text((ROOT / "templates" / "bin-validate.sh").read_text())
        binv.chmod(0o755)

        env = {"PATH": "/usr/bin:/bin", "ARC_CORE_PATH": str(ROOT)}
        sh(root, str(binv), env=env)
        r = sh(root, "git", "config", "--local", "--get", "core.hooksPath")
        expect(r.stdout.strip() == "bin/hooks",
               f"bin/validate must set core.hooksPath when unset (got '{r.stdout.strip()}')")
        r2 = sh(root, str(binv), env=env)
        expect("NOT installed" not in r2.stderr, "the second run must change and say nothing")

        # An author's own hooksPath is never overridden — warned about instead.
        sh(root, "git", "config", "core.hooksPath", ".githooks")
        r = sh(root, str(binv), env=env)
        expect("NOT installed" in r.stderr,
               f"an existing foreign hooksPath must warn:\n{r.stderr}")
        r = sh(root, "git", "config", "--local", "--get", "core.hooksPath")
        expect(r.stdout.strip() == ".githooks", "the author's hooksPath must survive")

    if failures:
        print(f"{failures} FAILURES", file=sys.stderr)
        return 1
    print("commit gate: scene bodies refused and frontmatter ratification allowed, "
          "quotes enforced only where dropped, chapter membership sticky, deletion "
          "refused, absorption exempt, unlock-by-removal commits, and bin/validate "
          "installs the hook path exactly once")
    return 0


if __name__ == "__main__":
    sys.exit(main())
