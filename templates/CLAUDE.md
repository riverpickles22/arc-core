# <Story Title> — agent workflow

You are working inside an **arc** story. This repository holds *only* the story;
the schemas, tools, and constitution live in the separate **arc-core** repo,
expected as a sibling checkout at `../arc-core`.

Read `../arc-core/conventions.md` first; it is binding. This file tells you how
to *consume and update* this story's canon.

The general arc workflow — reading order, query recipes, minting/changing
canon, the proposed-vs-canon default — lives in arc-core's `arc-canon` skill,
so every story shares one copy of it instead of each repeating it. If that
skill isn't available in this session (it's discovered from `arc-core`'s own
working tree, which this repo is a sibling of, not a descendant of), read
`../arc-core/conventions.md` §§4–8 directly — it covers the same ground and
is binding regardless.

## Canon supremacy

`canon/**/*.yaml` is the source of truth. On conflict: **canon > docs >
prose > conversation**. Never write prose or docs that contradict a
`status: canon` fact. `status: proposed` facts may be referenced but not
load-bearing. If you need a fact that doesn't exist, mint it — do not
improvise it in prose only.

## Validation

Run after any canon change:

```bash
# from the root of this repo
bin/validate
```

That wrapper holds nothing but the answer to "where is arc-core"; it honours
`ARC_CORE_PATH` and says so when it cannot find a checkout. Without it, the
long form is `../arc-core/.venv/bin/python ../arc-core/tools/validate.py .`

Checks schemas, ID/wikilink referential integrity, era containment of
timerefs, and citation keys. A red validator blocks the commit.

If `../arc-core` is missing, clone it alongside this repo and install its
requirements — see that repo's README.

## Current state of this story (update when it changes)

- Milestone: **TODO** — e.g. "premise only", "material" (canon but no prose),
  "drafting".
- TODO: note the most recent ratification pass and what it moved from
  `proposed` to `canon`.
- TODO: link open structural questions (POV, structure, endings still being
  decided) to wherever they're tracked — `docs/vision.md` or similar.
