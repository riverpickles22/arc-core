# arc-core

The story-agnostic core of **arc**, a system for writing long-form fiction with AI assistance while keeping the story canonical and internally consistent.

This repository holds the constitution, the schemas, and the tools. It holds no story.

## Theory

A novel is two things:

1. **The story** — the prose itself.
2. **The material that shapes the story** — the world: its geography, politics, history, factions, objects, and above all its characters and how they change.

arc always builds the material **first**. The material lives as a versioned graph: entities (characters, places, factions, objects) connected by relationships and events, with **state snapshots** capturing how each character's location, condition, psychology, beliefs, and perception of others evolve across story-time. When an AI agent writes prose, it reads this graph — not its memory of earlier chapters — so a detail established in chapter 2 cannot silently drift by chapter 40.

## The three layers

Every arc story has the same three layers:

| Layer | Location | Role |
|---|---|---|
| **Canon** | `<story>/canon/` | Structured YAML. **The source of truth.** Machine-consumed by writing agents and the viewer. |
| **Docs** | `<story>/docs/` | Markdown for humans: vision, a wikipedia-style world document, per-entity articles. Docs elaborate and motivate; canon states facts. On conflict, **canon wins**. |
| **Research** | `<story>/research/` | Cited factual grounding for stories set in real history. Research is *evidence*, not canon — the story may diverge from history, but only knowingly. |

## What's here

```
conventions.md        The constitution: IDs, dates, linking, canon discipline
schema/               JSON Schemas (2020-12) that validate canon YAML
templates/            Markdown skeletons for docs, and a story's CLAUDE.md
tools/validate.py     Schema conformance + referential integrity + scene bindings
tools/export-canon.py Canon YAML -> one JSON graph, for any app
tools/scenes.py       The prose binding, inverted: which scenes rest on a fact
graph/                The query layer over the export (TypeScript, zero-dep):
                      the date-ordering rule, projectAt(T), neighbors, orphans,
                      diff, the six cross-entity checks, and three CLIs
examples/example-story/  A small, valid, complete story to copy from
.claude/skills/arc-canon/  A Claude Code skill for working canon from the terminal
```

## Setup

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Usage

Both tools take a **path to a story directory**. The story can live anywhere — its own repository, a sibling checkout, a subdirectory here. Only the schemas resolve relative to this repo.

```sh
.venv/bin/python tools/validate.py     examples/example-story
.venv/bin/python tools/export-canon.py examples/example-story        # graph to stdout
.venv/bin/python tools/export-canon.py ../my-story out/canon.json    # or to a file
```

`validate.py` exits 0 when clean and 1 with a list of findings otherwise, which makes it usable as a pre-commit hook or CI gate on a story repo. It checks schema conformance, that every referenced ID resolves, that every `[[wikilink]]` in docs resolves, that every entity has a docs article, that every timeref falls inside its declared era, that every grounding slug names a real research topic, that every `[@citation]` is registered in `sources.yaml`, and that every prose scene's frontmatter binding resolves (conventions §10). A missing `jsonschema` package is a hard failure — `--skip-schema` runs the other checks and says so loudly.

The **graph layer** (`graph/`, Node 22+) works on the export JSON — the date-ordering rule lives here once, held to `graph/date-vectors.json` in both languages (`npm test` in `graph/`, `tools/test_date_vectors.py`):

**The testing pattern** (established by the date vectors; new checks follow it):
one command per repo — `npm test` in `graph/` runs every TS suite, and each
`tools/test_*.py` runs standalone (both wired into CI). A rule implemented in
more than one language is specified once in a **shared vector file**
(`graph/date-vectors.json`) that every implementation runs — sections a
language can't apply say so in the file (`eras` is TS-only). Behavioral
checks are verified against **planted-defect fixtures** beside the tests
(`graph/fixtures/`): every planted violation must be found *and* its clean
twin must stay quiet, so a check is tested for both sensitivity and silence.
Validator rules get a **negative test** proving each failure mode fails
(`tools/test_provenance.py` is the template).

```sh
.venv/bin/python tools/export-canon.py ../my-story - |
  node --experimental-strip-types graph/briefing.ts -            # reports + the six continuity checks (--strict for pre-commit)
  node --experimental-strip-types graph/context-pack.ts - --chapter ch.10   # auditable drafting bundle
  node --experimental-strip-types graph/cli.ts - --at 1959 --orphans        # projection, neighbors, diff
```

## Working from Claude Code

`.claude/skills/arc-canon/` packages this same discipline — read
`conventions.md`, locate a story, query the graph, write through the
validator — as a Claude Code skill, so a terminal session can read and
reshape canon without `arc-frontend` or `arc-backend` running. It holds
itself to the same rules as `arc-backend`'s embedded chat agent (new facts
land as `status: proposed` unless the author ratifies them); the two are
peers, not a UI path and a lesser one.

The skill lives here because it's story-agnostic, same as everything else in
this repo. It's discovered when a Claude Code session's working tree includes
`arc-core` — reliably so if you `cd` into it or a workspace root above it.
From inside a story's own repo, where `arc-core` is a sibling rather than an
ancestor, it may not surface; that story's `CLAUDE.md` (see `templates/`)
should point back at `conventions.md` directly as a fallback.

## Starting a story

Copy the shape of `examples/example-story` — it is deliberately small (three entities, one event, two relationships) and it validates. Read `conventions.md` before writing canon; it is short, and it is the part that makes the rest work.

## The rest of arc

- **arc-backend** — canon API and the embedded world-shaping agent.
- **arc-frontend** — the living map/graph/timeline viewer.

Both are optional. Canon plus these tools is a complete, useful system on its own.
