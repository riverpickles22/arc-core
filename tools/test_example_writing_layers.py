#!/usr/bin/env python3
"""The worked example carries what a writing brief has to read.

The gap this closes: arc's writing slice (agent-workflows §4) is assembled in
named layers — the handoff, the dramatic condition, canon with its status,
position, voice, the live obligations — and every test of that assembly runs
against `examples/example-story`. A layer whose source is missing from the
example renders empty, and an empty layer PASSES a test that only asks whether
the assembler ran. So the example has to carry one honest instance of each,
and something has to say so out loud (A69-1).

This is a fixture-shape test, not a schema test: `validate.py` already proves
these files are well formed. What is proved here is that they are still THERE
and still REACHABLE from the scene, so that deleting Ines's fears or the open
obligation to tidy the example is a failure here rather than a silently weaker
brief three stories later.

What it cannot prove: that a layer actually RENDERS. This test reads YAML; the
assembler is TypeScript, and the brief is what the assembler makes of these
files. arc-backend holds the other half — `fixture-engine.test.ts` asserts the
proposed fact reaches a rendered brief — and both halves are needed, because
the sources being present and the brief carrying them are two different claims.
Today's pack seeds its cast from the POV and from event participants, and the
example's scene binds no events, so Wren's voice is in canon and NOT in the
brief; the voice layer that reads the scene's bound characters is A69-7's.

Run: python3 tools/test_example_writing_layers.py
"""
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "example-story"
SCENE = EXAMPLE / "prose" / "ch-01" / "scene-01.md"

failures = 0


def expect(cond, msg):
    global failures
    if not cond:
        print(f"  FAIL {msg}", file=sys.stderr)
        failures += 1


def load(path):
    return yaml.safe_load(path.read_text())


def main():
    scene_fm = yaml.safe_load(SCENE.read_text().split("---")[1])
    bound = set(scene_fm.get("facts") or [])

    # 1. THE DRAMATIC CONDITION. The POV character's snapshot at the scene's
    #    moment carries wants, fears and beliefs in their own fields — not
    #    inside `psychology` prose, where no diff and no brief can see them
    #    (conventions §4).
    ines = load(EXAMPLE / "canon" / "entities" / "characters" / "ines.yaml")
    at_scene = [s for s in ines["states"] if str(s["at"].get("date", "")).startswith("1910")]
    expect(len(at_scene) == 1, "Ines has exactly one snapshot at the scene's moment")
    if at_scene:
        st = at_scene[0]
        for field in ("wants", "fears", "beliefs"):
            expect(isinstance(st.get(field), list) and st[field],
                   f"Ines's 1910 snapshot carries a non-empty {field} list")
        expect(any(r.get("stance") for r in st.get("relationships") or []),
               "Ines's 1910 snapshot carries at least one stance")

    # 2. VOICE, for every present character and not only the POV. The scene
    #    binds two characters; the voice layer is a list, so it needs two.
    voiced = 0
    for f in (EXAMPLE / "canon" / "entities" / "characters").glob("*.yaml"):
        e = load(f)
        if e["id"] in bound and (e.get("voice") or "").strip():
            voiced += 1
    expect(voiced >= 2, f"at least two characters the scene binds carry a voice (found {voiced})")

    # 3. CANON WITH STATUS. A `proposed` id is only worth carrying if a brief
    #    can SEE it: an object reaches a drafting context through the POV's
    #    `possessions` at T, and an edge only when both its endpoints are
    #    already in (context-pack-lib). A proposed fact hanging off nothing is
    #    on disk and in no brief, and proves nothing about status — so the
    #    reachability is what is asserted, not the mere existence.
    statuses = {}
    for f in (EXAMPLE / "canon").rglob("*.yaml"):
        doc = load(f)
        for item in ([doc] if isinstance(doc, dict) and "id" in doc else
                     (doc.get("relationships") or []) if isinstance(doc, dict) else []):
            if isinstance(item, dict) and item.get("id"):
                statuses[item["id"]] = item.get("status")
    proposed = {i for i, st in statuses.items() if st == "proposed"}
    expect(proposed, "the example carries at least one proposed canon id")
    reachable = set()
    for st in ines.get("states", []):
        reachable |= set(st.get("possessions") or [])
    edges = load(EXAMPLE / "canon" / "relationships.yaml")["relationships"]
    for r in edges:
        if r["from"] in bound or r["to"] in bound:
            reachable |= {r["id"], r["from"], r["to"]}
    expect(proposed & reachable,
           f"a proposed id hangs off an entity the scene binds (proposed={sorted(proposed)}, "
           f"reachable={sorted(reachable)})")
    expect(any(statuses.get(i) == "canon" for i in bound),
           "and the scene still binds canon the prose may rest on")

    # 4. LIVE OBLIGATIONS. One obligation nothing discharges, with a window
    #    that touches the scene's chapter — the normal state of an open
    #    obligation (conventions §12), and what the live-obligations layer
    #    reads.
    material = list((EXAMPLE / "material").glob("*.yaml")) if (EXAMPLE / "material").is_dir() else []
    obligations = [load(f) for f in material]
    open_ones = [o for o in obligations
                 if o.get("type") == "obligation" and o.get("status") == "unplaced" and not o.get("satisfied_by")]
    expect(open_ones, "the example carries an open obligation nothing satisfies")
    expect(any((o.get("window") or {}).get("from") == scene_fm["chapter"]
               or (o.get("window") or {}).get("to") == scene_fm["chapter"]
               for o in open_ones),
           "and its window touches the scene's own chapter")

    # 5. THE HANDOFF's honest empty case. sc.01-1 must be the FIRST scene in
    #    book order, so the layer reads `none — the first scene of the book`
    #    rather than `not shown`. The example gaining a second scene later is
    #    fine and expected; sc.01-1 stopping being the first is not.
    scenes = sorted(p.name for p in (EXAMPLE / "prose").rglob("*.md"))
    chapters = {c["id"]: c.get("order", 0) for c in load(EXAMPLE / "canon" / "chapters.yaml")["chapters"]}
    first_chapter = min(chapters, key=lambda c: chapters[c])
    expect(scene_fm["chapter"] == first_chapter and scenes[0] == SCENE.name,
           "sc.01-1 is still the first scene of the first chapter, so the handoff's empty case is real")

    if failures:
        print(f"{failures} FAILURES", file=sys.stderr)
        return 1
    print("example writing layers: wants, fears and beliefs in their own fields; two voices; "
          "a proposed id beside canon; one obligation nothing satisfies; the handoff honestly empty")
    return 0


if __name__ == "__main__":
    sys.exit(main())
