#!/usr/bin/env node
// arc's Claude Code hook. One script, every event.
//
// It reports what the session is doing to a backend that may or may not be
// running, and then gets out of the way. Three rules govern all of it:
//
//   1. NEVER BREAK THE SESSION. Every path exits 0. A backend that is stopped,
//      unreachable, slow, or returning nonsense must leave the author's Claude
//      session behaving exactly as if arc were not installed. Nothing here
//      writes to stdout, because on some hooks that is input to the model.
//
//   2. NEVER BE SLOW. UserPromptSubmit is synchronous with a thirty-second
//      timeout and blocks the author's turn. The request below is capped far
//      below that, and the backend's side of it opens a run and returns —
//      no model runs inside this call.
//
//   3. REPORT, NEVER ACT. Hooks say what the agent is doing. They do not
//      change the story, and they hold no capability that could.
//
// Usage (from .claude/settings.json):  node <path>/arc-hook.mjs SessionStart
const EVENT = process.argv[2] ?? ''
const BASE = process.env.ARC_URL ?? `http://localhost:${process.env.ARC_PORT ?? 8787}`
const TIMEOUT_MS = Number(process.env.ARC_HOOK_TIMEOUT_MS ?? 1500)

/** Claude Code delivers the hook payload as JSON on stdin.
 *
 *  Read as a STREAM, not with readFile(0): Claude pipes the payload, and
 *  reading a pipe by file descriptor returns empty or throws depending on
 *  timing. That failure is silent and total — an empty payload means no
 *  session id, which the backend correctly ignores, so every hook would
 *  succeed at doing nothing. Caught only by running the script for real.
 *
 *  An empty or unparseable body is still survivable; this never throws. */
async function payload() {
  if (process.stdin.isTTY) return {}
  try {
    const chunks = []
    // A hook that never gets its stdin closed must not hang the author's turn.
    const guard = setTimeout(() => process.stdin.destroy(), 1000)
    for await (const chunk of process.stdin) chunks.push(chunk)
    clearTimeout(guard)
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

try {
  const p = await payload()

  // Field names differ a little across hook types and Claude versions; take
  // whichever is present rather than insisting on one shape.
  const body = {
    event: EVENT,
    session: p.session_id ?? p.sessionId ?? '',
    cwd: p.cwd ?? process.cwd(),
    source: p.source ?? 'claude-code',
    prompt: p.prompt ?? p.user_prompt ?? '',
    detail: p.tool_name
      ? { tool: p.tool_name, input: p.tool_input, response: p.tool_response }
      : undefined,
    // Set when arc launched this session itself. Without it the hook would
    // open a second run for work arc already has one for.
    run: process.env.ARC_RUN_ID || undefined,
  }

  const stop = AbortSignal.timeout(TIMEOUT_MS)
  await fetch(`${BASE}/api/agents/hook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: stop,
  })
} catch {
  // Deliberately silent. arc being unavailable is arc's problem, and the
  // author is in the middle of a sentence.
}

process.exit(0)
