// Holds splitSentences() to the shared sentence vectors, and proves the
// rejoin identity on every paragraph in the spec.
// Run: npm test (in graph/).
import { readFileSync } from 'node:fs'
import { splitSentences, sentenceAt } from './sentences.ts'

interface Split { why: string; paragraph: string; sentences: string[] }
interface Offsets { why: string; paragraph: string; spans: [number, number][] }

const spec = JSON.parse(readFileSync(new URL('./sentence-vectors.json', import.meta.url), 'utf8'))
let failures = 0

for (const v of spec.splits as Split[]) {
  const got = splitSentences(v.paragraph).map(s => s.text)
  if (JSON.stringify(got) !== JSON.stringify(v.sentences)) {
    failures++
    console.error(`FAIL split (${v.why})\n  paragraph: ${JSON.stringify(v.paragraph)}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(v.sentences)}`)
  }
  // The identity that makes accepting one sentence safe.
  const rejoined = got.join('')
  if (rejoined !== v.paragraph) {
    failures++
    console.error(`FAIL rejoin (${v.why}): ${JSON.stringify(rejoined)} !== ${JSON.stringify(v.paragraph)}`)
  }
}

for (const v of spec.offsets as Offsets[]) {
  const got = splitSentences(v.paragraph).map(s => [s.start, s.end])
  if (JSON.stringify(got) !== JSON.stringify(v.spans)) {
    failures++
    console.error(`FAIL offsets (${v.why})\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(v.spans)}`)
  }
  // Offsets must address the text they claim to.
  for (const s of splitSentences(v.paragraph)) {
    if (v.paragraph.slice(s.start, s.end) !== s.text) {
      failures++
      console.error(`FAIL offset/text disagreement at ${s.start}..${s.end} in ${JSON.stringify(v.paragraph)}`)
    }
  }
}

// sentenceAt maps every offset in a paragraph to the sentence containing it.
const p = 'He shipped the oars. The swell ran heavy.'
for (let i = 0; i < p.length; i++) {
  const idx = sentenceAt(p, i)
  const s = splitSentences(p)[idx]
  if (!s || i < s.start || i >= s.end) {
    failures++
    console.error(`FAIL sentenceAt(${i}) = ${idx}, which does not contain offset ${i}`)
  }
}
if (sentenceAt('', 0) !== -1) {
  failures++
  console.error('FAIL sentenceAt on an empty paragraph should be -1')
}

console.log(failures === 0
  ? `sentence vectors: ${spec.splits.length} splits + ${spec.offsets.length} offset cases OK`
  : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
