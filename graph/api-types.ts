// The wire format of arc-backend's HTTP API — the single source of truth
// for the types both arc-backend and arc-frontend previously declared by
// hand. Types only: zero runtime code, so `import type` erases this file
// entirely and the package's no-build posture is untouched.
//
// Reached through the package main (`export type * from './api-types.ts'`
// in canon-graph.ts). If that re-export ever misbehaves under a future
// strip-types change, consumers can import this file's subpath directly —
// 'arc-canon-graph/api-types.ts' resolves by plain file path precisely
// because the package has no exports map.
//
// Canon types are deliberately NOT here: the backend serves the canon
// export as a string passthrough and holds no canon types, the graph keeps
// its loose *Like types, and the frontend keeps its richer ones — that
// split is documented in canon-graph.ts and preserved.

// ---- prose and docs ------------------------------------------------------

export interface DocArticle { path: string; canon: string | null; body: string }

/** The scene's stated intent (conventions §10) — what it must accomplish. */
export interface SceneContract {
  purpose?: string; reader_before?: string; reader_after?: string
  wants?: Record<string, string>
  must_establish?: string[]; must_withhold?: string[]; motifs?: string[]
  constraints?: string
  /** Narrative obligations this scene discharges (conventions §12). */
  satisfies?: string[]
}

export interface ProseScene {
  scene: string; chapter: string; status: string
  pov: string | null; events: string[]; facts: string[]
  contract: SceneContract | null
  /** The window the scene covers (conventions §10), when its frontmatter
   *  says. The handoff diffs the record over it (A69-5). */
  span?: { start?: string; end?: string }
  file: string; body: string
}

/** One prose file that differs from HEAD (main = HEAD, draft = working tree). */
export interface ProseChange {
  file: string
  status: 'added' | 'modified' | 'deleted'
  main: ProseScene | null
  /** Which pass wrote the pending text — 'draft', 'revise', 'redraft',
   *  'reroute' — read from the generation ledger. Absent when the author
   *  typed it, or when what arc wrote has already been accepted. */
  origin?: string
  /** The note ids the pending text was written to answer. Provenance from
   *  the ledger, never a model's reading: a note is listed here because the
   *  pass was handed it, not because anyone judged it answered. */
  answers?: string[]
  /** The run that wrote it, from the ledger — the address of its receipt
   *  (A69-11). It is also what tells a governed draft from one an unrowed
   *  pass left here: a change with an origin and no run predates the row. */
  run?: string
}

export interface ProseDraft {
  git: boolean
  changes: ProseChange[]
  history: { hash: string; date: string; subject: string }[]
}

/** The re-entry briefing (/api/briefing): where the author left off, what is
 *  in flight, what is due — assembled from the record, never generated.
 *  Every field is proven: a paragraph read back from a commit, a count over
 *  a store, an obligation whose window the chapter order places. */
export interface BriefingResponse {
  /** false when the story is not a git repository: no accept history exists */
  git: boolean
  /** WHERE YOU LEFT OFF — the scene the last accept touched (latest in
   *  reading order when one accept took several), its final paragraph
   *  verbatim as committed, and when. null until a scene has been accepted. */
  lastAccepted: {
    scene: string; chapter: string; file: string
    paragraph: string
    /** the accept commit's author date, ISO 8601 */
    acceptedAt: string
    hash: string
  } | null
  /** WHAT'S IN FLIGHT — the draft layer, open notes, routes waiting, and
   *  material still unplaced. Counts are the arrays' lengths. */
  draft: { file: string; scene: string | null; status: 'added' | 'modified' | 'deleted' }[]
  notes: { id: string; scene: string; body: string }[]
  /** routes waiting per scene — chain heads, the same count the cap uses */
  routes: Record<string, number>
  unplaced: number
  /** WHAT'S DUE — unmet obligations whose window touches the chapter of the
   *  last accepted scene. Empty when nothing has been accepted yet; null
   *  when the canon could not be read, because an unknown count is not zero. */
  due: { id: string; body: string; klass: 'unowned' | 'unwritten' | 'overdue'; window: { from?: string; to?: string } }[] | null
  /** the last session's prose commits, newest first — a session being a run
   *  of accepts closer together than SESSION_GAP_HOURS */
  lastSession: { hash: string; date: string; subject: string }[]
  /** runs that DID NOT FINISH — found on disk with no ending, as a backend
   *  killed mid-run leaves them (A67-3); each deletable by id */
  unfinished: { id: string; prompt: string; started_at: string }[]
}

// ---- request/response envelopes -----------------------------------------

export interface DocsResponse { articles: DocArticle[] }
export interface ProseResponse { scenes: ProseScene[] }
/** `files` names the scenes this accept ratifies, and is REQUIRED (A72-1):
 *  the decision lives at the scene it is about (A64-3), and there is no
 *  accept-everything — a request that named no file used to take the whole
 *  prose directory, a decision no author ever read. Each entry is a plain
 *  `prose/…/scene.md` path with a pending change. */
