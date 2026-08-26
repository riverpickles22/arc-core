#!/usr/bin/env python3
"""The commit gate: git refuses to ratify an edit to locked prose (A46-2).

In arc a commit is the author ratifying — so the commit is where a manual
edit to settled prose is refused, with the baseline git itself holds. This
runs as the story repo's pre-commit hook (bin/hooks/pre-commit) and reads
only the STAGED state: the locks being committed decide, so removing a lock
file and editing its prose in one commit is the unlock flow, not a
violation.

The rules, mirroring the backend's write path exactly:
  - a scene lock refuses any change to that scene's BODY; frontmatter-only
    changes commit, because ratifying a settled scene (proposed -> canon) is
    the expected next step, not a violation
  - a chapter lock does the same for every scene whose frontmatter names
    the chapter (in HEAD or staged — renaming the chapter binding does not
    slip the lock)
  - a paragraph lock refuses only a staged scene that no longer contains
    its quote (whitespace-normalized); edits elsewhere in the scene commit
  - deleting a locked scene's file is refused
  - a lock absorbed by an existing wider lock enforces nothing
  - a scene or chapter lock born in this very commit blesses the staged
    text (the author locked what they were looking at); it binds from the
    next commit on, when HEAD holds its baseline

Exit 0 lets the commit through; exit 1 refuses it, naming every violated
lock. Anything outside prose/ and locks/ is none of this gate's business.
"""
import re
import subprocess
import sys
from pathlib import Path

import yaml

FM_RE = re.compile(r"^---\n(.*?)\n---\n", re.S)


def git(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(root), *args],
                          capture_output=True, text=True)


def staged_text(root: Path, path: str):
    r = git(root, "show", f":{path}")
    return r.stdout if r.returncode == 0 else None


def head_text(root: Path, path: str):
    r = git(root, "show", f"HEAD:{path}")
    return r.stdout if r.returncode == 0 else None


def split_scene(text):
    """(frontmatter meta, body) — (None, whole text) when there is none."""
    if text is None:
        return None, None
    m = FM_RE.match(text)
    if not m:
        return None, text
    try:
        meta = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError:
        meta = {}
    return meta, text[m.end():]


def norm(text: str) -> str:
    return " ".join(text.split())


def staged_changes(root: Path):
    """Staged prose changes as (status, head_path, staged_path) triples."""
    r = git(root, "diff", "--cached", "--name-status", "-z", "--", "prose")
    toks = [t for t in r.stdout.split("\0") if t]
    out = []
    i = 0
    while i < len(toks):
        status = toks[i][0]
        if status in ("R", "C"):
            out.append((status, toks[i + 1], toks[i + 2]))
            i += 3
        else:
            out.append((status, toks[i + 1], toks[i + 1]))
            i += 2
    return out


def active_locks(root: Path):
    """The staged lock set, absorption resolved the runtime's way: a lock
    absorbed by an EXISTING lock enforces nothing.

    Each lock also carries whether it exists in HEAD, because a scene or
    chapter lock's baseline is the prose AT LOCK CREATION: a lock born in
    this very commit blesses the staged text — the author locked what they
    were looking at — so there is no HEAD baseline to defend yet. This
    commit establishes it; from the next commit on, the lock binds."""
    r = git(root, "ls-files", "--cached", "-z", "--", "locks")
    locks = []
    for path in (p for p in r.stdout.split("\0") if p):
        text = staged_text(root, path)
        if text is None:
            continue
        try:
            item = yaml.safe_load(text) or {}
        except yaml.YAMLError:
            continue
        if isinstance(item, dict) and item.get("anchor"):
            item["_in_head"] = head_text(root, path) is not None
            locks.append(item)
    ids = {l["id"] for l in locks if isinstance(l.get("id"), str)}
    return [l for l in locks if l.get("absorbed_by") not in ids]


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    locks = active_locks(root)
    if not locks:
        return 0
    changes = staged_changes(root)
    if not changes:
        return 0

    refusals = []
    for status, head_path, staged_path in changes:
        head_meta, head_body = split_scene(head_text(root, head_path))
        staged_meta, staged_body = split_scene(staged_text(root, staged_path))
        scenes = {m.get("scene") for m in (head_meta, staged_meta) if m}
        chapters = {m.get("chapter") for m in (head_meta, staged_meta) if m}

        for lock in locks:
            a = lock["anchor"]
            lid = lock.get("id", "lock.?")
            if a.get("quote") is not None:                      # paragraph lock
                if a.get("scene") not in scenes:
                    continue
                if staged_body is None:
                    refusals.append(f"{staged_path}: deletes {a['scene']}, whose "
                                    f"paragraph is settled under {lid}")
                elif norm(a["quote"]) not in norm(staged_body):
                    refusals.append(f"{staged_path}: the staged scene no longer contains "
                                    f"{lid}'s quote — that paragraph is settled")
            elif a.get("scene") is not None:                     # scene lock
                if a["scene"] not in scenes or not lock.get("_in_head"):
                    continue
                if staged_body is None:
                    refusals.append(f"{staged_path}: deletes {a['scene']}, "
                                    f"settled entire under {lid}")
                elif head_body is not None and staged_body != head_body:
                    refusals.append(f"{staged_path}: edits the body of {a['scene']}, "
                                    f"settled entire under {lid}")
            else:                                                # chapter lock
                if a.get("chapter") not in chapters or not lock.get("_in_head"):
                    continue
                if staged_body is None:
                    refusals.append(f"{staged_path}: deletes a scene of {a['chapter']}, "
                                    f"settled entire under {lid}")
                elif head_body is not None and staged_body != head_body:
                    refusals.append(f"{staged_path}: edits the body of a scene in "
                                    f"{a['chapter']}, settled entire under {lid}")

    if refusals:
        print("lock-gate: refusing the commit — it rewrites settled prose:", file=sys.stderr)
        for r in refusals:
            print(f"  {r}", file=sys.stderr)
        print("Only the author unlocks, from the viewer's right-click menu; "
              "committing the lock file's removal alongside the edit is that "
              "unlock, ratified.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
