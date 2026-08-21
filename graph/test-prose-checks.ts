// The mechanical checker: every seeded fault found exactly once, and — the
// gate that matters — ZERO findings on deliberate style. The moment a proven
// channel cries wolf on craft, the register discipline is dead.
// Run: npm test (in graph/).
import fs from 'node:fs'
import path from 'node:path'
import { proseChecks } from './prose-checks.ts'

let failures = 0
const expect = (cond: boolean, msg: string) => {
  if (!cond) { failures++; console.error(`FAIL: ${msg}`) }
}

// ---- each fault, seeded once, found exactly once, at its paragraph -------

const seeded = [
  'The lamp was lit. it burned low.',                 // ¶0 lowercase start
  'He waited  for the tide to turn.',                 // ¶1 doubled space
  'She said ” and left the room.',                    // ¶2 close with no open
  'The the boat rode low in the water.',              // ¶3 repeated word
  'He stopped , and listened for the surf.',          // ¶4 space before comma
].join('\n\n')

const found = proseChecks(seeded)
const byCheck = new Map(found.map(f => [f.check, f]))
expect(found.length === 5, `five seeded faults, five findings (got ${found.length})`)
const wants: [string, number][] = [
  ['lowercase-sentence-start', 0], ['doubled-space', 1], ['unbalanced-quotes', 2],
  ['repeated-word', 3], ['space-before-punctuation', 4],
]
for (const [check, para] of wants) {
  const f = byCheck.get(check as never)
  expect(!!f, `${check} is found`)
  if (f) expect(f.paragraph === para, `${check} names ¶${para + 1} (got ¶${f.paragraph + 1})`)
  if (f) expect(f.register === 'proven', `${check} arrives proven`)
}

// ---- the false-positive gate: deliberate style yields NOTHING ------------
//
// Written in the manuscript's own manner — fragments, bare-"and"
// accumulations, spaced em dashes, dialogue tags, initials, decimals,
// grammatical doubles, a trailing ellipsis — without quoting the private
// prose into a public repo. When the private story is checked out, the real
// scenes run below as well.
const craft = [
  'Green rot. Woodsmoke. Rain drying on hot stone, and under it the sweet breath of a river mouth.',
  'It flowered and fruited and dropped and grew again — and the wood said nothing.',
  '“Get out!” he said. Mr. Reyes waited by the door. J. R. R. wrote it in 1937.',
  'He had had enough. The fact that that implied was plain. It measured 3.14 exactly…',
  'And then nothing.',
].join('\n\n')
const cried = proseChecks(craft)
expect(cried.length === 0,
  `deliberate style must yield zero mechanical findings — got ${cried.length}: ${cried.map(f => f.check + '@' + f.paragraph).join(', ')}`)

// An empty body is quietly nothing.
expect(proseChecks('').length === 0, 'an empty body has no findings')

// ---- the real manuscript, when it is here (private; absent in CI) --------
const real = path.join(process.env.HOME ?? '', 'workspace', 'arc', 'feral-dogs-of-cuba', 'prose')
if (fs.existsSync(real)) {
  let total = 0
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : [])
  for (const f of walk(real).sort()) {
    const text = fs.readFileSync(f, 'utf8')
    const body = text.replace(/^---[\s\S]*?---\n/, '')
    const hits = proseChecks(body)
    total += hits.length
    for (const h of hits) console.log(`  ${path.relative(real, f)} ¶${h.paragraph + 1} ${h.check}: ${JSON.stringify(h.excerpt)}`)
  }
  console.log(`  (real manuscript: ${total} mechanical finding(s); the 2026-08-18 probe found 3 — drift is prose written since, and it is the point)`)
}

if (failures) { console.error(`prose checks: ${failures} failure(s)`); process.exit(1) }
console.log('prose checks: five faults found exactly once, and deliberate style yields nothing')
