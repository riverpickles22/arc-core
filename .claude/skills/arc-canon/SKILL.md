---
name: arc-canon
description: Read and reshape an arc story's canon graph — characters, places, factions, objects, events, timeline, relationships — directly as YAML from Claude Code, under the same rules arc-backend's embedded chat agent follows. Use whenever the user wants to query story state (who/where/what at a given time, what's proposed vs ratified), mint or update canon, or otherwise work the story graph from the terminal instead of the arc-frontend viewer.
---

# arc-canon

arc stories keep their material — not their prose, the *world* — as versioned
YAML canon: entities with time-ordered state snapshots, events wired by
causality, objective relationships, a timeline of eras. `arc-backend`'s chat
agent and `arc-frontend`'s viewer are one way to work with that graph. This
skill makes Claude Code a peer of that agent: same files, same rules, same
validator. Nothing here needs either app running.

## 1. Locate the story and arc-core

1. If the working directory itself contains `canon/story.yaml`, it's the
   story.
2. Otherwise check `$ARC_STORY_PATH`.
3. Otherwise look at sibling and child directories for one containing
   `canon/story.yaml` — the normal layout is several arc repos checked out
   next to each other under one holding folder.
4. If none of that resolves it, ask the user which directory is the story.

Same pattern for arc-core: `$ARC_CORE_PATH`, else `<story>/../arc-core`, else
a sibling/child directory containing `conventions.md` and `schema/`.

The author's own style layer sits outside every story: `$ARC_AUTHOR_STYLE`,
else `$ARC_HOME/style.md`, else `~/.arc/style.md`. Absent is normal — plenty
of writers keep only the story's contract.

## 2. Read conventions.md first — it's binding

Read `<arc-core>/conventions.md` in full before touching any file. It defines
IDs, timerefs, versioned state, the status lifecycle, cross-referencing, and
what the validator checks. Everything below assumes it, none of it overrides
it.

## 3. Rules

These are the same rules `arc-backend/src/agent.ts` holds itself to — hold
yourself to the same ones so an edit from Claude Code is indistinguishable
from one made through the viewer's chat panel:

- Canon YAML is the source of truth. Docs elaborate; canon states facts.
  Prose must never contradict a `status: canon` fact.
- New facts you introduce default to `status: proposed` unless the author
  explicitly ratifies them in this conversation — then use `status: canon`.
  This is the same line the viewer draws with its proposed/ratify toggle;
  here you're the one who has to hold it.
- Character/place development is a **new state snapshot** at a timepoint,
  never an edit to an old one (old snapshots change only to fix errors).
- Wire causality explicitly: events carry `causes`/`leads_to`; states carry
  `caused_by`.
- Mint IDs as `type.slug`, kebab-case. Grep for collisions first
  (`grep -rn "char.new-slug" canon docs`). When you create an entity, create
  its docs article stub too, from `<arc-core>/templates/entity-article.md`.
- Edit minimally. Read the file, change only what's intended, write it back
  — don't rewrite a file wholesale for a one-field change.
- Treat `research/` as evidence, not something to silently override. A story
  may diverge from its sources, but only knowingly, noted in
  `narrative_notes` or the relevant article.

## 4. Reading order for a session

1. `canon/story.yaml` — premise, themes, POV status.
2. `canon/timeline.yaml` — eras and anchors; identify the scene's timepoint T.
3. For each entity in play: its file under `canon/entities/**/` — take the
   latest `states:` snapshot whose `at` ≤ T.
4. The relevant event file(s) at T, plus their `causes`/`leads_to` neighbors.
5. `docs/vision.md` (or equivalent) for themes and structural decisions.
6. **Before writing or editing any prose: `docs/style.md`, then the author's
   layer** (§1). This is the voice contract — see §9.
7. `research/topics/*.md` for grounding, where the entity/event cites it.
8. The story's own `CLAUDE.md`, if present — story-specific state (current
   milestone, open questions) that doesn't belong in canon or in this skill.

## 5. Query recipes

```bash
# Everything about an entity, everywhere
grep -rn "char.<slug>" canon docs

# One entity's full state history
cat canon/entities/characters/<slug>.yaml

# All events in an era
grep -l "era: era.<slug>" canon/events/*/*.yaml

# All wikilinks in docs referencing an ID
grep -rn "\[\[<type>\." docs/

# Open questions across all articles
grep -rn -A3 "## Open questions" docs/entities/

# Everything pending ratification
grep -rln "status: proposed" canon/
```

**Anchored references.** The viewer's `⧉ ref` buttons copy references like
`char.carlos@ch.10-return` or `event.diego-killed@1961` (conventions §7).
When the user pastes one, resolve the anchor as a moment: a chapter anchor
means the world as of that chapter's span end, a date anchor means the end
of that date. The canon-graph CLI does the projection:

