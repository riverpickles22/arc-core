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
- New psychological development ⇒ new snapshot, not an edit to an old one (edit old snapshots only to correct errors). Adding a field a snapshot's own prose already implies (a want living in a stance string, a fear filed as a belief) *completes* the record of that timepoint and is allowed; changing what a snapshot claims is not.

**The state fields**, shared by every entity type (one `$defs.state` — a
place or an object may carry `psychology` in principle; use judgment):
`at` (required), `caused_by`, `age`, `location`, `condition`, `psychology`,
`beliefs`, `wants`, `fears`, `relationships` (perception, above),
`possessions`, `controlled_by`, `note`.

- `beliefs` — what the entity holds true; `wants` — what it is moving
  toward; `fears` — what it is moving away from. Structured lists, not
  prose, so a diff between two moments can say *which* belief was lost and
  *which* fear replaced it. Wants and fears that live inside `psychology`
  prose or a relationship stance are invisible to every diff and every
  drafting context — put them in their fields.
- Naming collision, deliberate: a **scene contract's** `wants` (§10) is a
  map keyed by character id — what each character wants *in that scene*. A
  **state's** `wants` is the character's own list — what they want *in
  life, at that moment*. Same word, different scope and shape.
- Knowledge (`knows`) is deliberately **not** a state field yet — it
  arrives id-typed (`knows: [event.*]`) with the knowledge lint, so that
  what a character knows stays checkable rather than stringly.

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
- A **reference** hands an exact object between surfaces — the viewer, an
  agent session, a finding: `<id>`, optionally anchored to a moment with
  `@` — `char.carlos@ch.10-return` (the world as of that chapter's span
  end) or `char.carlos@1992` (end of that date). Consumers resolve the
  anchor with `projectAt`; an unanchored reference means "timeless" (the
  record itself). The viewer's `⧉ ref` buttons copy this form.

## 8. Files and validation

- Canon is YAML (hand-editable, comments allowed, multiline prose fields). Schemas in arc-core's `schema/*.schema.json` (JSON Schema 2020-12) validate the *parsed* data.
- One file per entity and per event. Objective edges collected in `canon/relationships.yaml`. Timeline in `canon/timeline.yaml`. Story manifest in `canon/story.yaml`.
- `tools/validate.py` enforces: schema conformance, every referenced ID resolves, every wikilink resolves, every state/event timeref falls inside its declared era, every citation key exists in `sources.yaml`.

## 9. Story layout and repo boundaries

A story is a self-contained directory — `canon/`, `docs/`, `research/`, `prose/`, and a `CLAUDE.md` describing its agent workflow. It may live anywhere: its own repository, a sibling checkout, or a subdirectory of arc-core (as `examples/example-story` does). Nothing in arc-core is story-specific, and nothing in a story repeats what arc-core defines.

A story also carries its **style contract** — `docs/style.md`, the author's
voice written down (§10) — started from `templates/style.md`.

A story may also carry its own presentation, which is **not canon** and is not validated:

- `assets/` — files an app draws, such as a basemap coastline.
- `view.yaml` — how the story is drawn: which basemap to use, and an optional map inset for a dense cluster of places.

A story may also carry `notes/` — the author's notebook. Plain markdown with a
small frontmatter block (`id`, `created`, `worked`), one file per note. These
are whatever the author wanted written down and have no structure imposed on
them: writing a note runs no model, asserts nothing, and cannot fail for an
interesting reason. Nothing reads a note until the author asks arc to work it
into the story, which produces material (§12) and leaves the note untouched.
Notes are committed — they are part of the story, not machine scratch.

A story may also accumulate `.arc/` — machine working state, such as what a
drafting pass generated before the author edited it. It is gitignored, never
canon, and nothing but arc reads it; delete it freely. The distinction from
`notes/` is worth stating: `.arc/` is arc's, and disposable; `notes/` is the
author's, and kept.

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

