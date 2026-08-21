// whyHere: four proven walks, every row cited — and silence as the fifth
// answer. The fixture is the idea's own example: a photograph introduced in
// ch.2, possessed by Carlos, planted by the gift, paying off in the ch.12
// reveal, carried by a theme — plus a furniture character the record cannot
// place, whose four silences are the point. Run via npm test.
import { readFileSync } from 'node:fs'
import { loadGraph } from './canon-graph.ts'

const canon = JSON.parse(readFileSync(new URL('./fixtures/planted-why.json', import.meta.url), 'utf8'))
const g = loadGraph(canon)
let failures = 0
const expect = (cond: boolean, what: string) => {
  if (!cond) { failures++; console.error(`FAIL ${what}`) }
}

const scenes = [
  { scene: 'sc.02-1', chapter: 'ch.02', facts: ['obj.photograph', 'char.carlos'], events: ['event.gift'] },
  { scene: 'sc.12-1', chapter: 'ch.12', facts: ['char.carlos'], events: ['event.reveal'] },
]

// --- the photograph: all four questions answered, with citations ----------
const photo = g.whyHere('obj.photograph', scenes)
expect(photo.register === 'proven', 'the trace is proven — graph walks, no model')
expect(photo.introduced?.chapter === 'ch.02' && photo.introduced?.scene === 'sc.02-1'
  && photo.introduced?.via === 'bound by the scene',
  `introduced where the scene binds it (got ${JSON.stringify(photo.introduced)})`)
expect(photo.dependents.some(d => d.id === 'char.carlos' && /possession/.test(d.via)),
  'Carlos depends on it via possession, cited')
expect(photo.dependents.some(d => d.id === 'event.keeps' && d.via === 'location'),
  'the keeping event cites it as location')
expect(photo.themes.length === 1 && photo.themes[0].id === 'theme.lost-childhood',
  'the theme that carries it is named')
expect(photo.silences.length === 0, `nothing is silent about the photograph (got ${JSON.stringify(photo.silences)})`)

// --- setup and payoff, with the report's own notion of "fires" ------------
const gift = g.whyHere('event.gift', scenes)
expect(gift.payoffs.some(p => p.to === 'event.reveal' && p.firesOnPage === true),
  'the gift plants the reveal, and the reveal fires on the page')
const keeps = g.whyHere('event.keeps', scenes)
expect(keeps.payoffs.some(p => p.to === 'event.lost-thread' && p.firesOnPage === false),
  'a payoff that never reaches the page says so')
// The same edge the dangling-payoff report flags — one notion of dangling.
const dangling = g.orphans().danglingLeadsTo
expect(dangling.some(d => d.from === 'event.keeps' && d.to === 'event.lost-thread'),
  'the report agrees: that payoff is dangling')
expect(!dangling.some(d => d.to === 'event.reveal'), 'and the fired one is not')
const reveal = g.whyHere('event.reveal', scenes)
expect(reveal.setup.some(x => x.from === 'event.gift' && /leads to/.test(x.via)),
  'the reveal knows what planted it')

// --- the furniture character: four honest silences ------------------------
const nobody = g.whyHere('char.furniture', scenes)
expect(nobody.introduced === null, 'the record does not place them')
expect(nobody.silences.length === 4,
  `all four questions are silent, in words (got ${nobody.silences.length}: ${JSON.stringify(nobody.silences)})`)
expect(nobody.silences.some(s => /never reaches the page/.test(s)), 'the introduction silence says so')
expect(nobody.silences.some(s => /nothing in the record depends/.test(s)), 'the dependents silence says so')

if (failures) { console.error(`why-here: ${failures} failure(s)`); process.exit(1) }
console.log('why-here: the photograph answers all four questions with citations; the furniture character is four honest silences; the trace and the dangling-payoff report share one notion of fires')
