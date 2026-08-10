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
// Pure and zero-dependency: the backend, the viewer, and the CLIs all resolve
// anchors the same way, and none of them needs the others running.

export interface Anchor {
  /** the scene the note was made in — permanent */
  scene: string
  /** 0-based paragraph index at the time the note was made */
  paragraph: number
  /** the selected text, verbatim — the durable fallback */
  quote: string
}

export interface AnnotationLike {
  id: string
  anchor: Anchor
  body: string
  status?: 'open' | 'working' | 'resolved' | 'dropped'
  created_at?: string
  /** ids this note produced when its scope outgrew the passage */
  links?: string[]
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
  const paras = paragraphsOf(sceneBody).map(norm)
  const quote = norm(anchor.quote)
  if (!quote) {
    // A note with no quote can only trust its index — say so rather than
    // pretending the anchor is strong.
    const ok = anchor.paragraph < paras.length
    return ok
      ? { state: 'resolved', paragraph: anchor.paragraph }
      : { state: 'orphaned', paragraph: null, note: 'no quote recorded and the paragraph is gone' }
  }

  const at = paras[anchor.paragraph]
  if (at !== undefined && at.includes(quote)) return { state: 'resolved', paragraph: anchor.paragraph }

  const found = paras.findIndex(p => p.includes(quote))
  if (found > -1) {
    return {
      state: 'drifted',
      paragraph: found,
      note: `the passage moved from paragraph ${anchor.paragraph + 1} to ${found + 1}`,
    }
  }
  return { state: 'orphaned', paragraph: null, note: 'the passage this note was made on is no longer in the scene' }
}

export interface ResolvedAnnotation extends AnnotationLike {
  resolution: AnchorResolution
}

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
      (a.resolution.paragraph ?? Number.MAX_SAFE_INTEGER) - (b.resolution.paragraph ?? Number.MAX_SAFE_INTEGER) ||
      a.id.localeCompare(b.id))
}

/** Notes whose anchor no longer resolves — a proven finding (conventions
 *  §11): it is a fact that the passage is gone, and only the author can say
 *  where the thought now belongs. */
export function orphanedAnnotations(resolved: ResolvedAnnotation[]): ResolvedAnnotation[] {
  return resolved.filter(n =>
    (n.status ?? 'open') !== 'resolved' && (n.status ?? 'open') !== 'dropped' &&
    (n.resolution.state === 'orphaned' || n.resolution.state === 'no-scene'))
}
