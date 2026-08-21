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

// ---- locks learn how much they cover (A40-1) ----------------------------

const { resolveLocks, lockViolations, lockScope } = await import('./annotations.ts')

// 11. the three coherent shapes, and every blend rejected
expect(lockScope({ scene: 'sc.01-1', paragraph: 2, quote: 'x' }) === 'paragraph', "today's shape is a paragraph lock")
expect(lockScope({ scene: 'sc.01-1' }) === 'scene', 'a scene alone is a section lock')
expect(lockScope({ chapter: 'ch.01' }) === 'chapter', 'a chapter alone is a chapter lock')
expect(lockScope({ chapter: 'ch.01', paragraph: 2 }) === 'invalid', 'a chapter anchor naming a paragraph is incoherent')
expect(lockScope({ chapter: 'ch.01', scene: 'sc.01-1' }) === 'invalid', 'or naming a scene')
expect(lockScope({ scene: 'sc.01-1', quote: 'x' }) === 'invalid', 'a quote without its paragraph is neither shape')

const [invalid] = resolveLocks([{ id: 'lock.bad', anchor: { chapter: 'ch.01', paragraph: 2 } }], () => 'Body.')
expect(invalid.scope === 'invalid' && /incoherent/.test(invalid.resolution.note ?? ''),
  'an incoherent lock is rejected with the reason, and enforces nothing')
expect(lockViolations('Body.', 'Changed.', [invalid]).length === 0, 'rejected means it blocks nothing')

// 12. a section lock refuses ANY change to its scene — including growth —
//     and survives a total rewrite unreported
const [section] = resolveLocks([{ id: 'lock.sec', anchor: { scene: 'sc.01-1' } }], () => 'One.\n\nTwo.')
expect(section.scope === 'scene' && section.resolution.state === 'resolved', 'a section lock resolves against any body')
expect(lockViolations('One.\n\nTwo.', 'One.\n\nTwo.', [section]).length === 0, 'an unchanged scene is fine')
expect(lockViolations('One.\n\nTwo.', 'One.\n\nTwo.\n\nThree.', [section]).length === 1, 'growth is a change — settled means settled')
const grew = lockViolations('One.\n\nTwo.', 'Entirely new.', [section])[0]
expect(grew.paragraph === null, 'a scope violation has no paragraph number to point at')

const [rewritten] = resolveLocks([{ id: 'lock.sec', anchor: { scene: 'sc.01-1' } }], () => 'Every word replaced, twice.')
expect(rewritten.resolution.state === 'resolved', 'never drifted or orphaned, whatever the prose becomes')
const [gone] = resolveLocks([{ id: 'lock.sec', anchor: { scene: 'sc.99-9' } }], () => null)
expect(gone.resolution.state === 'no-scene', 'only deleting the scene reaches it')

// 13. a chapter lock resolves standing; the caller supplies its scenes
const [chapterLock] = resolveLocks([{ id: 'lock.ch', anchor: { chapter: 'ch.01' } }], () => null)
expect(chapterLock.scope === 'chapter' && chapterLock.resolution.state === 'resolved',
  'a chapter lock stands without a scene body — membership is the caller\'s knowledge')
expect(lockViolations('A scene of the chapter.', 'That scene, changed.', [chapterLock]).length === 1,
  'and refuses any change to any body the caller holds it against')

// 14. a paragraph lock is exactly what it was before scopes existed
const [para] = resolveLocks(
  [{ id: 'lock.p', anchor: { scene: 'sc.01-1', paragraph: 1, quote: 'Two.' } }],
  () => 'One.\n\nTwo.\n\nThree.')
expect(para.scope === 'paragraph' && para.resolution.state === 'resolved' && para.resolution.paragraph === 1,
  'the existing shape resolves exactly as it always did')
expect(lockViolations('One.\n\nTwo.\n\nThree.', 'One.\n\nTwo, changed.\n\nThree.', [para]).length === 1)
expect(lockViolations('One.\n\nTwo.\n\nThree.', 'One, changed.\n\nTwo.\n\nThree.', [para]).length === 0,
  'and still fences its paragraph alone')

if (failures) { console.error(`annotation anchors: ${failures} failure(s)`); process.exit(1) }
console.log('annotation anchors: notes follow their quote, orphan honestly, never relocate on a guess, and a scene note holds')
