// Holds dk() to the shared date-ordering vectors. Run: npm test (in graph/),
// which is `node --experimental-strip-types test-vectors.ts`.
import { readFileSync } from 'node:fs'
import { dk } from './canon-graph.ts'

interface Vector { date: string; end: boolean; y: number; m: number; d: number }
interface Ref { date: string; end: boolean }

const spec = JSON.parse(readFileSync(new URL('./date-vectors.json', import.meta.url), 'utf8'))
let failures = 0

for (const v of spec.vectors as Vector[]) {
  const got = dk(v.date, v.end)
  const want = v.y * 10000 + v.m * 100 + v.d
  if (got !== want) {
    failures++
    console.error(`FAIL dk(${JSON.stringify(v.date)}, end=${v.end}) = ${got}, want ${want}`)
  }
}
for (const p of spec.orderings.pairs as { a: Ref; before: Ref }[]) {
  const ka = dk(p.a.date, p.a.end)
  const kb = dk(p.before.date, p.before.end)
  if (!(ka < kb)) {
    failures++
    console.error(`FAIL ordering: dk(${p.a.date},${p.a.end})=${ka} not < dk(${p.before.date},${p.before.end})=${kb}`)
  }
}

if (failures) {
  console.error(`date vectors: ${failures} failure(s)`)
  process.exit(1)
}
console.log(`date vectors: ${spec.vectors.length} vectors + ${spec.orderings.pairs.length} orderings OK (TS dk)`)
