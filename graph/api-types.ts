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
  note?: string
}

export interface MaterialResponse { items: MaterialItem[] }

// ---- the attention inbox (/api/attention) --------------------------------

import type { Finding } from './canon-graph.ts'

/** Everything currently needing the author's attention, aggregated from
 *  machinery that already runs: the continuity checks, the proposal queue,
 *  and payoffs planted but never fired. Registers per conventions §11 —
 *  everything here is proven; argued findings join when lenses ship. */
export interface AttentionResponse {
  errors: number
  warnings: number
  proposals: number
  payoffs: number
  findings: Finding[]
  proposedRecords: { id: string; type: string }[]
  danglingPayoffs: { from: string; to: string }[]
}

// ---- the chat contract (/api/chat) --------------------------------------

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface ChatRequest { messages: ChatMessage[] }

/** One tool invocation the agent made during a turn. */
export interface ChatAction { tool: string; path: string; ok: boolean; detail?: string }

export interface ChatResponse { reply: string; actions: ChatAction[]; canonChanged: boolean }
