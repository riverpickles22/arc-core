# <Story Title>

An **arc** story: the manuscript, and the record the manuscript rests on.

This repository holds only the story. The schemas, the tools and the
constitution live in [arc-core](https://github.com/riverpickles22/arc-core),
expected as a sibling checkout at `../arc-core` (or wherever `ARC_CORE_PATH`
points).

## What is here

| | |
|---|---|
| `canon/` | The source of truth. Structured YAML: entities, events, relationships, the timeline, the chapter list. Machine-checked. |
| `docs/` | Markdown for humans — the vision, the world, one article per entity, and `style.md`, this book's voice written down. |
| `prose/` | The manuscript, one file per scene, bound to canon by its frontmatter. |
| `research/` | Cited grounding for anything real. Evidence, not canon. |

Canon wins on conflict — a fact that lives only in a doc or in prose is not
yet a fact. See `../arc-core/conventions.md`, which is binding.

Optional, and created when the story needs them: `material/` for what is not
placed yet, `notes/` for the notebook, `annotations/` for margin notes on the
prose, `assets/` and `view.yaml` for the map.

## Checking it

```sh
bin/validate
```

Schemas, id and wikilink integrity, era containment, citation keys. Run it
after any canon change; a red validator is a broken story, and the viewer's
health endpoint reports the same findings.

## Reading it

From an arc workspace with the three system repos checked out as siblings:

```sh
../arc/dev.sh .
```

The world map, the timeline, the graph and the manuscript, at
<http://localhost:5173>.

## Working on it with an agent

`CLAUDE.md` holds this story's agent workflow. The general rules — reading
order, how to mint canon, the proposed-versus-canon default — live in
arc-core and are shared by every story rather than repeated here.

## Rights

The story is the author's. arc's software is Apache 2.0; nothing about that
licence reaches the prose, the canon, the characters or the notes in this
repository.
