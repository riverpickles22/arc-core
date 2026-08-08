// Holds the report queries to a fixture with one known planted defect per
// class. Run via npm test alongside the date vectors.
import { readFileSync } from 'node:fs'
import { loadGraph } from './canon-graph.ts'

const canon = JSON.parse(readFileSync(new URL('./fixtures/planted-defects.json', import.meta.url), 'utf8'))
const g = loadGraph(canon)
let failures = 0
const expect = (cond: boolean, what: string) => {
  if (!cond) { failures++; console.error(`FAIL ${what}`) }
}

const o = g.orphans()
expect(o.danglingLeadsTo.some(d => d.from === 'event.meeting' && d.to === 'event.offpage-payoff'),
  'dangling leads_to: event.meeting → event.offpage-payoff (payoff never fires)')
expect(o.unreferencedEntities.includes('char.ghost'), 'orphan entity: char.ghost')
expect(!o.unreferencedEntities.includes('char.hero'), 'char.hero must NOT be an orphan (participates in event.stranded)')
expect(o.onPageEventsInNoChapter.includes('event.stranded'), 'on-page event in no chapter: event.stranded')
expect(!o.onPageEventsInNoChapter.includes('event.meeting'), 'event.meeting must NOT be flagged (covered by ch.one)')

const pov = g.povMismatches()
expect(pov.some(p => p.chapter === 'ch.one' && p.pov === 'char.hero'),
  'POV mismatch: ch.one narrated by char.hero who was not at event.meeting')

const ended = g.endedEdgesWithoutCause()
expect(ended.some(e => e.id === 'rel.unexplained-end'), 'relationship end without cause: rel.unexplained-end')
expect(!ended.some(e => e.id === 'rel.open'), 'rel.open (no end) must NOT be flagged')

const view = g.povView('char.hero', 99999999)
expect(view.seen.includes('event.stranded'), 'povView: hero has seen event.stranded (participant)')
expect(view.unseen.includes('event.meeting'), 'povView: event.meeting is outside hero\'s view (irony list)')
expect(!view.seen.includes('event.meeting'), 'povView: seen and unseen are disjoint')

const counts = g.appearanceCounts()
expect(counts[0]?.id === 'char.ghost' && counts[0].events === 0 && counts[0].chapters === 0,
  'appearance counts: char.ghost quietest with 0/0')

if (failures) { console.error(`report fixture: ${failures} failure(s)`); process.exit(1) }
console.log(`report fixture: all planted defects found, all clean cases quiet`)
