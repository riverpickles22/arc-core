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
export interface ProseAcceptResponse { hash: string; files: string[]; capture?: ChatResponse }
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
 *  ratification — always present, empty until the learning pass ships, and
 *  never binding on drafting. */
export interface StyleLayerPayload { source: 'author' | 'story'; path: string; body: string }
export interface StyleResponse {
  author: StyleLayerPayload | null
  story: StyleLayerPayload | null
  proposed: { id: string; rule: string; section: string | null }[]
}

/** Annotations (conventions §14) with their anchors resolved against the
 *  prose as it stands — resolved, drifted, or honestly orphaned. */
export interface AnnotationsResponse { annotations: import('./annotations.ts').ResolvedAnnotation[] }
export interface CreateAnnotationRequest { scene: string; paragraph: number; quote: string; body: string }
export interface UpdateAnnotationRequest { id: string; status: 'open' | 'working' | 'resolved' | 'dropped' }

export interface OkResponse { ok: true }
export interface ApiErrorResponse { error: string }
export interface HealthResponse { ok: boolean; validator: string }

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
