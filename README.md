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
templates/            Markdown skeletons for docs
tools/validate.py     Schema conformance + referential integrity
tools/export-canon.py Canon YAML -> one JSON graph, for any app
examples/example-story/  A small, valid, complete story to copy from
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

`validate.py` exits 0 when clean and 1 with a list of findings otherwise, which makes it usable as a pre-commit hook or CI gate on a story repo. It checks schema conformance, that every referenced ID resolves, that every `[[wikilink]]` in docs resolves, that every entity has a docs article, that every timeref falls inside its declared era, that every grounding slug names a real research topic, and that every `[@citation]` is registered in `sources.yaml`.

## Starting a story

Copy the shape of `examples/example-story` — it is deliberately small (three entities, one event, two relationships) and it validates. Read `conventions.md` before writing canon; it is short, and it is the part that makes the rest work.

## The rest of arc

- **arc-backend** — canon API and the embedded world-shaping agent.
- **arc-frontend** — the living map/graph/timeline viewer.

Both are optional. Canon plus these tools is a complete, useful system on its own.
