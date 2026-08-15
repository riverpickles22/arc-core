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

// ---- the HTTP API wire format (types only; see api-types.ts) ------------

export type * from './api-types.ts'
export type { Anchor, AnchorResolution, AnchorState, AnnotationLike, ResolvedAnnotation, LockLike, ResolvedLock } from './annotations.ts'

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

export interface ThemeLike {
  id: string
  name?: string
  status?: string
  summary?: string
  /** canon that embodies this theme */
  carriers?: string[]
  /** the words it goes by in scene contracts */
  motifs?: string[]
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

/** The three registers of consequence (conventions §11). Every finding any
 *  surface shows lives in exactly one, never blurred: 'proven' facts are
 *  deterministic and the only kind ever called an error; 'argued' findings
 *  are model-read claims with citations, to review, never verdicts; 'asked'
 *  questions are surfaced because a dependency is visible, and the machine
 *  never answers them. */
export type Register = 'proven' | 'argued' | 'asked'

/** A deterministic continuity finding. Severity follows the consequence
 *  taxonomy: 'error' only when the dates are precise enough to prove it;
 *  anything resting on approximate or era-only dates degrades to 'warning'
 *  — never a confident error on a guessed date. */
export interface Finding {
  check: 'lifespan' | 'causality' | 'custody' | 'co-location' | 'span-sanity' | 'lifecycle'
  severity: 'error' | 'warning'
  /** Absent means 'proven' — every deterministic check is. The field exists
   *  so model-read surfaces land into the same shape without a migration. */
  register?: Register
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
  themes?: ThemeLike[]
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

/** The snapshots strictly after tA and at-or-before tB, in time order —
 *  the path a character walked between two moments, not just the endpoints. */
export function statesBetween<S extends { at: TimeRef }>(
  entity: { states?: S[] },
  tA: number,
  tB: number,
  eras: EraLike[],
): S[] {
  return (entity.states ?? [])
    .map(s => ({ s, k: timeRefKey(s.at, eras) }))
    .filter(x => x.k > tA && x.k <= tB)
    .sort((a, b) => a.k - b.k)
    .map(x => x.s)
}

export interface StateListDelta { field: 'beliefs' | 'wants' | 'fears' | 'possessions'; added: string[]; removed: string[] }
export interface StateScalarDelta { field: 'location' | 'condition' | 'psychology' | 'age'; before?: string; after?: string }
/** absent before = perception gained; absent after = perception dropped */
export interface RelationshipDelta { toward: string; before?: string; after?: string }

export interface CharacterDiff {
  /** the compared endpoint snapshots' timerefs; null = no state at that moment */
  from: TimeRef | null
  to: TimeRef | null
  scalars: StateScalarDelta[]
  lists: StateListDelta[]
  relationships: RelationshipDelta[]
  /** caused_by union across every snapshot in (tA, tB] — WHY it changed */
  causes: string[]
  /** snapshots inside the window: the path, not just the endpoints */
  steps: number
}

/** Who is this character at tB that they were not at tA — named contents,
 *  never counts. A snapshot that drops one belief and adds another reports
 *  both; the adjacent-snapshot delta is the degenerate case of this. */
export function diffCharacter<S extends { at: TimeRef }>(
  entity: { states?: S[] },
  tA: number,
  tB: number,
  eras: EraLike[],
): CharacterDiff {
  const a = stateAt(entity, tA, eras) as AnyState | undefined
  const b = stateAt(entity, tB, eras) as AnyState | undefined
  const between = statesBetween(entity, tA, tB, eras) as AnyState[]

  const out: CharacterDiff = {
    from: a?.at ?? null, to: b?.at ?? null,
    scalars: [], lists: [], relationships: [],
    causes: [...new Set(between.flatMap(s => (s.caused_by as string[] | undefined) ?? []))].sort(),
    steps: between.length,
  }
  if (a === b) return out   // same snapshot (or neither exists): no change to report

  const sa = (a ?? {}) as Record<string, unknown>
  const sb = (b ?? {}) as Record<string, unknown>
  for (const field of ['location', 'condition', 'psychology', 'age'] as const) {
    const va = sa[field] === undefined ? undefined : String(sa[field])
    const vb = sb[field] === undefined ? undefined : String(sb[field])
    if (va !== vb) out.scalars.push({ field, before: va, after: vb })
  }
  for (const field of ['beliefs', 'wants', 'fears', 'possessions'] as const) {
    const la = (sa[field] as string[] | undefined) ?? []
    const lb = (sb[field] as string[] | undefined) ?? []
    const added = lb.filter(x => !la.includes(x))
    const removed = la.filter(x => !lb.includes(x))
    if (added.length || removed.length) out.lists.push({ field, added, removed })
  }
  const ra = new Map(((sa.relationships as { toward: string; stance: string }[] | undefined) ?? []).map(r => [r.toward, r.stance]))
  const rb = new Map(((sb.relationships as { toward: string; stance: string }[] | undefined) ?? []).map(r => [r.toward, r.stance]))
  for (const [toward, stance] of rb) {
    const prev = ra.get(toward)
    if (prev === undefined) out.relationships.push({ toward, after: stance })
    else if (prev !== stance) out.relationships.push({ toward, before: prev, after: stance })
  }
  for (const [toward, stance] of ra) {
    if (!rb.has(toward)) out.relationships.push({ toward, before: stance })
  }
  out.relationships.sort((x, y) => x.toward.localeCompare(y.toward))
  return out
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

/** A prose scene's binding, as consumers hold it (the export carries no
 *  prose; the viewer and CLIs pass bindings in). */
export interface SceneBinding {
  scene: string; facts?: string[]; events?: string[]
  /** the chapter the scene belongs to — reading order for obligation windows */
  chapter?: string
  /** narrative obligations this scene's contract claims to discharge */
  satisfies?: string[]
  /** the motifs the scene's contract names, in the author's own words */
  motifs?: string[]
}

/** A story material item (conventions §12). Material lives beside canon,
 *  never in it, so it is passed into the graph rather than loaded from the
 *  export — the same way scene bindings are. */
export interface MaterialLike {
  id: string
  type?: string
  status?: string
  body?: string
  satisfied_by?: string[]
  window?: { from?: string; to?: string }
}

export interface ObligationRow {
  id: string
  body: string
  /** what claims to discharge it — canon, material, or scene ids */
  satisfiers: string[]
  window?: { from?: string; to?: string }
}

/** What the book still owes (conventions §12) — the mirror of the unfired
 *  payoff report. A payoff is bottom-up: planted and never fired. An
 *  obligation is top-down: decided and never made.
 *
 *  Registers are split deliberately (§11): the three classes are 'proven' —
 *  it is a fact that nothing links here — while whether a scene that claims
 *  an obligation truly discharges it is 'asked', because only a reader can
 *  answer that. */
export interface Obligations {
  /** nothing anywhere claims to satisfy this */
  unowned: ObligationRow[]
  /** claimed, but by material or a scene that isn't written */
  unwritten: ObligationRow[]
  /** the book is drafted past the window's close and it is still unmet */
  overdue: ObligationRow[]
  questions: ImpactQuestion[]
}

export interface ImpactQuestion { about: string; question: string; register: 'asked' }

/** The deterministic blast radius of one id — registers 'proven' (every
 *  list but questions) and 'asked' (questions), never blurred. */
export interface ImpactReport {
  id: string
  events: { id: string; via: string }[]
  states: { entity: string; at: string; via: string }[]
  relationships: string[]
  chapters: { id: string; via: string }[]
  parts: string[]
  scenes: string[]
  downstream: { id: string; depth: number }[]
  downstreamTruncated: boolean
  questions: ImpactQuestion[]
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

  /** What the story still owes. Material and scene bindings are arguments,
   *  not canon — material lives beside canon, never in it (conventions §12). */
  obligations(material: MaterialLike[], scenes: SceneBinding[] = []): Obligations {
    const order = new Map((this.canon.chapters ?? []).map(c => [c.id, c.order ?? 0]))
    // A scene binding exists only when the prose file does, so "has a binding"
    // is the obligation analogue of an event's on_page.
    const sceneById = new Map(scenes.map(s => [s.scene, s]))
    const lastDrafted = scenes.reduce((max, s) => {
      const o = s.chapter ? order.get(s.chapter) : undefined
      return o !== undefined && o > max ? o : max
    }, -1)

    const out: Obligations = { unowned: [], unwritten: [], overdue: [], questions: [] }
    for (const m of material) {
      if (m.type !== 'obligation') continue
      if (m.status === 'absorbed' || m.status === 'dropped') continue

      const claimed = [
        ...(m.satisfied_by ?? []),
        ...scenes.filter(s => (s.satisfies ?? []).includes(m.id)).map(s => s.scene),
      ]
      const satisfiers = [...new Set(claimed)].sort()
      const row: ObligationRow = { id: m.id, body: (m.body ?? '').trim(), satisfiers, window: m.window }

      // Only prose discharges an obligation. Canon or material naming it is
      // an intention — the reader has still met nothing.
      const onPage = satisfiers.filter(s => sceneById.has(s))

      if (!satisfiers.length) { out.unowned.push(row); continue }
      if (!onPage.length) { out.unwritten.push(row); continue }

      // Written — but did it land in time, and does it actually discharge?
      const close = m.window?.to ? order.get(m.window.to) : undefined
      const earliest = Math.min(...onPage.map(s => {
        const ch = sceneById.get(s)?.chapter
        const o = ch ? order.get(ch) : undefined
        return o ?? Number.POSITIVE_INFINITY
      }))
      if (close !== undefined && earliest > close) out.overdue.push(row)

      for (const s of onPage) {
        out.questions.push({
          about: m.id,
          question: `${s} claims to discharge "${row.body.slice(0, 60)}${row.body.length > 60 ? '…' : ''}" — does it, on the page?`,
          register: 'asked',
        })
      }
    }
    // An obligation whose window has closed while the book was drafted past it
    // is overdue even with nothing claiming it.
    for (const row of out.unowned.concat(out.unwritten)) {
      const close = row.window?.to ? order.get(row.window.to) : undefined
      if (close !== undefined && lastDrafted >= close) out.overdue.push(row)
    }
    const byId = (a: ObligationRow, b: ObligationRow) => a.id.localeCompare(b.id)
    out.unowned.sort(byId); out.unwritten.sort(byId); out.overdue.sort(byId)
    out.questions.sort((a, b) => a.about.localeCompare(b.about) || a.question.localeCompare(b.question))
    return out
  }

  /** Where each theme actually is: what canon carries it, and which scenes
   *  carry it on the page. Two deterministic classes, the same shape as the
   *  payoff and obligation reports pointed at what the book is ABOUT —
   *  UNCARRIED (declared, nothing embodies it: a wish) and UNWRITTEN
   *  (carried in canon, but no scene has dramatised it yet).
   *
   *  Scene contracts name motifs in the author's own words, so matching runs
   *  prose → theme, case-insensitively. Nobody types an id into a contract. */
  themes(scenes: SceneBinding[] = []): {
    themes: { id: string; name: string; carriers: string[]; scenes: string[] }[]
    uncarried: string[]
    unwritten: string[]
  } {
    const norm = (s: string) => s.trim().toLowerCase()
    const declared = this.canon.themes ?? []
    const rows = declared.map(th => {
      const words = new Set((th.motifs ?? []).map(norm))
      // a theme's own name is a motif by default — the author should not have
      // to repeat it to be found
      if (th.name) words.add(norm(th.name))
      const hits = scenes
        .filter(sc => (sc.motifs ?? []).some(m => words.has(norm(m))))
        .map(sc => sc.scene)
        .sort()
      return {
        id: th.id,
        name: th.name ?? th.id,
        carriers: [...(th.carriers ?? [])].sort(),
        scenes: [...new Set(hits)],
      }
    }).sort((a, b) => a.id.localeCompare(b.id))

    return {
      themes: rows,
      uncarried: rows.filter(r => !r.carriers.length).map(r => r.id),
      unwritten: rows.filter(r => r.carriers.length && !r.scenes.length).map(r => r.id),
    }
  }

  /** A character's world as of T: what they have seen, where they have
   *  been, whom they have met — and the irony list, the events that have
   *  happened by T outside their view (what the reader may know that they
   *  don't). Event-level; fact-level knowledge is the knowledge lint's job. */
  povView(charId: string, tEnd: number): {
    seen: string[]; places: string[]; met: string[]; unseen: string[]
  } {
    const seen: string[] = []
    const unseen: string[] = []
    const places = new Set<string>()
    const met = new Set<string>()
    for (const e of Object.values(this.canon.events ?? {})) {
      if (timeRefKey(e.when, this.eras) > tEnd) continue
      const present = (e.participants ?? []).some(p => p.entity === charId) || (e.witnesses ?? []).includes(charId)
      if (!present) { unseen.push(e.id); continue }
      seen.push(e.id)
      if (e.where) places.add(e.where)
      for (const p of e.participants ?? []) if (p.entity !== charId) met.add(p.entity)
      for (const w of e.witnesses ?? []) if (w !== charId) met.add(w)
    }
    return { seen: seen.sort(), places: [...places].sort(), met: [...met].sort(), unseen: unseen.sort() }
  }

  /** The deterministic blast radius: everything that depends on one id,
   *  grouped by how it depends — plus, in the 'asked' register, the payoff
   *  questions the dependency structure surfaces but never answers.
   *  Registers 'proven' and 'asked' only; the model-read tier is elsewhere. */
  impacts(id: string, scenes: SceneBinding[] = [], maxDepth = 5, maxNodes = 50): ImpactReport {
    const ents = this.canon.entities ?? {}
    const evs = Object.values(this.canon.events ?? {})
    const label = (at: TimeRef) => at.date ?? at.era

    const events: { id: string; via: string }[] = []
    for (const e of evs) {
      if ((e.causes ?? []).includes(id)) events.push({ id: e.id, via: 'caused by it' })
      if ((e.leads_to ?? []).includes(id)) events.push({ id: e.id, via: 'plants it' })
      if ((e.participants ?? []).some(p => p.entity === id)) events.push({ id: e.id, via: 'participant' })
      if ((e.witnesses ?? []).includes(id)) events.push({ id: e.id, via: 'witness' })
      if (e.where === id) events.push({ id: e.id, via: 'location' })
    }

    const states: { entity: string; at: string; via: string }[] = []
    for (const ent of Object.values(ents)) {
      for (const st of (ent.states ?? []) as AnyState[]) {
        const cite = (via: string) => states.push({ entity: ent.id, at: label(st.at), via })
        if (((st.caused_by as string[] | undefined) ?? []).includes(id)) cite('caused_by')
        if (st.location === id) cite('location')
        if (((st.possessions as string[] | undefined) ?? []).includes(id)) cite('possession')
        if (st.controlled_by === id) cite('controlled_by')
        if (((st.relationships as { toward: string }[] | undefined) ?? []).some(r => r.toward === id)) cite('perception')
      }
    }

    const relationships = (this.canon.relationships ?? [])
      .filter(r => r.from === id || r.to === id).map(r => r.id).sort()

    const chapters: { id: string; via: string }[] = []
    for (const ch of this.canon.chapters ?? []) {
      if (ch.pov === id) chapters.push({ id: ch.id, via: 'pov' })
      if ((ch.events ?? []).includes(id)) chapters.push({ id: ch.id, via: 'covers' })
      if ((ch.locations ?? []).includes(id)) chapters.push({ id: ch.id, via: 'set in' })
    }

    const parts = Object.values(ents).filter(e => e.part_of === id).map(e => e.id).sort()

    const sceneIds = scenes
      .filter(s => (s.facts ?? []).includes(id) || (s.events ?? []).includes(id))
      .map(s => s.scene).sort()

    // Transitive: forward along causality from the id (if it is an event) or
    // from the events that directly cite it, depth- and size-capped with the
    // cap reported — no silent truncation.
    const isEvent = !!this.canon.events?.[id]
    const childrenOf = (evId: string): string[] => {
      const e = this.canon.events[evId]
      if (!e) return []
      const kids = [...(e.leads_to ?? [])]
      for (const other of evs) if ((other.causes ?? []).includes(evId)) kids.push(other.id)
      return kids
    }
    const seeds = isEvent ? [id] : events.map(e => e.id)
    const seen = new Map<string, number>()
    let frontier = [...new Set(seeds)]
    let truncated = false
    for (let d = 1; d <= maxDepth && frontier.length; d++) {
      const next: string[] = []
      for (const cur of frontier) for (const kid of childrenOf(cur)) {
        if (kid === id || seen.has(kid) || seeds.includes(kid)) continue
        if (seen.size >= maxNodes) { truncated = true; break }
        seen.set(kid, d)
        next.push(kid)
      }
      frontier = next
    }
    const downstream = [...seen.entries()].map(([eid, depth]) => ({ id: eid, depth }))
      .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))

    // Register 'asked': the payoff questions the structure surfaces.
    const questions: ImpactQuestion[] = []
    const ask = (about: string, question: string) => questions.push({ about, question, register: 'asked' })
    if (isEvent) {
      const e = this.canon.events[id]
      for (const t of e.leads_to ?? []) ask(t, `${id} plants ${t} — does that payoff still stand if this changes?`)
      for (const p of events.filter(x => x.via === 'plants it')) ask(p.id, `${p.id} plants ${id} — does its setup still make sense if this changes?`)
    } else {
      for (const cite of events) {
        const e = this.canon.events[cite.id]
        for (const t of e?.leads_to ?? []) ask(t, `${cite.id} (which rests on ${id}) leads to ${t} — does that payoff survive a change here?`)
      }
    }

    return { id, events, states, relationships, chapters, parts, scenes: sceneIds, downstream, downstreamTruncated: truncated, questions }
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
