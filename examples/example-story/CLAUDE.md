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
  a novel anyone is writing — deliberately small (three entities, one event,
  one relationship) so the tools and a new story's copy-from shape both have
  something real and valid to point at.
- `prose/ch-01/scene-01.md` is the one scene, and it exists for arc's own
  tests: arc-backend's fixture engine runs the route passes against it, so it
  carries a contract with a quoted withhold, author-marked key points
  (`annotations/`), a locked paragraph (`locks/`) and an author note that
  quotes the prose. Its wording is load-bearing — every fixture brief is
  fingerprinted over it — so a change here is a fixture change there
  (`arc-backend/fixtures/`, `npm run fixtures:rekey`).
- Everything in `canon/` is `status: canon`; there is nothing pending
  ratification. If you're using this story to test the `proposed` workflow,
  that's expected to be temporary — revert before committing.
