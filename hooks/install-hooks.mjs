#!/usr/bin/env node
// Install arc's hooks into a story's .claude/settings.json — idempotently, and
// without ever taking something that is not arc's.
//
// settings.json is the AUTHOR'S file. It may already carry their own hooks,
// their own permissions, anything. So this merges: it adds arc's entries where
// they are missing, replaces arc's own entries when the path has changed, and
// leaves every other line exactly as it found it. Running it twice changes
// nothing the second time.
//
// Env: ARC_HOOK (path to arc-hook.mjs), ARC_SETTINGS (target), ARC_PORT.
import fs from 'node:fs'
import path from 'node:path'

const HOOK = process.env.ARC_HOOK
const SETTINGS = process.env.ARC_SETTINGS
const PORT = process.env.ARC_PORT || '8787'

if (!HOOK || !SETTINGS) {
  console.error('install-hooks: ARC_HOOK and ARC_SETTINGS are required')
  process.exit(1)
}

/** The events arc listens for, and what each one tells it. */
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'SessionEnd']

const commandFor = event => `ARC_PORT=${PORT} node ${JSON.stringify(HOOK)} ${event}`

/** Ours is recognisable by the script it runs, so a moved checkout is an
 *  update rather than a duplicate. */
const isArcHook = entry =>
  typeof entry?.command === 'string' &&
  (entry.command.includes('arc-hook.mjs') || entry.command.includes(HOOK))

let settings = {}
if (fs.existsSync(SETTINGS)) {
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'))
  } catch (e) {
    // Refuse rather than clobber: an unparseable settings file is a file the
    // author is mid-edit on, or one arc has no business rewriting.
    console.error(`install-hooks: ${SETTINGS} is not valid JSON — leaving it alone (${e.message})`)
    process.exit(1)
  }
}

settings.hooks ??= {}
let changed = false

for (const event of EVENTS) {
  const want = { type: 'command', command: commandFor(event) }
  const groups = (settings.hooks[event] ??= [])

  // Find the group holding arc's hook, if any, and update it in place.
  let found = false
  for (const group of groups) {
    const hooks = group?.hooks
    if (!Array.isArray(hooks)) continue
    const ix = hooks.findIndex(isArcHook)
    if (ix >= 0) {
      found = true
      if (hooks[ix].command !== want.command) { hooks[ix] = want; changed = true }
    }
  }
  if (!found) {
    groups.push({ hooks: [want] })
    changed = true
  }
}

if (changed) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true })
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n')
}
process.exit(0)