export interface ProseAcceptRequest { message?: string; capture?: boolean; files: string[] }
export interface ProseAcceptResponse {
  hash: string
  files: string[]
  /** Notes the accepted change was written to answer, closed by this accept
   *  (A63-4). From the ledger — the pass was handed them — never a judgement
   *  that they were met. */
  notesResolved?: string[]
  capture?: ChatResponse
  /** How many style rules the learning pass argued for at this accept, when
   *  it argued for any. The rules themselves live in the queue, not here. */
  proposed?: number
}
export interface ProseDiscardRequest { file: string }
/** Judging one paragraph of a changed scene.
 *
 *  Named by IDENTITY like a sentence, and for the same reason: `side` says
 *  which version the paragraph belongs to (`main` is the before text, so a
 *  deletion; `draft` the after text, so a rewrite or an insertion) and
 *  `paragraph` indexes that side's own list. The server re-derives the
 *  alignment by the shared rule and performs the merge itself.
 *
 *  A bare index used to be the whole request, read off the draft and applied
 *  to main. That is only safe while both versions hold the same paragraphs in
 *  the same order, which a draft that inserts one does not. */
export interface ProseParagraphRequest {
  file: string
  side: 'main' | 'draft'
  paragraph: number
  /** Accept only: the commit subject. */
  message?: string
}
/** Judging one sentence of a changed paragraph (A37-3).
 *
 *  The sentence is named by IDENTITY, never by text — `side` says which
 *  version it belongs to (`main` is the before text, `draft` the after) and
 *  `sentence` indexes that side's own splitSentences() list. The server
 *  re-derives the sentence by the shared rule and performs the merge itself,
 *  because an endpoint that accepts prose from a browser is an endpoint that
 *  can write anything into the author's book. */
export interface ProseSentenceRequest {
  file: string
  paragraph: number
  side: 'main' | 'draft'
  sentence: number
  /** Accept only: the commit subject. */
  message?: string
}
/** The drafting pass (/api/prose/draft-scene): generation into the working
 *  tree. The result is an ordinary draft — reviewed, accepted, or discarded
 *  through the existing draft layer; arc never ratifies its own prose. */
/** One craft move, as arc's vocabulary and the author's sentence (A69-4). */
export interface CraftMovePlanned { move: string; how: string }
export interface CraftPlanned { moves: CraftMovePlanned[] }

export interface DraftSceneRequest {
  chapter: string
  guidance?: string
  /** THE SECOND CALL. Absent means the author has not been shown a plan yet:
   *  a line said now returns one and writes nothing. A plan means they
   *  settled it — as given, or edited. `null` means they withdrew the line
   *  and want the draft without it (A69-4). */
  plan?: CraftPlanned | null
}
/** The redraft pass (/api/prose/redraft): a REBUILD of existing prose, told
 *  apart from revise (minimal, annotation-driven) and rephrase (a selection,
 *  writes nothing). A whole scene, or an inclusive paragraph range whose
 *  surroundings are preserved byte-for-byte by construction. The result is
 *  an ordinary draft, reviewed through the existing gate. */
export interface RedraftRequest {
  scene: string
  paragraphs?: [number, number]
  guidance?: string
  /** THE SECOND CALL, as the draft's (A69-4, A69-8). Absent means the author
   *  has not been shown a plan: a line said now returns one and writes
   *  nothing. A plan means they settled it; `null` means they withdrew the
   *  line and want the pass without it. */
  plan?: CraftPlanned | null
}

/** "Work through my notes on this scene" (/api/prose/work-notes): the
 *  scene's open notes are the brief, no ceremony. `revise` is the minimal
 *  revision with the notes as instructions; `redraft` is the clean pass with
 *  the notes answered where the rebuild allows. A scene with no open notes
 *  is refused (409) rather than run on nothing. */
export type WorkNotesMode = 'revise' | 'redraft'
export interface WorkNotesRequest { scene: string; mode?: WorkNotesMode; guidance?: string }
export interface WorkNotesResponse {
  scene: string
  mode: WorkNotesMode
  /** The note ids handed to the pass, in rail order. */
  notes: string[]
  file: string | null
  /** false when nothing was written: a conflict between notes, a refusal,
   *  or a pass that changed nothing. */
  changed: boolean
  /** Notes that pull against each other, surfaced BEFORE anything is
   *  written (revise mode); the author decides which wins. */
  conflicts: NoteConflict[]
  /** One short paragraph in the author's language: what happened, where to
   *  look. Never the prose. */
  reply: string
  /** The run that carries the receipt, when one was opened. */
  run: string | null
}
export interface DraftSceneResponse {
  reply: string
  actions: ChatAction[]
  file: string | null
  /** the run that produced it — its receipt is `.arc/runs/<run>/receipt.yaml`
   *  and, at the author's decision, `history/<run>.yaml` (A69-3). The receipt
   *  ITSELF is not on this response yet: the fold that reads one under a
   *  draft is A69-11's, and a field no code fills is a promise the type makes
   *  and the backend does not keep. */
  run?: string
  /** THE CRAFT THE LINE BECAME (A69-4). Present on the first call's answer,
   *  where there is no prose yet and the author reads one line — *Writing
   *  toward: …* — before a token is spent; present again on the draft that
   *  was written from it, so the fold can show what the pass was given. */
  plan?: CraftPlanned
}

