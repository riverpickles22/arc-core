#!/usr/bin/env python3
"""Scene index — the prose-to-canon binding, inverted.

Usage:
  python3 tools/scenes.py <path-to-story>              # every scene and its bindings
  python3 tools/scenes.py <path-to-story> --fact <id>  # scenes resting on one fact

The inversion (fact -> scenes) is what makes stale-marking mechanical: when
a canon change touches an id, the scenes listed here are the prose to
re-read (conventions.md §10).
"""
import re
import sys
from pathlib import Path

import yaml


def scenes_of(story_dir):
    prose = story_dir / "prose"
    out = []
    if not prose.is_dir():
        return out
    for f in sorted(prose.rglob("*.md")):
        fm = re.match(r"^---\n(.*?)\n---\n", f.read_text(), re.S)
        if not fm:
            continue
        meta = yaml.safe_load(fm.group(1)) or {}
        if "scene" not in meta:
            continue
        refs = [meta.get("chapter"), meta.get("pov"),
                *(meta.get("events") or []), *(meta.get("facts") or []),
                *((meta.get("contract") or {}).get("satisfies") or [])]
        out.append({"scene": meta["scene"], "file": f.relative_to(story_dir),
                    "status": meta.get("status", "proposed"),
                    "refs": [r for r in refs if r]})
    return out


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    fact = None
    if "--fact" in args:
        i = args.index("--fact")
        fact = args[i + 1]
        args = args[:i] + args[i + 2:]
    story_dir = Path(args[0]).resolve()
    scenes = scenes_of(story_dir)
    if fact:
        hits = [s for s in scenes if fact in s["refs"]]
        print(f"{len(hits)} scene(s) rest on {fact}:")
        for s in hits:
            print(f"  {s['scene']} ({s['status']}) — {s['file']}")
        return
    if not scenes:
        print("no bound scenes (prose/ has no scene frontmatter yet)")
        return
    for s in scenes:
        print(f"{s['scene']} ({s['status']}) — {s['file']}")
        for r in s["refs"]:
            print(f"    {r}")


if __name__ == "__main__":
    main()
