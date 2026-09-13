# arc-core — agent notes

Read `../arc-system-design/AGENTS.md` first; it carries the rules every arc
repo shares. This file is only what is particular to the constitution.

- **`conventions.md` is binding on every story and every tool.** A change to
  it is a change to the constitution: say what rule you add or loosen and
  what breaks if nobody follows it. §11 (proven / argued / asked) is the one
  most often misread.
- **The validator is the gate.** Schemas, canon discipline, and the commit
  gate for locked prose all live in `tools/`; `examples/example-story` must
  validate after any change, and it is what CI runs.
- **`graph/` is the shared module** (`arc-canon-graph`): projections, checks,
  reports, prose checks, and `api-types.ts`, the wire contract both apps
  import. Add types here before either app uses them.
- **Skills are the terminal path.** `arc-canon` and `arc-new-story` are
  symlinked to `~/.claude/skills` by `../dev.sh`; they hold protocol, never
  story content.
- Checks before you say done: `.venv/bin/python tools/validate.py examples/example-story`
  · `.venv/bin/python tools/test_*.py` · `cd graph && npm test` (the venv `../dev.sh`
  makes — the system `python3` has no PyYAML). Commit with `-s` (DCO).
