// Mechanical prose faults — the checks that are decidable by reading the
// characters (A43-1).
//
// Grammar is two kinds of claim wearing one name, and arc's register
// discipline (conventions §11) forbids presenting them at one confidence. A
// doubled space is a fact: no model, no judgment, same answer every run —
// `proven`, the validator's kind of truth, free and incapable of
// hallucinating. A fragment is craft: "Green rot. Woodsmoke." is the book's
// style, not an error, and nothing here may flag it. The argued half of
// grammar lives in the model lens fan-out, deliberately elsewhere — a lens
// is a model pass, and this is not one.
//
// THE FALSE-POSITIVE GATE IS THE DESIGN CONSTRAINT. The moment a proven
// channel cries wolf on deliberate style, the register discipline is dead —
// so every check below is scoped to what typography alone can settle, and
// the grammatical edge cases each check would trip over are excluded and
// named where they are excluded.
import { isTerminalMark } from './sentences.ts'

export interface ProseCheckFinding {
  check: 'lowercase-sentence-start' | 'doubled-space' | 'unbalanced-quotes'
       | 'repeated-word' | 'space-before-punctuation'
  /** 0-based paragraph index, the manuscript's own addressing. */
  paragraph: number
  /** A short excerpt around the fault, materialized from the prose itself. */
  excerpt: string
  register: 'proven'
}

const paragraphsOf = (body: string): string[] =>
  body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

const excerptAt = (text: string, index: number, span = 18): string => {
  const from = Math.max(0, index - span)
  const to = Math.min(text.length, index + span)
  return `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`
}

/** Doubled words that are grammar, not typos. "He had had enough" and "the
 *  fact that that implies" are English; flagging them in a proven channel
 *  would be the false positive that kills the register. */
const GRAMMATICAL_DOUBLES = new Set(['had', 'that'])

export function proseChecks(body: string): ProseCheckFinding[] {
  const out: ProseCheckFinding[] = []
  paragraphsOf(body).forEach((para, paragraph) => {
    // A sentence opening in lowercase. The splitter itself reads a lowercase
    // follower as a continuation — '"Get out!" he said.' is one sentence by
    // design — so the check uses the shared MARK rule directly: a bare
    // terminal PERIOD (not an ellipsis, decimal, initial or abbreviation, by
    // isTerminalMark — one rule, both consumers) followed by space and a
    // lowercase letter, with no closing quote between. The quote case is the
    // legitimate speech tag; free-indirect tags after ! and ? ("what now?
    // she wondered") are craft, which is why the check is period-only.
    for (let i = 0; i < para.length; i++) {
      if (para[i] !== '.') continue
      if (!isTerminalMark(para, i)) continue
      let j = i + 1
      let sawSpace = false
      while (j < para.length && para[j] === ' ') { sawSpace = true; j++ }
      if (!sawSpace || j >= para.length) continue
      const c = para[j]
      if (c >= 'a' && c <= 'z') {
        out.push({ check: 'lowercase-sentence-start', paragraph, excerpt: excerptAt(para, j), register: 'proven' })
      }
    }

    // Two or more spaces in running prose. Paragraphs are trimmed, so this
    // can only be interior — the classic invisible residue of hand revision.
    for (const m of para.matchAll(/ {2,}/g)) {
      out.push({ check: 'doubled-space', paragraph, excerpt: excerptAt(para, m.index), register: 'proven' })
    }

    // Quote pairing. Curly quotes are flagged only when a paragraph CLOSES
    // more than it opens — an open without a close is the multi-paragraph
    // dialogue convention and is correct typography, but a close with no
    // open is never that. Straight quotes have no direction, so an odd count
    // is the decidable fault (a book using multi-paragraph dialogue in
    // straight quotes would need this check taught the convention).
    const opens = (para.match(/“/g) ?? []).length
    const closes = (para.match(/”/g) ?? []).length
    const straight = (para.match(/"/g) ?? []).length
    if (closes > opens || straight % 2 === 1) {
      out.push({ check: 'unbalanced-quotes', paragraph, excerpt: excerptAt(para, para.search(/[“”"]/)), register: 'proven' })
    }

    // An immediately repeated word — "the the" — case-insensitively, so
    // "The the" at a sentence seam is caught. The grammatical doubles are
    // excluded by name above.
    for (const m of para.matchAll(/\b([A-Za-z]+)[ \t]+([A-Za-z]+)\b/g)) {
      if (m[1].toLowerCase() === m[2].toLowerCase() && !GRAMMATICAL_DOUBLES.has(m[1].toLowerCase())) {
        out.push({ check: 'repeated-word', paragraph, excerpt: excerptAt(para, m.index), register: 'proven' })
      }
    }

    // A space before closing punctuation. The spaced em dash is this book's
    // correct typography and is not in the list; the ellipsis character is
    // its own mark and untouched.
    for (const m of para.matchAll(/ [,.;:!?]/g)) {
      out.push({ check: 'space-before-punctuation', paragraph, excerpt: excerptAt(para, m.index), register: 'proven' })
    }
  })
  return out
}
