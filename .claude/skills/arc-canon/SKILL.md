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
5. `docs/vision.md` (or equivalent) for voice, themes, structural decisions.
6. `research/topics/*.md` for grounding, where the entity/event cites it.
7. The story's own `CLAUDE.md`, if present — story-specific state (current
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