**The style contract.** The scene contract says what *one scene* must
accomplish. The style contract says how *all sentences* behave — the
author's voice, written down so it survives a new session, a new
collaborator, or a machine. It binds prose **form**; canon still wins on
every question of **fact** (§1).

It lives in two layers, both loaded, the more specific winning:

```
~/.arc/style.md      the author's own voice — constant across books
                     (ARC_AUTHOR_STYLE overrides the location)
docs/style.md        this story's contract — wins on any conflict
```

An author who writes one book needs only the story layer; the author
layer exists so that what is constant about a writer does not have to be
rediscovered with every project. Both are ordinary markdown, versioned
like anything else, and either may be absent.

A style contract holds four kinds of thing, and its shape is a
convention, not a schema — nothing validates it:

- **Rules** — checkable statements about form: POV and tense, what the
  narrator may not do, sensory and rhythm habits, diction boundaries,
  what is deliberately never named.
- **Touchstones** — passages quoted from the author's own manuscript that
  calibrate a rule, each labelled with the quality it demonstrates. A
  wrong version, annotated with the rules it violates, teaches more than
  three right ones.
- **A pre-draft checklist** — the questions any writer, human or machine,
  answers before showing prose to the author. It is to prose what
  `validate.py` is to canon: a gate that runs before the work is offered,
  not a review afterwards.
- **Open questions** — style decisions not yet made, held honestly rather
  than resolved by accident.

Rules: every pass that writes or judges prose loads both layers and states
which one wins. **The contract grows by extraction, never by invention** —
a rule earns its place because the author's own edits or corrections imply
it, and a machine may only *propose* one. Proposed rules wait outside the
contract and bind nothing until the author ratifies them; a machine never
writes a binding rule, because a voice nobody chose is not a voice.
New stories start from `templates/style.md` (§9).

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

## 12. Story material (the unplaced layer)

The full ladder of a fact's life:

1. **Material** — something the author is considering. Intentions, unplaced
   scenes, obligations, gaps: "Carlos needs a close childhood friend."
2. **Proposed** — the author (or an agent) thinks it belongs; pending
   ratification (§5).
3. **Canon** — true in the story.
4. **Manuscript** — the reader has actually encountered it.

Material lives in `material/*.yaml` — beside canon, never in it. An item
carries `type` (character-need | unplaced-scene | motif-idea | relationship
| obligation | gap), `status` (`unplaced → placed → absorbed | dropped`),
its body as vague as honestly known, optional purpose, constraints,
`related` canon ids, and a likely chapter `window`. The validator checks
only the linkage (related ids, window chapters, placement); vagueness is
the point — never invent precision to satisfy a schema.

Rules:

- Material is **never load-bearing**: prose and canon must not depend on a
  material item. Promotion out of material is an explicit act — mint the
  proposed canon (or bind the scene), set the item `placed` (with
  `placed_in`) or `absorbed`, and keep the item as the record of intent.
- Capturing material must cost nothing: an agent hearing "capture that"
  files the item without forcing decisions about characters, scenes, or
  placement. `dropped` beats deletion — intent history is story history.

## 13. Provenance registers (what kind of fact is this?)

A story set against real history holds three different kinds of fact, and
a record can now say which it is — the `provenance` block, valid on any
entity or event:

```yaml
provenance:
  register: historical        # fictional | historical | inferred
  sources: [akc-havanese]     # keys into research/sources.yaml
  confidence: high            # required when register: inferred
  note: dates per the AKC breed history
```

- **fictional** — an in-story fact. The default reading when the block is
  absent; tag it explicitly only when the distinction is worth stating
  (e.g. a fictional café on a real street).
- **historical** — real history the story leans on. **Requires at least
  one source**, and every key must resolve in `research/sources.yaml` —
  the validator enforces both. A cited history that cites nothing is a
  trust hole, not a style choice.