```bash
python3 ../arc-core/tools/export-canon.py . - |
  node --experimental-strip-types ../arc-core/graph/cli.ts - --at <date-or-chapter-end>
```

An unanchored reference is timeless — just read the record's file.

## 6. Validate after any canon change

```bash
<arc-core>/.venv/bin/python <arc-core>/tools/validate.py <story>
```

Exit 0 = clean, non-zero = findings — fix and re-run before treating the
change as done. This is the same gate the chat agent's writes bounce off;
going through Claude Code instead doesn't relax it.

## 7. Seeing the result

No sync step needed. `tools/export-canon.py` is what `arc-backend` serves and
`arc-frontend` renders — if they're running, a YAML edit shows up in the
viewer once the story reloads. If they're not running, the files themselves
are the whole story; the viewer is a lens on them, not the other way around.

## 8. Capturing story material

When the user voices an intention that has no place yet — "Carlos needs
more of a social life before everything falls apart; capture that" — file
it as **material**, not canon (conventions §12): `material/<slug>.yaml`
with `id: mat.<slug>`, a type, `status: unplaced`, the body as vague as
they said it, and whatever purpose/constraints/related/window they
actually implied. Do not invent placement or characters. Validate after.
The viewer's Material drawer picks it up; promotion to proposed canon
comes later, as its own act.

## 9. Writing or editing prose

Canon has `validate.py` as its gate. Prose has the **style contract**
(conventions §10) — the author's voice, written down. Honor it exactly as
you honor canon, because a session that drafts in nobody's voice is worse
than one that drafts nothing.

Before touching anything under `prose/`:

1. Read `<story>/docs/style.md` in full — rules, touchstones, checklist.
2. Read the author's layer (§1) if it exists.
3. **The story's contract wins wherever the two disagree.** Both bind prose
   *form* only; canon still wins on any question of *fact* (conventions §1).
4. Run the contract's own pre-draft checklist before showing the author
   prose. That checklist is the gate; running it is not optional.

`docs/style.proposed.md`, if present, is a queue of rules a machine has
proposed and the author has **not** ratified. It binds nothing. Never draft
to it, and never quote it as though it were the contract.

**The contract grows by extraction, never by invention.** When the author
corrects your prose — "stop explaining the metaphor", "that adverb is doing
the work the verb should" — that correction is evidence about their voice.
Offer to record it; never write a rule into `style.md` on your own
initiative. A voice nobody chose is not a voice.

## 10. Working the author's notes

The author reads the manuscript and leaves **annotations** — thoughts
anchored to the passage that provoked them (conventions §14),
`annotations/*.yaml`. When they ask you to *work the open notes*, you are
being handed accumulated intent, not a prompt.

Read every note whose `status` is `open`, with its anchor: the scene, the
paragraph, and the quoted text. Then, before changing anything:

1. **Group them.** Notes about the same scene, character, or thread are one
   piece of work, not several. Two notes may also *conflict* — "make Manuel
   seem more suspicious here" early and "the Manuel reveal feels too
   obvious" later. Say so and resolve it before implementing both.
2. **Judge each note's scope, and say what you judged.** The anchor is where
   the thought occurred, not necessarily what it is about. A note on one
   sentence may be a line edit, or may implicate the whole book. Scope drives
   what you must read:
   - *local* — the scene's own text, its contract, the style contract.
   - *scene or chapter* — plus the chapter's canon outline, its events,
     the neighbouring scenes' contracts.
   - *story-wide* — plus `impacts()` on whatever the note touches, the
     character's state at that moment, the obligations it bears on, and
     the payoff chains it would disturb.
3. **Ask only where it matters.** Do not seek permission for ordinary
   editorial decisions — that is what the note delegated to you. Ask when an
   ambiguity would materially change narrative intent, canon, a character's
   motivation, chronology, or downstream structure.

Then work them as **one coherent revision**, not a series of disconnected
edits. Rules that do not bend:

- **Never edit accepted prose because a note asked you to.** Revision lands
  in the working tree as a draft and reaches the author through the same
  accept gate as everything else (§9, conventions §10).
- Prose you write obeys the style contract (§9). Facts you would establish
  become `status: proposed` canon (§3), never silent.
- **Never resolve a note yourself.** Report what you did against which notes
  and leave their status to the author — a note is closed by the person who
  had the thought.
- A note whose scope outgrew its passage may become material, a narrative
  obligation, or proposed canon; record what it became in the note's `links`
  and tell the author.

Report back per note: what you did, what you judged its scope to be, what
you deliberately did not do, and anything you would have needed to invent.
