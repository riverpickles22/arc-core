// Annotations: the author's thoughts, anchored to the prose that provoked
// them (conventions §14).
//
// The hard part is not storing a note — it is keeping it attached while the
// manuscript moves underneath it. Every tool that has tried this fails the
// same way: it stores a character offset, the author edits a paragraph above,
// and the note silently reattaches to the wrong sentence. A note in the wrong
// place is worse than no note, because the author stops trusting the surface.
//
// So an anchor is three facts, resolved in order of durability:
//   1. the scene id      — permanent (conventions §2), survives everything
//   2. the paragraph index — survives edits elsewhere in the scene
//   3. the quoted text    — survives reordering and index drift
//
// and a note that resolves to none of them becomes ORPHANED, keeping its
// quote, rather than being relocated on a guess. Honest beats tidy.
//
// A note may also be about the SCENE rather than a passage in it, and then it
// carries only the first fact. That is not a weaker anchor — it is a different
// claim, and a stronger one: it holds against any body the scene ever has, and
// can never drift or orphan. It is also the only shape available for the most
// useful reading note there is, the observation that something is MISSING —
// "we never reference the tide here" has nothing to quote, and a rewrite that
// still fails to mention the tide must leave the note standing.
//
// Pure and zero-dependency: the backend, the viewer, and the CLIs all resolve
// anchors the same way, and none of them needs the others running.

export interface Anchor {
  /** the scene the note was made in — permanent */
  scene: string
  /** 0-based paragraph index at the time the note was made. Absent means the
   *  note is about the whole scene. */
  paragraph?: number
  /** the selected text, verbatim — the durable fallback. Meaningless without
   *  a paragraph, and the schema refuses that combination. */
  quote?: string
}

/** Is this anchor about the section rather than a sentence in it? */
export const isSceneScoped = (a: Anchor): boolean => a.paragraph == null

/** A note's lifecycle. Named once here so the wire contract and the viewer
 *  cannot drift into disagreeing about what a status may be. */
export type AnnotationStatus = 'open' | 'working' | 'resolved' | 'dropped'

export interface AnnotationLike {
  id: string
  anchor: Anchor
  body: string
  status?: AnnotationStatus
  created_at?: string
  /** ids this note produced when its scope outgrew the passage */
  links?: string[]
  /** What the record IS. Absent means 'note' — a thought with a status
   *  lifecycle, rendered in the notes rail, driving revision work. A
   *  'keypoint' is the margin timeline's dot (A30): a structural statement
   *  with no lifecycle, never in the notes rail, never driving a revision —
   *  it marks what a passage must get across, it does not ask for change. */
  kind?: 'note' | 'keypoint'
  /** Provenance: who minted it. A keypoint an agent left while working is
   *  reviewable and deletable like any proposal; absent means the author. */
  by?: 'author' | 'agent'
}

export type AnchorState = 'resolved' | 'drifted' | 'orphaned' | 'no-scene'

export interface AnchorResolution {
  state: AnchorState
  /** where the quote actually is now; null when it cannot be found */
  paragraph: number | null
  /** what moved, in the author's terms — empty when nothing did */
  note?: string
}

/** Split a scene body into paragraphs the same way every surface must.
 *  Blank-line separated, trimmed, empties dropped — the shape mdToHtml and
 *  the prose differ already treat as a unit. */
export function paragraphsOf(body: string): string[] {
  return body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
}

/** Compare loosely enough to survive reflowing — whitespace collapses, but
 *  no fuzzy matching: a changed word means the passage changed, and the
 *  author should be told rather than guessed at. */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Where is this note now? Resolution never relocates on a guess: a quote
 *  that cannot be found orphans the note and keeps it visible with its text
 *  intact, so the author can re-place it deliberately. */
export function resolveAnchor(anchor: Anchor, sceneBody: string | null): AnchorResolution {
  if (sceneBody === null) {
    return { state: 'no-scene', paragraph: null, note: `scene ${anchor.scene} no longer exists` }
  }
  // A scene note is about the section, so any body the section has satisfies
  // it. Returning here is what guarantees it can never be reported as drifted
  // or orphaned — states that describe a quote, which it never had. It also
  // narrows the index for everything below.
  const index = anchor.paragraph
  if (index == null) return { state: 'resolved', paragraph: null }

  const paras = paragraphsOf(sceneBody).map(norm)
  const quote = norm(anchor.quote ?? '')
  if (!quote) {
    // A note with no quote can only trust its index — say so rather than
    // pretending the anchor is strong.
    const ok = index < paras.length
    return ok
      ? { state: 'resolved', paragraph: index }
      : { state: 'orphaned', paragraph: null, note: 'no quote recorded and the paragraph is gone' }
  }

  const at = paras[index]
  if (at !== undefined && at.includes(quote)) return { state: 'resolved', paragraph: index }

  const found = paras.findIndex(p => p.includes(quote))
  if (found > -1) {
    return {
      state: 'drifted',
      paragraph: found,
      note: `the passage moved from paragraph ${index + 1} to ${found + 1}`,
    }
  }
  return { state: 'orphaned', paragraph: null, note: 'the passage this note was made on is no longer in the scene' }
}

