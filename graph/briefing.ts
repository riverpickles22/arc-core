// The end-of-session briefing — the story read back to the author.
// Deterministic reports over the canon graph: loose ends, POV blind spots,
// and who is going quiet. Zero model calls; every finding is a set-membership
// or reachability fact you can check by hand.
//
//   python3 tools/export-canon.py <story> - | node --experimental-strip-types graph/briefing.ts -
//   node --experimental-strip-types graph/briefing.ts export.json
import { readFileSync, readdirSync } from 'node:fs'
import { join as joinPath } from 'node:path'
import { loadGraph, type CanonDoc } from './canon-graph.ts'

const src = process.argv[2]
if (!src || src === '--help') {
  console.log('usage: briefing.ts <export.json | ->   (export from tools/export-canon.py)')
  process.exit(src ? 0 : 1)
}
const canon: CanonDoc & { generated_from?: string } =
  JSON.parse(src === '-' ? readFileSync(0, 'utf8') : readFileSync(src, 'utf8'))
const g = loadGraph(canon)

const strict = process.argv.includes('--strict')

// Scene bindings live in prose, not the export. --prose <dir> lets the
// briefing read the manuscript's contracts so theme appearances can be
// matched; without it the theme section reports carriers only.
const proseIx = process.argv.indexOf('--prose')
const proseDir = proseIx > -1 ? process.argv[proseIx + 1] : undefined
function bindingsFrom(dir?: string): { scene: string; chapter?: string; motifs?: string[] }[] {
  if (!dir) return []
  const out: { scene: string; chapter?: string; motifs?: string[] }[] = []
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = joinPath(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.name.endsWith('.md')) continue
      const fm = readFileSync(p, 'utf8').match(/^---\n([\s\S]*?)\n---/)
      if (!fm) continue
      const scene = fm[1].match(/^scene:\s*(\S+)/m)?.[1]
      if (!scene) continue
      const chapter = fm[1].match(/^chapter:\s*(\S+)/m)?.[1]
      const motifs = fm[1].match(/^\s*motifs:\s*\[(.*?)\]/m)?.[1]
        ?.split(',').map(s => s.trim()).filter(Boolean)
      out.push({ scene, chapter, motifs })
    }
  }
  try { walk(dir) } catch { /* no prose is fine */ }
  return out
}
const bindings = bindingsFrom(proseDir)
const o = g.orphans()
const pov = g.povMismatches()
const ended = g.endedEdgesWithoutCause()
const counts = g.appearanceCounts()
const findings = g.checks()

const lines: string[] = []
const section = (title: string, items: string[], empty: string) => {
  lines.push(`\n## ${title}\n`)
  if (items.length) items.forEach(i => lines.push(`- ${i}`))
  else lines.push(`_${empty}_`)
}

lines.push(`# Story briefing — ${canon.generated_from ?? 'canon export'}`)
lines.push(`\nDeterministic reads over the canon graph. Findings are facts about`)
lines.push(`the record's structure — whether each one is a problem is the author's call.`)

section('Continuity — provable breaks and warnings',
  findings.map(f => `**${f.severity.toUpperCase()}** [${f.check}] ${f.message}`),
  'the six cross-entity checks pass clean')

section('Payoffs planted, never fired',
  o.danglingLeadsTo.map(d => `\`${d.from}\` leads to \`${d.to}\`, and that chain never reaches the page`),
  'every leads_to chain reaches an on-page event')

section('Entities no event or chapter touches',
  o.unreferencedEntities.map(id => `\`${id}\``),
  'every entity is referenced somewhere')

section('On-page events in no chapter',
  o.onPageEventsInNoChapter.map(id => `\`${id}\` is marked on_page but no chapter covers it`),
  'every on-page event has a chapter')

section('Relationships that end with no visible cause',
  ended.map(e => `\`${e.id}\` (${e.from} ↔ ${e.to}) ends ${e.end} with no event touching either party in that period — candidates only, dates are coarse`),
  'every relationship end has an event near it')

section('Narrators who never saw their own scenes',
  pov.map(p => `\`${p.chapter}\`: POV \`${p.pov}\` neither participated in nor witnessed ${p.events.map(e => `\`${e}\``).join(', ')}`),
  'every POV was present for their chapter')

lines.push(`\n## Who is going quiet (appearance counts, ascending)\n`)
counts.forEach(c => lines.push(`- \`${c.id}\` — ${c.chapters} chapter${c.chapters === 1 ? '' : 's'}, ${c.events} event${c.events === 1 ? '' : 's'}`))

const th = g.themes(bindings)
section('Themes with nothing to carry them',
  th.uncarried.map(id => `${th.themes.find(t => t.id === id)?.name ?? id} — declared, but no canon embodies it`),
  'every theme has a carrier')
section('Themes carried in canon but not yet on the page',
  th.unwritten.map(id => {
    const row = th.themes.find(t => t.id === id)!
    return `${row.name} — carried by ${row.carriers.join(', ')}, dramatised in no scene`
  }),
  proseDir ? 'every carried theme appears in the manuscript' : 'not checked — pass --prose <dir> to match scene motifs')

console.log(lines.join('\n'))
// --strict: pre-commit mode — provable breaks fail the run; warnings never do.
if (strict && findings.some(f => f.severity === 'error')) process.exit(1)
