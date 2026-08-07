// arc canon-graph — the query layer over the canon export.
//
// This module is the single home of the date-ordering rule (dk) and the
// canonical temporal projection (projectAt). The rule is specified by
// date-vectors.json beside this file; tools/test_date_vectors.py holds the
// Python validator to the same vectors, so the rule cannot silently fork.
//
// Design contract: graph-model.md §5 — load the export JSON, build adjacency
// and interval indexes in memory, expose projectAt / neighbors / orphans /
// diff. The YAML files are the database; this is a rebuildable cache.
// No dependencies, no build step: plain erasable TypeScript, runnable with
// `node --experimental-strip-types` and importable by Vite/tsx consumers.

// ---- minimal structural types (consumers keep their richer ones) --------

export type DateLike = string | { date?: string; era?: string; note?: string; approximate?: boolean }

export interface TimeRef {
  era: string
  date?: string
  precision?: string
  approximate?: boolean
  timepoint?: string
  note?: string
}

export interface SpanLike { start?: DateLike; end?: DateLike }

export interface EraLike { id: string; span: SpanLike }

export interface EntityLike {
  id: string
  type?: string
  name?: string
  status?: string
  summary?: string
  voice?: string
  sensory?: string
  significance?: string
  born?: DateLike
  died?: DateLike
  created?: DateLike
  destroyed?: DateLike
  span?: SpanLike
  part_of?: string
  states?: { at: TimeRef }[]
}

/** Internal loose view of a state's optional fields — keeps EntityLike
 *  assignable from consumers' richer State types (no index signature). */
type AnyState = { at: TimeRef } & Record<string, unknown>

export interface EventLike {
  id: string
  when: TimeRef
  where?: string
  status?: string
  title?: string
  summary?: string
  on_page?: boolean
  participants?: { entity: string; role?: string }[]
  witnesses?: string[]
  causes?: string[]
  leads_to?: string[]
}

export interface EdgeLike {
  id: string
  kind: string
  status?: string
  from: string
  to: string
  directed?: boolean
  span?: SpanLike
}

export interface ChapterLike {
  id: string
  order?: number
  status?: string
  pov?: string
  events?: string[]
  locations?: string[]
  span?: SpanLike
}

/** A deterministic continuity finding. Severity follows the consequence
 *  taxonomy: 'error' only when the dates are precise enough to prove it;
 *  anything resting on approximate or era-only dates degrades to 'warning'
 *  — never a confident error on a guessed date. */
export interface Finding {
  check: 'lifespan' | 'causality' | 'custody' | 'co-location' | 'span-sanity' | 'lifecycle'
  severity: 'error' | 'warning'
  about: string[]
  message: string
}

export interface CanonDoc {
  story?: { title?: string; logline?: string; themes?: string[]; protagonists?: string[] }
  timeline: { eras: EraLike[] }
  entities: Record<string, EntityLike>
  events: Record<string, EventLike>
  relationships: EdgeLike[]
  chapters?: ChapterLike[]
}

// ---- THE date-ordering rule --------------------------------------------
// Numeric key yyyymmdd; missing parts snap to the start (or end) of the
// period. The end key is an ordering key, not a calendar date — "1959-02"
// end-snaps to ..0231 by rule, which orders correctly and matches the
// Python date_key_end. Specified by date-vectors.json.

export function dk(date: string, end = false): number {
  const p = date.split('-').map(Number)
  const [y, m, d] = [p[0], p[1] ?? (end ? 12 : 1), p[2] ?? (end ? 31 : 1)]
  return y * 10000 + m * 100 + d
}

export const dateOf = (v?: DateLike): string | undefined =>
  typeof v === 'string' ? v : v?.date

export function eraSpanKeys(era: EraLike): [number, number] {
  const s = dateOf(era.span.start)
  const e = dateOf(era.span.end)
  return [s ? dk(s) : 0, e ? dk(e, true) : 99999999]
}

/** Effective date key of a timeref: its date, else its era's start. */
export function timeRefKey(at: TimeRef, eras: EraLike[]): number {
  if (at.date) return dk(at.date)
  const era = eras.find(e => e.id === at.era)
  return era ? eraSpanKeys(era)[0] : 0
}