export interface ResolvedAnnotation extends AnnotationLike {
  resolution: AnchorResolution
}

/** Where a mark sits within its scene, for ordering. Two kinds resolve to no
 *  paragraph and they belong at opposite ends: a scene note is about
 *  everything below it, so it leads; an orphan has lost its place and trails
 *  the passages that still have one. */
const sortPos = (m: { anchor: Anchor; resolution: AnchorResolution }): number =>
  m.resolution.paragraph ?? (isSceneScoped(m.anchor) ? -1 : Number.MAX_SAFE_INTEGER)

/** Resolve a set of notes against the prose as it stands. `sceneBody` looks
 *  up a scene's current text, returning null when the scene is gone. */
export function resolveAnnotations(
  notes: AnnotationLike[],
  sceneBody: (scene: string) => string | null,
): ResolvedAnnotation[] {
  return notes
    .map(n => ({ ...n, resolution: resolveAnchor(n.anchor, sceneBody(n.anchor.scene)) }))
    .sort((a, b) =>
      a.anchor.scene.localeCompare(b.anchor.scene) ||
      sortPos(a) - sortPos(b) ||
      a.id.localeCompare(b.id))
}

/* ---- locks: the same anchor, carrying a refusal instead of a thought ----
 *
 * A lock says "this passage is settled — work around it." It anchors exactly
 * like a note (scene, paragraph, quote) and resolves by the same rules, so a
 * lock follows its prose when paragraphs shift and orphans honestly when the
 * passage is gone. An orphaned lock blocks nothing: enforcing a lock whose
 * text no longer exists would be locking a guess. */
export interface LockLike {
  id: string
  anchor: Anchor
  created_at?: string
}

export interface ResolvedLock extends LockLike {
  resolution: AnchorResolution
}

export function resolveLocks(
  locks: LockLike[],
  sceneBody: (scene: string) => string | null,
): ResolvedLock[] {
  return locks
    .map(l => ({ ...l, resolution: resolveAnchor(l.anchor, sceneBody(l.anchor.scene)) }))
    .sort((a, b) =>
      a.anchor.scene.localeCompare(b.anchor.scene) ||
      sortPos(a) - sortPos(b) ||
      a.id.localeCompare(b.id))
}

/** Which locked paragraphs did a rewrite fail to carry verbatim?
 *
 *  The question is presence, not position: a locked paragraph may move when
 *  its neighbours grow or shrink, and that is fine — what it may not do is
 *  change. Only locks that currently resolve (or drifted somewhere findable)
 *  are enforced; orphans and missing scenes block nothing, by design.
 *  Pure, so the write paths that refuse on it can be tested without I/O. */
export function lockViolations(
  before: string,
  after: string,
  locks: ResolvedLock[],
): { lock: ResolvedLock; paragraph: number; text: string }[] {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  const beforeParas = paragraphsOf(before).map(norm)
  const afterParas = new Set(paragraphsOf(after).map(norm))
  const out: { lock: ResolvedLock; paragraph: number; text: string }[] = []
  for (const l of locks) {
    if (l.resolution.state !== 'resolved' && l.resolution.state !== 'drifted') continue
    const at = l.resolution.paragraph
    if (at === null || at >= beforeParas.length) continue
    const text = beforeParas[at]
    if (!afterParas.has(text)) out.push({ lock: l, paragraph: at, text })
  }
  return out
}

/** Notes whose anchor no longer resolves — a proven finding (conventions
 *  §11): it is a fact that the passage is gone, and only the author can say
 *  where the thought now belongs. */
export function orphanedAnnotations(resolved: ResolvedAnnotation[]): ResolvedAnnotation[] {
  return resolved.filter(n =>
    (n.status ?? 'open') !== 'resolved' && (n.status ?? 'open') !== 'dropped' &&
    (n.resolution.state === 'orphaned' || n.resolution.state === 'no-scene'))
}
