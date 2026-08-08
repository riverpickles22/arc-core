# arc conventions

The constitution for every arc story. Canon files, docs, and tools all conform to what is written here.

## 1. Layers and supremacy

1. **Canon** (`canon/**/*.yaml`) — structured facts. The single source of truth.
2. **Docs** (`docs/**/*.md`) — human-readable articles that elaborate on canon.
3. **Prose** (`prose/`) — the manuscript.
4. Conversation / working notes — ephemeral.

On any conflict: **canon > docs > prose > conversation**. Prose must never contradict a `status: canon` fact. A fact that exists only in a doc or in prose is not yet a fact — it must be promoted into canon or logged as an open question.

## 2. Identifiers

Every canonical thing has a stable ID: `type.slug`, kebab-case, optionally hierarchical with dots.

Examples below are drawn from the world of `examples/example-story`.

| Prefix | Type | Examples |
|---|---|---|
| `char.` | character (humans *and* animals) | `char.ines`, `char.wren` |
| `place.` | place (hierarchy via dots) | `place.whitcombe-light`, `place.whitcombe-light.lamp-room` |
| `faction.` | faction / organization / group | `faction.lighthouse-board` |
| `obj.` | significant object | `obj.keepers-log` |
| `event.` | event (story or historical) | `event.the-wreck` |
| `era.` | timeline era | `era.after-the-wreck` |
| `tp.` | named timepoint (anchor) | `tp.the-storm` |
| `rel.` | objective relationship edge | `rel.ines-wren` |
| `ch.` | chapter (narrative structure) | `ch.02-the-aurelia` |

Regex: `^[a-z]+\.[a-z0-9-]+(\.[a-z0-9-]+)*$`

Rules:
- IDs are permanent. Renaming an entity changes its `name`, never its ID.
- The file for `char.ines` is `canon/entities/characters/ines.yaml`; for `place.whitcombe-light.lamp-room` it is `canon/entities/places/whitcombe-light.lamp-room.yaml` (full dotted slug as filename).
- Before minting an ID, grep for collisions: `grep -rn "char.new-slug" canon docs`.
- When you mint an entity, create its YAML file and its docs article stub together.

## 3. Dates and time

ISO-8601 strings with **reduced precision allowed**: `"1959"`, `"1959-01"`, `"1959-01-01"`.

A *timeref* is an object:

```yaml
at: { era: era.revolution, date: "1959-01", precision: month, approximate: true }
```

- `era` — required; the era ID this moment belongs to.
- `date` — optional; as precise as honestly known.
- `precision` — `year | month | day` (defaults to the precision of the string).
- `approximate: true` — the date is a deliberate blur, not a researched fact.

Never invent false precision. `"1959"` + `approximate: true` beats a fabricated exact day.

## 4. Versioned state (the journey)

Characters and places carry a `states:` list — **time-ordered snapshots**. Snapshots are authoritative: to know an entity's condition at story-time *T*, take the latest state whose `at` ≤ *T*. No replay logic.

- A snapshot may declare `caused_by: [event.*]` — the events that produced it. Causality is traceable, but the snapshot itself is the record.
- **Objective vs subjective:** objective relationships (kinship, ownership, membership) live in `canon/relationships.yaml`. How a character *perceives* a relationship at a moment in time lives in that character's state snapshot under `relationships:`. The edge "Carlos owns Diego" never changes; Carlos's *feelings* about Diego change per snapshot. This is how arc versions perception.
- New psychological development ⇒ new snapshot, not an edit to an old one (edit old snapshots only to correct errors).

## 5. Status lifecycle

Every entity, event, and edge carries `status`:

- `proposed` — drafted, not yet ratified by the author. Agents may reference it but must not build load-bearing prose on it.
- `canon` — binding. Prose and docs must conform.
- `deprecated` — superseded; kept for history. Must carry a `superseded_by` or explanatory `note`.

Promotion `proposed → canon` is an explicit authorial act, never a side effect.

## 6. Canon-change discipline

- A new fact invented while writing docs or prose is added to canon **in the same commit**, or filed under the relevant article's **Open questions** section.
- Changing existing canon: update the YAML, update every affected state/event/article, explain the change in the commit message, run `tools/validate.py`.
- Research findings never flow into canon automatically. A research pass files corrections as `status: proposed` entries (or `narrative_notes`) for the author to ratify.
- Canon may deliberately diverge from history. When it does, note the divergence in the entity's `narrative_notes` or the article, citing the research topic it diverges from.

## 7. Cross-referencing

- Markdown → canon: wikilinks containing full IDs — `[[char.ines]]`, or labeled `[[char.wren|the dog]]`. Greppable via `\[\[[a-z]+\.`.
- Docs articles bind to their entity with frontmatter: `canon: char.ines`. One article per entity, path mirroring `canon/entities/`.
- Canon → research: a `grounding:` list of research topic slugs (`grounding: [lighthouse-keeping]`) pointing at `research/topics/<slug>.md`.
- Research claims cite `research/sources.yaml` keys inline: `[@example-keeper-manual]`.
- Docs sections not yet grounded carry a machine-findable marker: `> TODO(research: <topic-slug>)`.

## 8. Files and validation

