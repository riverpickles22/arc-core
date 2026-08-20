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
  file: string; body: string
}

/** One prose file that differs from HEAD (main = HEAD, draft = working tree). */
export interface ProseChange {
  file: string
  status: 'added' | 'modified' | 'deleted'
  main: ProseScene | null
}

export interface ProseDraft {
  git: boolean
  changes: ProseChange[]
  history: { hash: string; date: string; subject: string }[]
}

// ---- request/response envelopes -----------------------------------------

export interface DocsResponse { articles: DocArticle[] }
export interface ProseResponse { scenes: ProseScene[] }
export interface ProseAcceptRequest { message?: string; capture?: boolean }
export interface ProseAcceptResponse {
  hash: string
  files: string[]
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
export interface DraftSceneRequest { chapter: string; guidance?: string }
export interface DraftSceneResponse { reply: string; actions: ChatAction[]; file: string | null }

/** The analysis pass (/api/prose/analyze): the loop's detect step, run
 *  BEFORE the author accepts. Read-only — it proposes nothing and writes
 *  nothing. Its briefing is wholly `argued` (conventions §11): claims with
 *  citations, for a human to judge, never presented as proven. */
export interface AnalyzeResponse {
  briefing: string
  register: Extract<Register, 'argued'>
  engine: 'sdk' | 'claude-cli'
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
  suggestions: string[]
  register: Extract<Register, 'argued'>
  engine: 'sdk' | 'claude-cli'
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
 *  decision git never records.
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
  source?: 'draft' | 'revision' | 'refusal'
  layer?: 'story' | 'author'
}

export interface StyleResponse {
  author: StyleLayerPayload | null
  story: StyleLayerPayload | null
  proposed: ProposedRule[]
}

/** Locks (settled prose): anchored refusals, resolved like annotations.
 *  The write path enforces them; the wire only reports and edits them. */
export interface LocksResponse { locks: import('./annotations.ts').ResolvedLock[] }
export interface CreateLockRequest { scene: string; paragraph: number; quote: string }
export interface DeleteLockRequest { id: string }

/** Ratify a proposed rule into a layer, or dismiss it. Deterministic on the
 *  server — no model runs in this path. */
export interface RatifyRuleRequest { id: string; action: 'ratify' | 'dismiss'; layer?: 'author' | 'story' }
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
  engine: 'sdk' | 'claude-cli' | null
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

/** Revision fan-out (/api/prose/revise): the author's open notes worked into
 *  the prose. Conflicts are surfaced BEFORE anything is written — a non-empty
 *  `conflicts` means nothing was revised and the author decides first. */
export interface NoteConflict { between: string[]; tension: string }

export interface RevisionResult {
  scene: string
  file: string
  /** The notes this revision answers. Provenance, carried to the receipt. */
  notes: string[]
  words_before: number
  words_after: number
  word_delta: number
  changed: boolean
  /** Non-empty when something this node read moved under it. */
  stale: string[]
  refused?: string
  error?: string
}

export interface ReviseResponse {
  conflicts: NoteConflict[]
  clusters: number
  /** How many rounds the write sets forced. One wave means everything was
   *  disjoint and ran at once. */
  waves: number
  revisions: RevisionResult[]
  notes_addressed: string[]
  scenes_changed: string[]
  word_delta: number
  stale_nodes: string[]
  proposed_canon_changes: string[]
  wall_ms: number
  run: string
}

/** Editorial lenses (/api/prose/lenses): several readings of one scene at
 *  once, each from its own projection of the graph. Read-only by
 *  construction — no lens holds write capability — so everything here is
 *  `argued` (conventions §11) and nothing it says changes the story. */
export interface LensFinding {
  lens: 'character' | 'style' | 'historical' | 'continuity'
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
export interface RunSummary {
  id: string
  source: 'ui' | 'claude-code' | 'cli' | 'external'
  prompt: string
  started_at: string
  /** `awaiting` means it is the author's move. */
  state: 'working' | 'awaiting' | 'closed'
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

// ---- the chat contract (/api/chat) --------------------------------------

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface ChatRequest { messages: ChatMessage[] }

/** One tool invocation the agent made during a turn. */
export interface ChatAction { tool: string; path: string; ok: boolean; detail?: string }

export interface ChatResponse { reply: string; actions: ChatAction[]; canonChanged: boolean }