/** The reroute pass (/api/prose/reroute): another way to the same destination.
 *  The scene contract and the author's key points are the destination; the
 *  current prose is withheld from the prompt and only its known route — the
 *  order of author-marked beats, what it opens and closes on, its locks — is
 *  fenced. Alternatives land beside the manuscript, never in it: adopt is the
 *  lock-gated scene write, and only then does the ledger learn of the route. */
/** `dry` runs the slice and the brief and never spawns: the response carries
 *  the rendered briefs, one per seed, and no route (A67-2). */
/** ASK AGAIN (A69-13): re-issue one route's job — the same notes by id, the
 *  same line, the same seed — against the record and the row as they stand
 *  now. The answer REPLACES the route named here, so the scene's count is
 *  unchanged; *another way through* stays the only gesture that adds one. */
export interface AskAgainRequest { scene: string; alt: string; depth?: string }

export interface RerouteRequest {
  scene: string
  count?: number
  guidance?: string
  dry?: boolean
  /** a depth word the author used — *quickly*, *thoroughly*. A word the
   *  rows do not carry is refused, never mapped to standard (A67-8). */
  depth?: string
}
/** Rewrite one alternative under the author's note; the result is a new
 *  version of the same route (`revises` names the parent). */
export interface ReviseRouteRequest { scene: string; alt: string; note?: string; depth?: string }
export interface AddRouteNoteRequest { scene: string; alt: string; body: string; paragraph?: number | null }
export interface DeleteRouteNoteRequest { scene: string; alt: string; note: string }
/** One required beat and where the pass claims it lands — argued, from the
 *  answer's own tail; `paragraph` is 1-based, null when the pass did not say. */
export interface RouteCoverage { item: string; paragraph: number | null }
/** A claim the pass made whose evidence did not resolve against the
 *  destination it was given, counted by reason (A67-8; §4, "Evidence
 *  resolution"). Shown where the route is, so the author can tell a route
 *  that reached its beats from one that talked about others. */
export interface DroppedClaim {
  reason: 'unresolvable' | 'outside the slice' | 'unparseable'
  count: number
}
export interface RouteAlternative {
  /** The run's receipt, as the author reads it (A67-11) — absent for a route
   *  written by an older arc, which has no run and therefore no receipt. */
  receipt?: RouteReceipt | null

  id: string
  scene: string
  seed: string
  guidance?: string
  /** sha256 prefix of the scene body this route diverged from */
  based_on: string
  created_at: string
  body: string
  /** the argued briefing, coverage tail removed */
  briefing: string
  /** the run that produced it — its receipt is `.arc/runs/<run>/receipt.yaml`
   *  while the route waits, and `history/<run>.yaml` once the author adopts
   *  it (A67-4). Absent on a route written by an older arc. */
  run?: string
  /** ASKED AGAIN (A69-13): this route replaced one the author asked again
   *  for, rather than joining the ones already on the scene. Kept on the
   *  route itself because the fold must still say so after the run's
   *  working receipt has been cleaned up. */
  reissued?: boolean
  /** the fingerprints of everything the pass read to write it (invariant 1;
   *  A67-10). Compared at the write path: a changed fingerprint makes the
   *  route stale. Absent on a route written by an older arc. */
  reads?: { id: string; version: string }[]
  /** filled by the backend when the route is listed, never stored: what has
   *  changed under it since it was written, and whether it can still be
   *  read as a governed route at all. */
  stale?: {
    /** the ids whose fingerprints moved — empty when the route is stale
     *  only because it predates the governed path */
    changed: string[]
    /** how to say it: a route written by an older arc is not the same thing
     *  as one whose scene moved */
    why: 'the record moved' | 'written by an older arc'
  }
  /** null when the answer carried no readable tail — shown as "not reported" */
  coverage: RouteCoverage[] | null
  /** claims that named a beat the destination did not hold, by reason —
   *  dropped rather than shown beside the required ones (A67-8) */
  dropped?: DroppedClaim[]
  /** share of counted paragraphs with a ≥60%-survival counterpart in the
   *  current scene; null when too few paragraphs were countable to judge */
  overlap: number | null
  /** present when the first answer was refused and this is the retry — the
   *  refusal, verbatim, so the author can see what the gate caught */
  retried?: string
  /** the alternative this one rewrites — versions of a route form a chain;
   *  absent on a first-generation route */
  revises?: string
  /** the author's reactions to this route. Proposal-side, like the route
   *  itself: they live with it and go when it goes. */
  notes?: RouteNote[]
}

/** A reaction to a route, anchored to one of its paragraphs or to the whole
 *  of it. No drift resolution: a route's body never changes in place — a
 *  rewrite writes a new version — so the index stays true. */
export interface RouteNote {
  id: string
  /** 1-based paragraph of the route, or null for the route as a whole */
  paragraph: number | null
  body: string
  created_at: string
}
/** One gate, as the author reads it: what it measured and against what bar.
 *  Proven, always — a gate is code, and nothing here is a model's reading. */
export interface RouteGateReading {
  /** arc's id for the gate — for a key, never for a label */
  gate: string
  /** what it checks, in the author's words: a gate id is arc's vocabulary and
   *  does not belong on a page beside the prose */
  says: string
  verdict: 'held' | 'refused' | 'could not judge' | 'not applicable'
  bar?: number | string | null
  measured?: number | string | null
  attempt: number
}

