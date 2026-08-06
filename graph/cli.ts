// canon-graph CLI — run the query layer against a canon export.
//
//   python3 tools/export-canon.py <story> - | node --experimental-strip-types graph/cli.ts - --at 1959
//   node --experimental-strip-types graph/cli.ts export.json --orphans
//   node --experimental-strip-types graph/cli.ts export.json --neighbors char.carlos --hops 2 [--kinds participant,at]
//   node --experimental-strip-types graph/cli.ts export.json --diff 1959 1992
import { readFileSync } from 'node:fs'
import { dk, loadGraph, CanonGraph, type CanonDoc } from './canon-graph.ts'

const args = process.argv.slice(2)
if (!args.length || args.includes('--help')) {
  console.log(`usage: cli.ts <export.json | -> [--at DATE] [--orphans]
              [--neighbors ID [--hops N] [--kinds a,b]]
              [--diff DATE_A DATE_B]
Reads a canon export (from tools/export-canon.py); "-" reads stdin.`)
  process.exit(args.length ? 0 : 1)
}

const src = args[0]
const flag = (name: string): string | undefined => {
  const ix = args.indexOf(name)
  return ix > -1 ? args[ix + 1] : undefined
}
const canon: CanonDoc = JSON.parse(src === '-' ? readFileSync(0, 'utf8') : readFileSync(src, 'utf8'))
const g: CanonGraph = loadGraph(canon)
console.log(`canon-graph: ${Object.keys(canon.entities).length} entities, ` +
  `${Object.keys(canon.events).length} events, ${canon.relationships.length} rel edges, ` +
  `${(canon.chapters ?? []).length} chapters, adjacency over ${g.adj.size} nodes`)

const at = flag('--at')
if (at) {
  const p = g.projectAt(dk(at, true))
  console.log(`\nprojectAt(${at}) — the world as of end of ${at}:`)
  for (const pe of Object.values(p.entities)) {
    const st = pe.state ? ` — state @ ${pe.state.at.date ?? pe.state.at.era}` : ''
    console.log(`  ${pe.id}${st}`)
  }
  console.log(`  edges active: ${p.edges.map(e => e.id).join(', ') || 'none'}`)
  console.log(`  events by then: ${p.eventsUpTo.length}`)
}

const nid = flag('--neighbors')
if (nid) {
  const hops = Number(flag('--hops') ?? 1)
  const kinds = flag('--kinds')?.split(',')
  console.log(`\nneighbors(${nid}, hops=${hops}${kinds ? `, kinds=${kinds.join('/')}` : ''}):`)
  for (const n of g.neighbors(nid, kinds, hops)) console.log(`  ${n.dist} hop${n.dist > 1 ? 's' : ''}  ${n.id}`)
}

if (args.includes('--orphans')) {
  const o = g.orphans()
  console.log('\norphans:')
  console.log(`  entities referenced by no event/chapter: ${o.unreferencedEntities.join(', ') || 'none'}`)
  console.log(`  on-page events in no chapter: ${o.onPageEventsInNoChapter.join(', ') || 'none'}`)
  console.log(`  dangling leads_to (payoff never fired): ` +
    (o.danglingLeadsTo.map(d => `${d.from} → ${d.to}`).join(', ') || 'none'))
}

const dix = args.indexOf('--diff')
if (dix > -1) {
  const [a, b] = [args[dix + 1], args[dix + 2]]
  const d = CanonGraph.diff(g.projectAt(dk(a, true)), g.projectAt(dk(b, true)))
  console.log(`\ndiff(${a} → ${b}):`)
  console.log(`  gone by ${b}: ${d.onlyInA.join(', ') || 'none'}`)
  console.log(`  new by ${b}: ${d.onlyInB.join(', ') || 'none'}`)
  console.log(`  state changed: ${d.stateChanged.join(', ') || 'none'}`)
  console.log(`  edges ended: ${d.edgesOnlyInA.join(', ') || 'none'}`)
  console.log(`  edges begun: ${d.edgesOnlyInB.join(', ') || 'none'}`)
}
