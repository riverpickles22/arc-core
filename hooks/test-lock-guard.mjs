#!/usr/bin/env node
// The agent's pen meets the wall (A46-3), negative-tested.
//
// The properties pinned: an Edit into a scene-locked body exits 2 naming the
// lock and saying only the author unlocks; frontmatter-only edits and
// body-identical Writes pass (ratification stays legal); a paragraph lock
// refuses only the edit that removes its quote; absorption exempts; a
// chapter lock covers its member scenes; and every malformed or out-of-scope
// input exits 0 — fail open is proven, not assumed. install-hooks.mjs is
// proven to add the PreToolUse group idempotently without disturbing the
// author's own entries.
//
// Run: node hooks/test-lock-guard.mjs   (needs python3 + pyyaml, same as validate)
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GUARD = join(HERE, 'lock-guard.mjs')
const INSTALL = join(HERE, 'install-hooks.mjs')

let failures = 0
const expect = (cond, msg) => {
  if (!cond) { failures++; console.error(`FAIL: ${msg}`) }
}

const SCENE = `---
scene: sc.01-1
chapter: ch.01
status: proposed
---
The lamp had been lit for an hour.

She went down to the rocks anyway.
`

const tmp = mkdtempSync(join(tmpdir(), 'lock-guard-'))
const story = join(tmp, 'story')
mkdirSync(join(story, 'prose', 'ch-01'), { recursive: true })
mkdirSync(join(story, 'locks'), { recursive: true })
const scenePath = join(story, 'prose', 'ch-01', 'scene-01.md')
writeFileSync(scenePath, SCENE)

const setLocks = (...bodies) => {
  rmSync(join(story, 'locks'), { recursive: true, force: true })
  mkdirSync(join(story, 'locks'))
  bodies.forEach((b, i) => writeFileSync(join(story, 'locks', `lock-00${i + 1}.yaml`), b))
}

const run = payload => spawnSync('node', [GUARD], {
  input: typeof payload === 'string' ? payload : JSON.stringify(payload),
  encoding: 'utf8',
})

const edit = (file, old_string, new_string, extra = {}) =>
  ({ tool_name: 'Edit', tool_input: { file_path: file, old_string, new_string, ...extra } })
const write = (file, content) =>
  ({ tool_name: 'Write', tool_input: { file_path: file, content } })

// --- scene lock: body refused, frontmatter passes, identical Write passes ---
setLocks('id: lock.001\nanchor:\n  scene: sc.01-1\n')

let r = run(edit(scenePath, 'an hour', 'two hours'))
expect(r.status === 2, `a body edit inside a scene lock must exit 2 (got ${r.status})`)
expect(r.stderr.includes('lock.001') && r.stderr.toLowerCase().includes('author'),
  `the refusal must name the lock and say only the author unlocks:\n${r.stderr}`)

r = run(edit(scenePath, 'status: proposed', 'status: canon'))
expect(r.status === 0, `a frontmatter-only edit must pass (got ${r.status}: ${r.stderr})`)

r = run(write(scenePath, SCENE.replace('status: proposed', 'status: canon')))
expect(r.status === 0, `a Write that keeps the body byte-identical must pass (got ${r.status}: ${r.stderr})`)

r = run(write(scenePath, SCENE.replace('an hour', 'two hours')))
expect(r.status === 2, `a Write that changes the locked body must exit 2 (got ${r.status})`)

// --- paragraph lock: only removing the quote is refused ---
setLocks('id: lock.001\nanchor:\n  scene: sc.01-1\n  paragraph: 0\n  quote: The lamp had been lit for an hour.\n')

r = run(edit(scenePath, 'The lamp had been lit for an hour.', 'The lamp had gone out.'))
expect(r.status === 2, `removing a paragraph lock's quote must exit 2 (got ${r.status})`)

r = run(edit(scenePath, 'She went down to the rocks anyway.', 'She stayed on the porch.'))
expect(r.status === 0, `an edit elsewhere in the scene must pass (got ${r.status}: ${r.stderr})`)

// Rewrapping the quote is not removing it — whitespace never violates.
r = run(edit(scenePath, 'The lamp had been lit for an hour.', 'The lamp had been lit\nfor an hour.'))
expect(r.status === 0, `rewrapping the quote must pass (got ${r.status}: ${r.stderr})`)