/** THE RECEIPT, AS THE AUTHOR READS IT (A67-11). The working receipt holds
 *  fingerprints, session ids, transcript paths and a git revision; none of
 *  that belongs on a page beside the prose, so this is a projection of it and
 *  not the thing itself. What survives the projection: what the pass was
 *  given, the three separate readings of what it was not, the gates, how it
 *  ended, and the request in the author's own words.
 *
 *  The three readings are kept apart on purpose: "arc chose not to show it"
 *  and "arc ran out of room" are different facts about the same absence, and
 *  a page that merges them tells the author neither. */
/** WHAT ARC RECORDED ABOUT ITS OWN RUN, in the shape the author reads. Named
 *  for the route reader that first showed one (A67-11); since A69-11 it is
 *  the receipt EVERY run shows, under the one fold that renders it, so a
 *  draft and a route cannot describe the same facts two different ways.
 *
 *  Everything here is PROVEN: arc writes every field from the slice manifest,
 *  the gate records and the envelope. No model writes its own receipt. */
export interface RouteReceipt {
  /** the run that made the route */
  run: string
  /** the gesture the author made, and the cell it resolved to */
  request?: { gesture: string; cell: string; subject?: string }
  /** the layers the brief carried, by id — never a line of its text */
  given: string[]
  /** withheld BY DESIGN: the row does not show this pass these things */
  withheld_by_design: string[]
  /** dropped for room, in the row's drop order */
  dropped_for_budget: string[]
  /** what the runtime added on its own, observed rather than declared */
  runtime_added: string[]
  gates: RouteGateReading[]
  /** how the run ended, from the closed set */
  ending?: RunEnding
  /** one sentence for a run that did not land, rendered by code from the
   *  gate record and ending in the keystroke that comes next; null when it
   *  landed. Never phrased by a model. */
  outcome: string | null
  /** the engine and model as THEY reported, never as arc assumed */
  engine?: { engine: string; model: string | null; runtime: string | null }
  wall_clock_ms?: number
  started_at: string
  decided_at: string

  // ---- what a writing run adds (A69-11) ----------------------------------

  /** THE LINE THE AUTHOR SAID AND THE CRAFT IT BECAME (A69-4). `said` is
   *  their words; `plan` is what the writing pass was given instead of them. */
  intent?: {
    said: string | null
    plan: { moves: { move: string; how: string }[] } | null
    /** they read a plan and drafted without it */
    withdrawn?: boolean
    /** why no reading ran, when none did */
    note?: string
  } | null
  /** EVERY LAYER OF THE BRIEF, with the status the author reads. The three
   *  lists above are the summary; this is the reading, and it is the reason
   *  `not shown` can never be mistaken for `none` (A69-2). */
  layers?: {
    layer: string
    status: 'given' | 'not shown' | 'deferred' | 'none'
    ids: string[]
    /** why, when it is not `given` */
    because?: string
    note?: string
    leaned_on?: { id: string; as_of: string; older_by_days: number }[]
    /** the rung each sibling scene reached the pass on (A69-7) */
    rungs?: { scene: string; rung: string }[]
  }[]
  /** every state fact the brief carried past the row's freshness distance,
   *  with how far past (A69-6) — proven from the manifest, never argued */
  leaned_on?: { id: string; as_of: string; older_by_days: number }[]
  /** the notes the pass was handed, each with who wrote it (A69-9) */
  notes_handed?: { id: string; by: 'author' | 'agent' }[]
  /** THE RECEIPT THIS RUN RE-ISSUED (A69-13). Present when the author asked
   *  again for a route: the same job, against the record as it stood at the
   *  asking. A route written by an older arc left no receipt to name, so a
   *  re-issue of one carries the flag and not the id. */
  reissued_from?: string
  /** true when this run was an *ask again*, whether or not the route it
   *  replaced had a receipt to name */
  reissued?: boolean
  /** TRUE WHEN ARC HAS CHANGED SINCE (Q14, the author's decision): the job's
   *  fingerprint moved after this run, so what arc would write now is not
   *  what it wrote then. A LABEL, never a staleness that hides the work. */
  older_arc?: boolean
}

/** One run's receipt, by id (/api/runs/:id/receipt). 404 when arc kept
 *  none — a run from before arc kept receipts, or one whose kept files have
 *  been cleared. */
export interface RunReceiptResponse { receipt: RouteReceipt }

export interface RerouteRefusal {
  seed: string
  /** why, as the gate runner reported it — arc's words, kept for the fold */
  reason: string
  /** the same thing in one sentence rendered by code, ending in the next
   *  keystroke: what the author reads (A67-11, criterion 4). */
  outcome?: string
  /** the run it was, so its receipt can be read and it can be stopped */
  run?: string
}
export interface RerouteResponse {
  alternatives: RouteAlternative[]
  refused: RerouteRefusal[]
  /** the run this request was — stoppable at /api/runs/:id/stop while it works (A67-3) */
  run?: string
  /** the rendered briefs, on a dry run only */
  briefs?: string[]
}
/** A lock that will constrain a reroute of this scene: verbatim and in order
 *  for a paragraph lock; a whole-scene or chapter lock refuses the run. */
