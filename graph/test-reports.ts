// Holds the report queries to a fixture with one known planted defect per
// class. Run via npm test alongside the date vectors.
import { readFileSync } from 'node:fs'
import { diffCharacter, dk, loadGraph } from './canon-graph.ts'

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

// Obligations — the mirror of the payoff report, running the other way.
// Material and bindings are arguments, not canon: material lives beside
// canon, never in it (conventions §12).
const MATERIAL = [
  { id: 'mat.unowned', type: 'obligation', status: 'unplaced', body: 'Nothing claims this.' },
  { id: 'mat.intended', type: 'obligation', status: 'unplaced', body: 'Claimed by an undrafted scene.', satisfied_by: ['sc.never-1'] },
  { id: 'mat.late', type: 'obligation', status: 'unplaced', body: 'Met, but after its window closed.', window: { to: 'ch.one' } },
  { id: 'mat.met', type: 'obligation', status: 'unplaced', body: 'Discharged on the page.' },
  { id: 'mat.dropped', type: 'obligation', status: 'dropped', body: 'Abandoned deliberately.' },
  { id: 'mat.notanobligation', type: 'gap', status: 'unplaced', body: 'A gap, not an obligation.' },
]
const BINDINGS = [
  { scene: 'sc.one-1', chapter: 'ch.one', satisfies: ['mat.met'] },
  { scene: 'sc.two-1', chapter: 'ch.two', satisfies: ['mat.late'] },
]
const obl = g.obligations(MATERIAL, BINDINGS)
expect(obl.unowned.some(o => o.id === 'mat.unowned'), 'obligation unowned: nothing satisfies mat.unowned')
expect(obl.unwritten.some(o => o.id === 'mat.intended'), 'obligation unwritten: mat.intended is claimed only by an undrafted scene')
expect(obl.overdue.some(o => o.id === 'mat.late'), 'obligation overdue: mat.late lands after its window closes')
expect(!obl.unowned.some(o => o.id === 'mat.met') && !obl.unwritten.some(o => o.id === 'mat.met'),
  'mat.met is discharged on the page — must NOT be flagged')
expect(!JSON.stringify(obl).includes('mat.dropped'), 'a dropped obligation must NOT be flagged')
expect(!JSON.stringify(obl).includes('mat.notanobligation'), 'a gap is not an obligation — must NOT be flagged')
expect(obl.questions.every(q => q.register === 'asked'),
  'obligation questions carry the asked register — only a reader can say whether prose discharges intent')
expect(obl.questions.some(q => q.about === 'mat.met'), 'the scene claiming mat.met raises a question, not a verdict')

// diffCharacter — named contents, never counts; the why travels with the what.
const ERAS = [{ id: 'era.x', span: { start: '1950', end: '1999' } }]
const HERO = { states: [
  { at: { era: 'era.x', date: '1958' }, location: 'place.cafe', age: 10,
    beliefs: ['the world is safe', 'dogs are brothers'], wants: ['to inherit the café'],
    relationships: [{ toward: 'char.friend', stance: 'trusts completely' }] },
  { at: { era: 'era.x', date: '1975' }, caused_by: ['event.mid'], location: 'place.exile',
    beliefs: ['the world is safe'], fears: ['wanting anything'] },
  { at: { era: 'era.x', date: '1992' }, caused_by: ['event.return'], location: 'place.city', age: 44,
    beliefs: ['dogs are brothers'], wants: ['to go home'],
    relationships: [{ toward: 'char.friend', stance: 'grieves' }, { toward: 'place.city', stance: 'estranged' }] },
] }
const cd = diffCharacter(HERO, dk('1958', true), dk('1992', true), ERAS)
expect(cd.steps === 2, 'diffCharacter: two snapshots inside the window (the path, not just endpoints)')
expect(cd.causes.join(',') === 'event.mid,event.return', 'causes union across the window, sorted')
const beliefs = cd.lists.find(l => l.field === 'beliefs')
expect(!!beliefs && beliefs.removed.includes('the world is safe') && !beliefs.added.length && !beliefs.removed.includes('dogs are brothers'),
  'beliefs: names the dropped belief; a belief lost-then-regained mid-window is no endpoint change')
const wants = cd.lists.find(l => l.field === 'wants')
expect(!!wants && wants.removed.includes('to inherit the café') && wants.added.includes('to go home'),
  'wants: a swap reports both sides, never a net-zero count')
expect(cd.relationships.some(r => r.toward === 'char.friend' && r.before === 'trusts completely' && r.after === 'grieves'),
  'relationships: stance change carries before and after')
expect(cd.relationships.some(r => r.toward === 'place.city' && r.before === undefined),
  'relationships: a gained perception has no before')
expect(cd.scalars.some(s => s.field === 'age' && s.before === '10' && s.after === '44'), 'scalars: age before/after')
const same = diffCharacter(HERO, dk('1992', true), dk('1993', true), ERAS)
expect(same.scalars.length + same.lists.length + same.relationships.length === 0 && same.steps === 0,
  'equal endpoints (same snapshot both sides): no change reported')

if (failures) { console.error(`report fixture: ${failures} failure(s)`); process.exit(1) }
console.log(`report fixture: all planted defects found, all clean cases quiet`)