// --- chapter lock covers member scenes ---
setLocks('id: lock.001\nanchor:\n  chapter: ch.01\n')
r = run(edit(scenePath, 'an hour', 'two hours'))
expect(r.status === 2, `a body edit in a chapter-locked scene must exit 2 (got ${r.status})`)

// --- absorption: an absorbed lock enforces nothing; a dangling one does ---
setLocks(
  'id: lock.001\nanchor:\n  scene: sc.01-1\n  paragraph: 0\n  quote: The lamp had been lit for an hour.\nabsorbed_by: lock.002\n',
  'id: lock.002\nanchor:\n  scene: sc.01-2\n')
r = run(edit(scenePath, 'The lamp had been lit for an hour.', 'Gone.'))
expect(r.status === 0, `an absorbed lock must not fire (got ${r.status}: ${r.stderr})`)

setLocks('id: lock.001\nanchor:\n  scene: sc.01-1\n  paragraph: 0\n  quote: The lamp had been lit for an hour.\nabsorbed_by: lock.999\n')
r = run(edit(scenePath, 'The lamp had been lit for an hour.', 'Gone.'))
expect(r.status === 2, `a dangling absorption un-absorbs — the lock enforces again (got ${r.status})`)

// --- fail open, proven case by case ---
setLocks('id: lock.001\nanchor:\n  scene: sc.01-1\n')

const outside = join(tmp, 'elsewhere.md')
writeFileSync(outside, 'not a story\n')
r = run(edit(outside, 'not', 'still not'))
expect(r.status === 0, `a file outside any story must pass (got ${r.status})`)

r = run('this is not json')
expect(r.status === 0, `unparseable stdin must pass (got ${r.status})`)

r = run({ tool_name: 'Bash', tool_input: { command: 'echo hi' } })
expect(r.status === 0, `a non-write tool must pass (got ${r.status})`)

r = run(edit(scenePath, 'text that is not in the file', 'x'))
expect(r.status === 0, `an Edit whose old_string is absent fails on its own — pass (got ${r.status})`)

writeFileSync(join(story, 'locks', 'lock-junk.yaml'), ':::not yaml{{{[')
r = run(edit(scenePath, 'status: proposed', 'status: canon'))
expect(r.status === 0, `an unreadable lock file must not break the rest (got ${r.status}: ${r.stderr})`)
r = run(edit(scenePath, 'an hour', 'two hours'))
expect(r.status === 2, `...and the readable lock beside it still enforces (got ${r.status})`)

// --- install-hooks: the guard group, added idempotently ---
const settingsPath = join(tmp, 'settings.json')
writeFileSync(settingsPath, JSON.stringify({
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-own-guard' }] }] },
  permissions: { deny: ['WebSearch'] },
}, null, 2))
const env = {
  ...process.env,
  ARC_HOOK: join(HERE, 'arc-hook.mjs'),
  ARC_SETTINGS: settingsPath,
}
spawnSync('node', [INSTALL], { env, encoding: 'utf8' })
const once = JSON.parse(readFileSync(settingsPath, 'utf8'))
const guardGroups = once.hooks.PreToolUse.filter(g => g.hooks?.some(h => h.command?.includes('lock-guard.mjs')))
expect(guardGroups.length === 1, 'install-hooks must add exactly one guard group')
expect(guardGroups[0]?.matcher === 'Edit|Write', `the guard group must match Edit|Write (got ${guardGroups[0]?.matcher})`)
expect(once.hooks.PreToolUse.some(g => g.matcher === 'Bash' && g.hooks[0].command === 'my-own-guard'),
  "the author's own PreToolUse entry must survive")
expect(JSON.stringify(once.permissions) === JSON.stringify({ deny: ['WebSearch'] }),
  "the author's permissions must survive")

const before = readFileSync(settingsPath, 'utf8')
spawnSync('node', [INSTALL], { env, encoding: 'utf8' })
expect(readFileSync(settingsPath, 'utf8') === before, 'the second run must change nothing')

rmSync(tmp, { recursive: true, force: true })

if (failures) {
  console.error(`${failures} FAILURES`)
  process.exit(1)
}
console.log('lock guard: settled bodies refuse the tool call naming the lock, '
  + 'frontmatter and elsewhere-edits pass, absorption exempts, every malformed '
  + 'input fails open, and install-hooks adds the Edit|Write group exactly once')