export interface RouteLockNotice { id: string; scope: 'paragraph' | 'scene' | 'chapter'; paragraph: number | null }
export interface RouteListResponse { scene: string; alternatives: RouteAlternative[]; locks: RouteLockNotice[] }
/** Per scene: how many routes still wait on the author, and how many of
 *  the four places are taken. A stale route waits but holds no place
 *  (A67-10), so the two differ and the viewer needs both. */
export interface RouteCountsResponse { counts: Record<string, { waiting: number; governed: number }> }
export interface AdoptRouteRequest { scene: string; alt: string }
export interface AdoptRouteResponse { scene: ProseScene; file: string }
export interface DropRouteRequest { scene: string; alt: string }

/** The analysis pass (/api/prose/analyze): the loop's detect step, run
 *  BEFORE the author accepts. Read-only — it proposes nothing and writes
 *  nothing. Its briefing is wholly `argued` (conventions §11): claims with
 *  citations, for a human to judge, never presented as proven. */
/** The mechanical prose checks (/api/prose/checks): the PROVEN channel over
 *  the manuscript. No engine, no tokens, no judgment — decidable by reading
 *  the characters, same answer every run. A finding inside locked prose
 *  carries the lock's id and nothing anywhere offers a repair: settled
 *  prose stays settled even against a typo — report it, never repair it. */
export interface ProseCheckHit {
  scene: string
  file: string
  check: string
  paragraph: number
  excerpt: string
  register: 'proven'
  /** the lock covering this paragraph, when one does */
  lock?: string
}
export interface ProseChecksResponse { findings: ProseCheckHit[] }

/** `files` scopes the reading to particular scenes, so it can stand beside
 *  the decision it informs (A64-4). Absent, the whole pending draft is read. */
export interface AnalyzeRequest { files?: string[] }
export interface AnalyzeResponse {
  briefing: string
  register: Extract<Register, 'argued'>
  engine: 'sdk' | 'claude-cli' | 'fixture'
  files: string[]
}
/** Selection suggestions (/api/prose/suggest): rephrase against the style
 *  contract, or synonyms with nuance notes. Read-only — a suggestion is in
 *  the `argued` register and is never applied by the machine; the author
 *  clicks one or none. */
export interface SuggestRequest {
  kind: 'rephrase' | 'synonyms'
  selection: string
  /** The paragraph the selection sits in — the sentence's surroundings. */
  paragraph?: string
  /** The scene file, for POV/tense context in the prompt. */
  file?: string
}
export interface SuggestResponse {
  /** The wordings that SURVIVED their gates, in the order the pass offered
   *  them. A rephrase's options are measured one by one against the two
   *  countable rules the author ratified, and one that breaks a rule is
   *  dropped before the author sees it — how many went is on the receipt
   *  (A69-10). */
  suggestions: string[]
  register: Extract<Register, 'argued'>
  engine: 'sdk' | 'claude-cli' | 'fixture'
  /** the run that offered them — its receipt is
   *  `.arc/runs/<run>/receipt.yaml` (A69-10). The receipt ITSELF is not on
   *  this response: the fold that reads one is A69-11's, and a field no code
   *  fills is a promise the type makes and the backend does not keep. */
  run?: string
}

/** The style contract (/api/style, conventions §10): the author's voice in
 *  two layers. `proposed` is the queue of machine-proposed rules awaiting
 *  ratification — never binding on drafting, and never loaded into any
 *  prompt that writes prose. */
export interface StyleLayerPayload { source: 'author' | 'story'; path: string; body: string }

/** What arc drafted against what the author kept, for one paragraph. The
 *  backend materializes both strings from its own diff table — a proposal
 *  can never carry a quote the model wrote. */
export interface RuleEvidence { scene: string; wrote: string; kept: string }

/** A rule arc has ARGUED for (conventions §11) and the author has not
 *  ratified. Nothing here binds until the author says so.
 *
 *  `source` says what the evidence diffs: 'draft' — arc's draft against what
 *  the author kept (A7-6); 'revision' — the author's own accepted prose
 *  against their hand rewrite of it, the purest voice signal there is;
 *  'refusal' — prose arc offered and the author declined, which is the only
 *  decision git never records; 'history' — successive accepted states of the
 *  manuscript, where the author ratified the movement but either side may
 *  have been machine-drafted on their behalf. The weakest kind, and labelled
 *  so nobody reads it as a hand edit.
 *  Absent means draft: queues written before the field existed stay valid.
 *
 *  `layer` is arc's RECOMMENDATION of where the rule belongs, shown on the
 *  card. It decides nothing: the author's click chooses the file, because
 *  letting a model-chosen field pick which contract gets written would be the
 *  promotion decision, and that is theirs. Absent means no recommendation. */
export interface ProposedRule {
  id: string
  rule: string
  section: string | null
  at: string
  evidence: RuleEvidence[]
  source?: 'draft' | 'revision' | 'refusal' | 'history'
  layer?: 'story' | 'author'
}

