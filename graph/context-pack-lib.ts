// context-pack library — one auditable markdown bundle for drafting a scene.
// The graph structure IS the retrieval: traversal from the chapter's own
// anchors, one causal hop back, payoffs fenced. Every included item carries
// the reason it is here — auditable context is the thesis (graph-model.md §4).
// The CLI wrapper is context-pack.ts; this module is import-safe (no argv, no
// process.exit) so arc-backend's drafting loop can build the same bundle.
import { dk, dateOf, eraSpanKeys, extantAt, stateAt, timeRefKey, type CanonDoc, type ChapterLike } from './canon-graph.ts'

export interface ContextPackOptions {
  /** anchor by chapter id — derives T, seed events, places, and POV */
  chapter?: string
  /** anchor by date (used when no chapter is given) */
  at?: string
  pov?: string
  place?: string
  events?: string[]
  /** truncate long freeform fields to this many characters */
  maxChars?: number
}

export function buildContextPack(canon: CanonDoc & { generated_from?: string }, opts: ContextPackOptions): string {
  const eras = canon.timeline?.eras ?? []
  const maxChars = opts.maxChars ?? 0
  const trim = (s?: string) => {
    const t = (s ?? '').trim().replace(/\s+/g, ' ')
    return maxChars && t.length > maxChars ? t.slice(0, maxChars - 1) + '…' : t
  }

  // ---- anchors ------------------------------------------------------------
  let chapter: ChapterLike | undefined
  let T: number
  let seedEvents: string[] = []
  let seedPlaces: string[] = []
  let pov: string | undefined

  if (opts.chapter) {
    chapter = (canon.chapters ?? []).find(c => c.id === opts.chapter)
    if (!chapter) throw new Error(`no chapter ${opts.chapter}`)
    const end = dateOf(chapter.span?.end) ?? dateOf(chapter.span?.start)
    T = end ? dk(end, true) : 99999999
    seedEvents = chapter.events ?? []
    seedPlaces = chapter.locations ?? []
    pov = chapter.pov
  } else {
    if (!opts.at) throw new Error('need --chapter or --at')
    T = dk(opts.at, true)
    pov = opts.pov
    seedPlaces = opts.place ? [opts.place] : []
    seedEvents = opts.events ?? []
  }

  // ---- selection with reasons --------------------------------------------
  const reasons = new Map<string, string[]>()
  const include = (id: string, why: string) => {
    if (!reasons.has(id)) reasons.set(id, [])
    const r = reasons.get(id)!
    if (!r.includes(why)) r.push(why)
  }
  const why = (id: string) => reasons.get(id)?.join('; ') ?? ''

  const events = new Set<string>()
  for (const e of seedEvents) { events.add(e); include(e, chapter ? `listed by ${chapter.id}` : 'seed event') }
  // one hop back along causes — what led here
  for (const id of [...events]) {
    for (const c of canon.events[id]?.causes ?? []) {
      if (!events.has(c)) { events.add(c); include(c, `cause of ${id}`) }
    }
  }
  // payoffs: included but fenced
  const payoffs: { from: string; to: string }[] = []
  for (const id of events) for (const l of canon.events[id]?.leads_to ?? [])
    if (!events.has(l)) payoffs.push({ from: id, to: l })

  const chars = new Set<string>()
  if (pov) { chars.add(pov); include(pov, chapter ? `POV of ${chapter.id}` : 'requested POV') }
  for (const id of events) {
    const e = canon.events[id]; if (!e) continue
    for (const p of e.participants ?? []) { chars.add(p.entity); include(p.entity, `participant in ${id}`) }
    for (const w of e.witnesses ?? []) { chars.add(w); include(w, `witness of ${id}`) }
  }

  const places = new Set<string>()
  const addPlaceChain = (id: string, why0: string) => {
    let cur: string | undefined = id
    let step = why0
    while (cur && canon.entities[cur] && !places.has(cur)) {
      places.add(cur); include(cur, step)
      const parent: string | undefined = canon.entities[cur].part_of
      step = `contains ${cur}`.replace('contains', 'part_of chain of') // parent reason
      cur = parent
    }
  }
  for (const p of seedPlaces) addPlaceChain(p, chapter ? `location of ${chapter.id}` : 'requested place')
  for (const id of events) { const w = canon.events[id]?.where; if (w) addPlaceChain(w, `where ${id} happens`) }

  const objs = new Set<string>()
  const charState = new Map<string, Record<string, unknown> & { at: { era: string; date?: string } }>()
  for (const c of chars) {
    const ent = canon.entities[c]; if (!ent) { chars.delete(c); continue }
    const st = stateAt(ent, T, eras) as (Record<string, unknown> & { at: { era: string; date?: string } }) | undefined
    if (st) charState.set(c, st)
    for (const o of (st?.possessions as string[] | undefined) ?? []) {
      if (canon.entities[o]) { objs.add(o); include(o, `possessed by ${c} at T`) }
    }
  }

  const included = new Set([...chars, ...places, ...objs])
  const edges = (canon.relationships ?? []).filter(r => {
    const active = ((): boolean => {
      const s = dateOf(r.span?.start), e = dateOf(r.span?.end)
      if (s && dk(s) > T) return false
      if (e && dk(e, true) < T) return false
      return true
    })()
    return active && included.has(r.from) && included.has(r.to)
  })

  // ---- the bundle ---------------------------------------------------------
  const era = eras.find(e => { const [s, en] = eraSpanKeys(e); return T >= s && T <= en })
  const out: string[] = []
  const item = (line: string, reason: string) => out.push(`- ${line}\n  — included: ${reason}`)

  out.push(`# Context pack — ${chapter ? `${chapter.id}` : `T=${opts.at}`} · ${canon.generated_from ?? ''}`)
  out.push(`\n## Premise`)
  out.push(`${canon.story?.title ?? ''} — ${trim(canon.story?.logline)}`)
  out.push(`\n## Time & era`)
  out.push(`T = end of ${chapter ? dateOf(chapter.span?.end) ?? dateOf(chapter.span?.start) : opts.at}` +
    (era ? ` · ${(era as any).name ?? era.id}${(era as any).mood ? ` — ${(era as any).mood}` : ''}` : ''))

  out.push(`\n## POV state`)
  if (pov && charState.has(pov)) {
    const st = charState.get(pov)!
    const bits = ['location', 'condition', 'psychology', 'note'].map(k => st[k] ? `${k}: ${trim(String(st[k]))}` : '').filter(Boolean)
    const beliefs = (st.beliefs as string[] | undefined)?.map(b => trim(b))
    const percept = (st.relationships as { toward: string; stance: string }[] | undefined)?.map(p => `${p.toward}: ${trim(p.stance)}`)
    item(`\`${pov}\` (${canon.entities[pov]?.name ?? ''}) — ${bits.join(' · ')}`, why(pov))
    if (beliefs?.length) out.push(`  beliefs: ${beliefs.join(' | ')}`)
    if (percept?.length) out.push(`  perceives — ${percept.join(' | ')}`)
    if (canon.entities[pov]?.voice) out.push(`  voice: ${trim(canon.entities[pov].voice)}`)
  } else out.push(pov ? `_${pov} has no state at T_` : '_no POV anchor_')

  out.push(`\n## Cast present`)
  for (const c of [...chars].filter(c => c !== pov).sort()) {
    const st = charState.get(c)
    const gone = !extantAt(canon.entities[c], T) ? ' **(not living at T — memory/backstory only)**' : ''
    const desc = st ? ['location', 'condition', 'psychology'].map(k => st[k] ? trim(String(st[k])) : '').filter(Boolean).join(' · ') : trim(canon.entities[c]?.summary)
    item(`\`${c}\` (${canon.entities[c]?.name ?? ''})${gone} — ${desc}`, why(c))
  }
  if (chars.size <= (pov ? 1 : 0)) out.push('_none beyond the POV_')

  out.push(`\n## Places`)
  for (const p of [...places].sort()) {
    const ent = canon.entities[p]
    const st = stateAt(ent, T, eras) as (Record<string, unknown> & { at: { era: string; date?: string } }) | undefined
    const desc = [st?.condition ? trim(String(st.condition)) : '', ent.sensory ? trim(ent.sensory) : ''].filter(Boolean).join(' · ') || trim(ent.summary)
    item(`\`${p}\` (${ent.name ?? ''}) — ${desc}`, why(p))
  }

  out.push(`\n## What just happened (events ≤ T, selected)`)
  for (const id of [...events].sort((a, b) => timeRefKey(canon.events[a].when, eras) - timeRefKey(canon.events[b].when, eras))) {
    const e = canon.events[id]
    if (timeRefKey(e.when, eras) > T) { item(`\`${id}\` — happens after T, drafted scene must not know it yet`, why(id)); continue }
    item(`\`${id}\` (${e.when.date ?? e.when.era}) — ${trim(e.summary ?? e.title)}`, why(id))
  }

  out.push(`\n## Planted payoffs — do not reveal`)
  if (payoffs.length) {
    out.push(`> The record knows these are coming; the scene must not.`)
    for (const p of payoffs) out.push(`> - \`${p.from}\` leads to \`${p.to}\``)
  } else out.push('_none planted from the selected events_')

  out.push(`\n## Active relationships (within the included cast)`)
  for (const r of edges) item(`\`${r.id}\` ${r.from} ${r.directed ? '→' : '↔'} ${r.to} (${r.kind}) — ${trim((r as any).summary)}`, 'span covers T; both parties included')
  if (!edges.length) out.push('_none_')

  for (const o of [...objs].sort()) {
    const ent = canon.entities[o]
    const st = stateAt(ent, T, eras) as (Record<string, unknown> & { at: { era: string; date?: string } }) | undefined
    out.push(`\n## Object: \`${o}\` (${ent.name ?? ''})`)
    item(`${st?.condition ? trim(String(st.condition)) : trim(ent.summary)}${ent.significance ? ` · ${trim(ent.significance)}` : ''}`, why(o))
  }

  return out.join('\n')
}
