// Sequence LCS, specified once — the machine under every diff arc shows.
//
// It was written in arc-frontend/src/diff.ts, fed words. A37-3 needs the same
// alignment on the SERVER, fed sentences, because the client names a sentence
// and the server applies the decision to the author's file. Two LCS
// implementations would be two alignments, and a disagreement lands as the
// wrong sentence being taken into a book. So it moves here, beside the date
// rule and the sentence rule, for the same reason both of those are here.
//
// Sequence-agnostic on purpose: it compares strings, and the caller decides
// whether a string is a word, a sentence, or a paragraph.

export type DiffOp = 'same' | 'del' | 'ins'

/** Longest-common-subsequence ops turning `a` into `b`.
 *
 *  Prose-sized inputs, no dependency. Beyond any real chapter it degrades to
 *  replace-all rather than stalling: a diff that never returns is worse than a
 *  coarse one, and at that size the author is not reading word-level anyway. */
export function diffSeq(a: string[], b: string[]): DiffOp[] {
  const n = a.length, m = b.length
  if ((n + 1) * (m + 1) > 16_000_000) {
    return [...(Array(n).fill('del') as DiffOp[]), ...(Array(m).fill('ins') as DiffOp[])]
  }
  const w = m + 1
  const dp = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + j + 1] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const ops: DiffOp[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push('same'); i++; j++ }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push('del'); i++ }
    else { ops.push('ins'); j++ }
  }
  while (i < n) { ops.push('del'); i++ }
  while (j < m) { ops.push('ins'); j++ }
  return ops
}

/** One sentence of a changed paragraph, with the identity the wire uses.
 *
 *  `side` plus `index` is the whole addressing scheme, and it is deliberately
 *  not the text: an endpoint that accepts prose from a browser is an endpoint
 *  that can write anything into the book. The server re-derives the sentence
 *  by the shared rule and merges it itself. */
export interface AlignedSentence {
  kind: DiffOp
  text: string
  /** Which version this sentence belongs to — `main` is the before text
   *  (a deletion), `draft` the after text (an insertion or an unchanged line). */
  side: 'main' | 'draft'
  /** Index into that side's own splitSentences() list. */
  index: number
}

/** Align two versions of a paragraph, sentence by sentence.
 *
 *  A rewritten sentence surfaces as a `del` on main's side followed by an
 *  `ins` on the draft's — which is exactly the before/after pair the author
 *  asked to be able to right-click either half of. */
export function alignSentences(mainSentences: string[], draftSentences: string[]): AlignedSentence[] {
  const out: AlignedSentence[] = []
  let i = 0, j = 0
  for (const op of diffSeq(mainSentences, draftSentences)) {
    if (op === 'same') {
      out.push({ kind: 'same', text: draftSentences[j], side: 'draft', index: j })
      i++; j++
    } else if (op === 'del') {
      out.push({ kind: 'del', text: mainSentences[i], side: 'main', index: i })
      i++
    } else {
      out.push({ kind: 'ins', text: draftSentences[j], side: 'draft', index: j })
      j++
    }
  }
  return out
}

/** One paragraph of a diffed scene, with the identity the paragraph verbs
 *  address it by.
 *
 *  The sentence verbs learned this lesson first (A37-3): naming a unit by its
 *  position in ONE version is only safe while both versions have the same
 *  units in the same order. A draft that inserts or removes a paragraph
 *  breaks that, and the break is silent — a draft-side index applied to
 *  main's array selects a different paragraph and commits it.
 *
 *  So a paragraph is named by `side` plus that side's own index, exactly as
 *  `AlignedSentence` is. `changed` is the one kind that exists on both sides:
 *  it carries both indices, because the author is judging a rewrite and the
 *  verb needs to know which paragraph of main the new text replaces. */
export interface AlignedParagraph {
  kind: 'same' | 'changed' | 'del' | 'ins'
  /** Index into main's paragraph list; null for a pure insertion. */
  mainIndex: number | null
  /** Index into the draft's paragraph list; null for a pure deletion. */
  draftIndex: number | null
}

/** Align two versions of a scene body, paragraph by paragraph.
 *
 *  Deliberately reproduces the pairing `diffProse` shows the author rather
 *  than a raw op list: inside a changed run, the nth removed paragraph pairs
 *  with the nth added one and the surplus stays unpaired. That pairing is
 *  what the reader sees as one rewritten paragraph, so it has to be what the
 *  server merges — a server that paired differently would apply the author's
 *  click to a paragraph they were not looking at.
 *
 *  Text never crosses the wire; callers index their own arrays. */
export function alignParagraphs(mainParas: string[], draftParas: string[]): AlignedParagraph[] {
  const out: AlignedParagraph[] = []
  const ops = diffSeq(mainParas, draftParas)
  let i = 0, j = 0, k = 0
  while (k < ops.length) {
    if (ops[k] === 'same') {
      out.push({ kind: 'same', mainIndex: i++, draftIndex: j++ })
      k++
      continue
    }
    const dels: number[] = []
    const inss: number[] = []
    while (k < ops.length && ops[k] !== 'same') {
      if (ops[k] === 'del') dels.push(i++)
      else inss.push(j++)
      k++
    }
    const pairs = Math.min(dels.length, inss.length)
    for (let p = 0; p < pairs; p++) out.push({ kind: 'changed', mainIndex: dels[p], draftIndex: inss[p] })
    for (let p = pairs; p < dels.length; p++) out.push({ kind: 'del', mainIndex: dels[p], draftIndex: null })
    for (let p = pairs; p < inss.length; p++) out.push({ kind: 'ins', mainIndex: null, draftIndex: inss[p] })
  }
  return out
}

/** Where a draft-side paragraph belongs in MAIN's array.
 *
 *  For anything that exists in main this is just its `mainIndex`. For an
 *  insertion it is the position after the last preceding paragraph that main
 *  also has — which is the whole point: `push` was only ever correct for a
 *  paragraph appended at the end, and every other insertion landed on top of
 *  whatever happened to sit at that index. */
export function mainInsertionPoint(aligned: AlignedParagraph[], at: number): number {
  let after = 0
  for (const a of aligned) {
    if (a.draftIndex === at) return a.mainIndex ?? after
    if (a.mainIndex !== null) after = a.mainIndex + 1
  }
  return after
}