/** Latest state whose effective time <= T. Generic so callers keep their State type. */
export function stateAt<S extends { at: TimeRef }>(
  entity: { states?: S[] },
  tEnd: number,
  eras: EraLike[],
): S | undefined {
  const states = (entity.states ?? [])
    .map(s => ({ s, k: timeRefKey(s.at, eras) }))
    .filter(x => x.k <= tEnd)
    .sort((a, b) => a.k - b.k)
  return states.at(-1)?.s
}

/** Is the entity extant (born/created and not yet dead/ended) at key T? */
export function extantAt(entity: EntityLike, tEnd: number): boolean {
  const start = dateOf(entity.born) ?? dateOf(entity.created) ?? dateOf(entity.span?.start)
  const stop = dateOf(entity.died) ?? dateOf(entity.destroyed) ?? dateOf(entity.span?.end)
  if (start && dk(start) > tEnd) return false
  if (stop && dk(stop, true) < tEnd) return false
  return true
}

/** Does a span (open-ended allowed) cover key T? A missing span covers everything. */
export function spanActive(span: SpanLike | undefined, tEnd: number): boolean {
  const s = dateOf(span?.start)
  const e = dateOf(span?.end)
  if (s && dk(s) > tEnd) return false
  if (e && dk(e, true) < tEnd) return false
  return true
}

// ---- the graph ----------------------------------------------------------

export interface Neighbor { to: string; kind: string; via?: string }

export interface ProjectedEntity<E = EntityLike> {
  id: string
  entity: E
  state?: { at: TimeRef }
}

export interface Projection {
  at: number
  entities: Record<string, ProjectedEntity>
  /** Reified relationship edges whose span covers T (all statuses — callers filter). */
  edges: EdgeLike[]
  /** Events whose effective time <= T — the history that has happened by T. */
  eventsUpTo: string[]
}

export interface Orphans {
  /** Entities referenced by no event and no chapter (relationships alone don't rescue them). */
  unreferencedEntities: string[]
  /** Events marked on_page that appear in no chapter's events list. */
  onPageEventsInNoChapter: string[]
  /** leads_to targets that never reach the page: the chain ends off-page — a payoff planted, never fired. */
  danglingLeadsTo: { from: string; to: string }[]
}

export interface ProjectionDiff {
  onlyInA: string[]
  onlyInB: string[]
  stateChanged: string[]
  edgesOnlyInA: string[]
  edgesOnlyInB: string[]
}

export class CanonGraph {
  readonly canon: CanonDoc
  readonly eras: EraLike[]
  /** Every edge — reified and structural — as an adjacency list, both directions. */
  readonly adj: Map<string, Neighbor[]>

  constructor(canon: CanonDoc) {
    this.canon = canon
    this.eras = canon.timeline?.eras ?? []
    this.adj = new Map()
    const add = (from: string, to: string, kind: string, via?: string) => {
      if (!from || !to) return
      if (!this.adj.has(from)) this.adj.set(from, [])
      this.adj.get(from)!.push({ to, kind, via })
    }
    const both = (a: string, b: string, kind: string, via?: string) => { add(a, b, kind, via); add(b, a, kind, via) }

    for (const r of canon.relationships ?? []) both(r.from, r.to, r.kind, r.id)
    for (const e of Object.values(canon.events ?? {})) {
      if (e.where) both(e.id, e.where, 'at')
      for (const p of e.participants ?? []) both(e.id, p.entity, 'participant')
      for (const w of e.witnesses ?? []) both(e.id, w, 'witness')
      for (const c of e.causes ?? []) both(e.id, c, 'causes')
      for (const l of e.leads_to ?? []) both(e.id, l, 'leads-to')
    }
    for (const ent of Object.values(canon.entities ?? {})) {
      if (ent.part_of) both(ent.id, ent.part_of, 'part-of')
    }
    for (const ch of canon.chapters ?? []) {
      if (ch.pov) both(ch.id, ch.pov, 'pov')
      for (const ev of ch.events ?? []) both(ch.id, ev, 'covers')
      for (const loc of ch.locations ?? []) both(ch.id, loc, 'set-in')
    }
  }