- Canon is YAML (hand-editable, comments allowed, multiline prose fields). Schemas in arc-core's `schema/*.schema.json` (JSON Schema 2020-12) validate the *parsed* data.
- One file per entity and per event. Objective edges collected in `canon/relationships.yaml`. Timeline in `canon/timeline.yaml`. Story manifest in `canon/story.yaml`.
- `tools/validate.py` enforces: schema conformance, every referenced ID resolves, every wikilink resolves, every state/event timeref falls inside its declared era, every citation key exists in `sources.yaml`.

## 9. Story layout and repo boundaries

A story is a self-contained directory — `canon/`, `docs/`, `research/`, `prose/`, and a `CLAUDE.md` describing its agent workflow. It may live anywhere: its own repository, a sibling checkout, or a subdirectory of arc-core (as `examples/example-story` does). Nothing in arc-core is story-specific, and nothing in a story repeats what arc-core defines.

A story may also carry its own presentation, which is **not canon** and is not validated:

- `assets/` — files an app draws, such as a basemap coastline.
- `view.yaml` — how the story is drawn: which basemap to use, and an optional map inset for a dense cluster of places.

Both are optional. Apps derive what they can from canon — the map fits itself to the coordinates of `place` entities, and character colours follow `story.protagonists` — so presentation config only records the editorial choices canon cannot imply. These live with the story rather than with the app so that an app serves *any* story, not one of them.

The tools take a story path as an argument and resolve schemas relative to arc-core, so the two never need to share a working tree:

```
python3 tools/validate.py     ../my-story
python3 tools/export-canon.py ../my-story
```

New stories copy `templates/` and the shape of `examples/example-story`. They never fork the schema — a story that needs a schema change needs it in arc-core, for everyone.

## 10. Prose and scenes (the binding)

Prose lives in `prose/`, one directory per chapter, one file per scene:

```
prose/
├── ch-00/
│   └── scene-01.md
└── ch-01/
    ├── scene-01.md
    └── scene-02.md
```

**The scene is the unit that binds prose to canon.** Each scene file opens
with YAML frontmatter declaring what the prose rests on; the body below it
is the manuscript text and nothing else — no markers, no citations, no
machine syntax in the prose itself.

```markdown
---
scene: sc.00-1                 # permanent id: sc.<chapter number>-<n>
chapter: ch.00-prologue        # must resolve
status: proposed               # same lifecycle as canon: proposed → canon
pov: char.carlos               # optional; omit for omniscient
events: [event.seed-comes-ashore]        # the events this scene narrates
facts: [place.hollow-tree, char.carlos]  # entities/relationships it rests on
---

The prose begins here.
```

Rules:

- Frontmatter ids **must resolve** — the validator checks `chapter`, `pov`,
  `events`, and `facts` against defined ids, the same way it checks canon.
- The binding is **invertible**: `tools/scenes.py <story> --fact <id>` lists
  every scene resting on a fact, which is what lets a canon change mark the
  prose that depends on it as stale.
- Scene ids are permanent, like all ids (§2). Scenes are ordered by
  filename within a chapter.
- Passage-level granularity, if ever needed, is added *inside* a scene
  later — the scene remains the binding unit; nothing here would migrate.
- On conflict, canon wins over prose (§1). A scene whose frontmatter is
  honest makes that conflict findable.

**The scene contract (optional).** Beyond what a scene rests on, the
frontmatter may state what the scene is *for* — the contract it must
satisfy, not an outline of what happens. Every field is optional: the
contract is clarity, never homework. Review passes evaluate prose against
the scene's stated purpose instead of offering generic advice; the reader
fields feed the reader model later.

```yaml
contract:
  purpose: >                    # what changes because this scene exists
    Introduce the hollow tree without explaining its symbolism.
  reader_before: Knows nothing about the tree.
  reader_after: >               # what the reader must know/suspect/feel after
    Senses that something foreign is slowly consuming something native.
  wants:                        # keyed by char id — keys must resolve
    char.carlos: His father's approval.
  must_establish:               # free text, checkable by a review pass
    - The seed arrives accidentally.
  must_withhold:
    - The settler's identity.
  motifs: [the hollowing, foreign intrusion]
  constraints: Omniscient, at the speed of vegetation. Cuba, 1903.
```

`wants` keys are validated against defined ids like every other binding
reference; the other fields are the author's language, not canon ids.

## 11. The three registers of consequence

Every finding any arc surface shows lives in exactly one register, and no
surface may blur them:

- **proven** — deterministic facts over the record: the continuity checks,
  the reports, the impact walk. The only register ever presented as an
  *error*. Same input, same answer, every run.
- **argued** — model-read claims about prose or likely narrative impact.
  Always presented as claims with citations, to review — never verdicts,
  never with proven's confidence. (No shipped surface carries this register
  yet; the type exists so those surfaces land into it, not around it.)
- **asked** — creative questions the dependency structure surfaces ("this
  payoff is planted by the fact you're changing — does it still stand?").
  The machine surfaces them because the dependency is visible; it never
  answers them.

The rule that follows: a report presents the registers labeled, in that
order — proven, argued, asked. A tool that presents *argued* with
*proven*'s confidence is overclaiming; a tool that answers *asked* is
writing the book. The `Register` type lives in `graph/canon-graph.ts`
beside `Finding`; a finding without a register is proven.
