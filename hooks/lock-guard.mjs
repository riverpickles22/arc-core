#!/usr/bin/env node
// arc's lock guard — the one hook that refuses (A46-3).
//
// arc-hook.mjs is sworn to report-never-act, and stays that way; this is a
// SEPARATE script because it does the one thing that constitution forbids:
// it blocks a tool call. PreToolUse, Edit|Write only. It walks up from the
// target file to the story root, reads locks/*.yaml directly — no backend,
// no server, nothing running — and exits 2 with the refusal on stderr when
// the change would rewrite settled prose. Everything else exits 0.
//
// Its own constitution, two rules:
//
//   1. NEVER BREAK THE SESSION. A proven violation is the ONLY thing that
//      blocks. A file outside any story, a missing locks/ dir, unparseable
//      stdin, an unreadable lock file, no Python to parse YAML with — all
//      exit 0. Fail open: the validator and the commit gate stand behind
//      this guard, so a miss here is caught twice more before it is ratified.
//
//   2. MIRROR THE WRITE PATH, EXACTLY. A scene or chapter lock refuses any
//      change to the BODY — frontmatter-only edits pass, because ratifying
//      a settled scene (proposed -> canon) is the expected next step. A
//      paragraph lock refuses only an edit that REMOVES its quote (an
//      already-missing quote is the validator's finding, not a reason to
//      brick the author's session). A lock absorbed by an existing wider
//      lock enforces nothing.
//
// YAML is parsed through the Python every arc checkout already requires for
// bin/validate (arc-core/.venv, else python3) — one spawn, all lock files.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const CORE = dirname(dirname(fileURLToPath(import.meta.url)))

const allow = () => process.exit(0)

/** Same stream discipline as arc-hook.mjs: Claude pipes the payload, and a
 *  hook that never gets its stdin closed must not hang the author's turn. */
async function payload() {
  if (process.stdin.isTTY) return {}
  try {
    const chunks = []
    const guard = setTimeout(() => process.stdin.destroy(), 1000)
    for await (const chunk of process.stdin) chunks.push(chunk)
    clearTimeout(guard)
    const raw = Buffer.concat(chunks).toString('utf8').trim()
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** Parse every lock file in one Python call; null when nothing can parse —
 *  which is a fail-open, never an error. */
function readLocks(lockDir) {
  let files
  try {
    files = readdirSync(lockDir)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map(f => join(lockDir, f))
  } catch {
    return null
  }
  if (!files.length) return null
  const script =
    'import json,sys\n' +
    'import yaml\n' +
    'out=[]\n' +
    'for p in sys.argv[1:]:\n' +
    '    try:\n' +
    '        with open(p) as f: out.append(yaml.safe_load(f))\n' +
    '    except Exception:\n' +
    '        out.append(None)\n' +
    'print(json.dumps(out))\n'
  for (const py of [join(CORE, '.venv', 'bin', 'python'), 'python3']) {
    try {
      const r = spawnSync(py, ['-c', script, ...files],
                          { encoding: 'utf8', timeout: 5000 })
      if (r.status === 0 && r.stdout) return JSON.parse(r.stdout)
    } catch { /* try the next interpreter */ }
  }
  return null
}

const FM_RE = /^---\n([\s\S]*?)\n---\n/

function splitScene(text) {
  const m = FM_RE.exec(text)
  if (!m) return { fm: '', body: text }
  return { fm: m[1], body: text.slice(m[0].length) }
}

/** scene:/chapter: out of machine-written frontmatter — a one-line scalar,
 *  by construction (new-story.py and the backend both write it that way). */
const fmField = (fm, key) =>
  (fm.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, 'm')) ?? [])[1]

const norm = t => t.split(/\s+/).filter(Boolean).join(' ')

function refuse(lock, what) {
  process.stderr.write(
    `lock-guard: refusing this edit — ${what} is settled under ${lock.id ?? 'a lock'}. ` +
    'Locked prose is not editable, by anyone, with any tool. Only the author ' +
    'unlocks, from the viewer’s right-click menu. Report what you wanted to ' +
    'change instead of changing it.\n')
  process.exit(2)
}

try {
  const p = await payload()
  const tool = p.tool_name ?? p.toolName ?? ''
  if (tool !== 'Edit' && tool !== 'Write') allow()
  const input = p.tool_input ?? p.toolInput ?? {}
  const target = input.file_path
  if (typeof target !== 'string' || !target) allow()
  const abs = resolve(target)

  // The story root is the nearest ancestor holding locks/; the file must be
  // that story's prose. Anything else is none of this guard's business.
  let root = null
  for (let d = dirname(abs); ; d = dirname(d)) {
    if (existsSync(join(d, 'locks'))) { root = d; break }
    if (dirname(d) === d) break
  }
  if (!root || !abs.startsWith(join(root, 'prose') + sep)) allow()

  const parsed = readLocks(join(root, 'locks'))
  if (!parsed) allow()
  const locks = parsed.filter(l => l && typeof l === 'object' && l.anchor)
  const ids = new Set(locks.map(l => l.id).filter(id => typeof id === 'string'))
  const active = locks.filter(l => !(typeof l.absorbed_by === 'string' && ids.has(l.absorbed_by)))
  if (!active.length) allow()

  const disk = existsSync(abs) ? readFileSync(abs, 'utf8') : null

  // The change, simulated: what the file would hold after the tool ran.
  let next
  if (tool === 'Write') {
    next = typeof input.content === 'string' ? input.content : null
  } else {
    // An Edit of a file that does not exist, or whose old_string is absent,
    // fails on its own; nothing for the guard to judge.
    if (disk === null) allow()
    const oldStr = input.old_string
    if (typeof oldStr !== 'string' || !oldStr || !disk.includes(oldStr)) allow()
    const newStr = typeof input.new_string === 'string' ? input.new_string : ''
    next = input.replace_all ? disk.split(oldStr).join(newStr) : disk.replace(oldStr, newStr)
  }
  if (next === null) allow()

  const before = splitScene(disk ?? next)
  const after = splitScene(next)
  const sceneId = fmField(after.fm, 'scene') ?? fmField(before.fm, 'scene')
  const chapterId = fmField(after.fm, 'chapter') ?? fmField(before.fm, 'chapter')

  for (const lock of active) {
    const a = lock.anchor
    if (a.quote != null) {                                   // paragraph lock
      if (a.scene !== sceneId) continue
      if (disk !== null &&
          norm(before.body).includes(norm(a.quote)) &&
          !norm(after.body).includes(norm(a.quote))) {
        refuse(lock, `a paragraph of ${a.scene}`)
      }
    } else if (a.scene != null) {                            // scene lock
      if (a.scene !== sceneId) continue
      if (disk !== null && after.body !== before.body) {
        refuse(lock, `the whole of ${a.scene}`)
      }
    } else if (a.chapter != null) {                          // chapter lock
      if (a.chapter !== chapterId) continue
      if (disk !== null && after.body !== before.body) {
        refuse(lock, `every scene of ${a.chapter}`)
      }
    }
  }
} catch {
  // Fail open — rule 1. The validator and the commit gate stand behind us.
}

process.exit(0)
