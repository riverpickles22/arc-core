---
name: arc-new-story
description: Start a brand-new arc story from a short interview — the author answers a handful of questions in their own words, sees what will be written, and gets a validating story directory. Use when someone wants to create, begin, or scaffold a NEW story (there is nothing to locate yet); once a story exists, arc-canon is the skill that grows it.
---

<!-- Superseded the moment /arc grows a creation path. This skill exists
     because arc-canon's first act is to LOCATE a story, and creation is
     precisely the case where there is none to locate — the one region a
     story-located protocol can never reach. It carries no canon rules and
     no story content: conventions.md is the constitution, new-story.py owns
     every emitter, and this file only conducts the interview between them. -->

# arc-new-story — the interview becomes a story

You conduct a short interview and hand the answers to
`arc-core/tools/new-story.py`, which derives everything technical and writes
the files. **You never write story files yourself, and you never show YAML
unless the author asks** — nobody should have to read a data format to begin
a novel.

## 1. Locate arc-core, and ask where the story should live

arc-core resolves exactly as in arc-canon §1: `$ARC_CORE_PATH`, else a
sibling or child directory containing `conventions.md` and `schema/`. If the
author has not said where the story should live, ask — the answer is a
parent directory; the tool creates `<parent>/<derived-slug>/` inside it.

## 2. The interview — short, in their words

Ask for, conversationally and not as a form:

1. the story's **title**;
2. **one or two sentences** about what it is;
3. roughly **where and when** it is set (the when becomes `period.start`
   and `period.end`; press gently for a rough span, since time is the one
   thing the record cannot do without);
4. **who the main character is** — a sentence or two of who they are;
5. **what is true of them** when the book opens;
6. **where the story opens**, if they know.

"I don't know yet" is a complete answer for anything past the four required
fields (title, logline, period, protagonist): omit the field rather than
inventing one — an absent field means the story does not say, which is a
fact worth keeping. Never ask anything that requires knowing arc exists (no
ids, no slugs, no eras, no statuses — the tool derives all of that; a
question about the schema is the wrong question). If someone was born before
the story opens, include `born` and let the tool build the backstory era.

Build the spec from the answers — the shape is
`arc-core/templates/story-spec.example.yaml`, and only these six areas of
it. Where the spec wants a closed value (`place.kind`), pick it from the
author's words rather than asking.

## 3. Preview, then the real run

```sh
cd <arc-core> && printf '%s' "$SPEC_YAML" | .venv/bin/python tools/new-story.py \
  --into <parent> --spec - --dry-run
```

Show the author the **tree and a plain-words summary** of what each file
will hold — not the raw dump, unless they ask. They can change the title or
any answer here: regeneration from the same answers is byte-identical, so
the preview is not a one-way door. On a yes, run without `--dry-run`. The
tool self-validates before anything lands and never overwrites an existing
story; relay a refusal in its own words rather than working around it.

Confirm with the story's own gate: `<story>/bin/validate`.

## 4. End as the beginning of the writing loop

A perfectly created empty story still has an onboarding cliff. Close by
naming the next natural moves **in story terms**, e.g.:

> Story created. Tell me about another character, describe what happens in
> the opening, add something you know must happen later — or just open the
> manuscript.

From here **arc-canon** is how the story grows (it will now locate this
story); adding a map is a documented follow-up (`view.yaml` and `assets/`,
conventions §9), not a silent gap.