  /** The world as of key T: extant entities with their latest state <= T,
   *  relationship edges whose span covers T, and the events that have happened. */
  projectAt(tEnd: number): Projection {
    const entities: Record<string, ProjectedEntity> = {}
    for (const ent of Object.values(this.canon.entities ?? {})) {
      if (!extantAt(ent, tEnd)) continue
      entities[ent.id] = { id: ent.id, entity: ent, state: stateAt(ent, tEnd, this.eras) }
    }
    const edges = (this.canon.relationships ?? []).filter(r => spanActive(r.span, tEnd))
    const eventsUpTo = Object.values(this.canon.events ?? {})
      .filter(e => timeRefKey(e.when, this.eras) <= tEnd)
      .map(e => e.id)
      .sort()
    return { at: tEnd, entities, edges, eventsUpTo }
  }

  /** BFS over every edge class, optionally restricted to edge kinds. */
  neighbors(id: string, kinds?: string[], hops = 1): { id: string; dist: number }[] {
    const want = kinds?.length ? new Set(kinds) : null
    const seen = new Map<string, number>([[id, 0]])
    let frontier = [id]
    for (let d = 1; d <= hops && frontier.length; d++) {
      const next: string[] = []
      for (const cur of frontier) {
        for (const n of this.adj.get(cur) ?? []) {
          if (want && !want.has(n.kind)) continue
          if (seen.has(n.to)) continue
          seen.set(n.to, d)
          next.push(n.to)
        }
      }
      frontier = next
    }
    seen.delete(id)
    return [...seen.entries()].map(([nid, dist]) => ({ id: nid, dist })).sort((a, b) => a.dist - b.dist || a.id.localeCompare(b.id))
  }

  orphans(): Orphans {
    const referenced = new Set<string>()
    for (const e of Object.values(this.canon.events ?? {})) {
      if (e.where) referenced.add(e.where)
      for (const p of e.participants ?? []) referenced.add(p.entity)
      for (const w of e.witnesses ?? []) referenced.add(w)
    }
    const chapterEvents = new Set<string>()
    for (const ch of this.canon.chapters ?? []) {
      if (ch.pov) referenced.add(ch.pov)
      for (const loc of ch.locations ?? []) referenced.add(loc)
      for (const ev of ch.events ?? []) chapterEvents.add(ev)
    }
    const unreferencedEntities = Object.keys(this.canon.entities ?? {})
      .filter(id => !referenced.has(id)).sort()

    const onPageEventsInNoChapter = Object.values(this.canon.events ?? {})
      .filter(e => e.on_page && !chapterEvents.has(e.id))
      .map(e => e.id).sort()

    // An event "reaches the page" if it, or anything downstream of it along
    // leads_to, is on_page. A leads_to edge into a subtree that never reaches
    // the page is a planted payoff that never fires.
    const events = this.canon.events ?? {}
    const reaches = new Map<string, boolean>()
    const reachesPage = (id: string, trail: Set<string>): boolean => {
      if (reaches.has(id)) return reaches.get(id)!
      if (trail.has(id)) return false // cycle guard; causality check owns cycles
      trail.add(id)
      const e = events[id]
      const r = !!e && (!!e.on_page || (e.leads_to ?? []).some(next => reachesPage(next, trail)))
      reaches.set(id, r)
      return r
    }
    const danglingLeadsTo: { from: string; to: string }[] = []
    for (const e of Object.values(events)) {
      for (const to of e.leads_to ?? []) {
        if (!reachesPage(to, new Set())) danglingLeadsTo.push({ from: e.id, to })
      }
    }
    danglingLeadsTo.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
    return { unreferencedEntities, onPageEventsInNoChapter, danglingLeadsTo }
  }

  /** Chapters whose POV neither participated in nor witnessed any of the
   *  chapter's own events — they narrate what they never saw. The graph
   *  flags; a human judges (a frame narrator may be intentional). */
  povMismatches(): { chapter: string; pov: string; events: string[] }[] {
    const out: { chapter: string; pov: string; events: string[] }[] = []
    for (const ch of this.canon.chapters ?? []) {
      if (!ch.pov || !(ch.events ?? []).length) continue
      const saw = (ch.events ?? []).some(id => {
        const e = this.canon.events[id]
        return !!e && ((e.participants ?? []).some(p => p.entity === ch.pov) || (e.witnesses ?? []).includes(ch.pov!))
      })
      if (!saw) out.push({ chapter: ch.id, pov: ch.pov, events: ch.events ?? [] })
    }
    return out
  }

