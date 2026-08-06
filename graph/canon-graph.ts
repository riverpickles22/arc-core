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
  born?: DateLike
  died?: DateLike
  created?: DateLike
  destroyed?: DateLike
  span?: SpanLike
  part_of?: string
  states?: { at: TimeRef }[]
}

export interface EventLike {
  id: string
  when: TimeRef
  where?: string
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
  pov?: string
  events?: string[]
  locations?: string[]
  span?: SpanLike
}

export interface CanonDoc {
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