- **inferred** — an authorial inference from history (plausible, not
  attested). **Requires `confidence`** (high | medium | low); sources
  optional but welcome.

This is the consequence-register discipline (§11) applied to facts:
`grounding` says which research *topics* inform a record; `provenance`
says what the record *is* and cites the specific sources. Surfaces that
render facts (profiles, the wiki) show the register so the author always
knows whether they are reading their invention or the world's record.

## 14. Annotations (thoughts anchored to the page)

An **annotation** is a thought the author had while reading a specific
passage: `annotations/*.yaml`, beside canon and material, never in canon.

```yaml
id: note.001
anchor:
  scene: sc.01-1          # permanent (§2) — survives everything
  paragraph: 4            # 0-based, at the time the note was made
  quote: >                # the selected text, verbatim
    Diego had taken up his post in the doorway
body: >
  Diego is furniture here. If "inseparable" is meant to be felt, it has to
  be dramatised, not asserted.
status: open              # open → working → resolved | dropped
```

**Annotations are not material** (§12), and the distinction is worth
holding. Material is an idea that *may* enter the story — it has no place
yet. An annotation is a reaction to something that is *already on the
page*. A note may promote into material, an obligation, or proposed canon
when its scope outgrows the passage; `links` records what it became.

**The anchor is where the thought occurred, not necessarily what it is
about.** An author may highlight one sentence and write something that
implicates the whole book. Nothing in the record should assume the note's
scope from its anchor's size.

Rules:

- The anchor resolves in order of durability — scene, then paragraph index,
  then the quoted text. A note whose quote has moved is **relocated and said
  to have drifted**; a note whose quote is gone is **orphaned**, keeps its
  text, and waits for the author. It is never silently reattached to
  whatever now occupies its old index: a note in the wrong place is worse
  than no note, because it costs trust in every other note.
- Orphaned notes are a **proven** finding (§11) — it is a fact that the
  passage is gone — and belong wherever findings are surfaced. Where the
  thought now belongs is the author's to say.
- Making a note must cost nothing: select, type, done. The author never
  categorises a note or declares its scope. Anything arc infers about scope
  is inference, and says so.
- A machine may read notes, plan against them, and propose — it never
  resolves one on the author's behalf, and never edits accepted prose
  because a note asked it to. Revision lands as a draft, through the same
  gate as everything else (§10).

## 15. Themes

What the book is about, given identity so it can be checked:
`canon/themes.yaml`, a collection like `relationships.yaml` (§8).

```yaml
themes:
  - id: theme.the-hollowing
    type: theme
    name: The hollowing
    status: canon
    summary: >
      An invasive vine consuming a living tree from within.
    carriers: [place.hollow-tree, event.seed-comes-ashore, ch.00-prologue]
    motifs: [the hollowing, foreign intrusion]
```

A theme is **not an entity**. It participates in no event, stands in no
place, and holds no state — making it one would put a node in the graph
with nothing to connect to and a marker on the map with no coordinate.
It is a collection entry with two kinds of link:

- **`carriers`** — the canon that embodies it: entities, events,
  relationships, chapters. Validated like any reference. A theme with no
  carrier is a *wish*, and the reports say so rather than letting it sit
  in a manifest looking real.
- **`motifs`** — the words the theme goes by in scene contracts (§10),
  matched case-insensitively. This is the bridge to the manuscript, and
  it runs this direction on purpose: the author writes *"the hollowing"*
  in a contract because that is what they call it, and arc matches the
  theme to the prose. Nobody types an id into a contract to satisfy a
  schema.

The two questions this makes answerable, both deterministic: a theme
**uncarried** (declared, but no canon embodies it) and a theme
**unwritten** (carried in canon, but no scene on the page carries it yet)
— the same shape as unfired payoffs (§?) and unmet obligations (§12),
pointed at what the book is *about* rather than what it does.

A story may keep a themes section in its directional docs; where both
exist, canon is the record and the doc is the argument.