  /** Relationship spans that end with no event visibly causing the end:
   *  no event inside the end date's period involves either endpoint.
   *  Candidates, not proof — coarse dates make this a lint. */
  endedEdgesWithoutCause(): { id: string; end: string; from: string; to: string }[] {
    const out: { id: string; end: string; from: string; to: string }[] = []
    for (const r of this.canon.relationships ?? []) {
      const end = dateOf(r.span?.end)
      if (!end) continue
      const lo = dk(end), hi = dk(end, true)
      const explained = Object.values(this.canon.events ?? {}).some(e => {
        const k = timeRefKey(e.when, this.eras)
        if (k < lo || k > hi) return false
        const touched = new Set([...(e.participants ?? []).map(p => p.entity), ...(e.witnesses ?? []), e.where ?? ''])
        return touched.has(r.from) || touched.has(r.to)
      })
      if (!explained) out.push({ id: r.id, end, from: r.from, to: r.to })
    }
    return out
  }

  /** Plain appearance counts per character — the boring version that beats
   *  centrality at this scale (graph-model.md §2). Ascending: quiet ones first. */
  appearanceCounts(): { id: string; events: number; chapters: number }[] {
    const chars = Object.values(this.canon.entities ?? {}).filter(e => e.type === 'character')
    const out = chars.map(c => {
      const evIds = Object.values(this.canon.events ?? {})
        .filter(e => (e.participants ?? []).some(p => p.entity === c.id) || (e.witnesses ?? []).includes(c.id))
        .map(e => e.id)
      const evSet = new Set(evIds)
      const chapters = (this.canon.chapters ?? []).filter(ch =>
        ch.pov === c.id || (ch.events ?? []).some(id => evSet.has(id))).length
      return { id: c.id, events: evIds.length, chapters }
    })
    return out.sort((a, b) => (a.chapters + a.events) - (b.chapters + b.events) || a.id.localeCompare(b.id))
  }

  /** Two places in the same part_of lineage don't conflict (Habana Vieja is in Havana). */
  private sameLineage(a: string, b: string): boolean {
    const chain = (id: string): Set<string> => {
      const out = new Set<string>()
      let cur: string | undefined = id
      while (cur && !out.has(cur)) { out.add(cur); cur = this.canon.entities[cur]?.part_of }
      return out
    }
    return chain(a).has(b) || chain(b).has(a)
  }