/** A touchstone arc has argued for — a calibration passage, not a rule.
 *
 *  Its own type, deliberately not a `kind` on ProposedRule: RuleEvidence
 *  requires `wrote` and `kept`, and a touchstone has one passage and no
 *  before/after. Overloading the rule shape would mean the queue's tolerant
 *  parser silently dropped touchstones on the next read.
 *
 *  The passage is materialized from the scene file by the backend, never
 *  written by a model — the same trust property rules have. */
export interface ProposedTouchstone {
  id: string
  /** The quality it calibrates, e.g. "Slow time (sea, smell-first opening)". */
  quality: string
  scene: string
  /** The prose file, e.g. prose/ch-00/scene-01.md — the "from" in the label. */
  file: string
  paragraph: number
  passage: string
  at: string
}

/** A ratified touchstone's standing against the manuscript as it is NOW.
 *
 *  A touchstone binds harder than a rule — models imitate cadence from
 *  examples more reliably than they follow imperatives — so one that no
 *  longer matches the book teaches a superseded voice. The anchor machinery
 *  locks already use answers whether it still holds, so staleness is a
 *  computed state rather than a note a human has to remember to write. */
export interface TouchstoneState {
  quality: string
  scene: string
  state: 'resolved' | 'drifted' | 'orphaned' | 'no-scene'
  note?: string
}

export interface StyleResponse {
  author: StyleLayerPayload | null
  story: StyleLayerPayload | null
  proposed: ProposedRule[]
  proposedTouchstones: ProposedTouchstone[]
  /** Ratified touchstones with machine anchors, resolved against the prose. */
  touchstones: TouchstoneState[]
}

/** Locks (settled prose): anchored refusals, resolved like annotations.
 *  The write path enforces them; the wire only reports and edits them. */
export interface LocksResponse { locks: import('./annotations.ts').ResolvedLock[] }
/** One of three shapes (A40-1): a paragraph with its quote, a scene alone
 *  (a section lock), or a chapter alone. A blend is refused. */
export interface CreateLockRequest { scene?: string; chapter?: string; paragraph?: number; quote?: string }
export interface DeleteLockRequest { id: string }

/** Ratify a proposed rule into a layer, or dismiss it. Deterministic on the
 *  server — no model runs in this path. */
export interface RatifyRuleRequest {
  id: string
  action: 'ratify' | 'dismiss'
  layer?: 'author' | 'story'
  /** Absent means rule. Touchstones only ever ratify into the story layer —
   *  they are calibration passages from THIS manuscript. */
  kind?: 'rule' | 'touchstone'
}
export interface RatifyRuleResponse {
  ok: true
  action: 'ratify' | 'dismiss'
  /** The layer file the rule was appended to, or null for a dismissal. */
  path: string | null
  /** How many proposals are left in the queue. */
  remaining: number
  /** Whether the change was also committed. False for a story without git —
   *  the file change stands either way; only the visible history is lost. */
  committed: boolean
}

/** Annotations (conventions §14) with their anchors resolved against the
 *  prose as it stands — resolved, drifted, or honestly orphaned. */
export interface AnnotationsResponse { annotations: import('./annotations.ts').ResolvedAnnotation[] }
/** `paragraph` and `quote` are optional together: their ABSENCE is the
 *  meaning, a note about the whole scene rather than a passage (conventions
 *  §14). Coercing a missing paragraph to a number would anchor the note to a
 *  paragraph that does not exist. */
export interface CreateAnnotationRequest {
  scene: string; paragraph?: number; quote?: string; body: string
  kind?: 'note' | 'keypoint'; by?: 'author' | 'agent'
}
/** Hard delete — keypoints only. Notes are thoughts, and thoughts are
 *  resolved or dropped, never erased. */
export interface DeleteAnnotationRequest { id: string }
/** A patch: `id` names the annotation, everything else is what changes. */
export interface UpdateAnnotationRequest {
  id: string
  status?: import('./annotations.ts').AnnotationStatus
  body?: string
}

export interface OkResponse { ok: true }
export interface ApiErrorResponse { error: string }
export interface HealthResponse {
  ok: boolean
  validator: string
  /** Which generation engine is live, or null when none is configured. The
   *  viewer needs this to explain an unavailable box rather than let the
   *  author type into a dead one. */
  engine: 'sdk' | 'claude-cli' | 'fixture' | null
}

// ---- story material (/api/material) --------------------------------------

/** The unplaced layer (conventions §12): creative material that has not
 *  found its place. Never load-bearing; the first rung of the ladder
 *  material → proposed → canon → manuscript. */
export interface MaterialItem {
  id: string
  type: 'character-need' | 'unplaced-scene' | 'motif-idea' | 'relationship' | 'obligation' | 'gap'
  status: 'unplaced' | 'placed' | 'absorbed' | 'dropped'
  body: string
  purpose?: string
  constraints?: string[]
  related?: string[]
  window?: { from?: string; to?: string }
  placed_in?: string
  /** What discharges this requirement — material, scene, or canon ids.
   *  Absence is the normal state of an open obligation. */
  satisfied_by?: string[]
  note?: string
}

export interface MaterialResponse { items: MaterialItem[] }

/** Correct a filed thought, or move it along its lifecycle (conventions §12).
 *  Only these three fields are writable: type, id and related are structural. */
