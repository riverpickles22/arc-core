#!/usr/bin/env python3
"""A keypoint written the way arc instructs must validate, negative-tested.

The gap this closes: the arc-canon skill §11 tells a session to mint keypoints
as `annotations/note-NNN.yaml` carrying `kind: keypoint`, `by: agent` and NO
status, and arc-backend's createAnnotation writes exactly that. The schema
defined neither field, was additionalProperties:false, and required `status` —
so the running app produced canon its own validator rejected, three ways at
once.

The keypoint fixture here is BUILT FROM THE SKILL'S OWN TEXT rather than typed
out beside it. A hand-written fixture proves the schema matches whatever the
test author believed; parsing the instruction proves it matches what a session
is actually told to do, and fails if that instruction ever changes without the
schema following.

Run: python3 tools/test_keypoint_shape.py
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "example-story"
SKILL = ROOT / ".claude" / "skills" / "arc-canon" / "SKILL.md"
PY = sys.executable

SCENE = """---
scene: sc.01-1
chapter: ch.01-the-arrival
status: proposed
---
The lamp had been lit for an hour before she noticed the wind had turned.

She went down to the rocks anyway, because that was the hour she went.
"""


def documented_keypoint_fields() -> dict:
    """The keypoint POST body, lifted out of the skill's §11 example.

    If §11 stops instructing `kind: keypoint` / `by: agent`, this raises rather
    than silently testing a shape nobody is told to write.
    """
    text = SKILL.read_text()
    section = text[text.index("## 11."):]
    body = re.search(r"\{[^{}]*\"kind\":\s*\"keypoint\"[^{}]*\}", section, re.S)
    if not body:
        raise SystemExit("FAIL: arc-canon SKILL.md §11 no longer shows a keypoint POST body")
    fields = json.loads(re.sub(r"<[^>]*>", "the paragraph's own text", body.group(0)))
    for required in ("kind", "by", "scene", "body"):
        if required not in fields:
            raise SystemExit(f"FAIL: §11's documented keypoint has no {required!r}")
    if "status" in fields:
        raise SystemExit("FAIL: §11 now documents a status on a keypoint — schema and code disagree")
    return fields


def story_with(tmp: Path, name: str, annotation: dict) -> Path:
    story = tmp / name
    shutil.copytree(EXAMPLE, story)
    chapters = (story / "canon" / "chapters.yaml").read_text()
    scene_id = "ch.01-the-arrival"
    if scene_id not in chapters:
        first = [ln for ln in chapters.splitlines() if ln.strip().startswith("- id:")]
        scene_id = first[0].split("- id:")[1].strip() if first else scene_id
    d = story / "prose" / "ch-01"
    d.mkdir(parents=True, exist_ok=True)
    (d / "scene-01.md").write_text(SCENE.replace("ch.01-the-arrival", scene_id))
    ann = story / "annotations"
    ann.mkdir(exist_ok=True)
    (ann / "note-001.yaml").write_text(json.dumps(annotation))   # JSON is valid YAML
    return story


def run(story: Path) -> subprocess.CompletedProcess:
    return subprocess.run([PY, str(ROOT / "tools" / "validate.py"), str(story)],
                          capture_output=True, text=True)


failures = 0


def expect(cond: bool, msg: str) -> None:
    global failures
    if not cond:
        failures += 1
        print(f"FAIL: {msg}", file=sys.stderr)


def main() -> int:
    doc = documented_keypoint_fields()

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # 1. The shape the skill documents, on disk as §11 says to write it.
        documented = {
            "id": "note.001",
            "anchor": {"scene": "sc.01-1", "paragraph": doc["paragraph"], "quote": doc["quote"]},
            "body": doc["body"],
            "kind": doc["kind"],
            "by": doc["by"],
            "created_at": "2026-08-20",
        }
        r = run(story_with(tmp, "documented", documented))
        expect(r.returncode == 0,
               f"a keypoint written as arc-canon SKILL.md §11 instructs must validate:\n{r.stdout}{r.stderr}")

        # 2. The shape the running backend actually writes. createAnnotation
        #    builds {id, anchor, body, kind, by, created_at} and deliberately
        #    omits status — mirrored here field for field.
        from_backend = {
            "id": "note.001",
            "anchor": {"scene": "sc.01-1", "paragraph": 4, "quote": "the paragraph's own text"},
            "body": "what this passage must get across",
            "kind": "keypoint",
            "by": "agent",
            "created_at": "2026-08-20",
        }
        r = run(story_with(tmp, "from-backend", from_backend))
        expect(r.returncode == 0,
               f"the keypoint arc-backend writes must validate:\n{r.stdout}{r.stderr}")

        # 3. A keypoint anchored to a whole scene — §11 prefers a paragraph,
        #    but A36-1 made the scene-only anchor legal and the two must compose.
        scene_kp = {
            "id": "note.001",
            "anchor": {"scene": "sc.01-1"},
            "body": "this scene must land the boat before the storm",
            "kind": "keypoint",
            "by": "agent",
        }
        r = run(story_with(tmp, "scene-keypoint", scene_kp))
        expect(r.returncode == 0, f"a scene-scoped keypoint must validate:\n{r.stdout}{r.stderr}")

        # ---- negatives: the rules still bite -----------------------------

        # 4. A plain note still owes a status.
        no_status = {"id": "note.001", "anchor": {"scene": "sc.01-1", "paragraph": 0, "quote": "The lamp"},
                     "body": "this reads long"}
        r = run(story_with(tmp, "note-without-status", no_status))
        expect(r.returncode != 0, "a note with no status must still be refused")

        # 5. A keypoint with a status is refused: a marker that acquired a
        #    lifecycle has drifted into being a task, which is the confusion
        #    the two kinds exist to prevent.
        kp_status = dict(from_backend, status="open")
        r = run(story_with(tmp, "keypoint-with-status", kp_status))
        expect(r.returncode != 0, "a keypoint carrying a status must be refused")

        # 6. The enums are closed.
        bad_kind = dict(from_backend, kind="marker")
        r = run(story_with(tmp, "bad-kind", bad_kind))
        expect(r.returncode != 0, "an unknown kind must be refused")
        bad_by = dict(from_backend, by="robot")
        r = run(story_with(tmp, "bad-by", bad_by))
        expect(r.returncode != 0, "an unknown author must be refused")

    if failures:
        print(f"{failures} FAILURES", file=sys.stderr)
        return 1
    print("keypoint shape: the documented keypoint, the backend's keypoint, and a scene-scoped "
          "keypoint all validate; notes still owe a status and keypoints still refuse one")
    return 0


if __name__ == "__main__":
    sys.exit(main())