  /** The six cross-entity checks (graph-model.md §6): deterministic interval
   *  arithmetic, free on every run. Findings, not verdicts — a human judges. */
  checks(): Finding[] {
    const F: Finding[] = []
    const ents = this.canon.entities ?? {}
    const evs = Object.values(this.canon.events ?? {})
    const key = (at: TimeRef) => timeRefKey(at, this.eras)
    const label = (at: TimeRef) => at.date ?? at.era
    const evInterval = (e: EventLike): [number, number] => {
      if (e.when.date) return [dk(e.when.date), dk(e.when.date, true)]
      const era = this.eras.find(x => x.id === e.when.era)
      return era ? eraSpanKeys(era) : [0, 99999999]
    }
    const precise = (at: TimeRef) => !!at.date && !at.approximate
    const sev = (p: boolean): Finding['severity'] => (p ? 'error' : 'warning')
    const startOf = (ent: EntityLike) => dateOf(ent.born) ?? dateOf(ent.created) ?? dateOf(ent.span?.start)
    const endOf = (ent: EntityLike) => dateOf(ent.died) ?? dateOf(ent.destroyed) ?? dateOf(ent.span?.end)

    // 1 — lifespan participation
    for (const e of evs) {
      const [lo, hi] = evInterval(e)
      for (const id of [...(e.participants ?? []).map(p => p.entity), ...(e.witnesses ?? [])]) {
        const ent = ents[id]; if (!ent) continue
        const born = startOf(ent), died = endOf(ent)
        if (born && hi < dk(born))
          F.push({ check: 'lifespan', severity: sev(precise(e.when)), about: [e.id, id], message: `${id} is in ${e.id} (${label(e.when)}) before existing (${born})` })
        if (died && lo > dk(died, true))
          F.push({ check: 'lifespan', severity: sev(precise(e.when)), about: [e.id, id], message: `${id} is in ${e.id} (${label(e.when)}) after their end (${died})` })
      }
    }

    // 2 — causality direction + cycles. Interval-provable only: a violation
    // exists iff the cause's EARLIEST possible time is after the effect's
    // LATEST possible time. A year-precision date can never prove ordering
    // inside its own year — no finding on overlap, no confident artifacts.
    for (const e of evs) {
      const [elo, ehi] = evInterval(e)
      for (const c of e.causes ?? []) {
        const ce = this.canon.events[c]; if (!ce) continue
        if (evInterval(ce)[0] > ehi)
          F.push({ check: 'causality', severity: sev(!!e.when.date && !!ce.when.date), about: [c, e.id], message: `${c} (${label(ce.when)}) causes ${e.id} (${label(e.when)}) but provably postdates it` })
      }
      for (const l of e.leads_to ?? []) {
        const le = this.canon.events[l]; if (!le) continue
        if (evInterval(le)[1] < elo)
          F.push({ check: 'causality', severity: sev(!!e.when.date && !!le.when.date), about: [e.id, l], message: `${e.id} (${label(e.when)}) leads to ${l} (${label(le.when)}), which provably happens earlier` })
      }
    }
    const atInterval = (at: TimeRef): [number, number] => {
      if (at.date) return [dk(at.date), dk(at.date, true)]
      const era = this.eras.find(x => x.id === at.era)
      return era ? eraSpanKeys(era) : [0, 99999999]
    }
    for (const ent of Object.values(ents)) for (const st of (ent.states ?? []) as AnyState[]) {
      const [, shi] = atInterval(st.at)
      for (const cb of (st.caused_by as string[] | undefined) ?? []) {
        const ce = this.canon.events[cb]; if (!ce) continue
        if (evInterval(ce)[0] > shi)
          F.push({ check: 'causality', severity: 'warning', about: [ent.id, cb], message: `${ent.id} state at ${label(st.at)} is caused_by ${cb} (${label(ce.when)}), which provably happens later` })
      }
    }
    {
      const children = new Map<string, string[]>()
      for (const e of evs) {
        if (!children.has(e.id)) children.set(e.id, [])
        children.get(e.id)!.push(...(e.leads_to ?? []))
        for (const c of e.causes ?? []) { if (!children.has(c)) children.set(c, []); children.get(c)!.push(e.id) }
      }
      const st = new Map<string, number>()
      const stack: string[] = []
      const dfs = (id: string) => {
        if (st.get(id) === 1) return
        if (st.get(id) === 0) {
          const at = stack.indexOf(id)
          F.push({ check: 'causality', severity: 'error', about: stack.slice(at), message: `causal cycle: ${[...stack.slice(at), id].join(' → ')}` })
          return
        }
        st.set(id, 0); stack.push(id)
        for (const ch of children.get(id) ?? []) dfs(ch)
        stack.pop(); st.set(id, 1)
      }
      for (const id of children.keys()) if (!st.has(id)) dfs(id)
    }

    // 3 — custody: the schema double-books possession; cross-check the records
    interface Poss { holder: string; from: number; to: number; at: string }
    const possOf = new Map<string, Poss[]>()
    for (const ent of Object.values(ents)) {
      if (ent.type !== 'character') continue
      const sts = ((ent.states ?? []) as AnyState[]).map(s => ({ s, k: key(s.at) })).sort((a, b) => a.k - b.k)
      sts.forEach((x, i) => {
        for (const o of (x.s.possessions as string[] | undefined) ?? []) {
          if (!possOf.has(o)) possOf.set(o, [])
          possOf.get(o)!.push({ holder: ent.id, from: x.k, to: sts[i + 1]?.k ?? 99999999, at: label(x.s.at) })
        }
      })
    }
    for (const [obj, list] of possOf) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        if (a.holder !== b.holder && a.from < b.to && b.from < a.to)
          F.push({ check: 'custody', severity: 'warning', about: [obj, a.holder, b.holder], message: `${obj} held by ${a.holder} (from ${a.at}) and ${b.holder} (from ${b.at}) over overlapping periods with no transfer recorded` })
      }
      const oEnt = ents[obj]
      for (const stx of (oEnt?.states ?? []) as AnyState[]) {
        const k = key(stx.at)
        const holders = list.filter(p => p.from <= k && k < p.to)
        const cb = stx.controlled_by as string | undefined
        if (cb && holders.length && !holders.some(h => h.holder === cb))
          F.push({ check: 'custody', severity: 'warning', about: [obj, cb, ...holders.map(h => h.holder)], message: `${obj} at ${label(stx.at)} says controlled_by ${cb}, but character states say ${holders.map(h => h.holder).join('/')} hold it then` })
        const loc = stx.location as string | undefined
        if (loc) for (const h of holders) {
          const hs = stateAt(ents[h.holder] ?? { states: [] }, k, this.eras) as AnyState | undefined
          const hl = hs?.location as string | undefined
          if (hl && hl !== loc && !this.sameLineage(loc, hl))
            F.push({ check: 'custody', severity: 'warning', about: [obj, h.holder], message: `${obj} is at ${loc} (${label(stx.at)}) while its holder ${h.holder} is at ${hl}` })
        }
      }
    }

    // 4 — co-location via event participation. Characters only: a faction
    // or organization being in two places at once is normal, not a finding.
    const evByChar = new Map<string, EventLike[]>()
    for (const e of evs) for (const p of (e.participants ?? []).map(p => p.entity)) {
      if (ents[p]?.type !== 'character') continue
      if (!evByChar.has(p)) evByChar.set(p, [])
      evByChar.get(p)!.push(e)
    }
    for (const [c, list] of evByChar) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        if (!a.where || !b.where || a.where === b.where || this.sameLineage(a.where, b.where)) continue
        const [alo, ahi] = evInterval(a), [blo, bhi] = evInterval(b)
        if (alo <= bhi && blo <= ahi)
          F.push({ check: 'co-location', severity: sev(precise(a.when) && precise(b.when) && a.when.date === b.when.date), about: [c, a.id, b.id], message: `${c} is at ${a.where} (${a.id}, ${label(a.when)}) and ${b.where} (${b.id}, ${label(b.when)}) in overlapping time` })
      }
    }

    // 5 — span sanity
    for (const r of this.canon.relationships ?? []) {
      const s = dateOf(r.span?.start), en = dateOf(r.span?.end)
      for (const endpoint of [r.from, r.to]) {
        const ent = ents[endpoint]; if (!ent) continue
        const eStart = startOf(ent), eEnd = endOf(ent)
        if (s && eStart && dk(s, true) < dk(eStart))
          F.push({ check: 'span-sanity', severity: 'warning', about: [r.id, endpoint], message: `${r.id} starts ${s}, before ${endpoint} exists (${eStart})` })
        if (en && eEnd && dk(en) > dk(eEnd, true))
          F.push({ check: 'span-sanity', severity: 'warning', about: [r.id, endpoint], message: `${r.id} ends ${en}, after ${endpoint} ends (${eEnd})` })
      }
    }
    for (const ent of Object.values(ents)) {
      const died = dateOf(ent.died) ?? dateOf(ent.destroyed)
      const sts = (ent.states ?? []).map(s => ({ s, k: key(s.at) }))
      if (died) for (const x of sts) if (x.k > dk(died, true))
        F.push({ check: 'span-sanity', severity: 'warning', about: [ent.id], message: `${ent.id} has a state at ${label(x.s.at)}, after its end (${died})` })
      for (let i = 1; i < sts.length; i++) if (sts[i].k < sts[i - 1].k)
        F.push({ check: 'span-sanity', severity: 'warning', about: [ent.id], message: `${ent.id} states are out of chronological order (${label(sts[i].s.at)} listed after ${label(sts[i - 1].s.at)})` })
      const seen = new Map<number, number>()
      sts.forEach(x => seen.set(x.k, (seen.get(x.k) ?? 0) + 1))
      for (const [k, n] of seen) if (n > 1)
        F.push({ check: 'span-sanity', severity: 'warning', about: [ent.id], message: `${ent.id} has ${n} states collapsing to the same time key (${k})` })
    }

    // 6 — lifecycle discipline: canon leaning on proposed; deprecated without successor
    const statusOf = new Map<string, string>()
    for (const ent of Object.values(ents)) if (ent.status) statusOf.set(ent.id, ent.status)
    for (const e of evs) if (e.status) statusOf.set(e.id, e.status)
    for (const r of this.canon.relationships ?? []) if (r.status) statusOf.set(r.id, r.status)
    const refsOf = (rec: { id: string }): string[] => {
      const ent = ents[rec.id]
      if (ent) {
        const out: string[] = ent.part_of ? [ent.part_of] : []
        for (const st of (ent.states ?? []) as AnyState[]) {
          out.push(...(((st.caused_by as string[] | undefined) ?? [])))
          if (st.location) out.push(String(st.location))
          out.push(...(((st.possessions as string[] | undefined) ?? [])))
          if (st.controlled_by) out.push(String(st.controlled_by))
          for (const p of (st.relationships as { toward: string }[] | undefined) ?? []) out.push(p.toward)
        }
        return out
      }
      const e = this.canon.events[rec.id]
      if (e) return [e.where ?? '', ...(e.participants ?? []).map(p => p.entity), ...(e.witnesses ?? []), ...(e.causes ?? []), ...(e.leads_to ?? [])].filter(Boolean)
      const r = (this.canon.relationships ?? []).find(x => x.id === rec.id)
      if (r) return [r.from, r.to]
      return []
    }
    const canonRecs = [...Object.values(ents), ...evs, ...(this.canon.relationships ?? [])].filter(r => (r as { status?: string }).status === 'canon')
    for (const rec of canonRecs) {
      for (const ref of refsOf(rec)) {
        if (statusOf.get(ref) === 'proposed')
          F.push({ check: 'lifecycle', severity: 'warning', about: [rec.id, ref], message: `canon-status ${rec.id} depends on proposed ${ref} (conventions §5)` })
      }
    }
    for (const rec of [...Object.values(ents), ...evs, ...(this.canon.relationships ?? [])]) {
      const r = rec as { id: string; status?: string; superseded_by?: string }
      if (r.status === 'deprecated' && !r.superseded_by)
        F.push({ check: 'lifecycle', severity: 'warning', about: [r.id], message: `${r.id} is deprecated with no superseded_by` })
    }

    // Dedupe identical findings (e.g. the same canon→proposed dependency
    // reached through several states), then errors first.
    const seenMsg = new Set<string>()
    const out = F.filter(f => { const k = f.check + '|' + f.message; if (seenMsg.has(k)) return false; seenMsg.add(k); return true })
    return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) || a.check.localeCompare(b.check) || a.message.localeCompare(b.message))
  }

  /** Diff two projections at the level of facts: presence, state, and edges. */
  static diff(a: Projection, b: Projection): ProjectionDiff {
    const aIds = new Set(Object.keys(a.entities)), bIds = new Set(Object.keys(b.entities))
    const onlyInA = [...aIds].filter(id => !bIds.has(id)).sort()
    const onlyInB = [...bIds].filter(id => !aIds.has(id)).sort()
    const stateChanged = [...aIds].filter(id => bIds.has(id) &&
      JSON.stringify(a.entities[id].state ?? null) !== JSON.stringify(b.entities[id].state ?? null)).sort()
    const aE = new Set(a.edges.map(e => e.id)), bE = new Set(b.edges.map(e => e.id))
    return {
      onlyInA, onlyInB, stateChanged,
      edgesOnlyInA: [...aE].filter(id => !bE.has(id)).sort(),
      edgesOnlyInB: [...bE].filter(id => !aE.has(id)).sort(),
    }
  }
}

export function loadGraph(canon: CanonDoc): CanonGraph {
  return new CanonGraph(canon)
}
