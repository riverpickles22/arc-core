// Holds the six cross-entity checks to a fixture with one planted violation
// per check — and clean twins that must stay quiet. Run via npm test.
import { readFileSync } from 'node:fs'
import { loadGraph, type Finding } from './canon-graph.ts'

const canon = JSON.parse(readFileSync(new URL('./fixtures/planted-check-violations.json', import.meta.url), 'utf8'))
const F: Finding[] = loadGraph(canon).checks()
let failures = 0
const has = (pred: (f: Finding) => boolean, what: string) => {
  if (!F.some(pred)) { failures++; console.error(`FAIL missing: ${what}`) }
}
const not = (pred: (f: Finding) => boolean, what: string) => {
  if (F.some(pred)) { failures++; console.error(`FAIL false positive: ${what}`) }
}

has(f => f.check === 'lifespan' && f.severity === 'error' && f.about.includes('char.dead') && f.about.includes('event.after-death'),
  'lifespan ERROR — char.dead in event.after-death (precise date)')
has(f => f.check === 'causality' && f.about.includes('event.late-cause') && f.about.includes('event.effect'),
  'causality — event.late-cause postdates its effect')
has(f => f.check === 'causality' && f.message.includes('causal cycle') && f.about.includes('event.loop-x'),
  'causality — loop-x/loop-y cycle')
has(f => f.check === 'custody' && f.about.includes('obj.thing') && f.about.includes('char.one') && f.about.includes('char.two'),
  'custody — obj.thing double-held 1960–1980')
has(f => f.check === 'co-location' && f.severity === 'error' && f.about.includes('char.busy') && f.about.includes('event.here') && f.about.includes('event.there'),
  'co-location ERROR — char.busy in place.a and place.b same precise day')
not(f => f.check === 'co-location' && f.about.includes('event.nested-ok') && f.about.includes('event.there'),
  'place.b.inner vs place.b must not conflict (same lineage)')
has(f => f.check === 'span-sanity' && f.about.includes('rel.early'), 'span-sanity — rel.early predates char.one')
not(f => f.about.includes('rel.fine'), 'rel.fine (clean twin) must not be flagged')
has(f => f.check === 'span-sanity' && f.about.includes('char.dead') && f.message.includes('after its end'),
  'span-sanity — char.dead state after death')
has(f => f.check === 'span-sanity' && f.about.includes('char.messy') && f.message.includes('chronological'),
  'span-sanity — char.messy states out of order')
has(f => f.check === 'lifecycle' && f.about.includes('event.canonical') && f.about.includes('event.tentative'),
  'lifecycle — canon event.canonical leans on proposed event.tentative')
has(f => f.check === 'lifecycle' && f.about.includes('rel.dep'), 'lifecycle — rel.dep deprecated without superseded_by')

if (failures) { console.error(`check fixture: ${failures} failure(s) (${F.length} findings total)`); process.exit(1) }
console.log(`check fixture: all planted violations found, clean twins quiet (${F.length} findings)`)
