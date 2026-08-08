// context-pack CLI — thin wrapper over context-pack-lib.ts (the importable
// selection/rendering logic). Usage unchanged:
//
//   python3 tools/export-canon.py <story> - | node --experimental-strip-types graph/context-pack.ts - --chapter ch.10-return
//   node --experimental-strip-types graph/context-pack.ts export.json --at 1959 --pov char.carlos --place place.havana
import { readFileSync } from 'node:fs'
import type { CanonDoc } from './canon-graph.ts'
import { buildContextPack } from './context-pack-lib.ts'

const args = process.argv.slice(2)
const flag = (n: string) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : undefined }
const src = args[0]
if (!src || src === '--help') {
  console.log(`usage: context-pack.ts <export.json | -> (--chapter ch.id | --at DATE [--pov id] [--place id] [--events e1,e2]) [--max-chars N]`)
  process.exit(src ? 0 : 1)
}
const canon: CanonDoc & { generated_from?: string } =
  JSON.parse(src === '-' ? readFileSync(0, 'utf8') : readFileSync(src, 'utf8'))

try {
  console.log(buildContextPack(canon, {
    chapter: flag('--chapter'),
    at: flag('--at'),
    pov: flag('--pov'),
    place: flag('--place'),
    events: flag('--events')?.split(','),
    maxChars: flag('--max-chars') ? Number(flag('--max-chars')) : undefined,
  }))
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}
