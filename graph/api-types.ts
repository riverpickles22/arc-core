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
 *  ratified. Nothing here binds until the author says so. */
export interface ProposedRule {
  id: string
  rule: string
  section: string | null
  at: string
  evidence: RuleEvidence[]
}

export interface StyleResponse {
  author: StyleLayerPayload | null
  story: StyleLayerPayload | null
  proposed: ProposedRule[]
}

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
export interface CreateAnnotationRequest { scene: string; paragraph: number; quote: string; body: string }
export interface UpdateAnnotationRequest { id: string; status: 'open' | 'working' | 'resolved' | 'dropped' }

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
  orphanedAnnotations: { id: string; body: string; scene: string; quote: string; why: string }[]
}

// ---- the chat contract (/api/chat) --------------------------------------

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface ChatRequest { messages: ChatMessage[] }

/** One tool invocation the agent made during a turn. */
export interface ChatAction { tool: string; path: string; ok: boolean; detail?: string }

export interface ChatResponse { reply: string; actions: ChatAction[]; canonChanged: boolean }
