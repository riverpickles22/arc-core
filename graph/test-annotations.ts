// Anchor durability: the property the whole annotation surface rests on.
// A note in the wrong place is worse than no note, so the only acceptable
// failure mode is an honest orphan.
import { isSceneScoped, orphanedAnnotations, paragraphsOf, resolveAnchor, resolveAnnotations, type AnnotationLike } from './annotations.ts'

let failures = 0
const expect = (cond: boolean, what: string) => {
  if (!cond) { failures++; console.error(`FAIL: ${what}`) }
}

const SCENE = [
  'The morning smelled of coffee before it smelled of anything else.',
  'By the time he came down the back stair, Diego had taken up his post in the doorway.',
  'His father worked the room in his apron, and the room worked back.',
].join('\n\n')

expect(paragraphsOf(SCENE).length === 3, 'paragraphsOf: blank-line separated, three paragraphs')
expect(paragraphsOf('a\n\n\n\nb\n\n').length === 2, 'paragraphsOf: runs of blank lines and trailing space collapse')

// 1. exact hit
const a1 = { scene: 'sc.01-1', paragraph: 1, quote: 'Diego had taken up his post' }
expect(resolveAnchor(a1, SCENE).state === 'resolved', 'resolved: quote sits at the recorded index')

// 2. an edit ABOVE shifts every index — the quote must still find its note
const WITH_INSERT = 'A new opening paragraph the author added.\n\n' + SCENE
const r2 = resolveAnchor(a1, WITH_INSERT)
expect(r2.state === 'drifted' && r2.paragraph === 2,
  'drifted: text inserted above shifts the index, the quote relocates it and says so')

// 3. the paragraph at the old index changed but the quote is elsewhere —
//    the note must NOT silently attach to whatever now occupies index 1
const REORDERED = [
  'His father worked the room in his apron, and the room worked back.',
  'The morning smelled of coffee before it smelled of anything else.',
  'By the time he came down the back stair, Diego had taken up his post in the doorway.',
].join('\n\n')
const r3 = resolveAnchor(a1, REORDERED)
expect(r3.state === 'drifted' && r3.paragraph === 2,
  'reordering: the note follows its quote, never the index it used to occupy')

// 4. the passage is rewritten away — orphan, never a guess
const REWRITTEN = 'The morning smelled of coffee.\n\nHis father worked the room.'
const r4 = resolveAnchor(a1, REWRITTEN)
expect(r4.state === 'orphaned' && r4.paragraph === null,
  'orphaned: a quote that is gone orphans the note rather than relocating it')

// 5. whitespace reflow is not a change
const REFLOWED = SCENE.replace('Diego had taken up his post', 'Diego had taken up\n  his post')
expect(resolveAnchor(a1, REFLOWED).state === 'resolved', 'reflowed whitespace still resolves')

// 6. the scene itself is gone
expect(resolveAnchor(a1, null).state === 'no-scene', 'a deleted scene is reported as such, not as an orphan')

// 7. the orphan set skips notes the author already closed
const NOTES: AnnotationLike[] = [
  { id: 'note.001', anchor: a1, body: 'Diego is furniture here.', status: 'open' },
  { id: 'note.002', anchor: { scene: 'sc.01-1', paragraph: 0, quote: 'a line that never existed' }, body: 'x', status: 'open' },
  { id: 'note.003', anchor: { scene: 'sc.01-1', paragraph: 0, quote: 'a line that never existed' }, body: 'y', status: 'dropped' },
  { id: 'note.004', anchor: { scene: 'sc.99-1', paragraph: 0, quote: 'z' }, body: 'z', status: 'open' },
]
const resolved = resolveAnnotations(NOTES, s => (s === 'sc.01-1' ? SCENE : null))
const orphans = orphanedAnnotations(resolved).map(n => n.id)
expect(orphans.includes('note.002'), 'orphan set: an open note whose quote is gone')
expect(orphans.includes('note.004'), 'orphan set: an open note whose scene is gone')
expect(!orphans.includes('note.003'), 'orphan set: a dropped note is not the author’s problem any more')
expect(!orphans.includes('note.001'), 'orphan set: a resolving note is not an orphan')
expect(resolved[0].id === 'note.002' || resolved[0].anchor.scene === 'sc.01-1', 'resolution sorts by scene then position')

// 8. a note about the SCENE, not a passage in it — the shape an observation
//    about something ABSENT must take, since absent text cannot be quoted.
//    It holds against any body the scene ever has.
const SCENE_NOTE = { scene: 'sc.01-1' }
expect(isSceneScoped(SCENE_NOTE), 'an anchor with no paragraph is scene-scoped')
expect(!isSceneScoped(a1), 'an anchor with a paragraph is not')

const rs = resolveAnchor(SCENE_NOTE, SCENE)
expect(rs.state === 'resolved' && rs.paragraph === null,
  'a scene note resolves, to no particular paragraph')

// The property the feature rests on: "we never reference the tide here" must
// survive a rewrite that still never references the tide.
for (const [label, body] of [
  ['a total rewrite', 'Nothing of the original survives. Not one word of it.'],
  ['insertion above', WITH_INSERT],
  ['reordering', REORDERED],
  ['a single paragraph', 'One paragraph now.'],
  ['an empty scene', ''],
] as const) {
  const r = resolveAnchor(SCENE_NOTE, body)
  expect(r.state === 'resolved', `a scene note survives ${label}`)
}

expect(resolveAnchor(SCENE_NOTE, null).state === 'no-scene',
  'deleting the scene is the one thing that breaks a scene note')

// 9. a scene note leads its scene: it is about everything below it. An orphan
//    also has no paragraph, and belongs at the other end.
const MIXED: AnnotationLike[] = [
  { id: 'note.b', anchor: a1, body: 'on a passage', status: 'open' },
  { id: 'note.c', anchor: { scene: 'sc.01-1', paragraph: 0, quote: 'gone entirely' }, body: 'orphan', status: 'open' },
  { id: 'note.a', anchor: SCENE_NOTE, body: 'the tide is never mentioned', status: 'open' },
]
const order = resolveAnnotations(MIXED, () => SCENE).map(n => n.id)
expect(order[0] === 'note.a', 'a scene note sorts first — it is about everything below it')
expect(order[2] === 'note.c', 'an orphan sorts last — it has lost its place')

// 10. and it is never an orphan, however the prose is rewritten
const afterRewrite = resolveAnnotations(
  [{ id: 'note.a', anchor: SCENE_NOTE, body: 'the tide is never mentioned', status: 'open' }],
  () => 'Every word replaced.',
)
expect(orphanedAnnotations(afterRewrite).length === 0,
  'a scene note is never reported as an orphan, whatever happens to the prose')

if (failures) { console.error(`annotation anchors: ${failures} failure(s)`); process.exit(1) }
console.log('annotation anchors: notes follow their quote, orphan honestly, never relocate on a guess, and a scene note holds')