export interface UpdateMaterialRequest {
  id: string
  body?: string
  purpose?: string
  status?: 'unplaced' | 'placed' | 'absorbed' | 'dropped'
}
export interface UpdateMaterialResponse { item: MaterialItem }

/** A tension between two of the author's open notes, surfaced BEFORE
 *  anything is written: a non-empty list means nothing was revised and the
 *  author decides which note wins (U2, `/api/prose/work-notes`).
 *
 *  `RevisionResult` and `ReviseResponse` went with the book-wide revision
 *  fan-out in A69-9: it put prose in the Changes reading from a pass with no
 *  row, which the trust boundary forbids once that surface is governed, and
 *  nothing called it. Revising every note in the book at once is Revise at
 *  manuscript scope, which no slice owns yet. */
export interface NoteConflict { between: string[]; tension: string }

/** Editorial lenses (/api/prose/lenses): several readings of one scene at
 *  once, each from its own projection of the graph. Read-only by
 *  construction — no lens holds write capability — so everything here is
 *  `argued` (conventions §11) and nothing it says changes the story. */
export interface LensFinding {
  lens: 'character' | 'style' | 'historical' | 'continuity' | 'grammar'
  about: string
  claim: string
  evidence: string
  register: 'argued'
}

export interface LensReport {
  lens: LensFinding['lens']
  findings: LensFinding[]
  /** Per-lens measurements (work-graph.md §12). Reported per lens rather than
   *  averaged: an under-specified selector and an over-broad one look
   *  identical in a mean. */
  context_supplied: number
  context_used: number
  /** Null when nothing was supplied — a node handed nothing has no ratio,
   *  and reporting 1.0 would make an under-specified selector look best. */
  context_utilization: number | null
  claim_expansions: number
  stale: string[]
  error?: string
}

export interface LensesResponse {
  scene: string
  lenses: LensReport[]
  findings: LensFinding[]
  synthesis: string
  /** Wall-clock of the concurrent fan-out, against the sum of its parts. */
  wall_ms: number
  serial_ms: number
  run: string
}

/** Connected agents (/api/agents): who is working on the story.
 *
 *  Everything here is OBSERVED. arc holds no plan for a Claude session working
 *  with its own tools, so `actions` says what has happened and there is
 *  deliberately no field for what comes next (work-graph.md §10). */
export interface Agent {
  session: string
  cwd: string
  source: string
  since: string
  /** The run this session's current turn is attached to, if any. */
  run: string | null
  state: 'idle' | 'working'
  actions: { at: string; detail: unknown }[]
}
export interface AgentsResponse { agents: Agent[] }

/** A hook reporting in. `ignored` means the session is not working on the
 *  story this backend serves — arc serves one story, and a prompt typed in
 *  another project is not a fact about this one. */
export interface HookRequest {
  event: string
  session: string
  cwd: string
  source?: string
  prompt?: string
  detail?: unknown
  run?: string
}
export interface HookResponse { ok: true; ignored?: true; run?: string }

/** Runs (/api/runs): what arc is doing, and why (work-graph.md §5, §9).
 *
 *  A run is created from the author's raw words BEFORE anything reads them —
 *  the hook that opens one is synchronous with a 30-second budget while intake
 *  alone measures ~9s, so the run carries what they said and the structured
 *  reading fills in later. */
/** A run's state, from the closed set (agent-workflows §4, "The run"), each
 *  with an author-facing word: queued · paused · running · waiting for you ·
 *  refused · failed · cancelled · done. The last four are over. */
export type RunState = 'queued' | 'paused' | 'running' | 'waiting for you' | 'refused' | 'failed' | 'cancelled' | 'done'
/** How a run ended, from the closed set (invariant 9): the receipt's
 *  ending. `unfinished` is what a run killed with the backend reads as. */
export type RunEnding = 'landed' | 'refused' | 'could not run' | 'timed out' | 'budget' | 'unreadable' | 'cancelled' | 'unfinished'

export interface RunSummary {
  id: string
  source: 'ui' | 'claude-code' | 'cli' | 'external'
  /** the run in the author's words — never the prompt text */
  prompt: string
  started_at: string
  /** `waiting for you` means it is the author's move. */
  state: RunState
  /** how it ended, once it has */
  ending?: RunEnding
  /** what the run was about — a scene id, a route id — when it has one */
  subject?: string
  events: number
  decision?: 'accepted' | 'rejected' | 'abandoned'
  /** Canon ids this run holds WRITE or PROPOSE over — never what it merely
   *  read. A run that read nine entities to file one item must not light nine
   *  nodes; presence marks intent to change, not attention. */
  touching: string[]
}
export interface RunEventPayload { at: string; event: string; node?: string; detail?: unknown }

/** What /api/runs/stream emits. One shape for run events and story events
 *  alike, so the viewer holds a single subscription. `run: null` means nothing
 *  governed explains it — a file changed outside any run (work-graph.md §10). */
export interface StreamMessage {
  run: string | null
  at: string
  event: string
  node?: string
  detail?: unknown
}

/** What `arc doctor` counts on disk (A67-12): one entry per count, each with
 *  a sample of the files behind it. Every one is read from the record — the
 *  run directory, the transcript parent, `history/`, the registry's own
 *  status — and never from prose. */
