# The Keeper of Whitcombe Light — agent workflow

You are working inside an **arc** story. This repository holds *only* the story;
the schemas, tools, and constitution live in the separate **arc-core** repo,
expected as a sibling checkout at `../../` (this example lives inside
arc-core itself, as `examples/example-story`).

Read `../../conventions.md` first; it is binding. This file tells you how to
*consume and update* this story's canon.

The general arc workflow — reading order, query recipes, minting/changing
canon, the proposed-vs-canon default — lives in arc-core's `arc-canon` skill,
so every story shares one copy of it instead of each repeating it. If that
skill isn't available in this session, read `../../conventions.md` §§4–8
directly — it covers the same ground and is binding regardless.

## Canon supremacy

`canon/**/*.yaml` is the source of truth. On conflict: **canon > docs >
prose > conversation**. Never write prose or docs that contradict a
`status: canon` fact. `status: proposed` facts may be referenced but not
load-bearing. If you need a fact that doesn't exist, mint it — do not
improvise it in prose only.

## Validation

Run after any canon change:

```bash
# from arc-core's root
.venv/bin/python tools/validate.py examples/example-story
```

## Current state of this story

- Milestone: **material**, with one scene. This is arc's worked example, not
  a novel anyone is writing — deliberately small (four entities, one event,
  three relationships) so the tools and a new story's copy-from shape both
  have something real and valid to point at.
- `prose/ch-01/scene-01.md` is the one scene, and it exists for arc's own
  tests: arc-backend's fixture engine runs the route passes against it, so it
  carries a contract with a quoted withhold, author-marked key points
  (`annotations/`), a locked paragraph (`locks/`) and an author note that
  quotes the prose. Its wording is load-bearing — every fixture brief is
  fingerprinted over it — so a change here is a fixture change there
  (`arc-backend/fixtures/`, `npm run fixtures:rekey -- --because "…"`).
- **What the writing slice reads, one honest instance of each (A69-1).** arc
  assembles a writing brief in named layers (agent-workflows §4), every test
  of that assembly runs against this story, and a layer whose source is
  missing renders empty — which passes a test that only asks whether the
  assembler ran. So the example carries one of each, and
  `tools/test_example_writing_layers.py` fails if any of them is tidied away:
  **In the brief today:**
  - Ines's 1910 snapshot carries `wants`, `fears` and `beliefs` in their own
    fields rather than inside the `psychology` prose (conventions §4 —
    completing a snapshot's record, not changing what it claims). It is a
    year-precision snapshot against a scene in 1910-11, which makes it the
    example's *aged state fact*; saying how old it is is A69-6's job, and the
    fact to say it about is here.
  - `obj.keepers-log` and `rel.ines-log` are **proposed**, not canon. The
    scene already writes in that book; whether the log is the board's record
    or Ines's own is undecided, which is the point — a brief must say which
    facts may bear weight, and a pass that rests prose on this one is wrong.
    Ines's 1910 state lists the log under `possessions`, because that is the
    only way an object reaches a drafting context at all: a proposed fact no
    brief can see proves nothing. `fixture-engine.test.ts` holds that line.

  **In canon, and not yet in any brief** — the sources the slice-2 layers
  will read, named here so nobody assumes today's pack already renders them:
  - `material/mat-light-must-nearly-fail.yaml` is an **open obligation**
    nothing discharges, windowed over ch.01–ch.02. Absence of `satisfied_by`
    is the normal state of an open obligation. The briefing's WHAT'S DUE
    reads it today; the live-obligations layer of a writing brief is A69-6's.
  - Both characters the scene binds carry a `voice`. Only the POV's reaches
    the brief right now: the pack seeds its cast from the POV and from event
    participants, and this scene binds no events, so Wren is in canon and not
    in the brief. The layer that reads every bound character is A69-7's.
  - The handoff layer's empty case — *none, the first scene of the book* — is
    real here rather than contrived, because sc.01-1 is the first scene of the
    first chapter. A second scene arriving later is fine; sc.01-1 ceasing to
    be first is what would break it.
- Otherwise everything in `canon/` is `status: canon`. If you're using this
  story to test the `proposed` workflow beyond the log above, that's expected
  to be temporary — revert before committing.
