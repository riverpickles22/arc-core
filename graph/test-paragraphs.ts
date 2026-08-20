// alignParagraphs: the identity that makes accepting one paragraph safe.
//
// The fixtures are the shapes that broke the positional scheme — an insertion
// before existing text, a deletion, a move, and a rewrite — because those are
// the shapes a redraft produces on nearly every paragraph.
// Run: npm test (in graph/).
import { alignParagraphs, mainInsertionPoint } from './diff-seq.ts'
import type { AlignedParagraph } from './diff-seq.ts'

let failures = 0

const show = (a: AlignedParagraph[]) =>
  a.map(x => `${x.kind}(${x.mainIndex ?? '-'},${x.draftIndex ?? '-'})`).join(' ')

function check(why: string, main: string[], draft: string[], want: string): void {
  const got = show(alignParagraphs(main, draft))
  if (got !== want) {
    failures++
    console.error(`FAIL ${why}\n  got:  ${got}\n  want: ${want}`)
  }
}

check('unchanged bodies are all anchors',
  ['A', 'B', 'C'], ['A', 'B', 'C'],
  'same(0,0) same(1,1) same(2,2)')

// The fixture from the bug: a draft-side index of 1 named NEW, and the old
// code applied it to main's index 1, which was B.
check('a paragraph inserted mid-scene shifts nothing on main',
  ['A', 'B', 'C'], ['A', 'NEW', 'B', 'C'],
  'same(0,0) ins(-,1) same(1,2) same(2,3)')

check('a deleted paragraph keeps its main-side identity',
  ['A', 'B', 'C'], ['A', 'C'],
  'same(0,0) del(1,-) same(2,1)')

check('a rewritten paragraph carries both indices',
  ['A', 'B', 'C'], ['A', 'B rewritten', 'C'],
  'same(0,0) changed(1,1) same(2,2)')

check('a rewrite next to an insertion pairs the rewrite and leaves the surplus',
  ['A', 'B'], ['A rewritten', 'EXTRA', 'B'],
  'changed(0,0) ins(-,1) same(1,2)')

check('a paragraph moved to the end reads as a delete and an insert',
  ['A', 'B', 'C'], ['B', 'C', 'A'],
  'del(0,-) same(1,0) same(2,1) ins(-,2)')

check('an emptied scene is all deletions',
  ['A', 'B'], [],
  'del(0,-) del(1,-)')

check('a scene written from nothing is all insertions',
  [], ['A', 'B'],
  'ins(-,0) ins(-,1)')

// Where an accepted insertion actually lands in main.
function point(why: string, main: string[], draft: string[], at: number, want: number): void {
  const got = mainInsertionPoint(alignParagraphs(main, draft), at)
  if (got !== want) {
    failures++
    console.error(`FAIL ${why}: mainInsertionPoint(...,${at}) = ${got}, want ${want}`)
  }
}

point('an insertion mid-scene lands before the paragraph it precedes',
  ['A', 'B', 'C'], ['A', 'NEW', 'B', 'C'], 1, 1)
point('an insertion at the head lands at zero',
  ['A', 'B'], ['NEW', 'A', 'B'], 0, 0)
point('an insertion at the tail lands past the end — the one case push got right',
  ['A', 'B'], ['A', 'B', 'NEW'], 2, 2)
point('a paragraph main already has reports its own main index',
  ['A', 'B', 'C'], ['A', 'B rewritten', 'C'], 1, 1)

// The property the verbs rely on: splicing an accepted insertion at its
// insertion point never displaces a paragraph main already had.
{
  const main = ['A', 'B', 'C']
  const draft = ['A', 'NEW', 'B', 'C']
  const merged = [...main]
  merged.splice(mainInsertionPoint(alignParagraphs(main, draft), 1), 0, draft[1])
  if (JSON.stringify(merged) !== JSON.stringify(['A', 'NEW', 'B', 'C'])) {
    failures++
    console.error(`FAIL splice property: ${JSON.stringify(merged)}`)
  }
  for (const p of main) {
    if (!merged.includes(p)) {
      failures++
      console.error(`FAIL splice property: accepting an insertion dropped ${p} from main`)
    }
  }
}

console.log(failures === 0 ? 'paragraph alignment: 13 cases OK' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