export interface RecordCount {
  id: 'runs-without-receipt' | 'transcripts-no-receipt-names' | 'proposals-out-of-date' | 'rows-never-attended'
  count: number
  /** at most a handful, so a terminal line stays a line */
  some: string[]
}
export interface DoctorRecordsResponse {
  counts: RecordCount[]
  story: string
  transcripts: string
}

export interface RunsResponse { runs: RunSummary[] }
export interface RunResponse { run: RunSummary }
export interface RunDetailResponse { run: RunSummary; events: RunEventPayload[] }
/** The three write routes on runs — POST /api/runs, /api/runs/:id/events, and
 *  /api/runs/:id/decision. Their only caller is hooks/arc-hook.mjs, which is
 *  plain JavaScript and cannot be typed against them, so these carry no
 *  TypeScript importer. They are the contract regardless; do not read the
 *  absence of an importer as evidence the routes are gone. */
export interface OpenRunRequest { prompt: string; source?: RunSummary['source'] }
export interface ObserveRunRequest { detail: unknown }
export interface RunDecisionRequest { decision: 'accepted' | 'rejected' | 'abandoned'; note?: string }
/** POST /api/runs/:id/stop — the run's child is killed, what landed stays,
 *  and the run ends `cancelled` (A67-3). */
export interface StopRunResponse { run: RunSummary }
/** DELETE /api/runs/:id/transcript — the transcripts a run's launches named,
 *  removed by id; `removed` lists what was on disk. */
export interface DeleteTranscriptResponse { run: string; removed: string[] }
export interface RunDecisionResponse { ok: true; receipt: string; dropped: string[] }

/** Notes (/api/notes): whatever the author wanted written down.
 *
 *  Filing a note is a WRITE, not a pass — no model runs, nothing can fail for
 *  an interesting reason, and no engine is required. Turning a note into story
 *  material is a separate act the author asks for (/api/notes/work). */
export interface Note {
  /** The note's file name, which is also its handle. */
  file: string
  id: string
  created: string
  /** Run ids that have worked this note into the story. */
  worked: string[]
  text: string
}
export interface NotesResponse { notes: Note[] }
export interface AddNoteRequest { text: string }
export interface UpdateNoteRequest { file: string; text: string }
export interface NoteResponse { note: Note }
export interface DeleteNoteRequest { file: string }

/** One material record a run produced, read back from the file itself rather
 *  than from anything the worker said it wrote. */
export interface FiledItem { path: string; id: string; type: string; status: string; body: string }

/** Working a note into the story (/api/notes/work): slice 1's whole path —
 *  intake, claim, capability-gated worker, judge — run because the author
 *  asked. The note is never at risk; a failed run leaves it exactly as it was. */
export interface WorkNoteRequest { file: string }
export interface WorkResponse {
  run: string
  note: string
  filed: FiledItem[]
  /** The judge's reading. Wholly `argued` (conventions §11); `asked` holds
   *  creative questions arc raises and never answers. */
  verdict: 'accept' | 'revise' | 'reject'
  argued: { about: string; claim: string; evidence: string }[]
  asked: { about: string; question: string }[]
  reply: string
}

/** Keep what a run filed, or discard it. Discard marks each item `dropped`
 *  rather than deleting it (§12); both answers write a receipt. */
export interface WorkDecisionRequest { run: string; keep: boolean; note?: string }
export interface WorkDecisionResponse { ok: true; receipt: string; dropped: string[] }

// ---- the attention inbox (/api/attention) --------------------------------

import type { Finding, Register } from './canon-graph.ts'

/** Everything currently needing the author's attention, aggregated from
 *  machinery that already runs: the continuity checks, the proposal queue,
 *  and payoffs planted but never fired. Registers per conventions §11 —
 *  everything here is proven; argued findings join when lenses ship. */
export interface AttentionResponse {
  errors: number
  warnings: number
  proposals: number
  payoffs: number
  /** obligations the story has not met — the mirror of danglingPayoffs */
  obligations: number
  findings: Finding[]
  proposedRecords: { id: string; type: string }[]
  danglingPayoffs: { from: string; to: string }[]
  /** what the book still owes (conventions §12); classes are proven, the
   *  questions that ride with them are asked. */
  unmetObligations: { id: string; body: string; klass: 'unowned' | 'unwritten' | 'overdue'; satisfiers: string[] }[]
  /** notes whose anchor no longer resolves — proven, and the author's to
   *  re-place; arc never guesses where a thought now belongs (§14). */
  orphanedNotes: number
  /** `quote` is absent when the note was about the whole scene: it never had
   *  one, and only a deleted scene can strand such a note here. */
  orphanedAnnotations: { id: string; body: string; scene: string; quote?: string; why: string }[]
}

// ---- what a tool-using pass reports back --------------------------------
//  There is no chat route: Claude Code with the arc-canon skill is the chat
//  (A54). These two shapes stay because the passes that write through the
//  story tools — capture, draft-scene, the material worker — report in them.

/** One tool invocation a pass made during a turn. */
export interface ChatAction { tool: string; path: string; ok: boolean; detail?: string }

export interface ChatResponse { reply: string; actions: ChatAction[]; canonChanged: boolean }
