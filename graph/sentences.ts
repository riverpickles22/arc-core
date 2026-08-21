// THE sentence rule, specified once (graph/sentence-vectors.json).
//
// Two surfaces need to agree on where a sentence ends: the viewer, which must
// know which sentence the author right-clicked, and the backend, which applies
// the decision to the author's file. Two implementations of one rule with
// nothing forcing them to agree is a bug waiting for a specific sentence — and
// here the bug's shape is the wrong sentence being accepted into a book,
// silently. So the rule lives here, beside the date rule, and a shared vector
// file holds both languages to it.
//
// THE BIAS, STATED: when the rule is unsure, it does NOT split. An unsplit
// sentence costs the author a coarser judgment — two sentences taken or
// refused together, which is exactly what the paragraph-level verbs already
// offer. A wrong split costs half a sentence landing in the manuscript. The
// harms are not the same size, so the tie goes to under-splitting. Every
// judgment call below runs that direction.

/** One sentence, with the offsets it came from. Offsets, because a caller has
 *  to map a click position back to a sentence and put text where it belongs. */
export interface Sentence {
  /** The exact substring: paragraph.slice(start, end). */
  text: string
  start: number
  /** Exclusive. */
  end: number
}

/** Words that end in a period without ending a sentence. Lowercased, no dot.
 *  Deliberately short: a missing entry under-splits (safe), a wrong entry
 *  over-splits (not). */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'sr', 'jr', 'rev', 'fr',
  'gen', 'col', 'capt', 'lt', 'sgt', 'maj', 'cpl', 'adm',
  'mt', 'ave', 'blvd', 'rd', 'no', 'vol', 'pp', 'ed',
  'inc', 'ltd', 'co', 'corp', 'dept', 'univ',
  'etc', 'vs', 'al', 'cf', 'approx', 'est',
])

/** Closers that may sit between the terminal mark and the space: quotes and
 *  brackets, straight and curly. */
const CLOSERS = new Set(['"', "'", ')', ']', '}', '”', '’', '»'])

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9'
const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/.test(c)

/** Lowercase for boundary purposes: a letter that has a distinct upper form.
 *  Used only to spot a continuation — `"Get out!" he said.` */
const isLower = (c: string | undefined): boolean =>
  c !== undefined && c !== c.toUpperCase() && c === c.toLowerCase()

/** The word ending at index `i` (exclusive), letters and dots only. */
function wordBefore(text: string, i: number): string {
  let j = i
  while (j > 0 && /[A-Za-z.]/.test(text[j - 1])) j--
  return text.slice(j, i)
}

/** Does a sentence end at `i`, where text[i] is a terminal mark? */
/** Is the mark at `i` a genuine terminal mark — not an ellipsis trailing
 *  off, a decimal point, an initial, or an abbreviation? The mark-level half
 *  of the sentence rule, exported for the checks that need the mark WITHOUT
 *  the follower rule: a lowercase word after a terminal period is a speech
 *  tag to the splitter and a typo to the mechanical checker, and both must
 *  agree on what a terminal mark IS or they are two sentence rules. */
export function isTerminalMark(text: string, i: number): boolean {
  const c = text[i]

  // An ellipsis trails off; it does not terminate. Under-splits by design.
  if (c === '.' && (text[i + 1] === '.' || text[i - 1] === '.')) return false
  if (text[i - 1] === '…' || c === '…') return false

  if (c === '.') {
    // 3.14, 1848.5 — a period between digits is never a boundary.
    if (isDigit(text[i - 1]) && isDigit(text[i + 1])) return false
    const word = wordBefore(text, i)
    // A single letter is an initial: J. R. R. Tolkien.
    if (word.length === 1 && /[A-Za-z]/.test(word)) return false
    // Mr. Reyes. Also catches e.g. and i.e., whose last segment is one letter,
    // via the initial rule above.
    if (ABBREVIATIONS.has(word.toLowerCase().replace(/\./g, ''))) return false
  }
  return true
}

function terminatesAt(text: string, i: number): boolean {
  if (!isTerminalMark(text, i)) return false

  // Step past closing quotes and brackets: the mark may belong to a quotation.
  let j = i + 1
  while (j < text.length && CLOSERS.has(text[j])) j++

  // End of paragraph always ends the sentence.
  if (j >= text.length) return true

  // A boundary needs whitespace after it. `Mr.Reyes` and `1.5` never reach here.
  if (!isSpace(text[j])) return false

  // What follows the space decides the quotation case. `"Get out!" he said.`
  // continues — a lowercase word after a terminal mark is a speech tag, not a
  // new sentence. A capital, a digit, or a quote starts one.
  let k = j
  while (k < text.length && isSpace(text[k])) k++
  if (k >= text.length) return true
  return !isLower(text[k])
}

/** Split a paragraph into sentences.
 *
 *  The sentences TILE the paragraph: they are contiguous, gapless, and cover
 *  it end to end, so trailing whitespace belongs to the sentence it follows.
 *  That is what makes `split(p).map(s => s.text).join('') === p` true by
 *  construction rather than by care — and that identity is the whole reason
 *  accepting one sentence cannot reflow its neighbours. */
export function splitSentences(paragraph: string): Sentence[] {
  if (paragraph === '') return []
  const out: Sentence[] = []
  let start = 0

  for (let i = 0; i < paragraph.length; i++) {
    const c = paragraph[i]
    if (c !== '.' && c !== '!' && c !== '?' && c !== '…') continue
    if (!terminatesAt(paragraph, i)) continue

    // Take the closers, then the whitespace that separates this sentence from
    // the next — it is this sentence's, so rejoining is lossless.
    let end = i + 1
    while (end < paragraph.length && CLOSERS.has(paragraph[end])) end++
    while (end < paragraph.length && isSpace(paragraph[end])) end++

    out.push({ text: paragraph.slice(start, end), start, end })
    start = end
    i = end - 1
  }

  if (start < paragraph.length) {
    out.push({ text: paragraph.slice(start), start, end: paragraph.length })
  }
  return out
}

/** Which sentence covers this offset? The click-to-sentence mapping, and the
 *  only supported way to name a sentence across the wire: an index into
 *  splitSentences(paragraph). Returns -1 when the paragraph has none. */
export function sentenceAt(paragraph: string, offset: number): number {
  const sentences = splitSentences(paragraph)
  for (let i = 0; i < sentences.length; i++) {
    if (offset >= sentences[i].start && offset < sentences[i].end) return i
  }
  return sentences.length ? sentences.length - 1 : -1
}
