// Holds impacts() to a fixture where every citation class has one planted
// dependent — and a clean entity proves the quiet case. Run via npm test.
import { readFileSync } from 'node:fs'
import { loadGraph } from './canon-graph.ts'

const canon = JSON.parse(readFileSync(new URL('./fixtures/planted-impacts.json', import.meta.url), 'utf8'))
const g = loadGraph(canon)
let failures = 0
const expect = (cond: boolean, what: string) => {
  if (!cond) { failures++; console.error(`FAIL ${what}`) }
}

const scenes = [{ scene: 'sc.1', facts: ['char.a'], events: ['event.one'] }]

// --- impacts of an event -------------------------------------------------
const ev = g.impacts('event.one', scenes)
expect(ev.events.some(e => e.id === 'event.two' && e.via === 'caused by it'), 'event.two depends on event.one via causes')
expect(ev.states.some(s => s.entity === 'char.a' && s.via === 'caused_by'), 'char.a state cites event.one via caused_by')
expect(ev.chapters.some(c => c.id === 'ch.one' && c.via === 'covers'), 'ch.one covers event.one')
expect(ev.scenes.includes('sc.1'), 'sc.1 rests on event.one')
expect(ev.downstream.some(d => d.id === 'event.two' && d.depth === 1), 'downstream: event.two at depth 1')
expect(ev.downstream.some(d => d.id === 'event.three' && d.depth === 2), 'downstream: event.three at depth 2 (transitive)')
expect(ev.downstreamTruncated === false, 'no truncation on the small fixture')
expect(ev.questions.some(q => q.about === 'event.two' && q.register === 'asked'), 'asked: the planted payoff question')
expect(ev.questions.every(q => q.register === 'asked'), 'questions carry only the asked register')

// --- impacts of an entity ------------------------------------------------
const ch = g.impacts('char.a', scenes)
expect(ch.events.some(e => e.id === 'event.one' && e.via === 'participant'), 'event.one cites char.a as participant')
expect(ch.relationships.includes('rel.ab'), 'rel.ab touches char.a')
expect(ch.chapters.some(c => c.id === 'ch.one' && c.via === 'pov'), 'ch.one narrated by char.a')
expect(ch.states.some(s => s.entity === 'obj.o' && s.via === 'controlled_by'), 'obj.o state cites char.a via controlled_by')
expect(ch.scenes.includes('sc.1'), 'sc.1 rests on char.a')
expect(ch.downstream.some(d => d.id === 'event.two'), 'entity impact walks downstream through its citing events')

// --- place and object citation classes -----------------------------------
const pl = g.impacts('place.p')
expect(pl.events.some(e => e.id === 'event.one' && e.via === 'location'), 'event.one happens at place.p')
expect(pl.states.some(s => s.entity === 'char.a' && s.via === 'location'), 'char.a state located at place.p')
expect(pl.parts.includes('place.sub'), 'place.sub is part_of place.p')
expect(pl.chapters.some(c => c.via === 'set in'), 'ch.one is set in place.p')

const ob = g.impacts('obj.o')
expect(ob.states.some(s => s.entity === 'char.a' && s.via === 'possession'), 'char.a state possesses obj.o')

const perception = g.impacts('char.b')
expect(perception.states.some(s => s.entity === 'char.a' && s.via === 'perception'), 'char.a perceives char.b in a state')

// --- the quiet case -------------------------------------------------------
const clean = g.impacts('char.clean')
expect(
  clean.events.length + clean.states.length + clean.relationships.length +
  clean.chapters.length + clean.parts.length + clean.scenes.length +
  clean.downstream.length + clean.questions.length === 0,
  'char.clean has an empty impact report',
)

if (failures) { console.error(`impact fixture: ${failures} failure(s)`); process.exit(1) }
console.log('impact fixture: every citation class found, clean entity quiet')
