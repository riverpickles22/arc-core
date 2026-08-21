#!/usr/bin/env python3
"""Create a conforming arc story from a spec of the author's answers.

    new-story.py --into <parent> [--spec <file>|-] [--dry-run] [--force]

The division of labour is the point (A34-3): an agent conducts the interview
and fills the spec on the author's behalf; THIS tool derives everything
technical — ids, slugs, filenames, eras, containment, paths — and writes the
files deterministically. The invariants a hand-written story silently
violates live here, in one testable place, and story creation stays runnable
by someone who has never opened Claude Code: producing a spec is all it takes.

Two rules bind every emitter:

  DERIVED, NEVER ASKED. The spec carries story answers only. A spec field
  that is an arc-schema question (an id, a slug, an era, a status) is a bug
  in this tool, not a gap in the spec.

  THE MINIMUM THE ANSWERS JUSTIFY. Told about a fisherman, it may create the
  fisherman; it must not invent a wife, a town or a birthday because the
  schema has room for them. An absent field means the story does not say,
  which is a fact worth keeping.

It is atomic: the story is built in a temp directory beside the target,
self-validated with validate.py, and only then moved into place. A bug in an
emitter fails loudly; a run that dies halfway leaves nothing on disk.

YAML is rendered from line templates, never yaml.safe_dump: arc's canon is
comment-bearing, block-scalar and hand-shaped, and a dumper flattens it into
quoted one-liners and strips every teaching comment.

The output is deterministic — no timestamps, no randomness — so regenerating
from the same answers is byte-identical, which is what makes the preview an
honest preview rather than a one-way door.
"""
import argparse
import json
import re
import shutil
import stat
import subprocess
import sys
import textwrap
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"

# Must match validate.py's ARC_FORMAT; test_new_story.py asserts the two
# constants agree so they cannot drift apart silently.
ARC_FORMAT = 1


def fail(msg: str) -> "sys.NoReturn":
    sys.exit(f"new-story: {msg}")


# ---------------------------------------------------------------- naming ----

def slugify(name: str) -> str:
    """Deterministic title-to-slug: accents folded, punctuation to hyphens.

    A name that normalises to nothing usable is refused by the caller with a
    request for a workable one — never guessed at.
    """
    ascii_ = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-")


def slug_or_fail(name: str, what: str) -> str:
    s = slugify(name)
    if not s:
        fail(f"{what} {name!r} normalises to nothing usable as a slug — "
             "please give a name with at least one latin letter or digit")
    return s


# ----------------------------------------------------------------- dates ----

DATE_RE = re.compile(r"^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$")


def year_of(d: str) -> int:
    m = DATE_RE.match(str(d))
    if not m:
        fail(f"date {d!r} is not ISO (YYYY, YYYY-MM or YYYY-MM-DD)")
    return int(m.group(1))


def day_before(d: str) -> str:
    """The last day before an ISO date of any precision — the backstory era's
    end, so the two eras partition time instead of overlapping."""
    m = DATE_RE.match(str(d))
    if not m:
        fail(f"date {d!r} is not ISO (YYYY, YYYY-MM or YYYY-MM-DD)")
    y, mo, da = int(m.group(1)), m.group(2), m.group(3)
    if mo is None:                       # "1927" -> "1926-12-31"
        return f"{y - 1}-12-31"
    if da is None:                       # "1927-11" -> "1927-10-31"
        from calendar import monthrange
        pm, py = (int(mo) - 1, y) if int(mo) > 1 else (12, y - 1)
        return f"{py}-{pm:02d}-{monthrange(py, pm)[1]:02d}"
    from datetime import date, timedelta
    prev = date(y, int(mo), int(da)) - timedelta(days=1)
    return prev.isoformat()


# ------------------------------------------------------------- rendering ----

def scalar(v: str) -> str:
    """A YAML plain scalar where safe, JSON-quoted where not. JSON strings
    are valid YAML, so quoting never changes what a loader reads."""
    s = str(v)
    if re.match(r"^[A-Za-z0-9][A-Za-z0-9 .,'’&()/-]*$", s) and not s.endswith((" ", ".")):
        return s
    return json.dumps(s, ensure_ascii=False)


def qdate(v: str) -> str:
    """Dates are always quoted so "1927" stays a string, never an int."""
    return f'"{v}"'


def block(key: str, text: str, indent: int = 0) -> list[str]:
    """`key: >` folded block, wrapped the way the worked example wraps."""
    pad = " " * indent
    body = " ".join(str(text).split())
    lines = textwrap.wrap(body, width=max(30, 78 - indent - 2)) or [""]
    return [f"{pad}{key}: >"] + [f"{pad}  {ln}" for ln in lines]


def render_story(spec: dict, slug: str, char_id: str) -> str:
    lines = [
        "# The arc story format this story is written against (STORY-FORMAT.md).",
        f"arc_format: {ARC_FORMAT}",
        f"slug: {slug}",
        f"title: {scalar(spec['title'])}",
        *block("logline", spec["logline"]),
    ]
    if spec.get("genre"):
        lines.append(f"genre: {scalar(spec['genre'])}")
    if spec.get("setting"):
        lines.append(f"setting: {scalar(spec['setting'])}")
    lines.append("status: material")
    lines.append(f"protagonists: [{char_id}]")
    themes = spec.get("themes") or []
    if themes:
        lines.append("themes:")
        lines += [f"  - {scalar(t)}" for t in themes]
    else:
        # Required by the schema; an empty list is the honest value — the
        # story does not say yet, and inventing a theme would say it does.
        lines.append("themes: []")
    if spec.get("pov"):
        lines += block("pov", spec["pov"])
    return "\n".join(lines) + "\n"


def backstory_span(spec: dict) -> tuple[str, str] | None:
    """The off-page era's span, derived by construction: from backstory_start
    when given, else from a birth date that precedes the story — the trap
    example-story's era.before-the-point documents."""
    period = spec["period"]
    start = period.get("backstory_start")
    born = (spec.get("protagonist") or {}).get("born")
    if not start and born and year_of(born) < year_of(period["start"]):
        start = str(born)
    if not start:
        return None
    return (str(start), day_before(str(period["start"])))


def render_timeline(spec: dict, era_id: str) -> str:
    period = spec["period"]
    era_name = period.get("name") or spec["title"]
    lines = [
        "# Eras partition story-time; every timeref anchors to one. Anchors are",
        "# named instants other records can point at instead of repeating a date.",
        "eras:",
    ]
    back = backstory_span(spec)
    if back:
        lines += [
            "  - id: era.backstory",
            "    name: Before the story (entirely off-page)",
            f"    span: {{ start: {qdate(back[0])}, end: {qdate(back[1])} }}",
            *block("notes", "Nothing here is dramatized. The era exists so that birth "
                            "dates and other backstory timerefs have a valid era to "
                            "anchor to; without it the validator rejects them as "
                            "preceding the timeline.", 4),
        ]
    lines += [
        f"  - id: {era_id}",
        f"    name: {scalar(era_name)}",
        f"    span: {{ start: {qdate(period['start'])}, end: {qdate(period['end'])} }}",
    ]
    return "\n".join(lines) + "\n"


def render_relationships() -> str:
    return "\n".join([
        "# Objective edges between entities. Perception — how one entity *sees*",
        "# another at a given moment — is subjective and lives in each entity's",
        "# states, not here. The key is required even while it is empty.",
        "relationships: []",
    ]) + "\n"


def render_character(spec: dict, char_id: str, era_id: str, place_id: str | None) -> str:
    p = spec["protagonist"]
    lines = [
        f"id: {char_id}",
        "type: character",
        f"name: {scalar(p['name'])}",
        f"species: {scalar(p.get('species') or 'human')}",
        # The spec is the author's approved answers; the scaffold transcribes
        # them, it does not propose them (the interview's preview is the
        # approval). Machine INFERENCE still defaults proposed everywhere.
        "status: canon",
    ]
    if p.get("born"):
        born_era = "era.backstory" if year_of(p["born"]) < year_of(spec["period"]["start"]) else era_id
        lines.append(f"born: {{ era: {born_era}, date: {qdate(p['born'])} }}")
    lines += block("summary", p["summary"])
    lines.append("tags: [protagonist]")
    lines.append("states:")
    lines.append(f"  - at: {{ era: {era_id}, date: {qdate(spec['period']['start'])} }}")
    if place_id:
        # "Where the story opens" plus "what is true of them at the start"
        # justifies placing them there at the start — a derivation, not an
        # invention.
        lines.append(f"    location: {place_id}")
    if p.get("at_start"):
        lines += block("condition", p["at_start"], 4)
    return "\n".join(lines) + "\n"


def render_place(spec: dict, place_id: str) -> str:
    pl = spec["place"]
    lines = [
        f"id: {place_id}",
        "type: place",
        f"name: {scalar(pl['name'])}",
        f"kind: {pl['kind']}",
        "status: canon",
    ]
    if isinstance(pl.get("real"), bool):
        lines.append(f"real: {'true' if pl['real'] else 'false'}")
    if pl.get("coordinates"):
        c = pl["coordinates"]
        lines.append(f"coordinates: {{ lat: {c['lat']}, lon: {c['lon']} }}")
    lines += block("summary", pl["summary"])
    return "\n".join(lines) + "\n"


def render_article(entity_id: str, name: str, canon_rel: str, summary: str) -> str:
    """A docs article per entity — the article-coverage rule 503s the API
    without one. Overview is the author's own summary: content, never a
    placeholder."""
    return "\n".join([
        "---",
        f"canon: {entity_id}",
        "---",
        f"# {name}",
        "",
        f"> Canonical data: `{canon_rel}` — YAML wins on conflict.",
        "",
        "## Overview",
        " ".join(str(summary).split()),
    ]) + "\n"


def from_template(name: str, title: str) -> str:
    """A template with its one marker filled. Refuses to emit any OTHER
    marker: placeholder content in a real story is a bug here, not a chore
    for the author."""
    text = (TEMPLATES / name).read_text()
    text = text.replace("<Story Title>", title)
    leftover = re.findall(r"^.*<[A-Z][^>]*>.*$", text, re.M)
    if leftover:
        fail(f"template {name} carries a marker this tool cannot fill: {leftover[0].strip()!r}")
    return text


# ----------------------------------------------------------------- build ----

def check_spec(spec: dict) -> None:
    """The story-shaped requirements, checked with legible messages. The
    JSON Schema is the contract; these checks exist so a hand-written spec
    fails with a sentence instead of a schema path."""
    if not isinstance(spec, dict):
        fail("the spec must be a YAML mapping of answers")
    for key in ("title", "logline", "period", "protagonist"):
        if not spec.get(key):
            fail(f"the spec is missing {key!r} — title, logline, period and protagonist are the minimum interview")
    for key in ("start", "end"):
        if not spec["period"].get(key):
            fail(f"period.{key} is required — when does the story happen?")
    for key in ("name", "summary"):
        if not spec["protagonist"].get(key):
            fail(f"protagonist.{key} is required — who does the story start with?")
    if spec.get("place"):
        for key, ask in (("name", "what is the place called?"),
                         ("kind", "an agent picks the kind from the author's words"),
                         ("summary", "say a sentence about it, or omit the place")):
            if not spec["place"].get(key):
                fail(f"place.{key} is required when a place is given — {ask}")
    year_of(spec["period"]["start"]); year_of(spec["period"]["end"])
    if spec["protagonist"].get("born"):
        year_of(spec["protagonist"]["born"])


def emit(spec: dict) -> dict[str, str | tuple[str, int]]:
    """spec -> {relative path: content}. Pure and deterministic — the whole
    of criterion 11 (regeneration is byte-identical) rests on that."""
    check_spec(spec)
    title = str(spec["title"])
    slug = slug_or_fail(title, "title")
    char_slug = slug_or_fail(spec["protagonist"]["name"], "protagonist name")
    era_id = f"era.{slug_or_fail(spec['period'].get('name') or title, 'era name')}"

    place_id = None
    place_slug = None
    if spec.get("place"):
        place_slug = slug_or_fail(spec["place"]["name"], "place name")
        if place_slug == char_slug:
            # Two entities normalising to one slug are told apart, never
            # silently merged: the place carries its kind as a suffix.
            place_slug = f"{place_slug}-{slugify(str(spec['place']['kind']))}"
        place_id = f"place.{place_slug}"
    char_id = f"char.{char_slug}"

    files: dict[str, str | tuple[str, int]] = {
        "canon/story.yaml": render_story(spec, slug, char_id),
        "canon/timeline.yaml": render_timeline(spec, era_id),
        "canon/relationships.yaml": render_relationships(),
        f"canon/entities/characters/{char_slug}.yaml": render_character(spec, char_id, era_id, place_id),
        f"docs/entities/characters/{char_slug}.md": render_article(
            char_id, spec["protagonist"]["name"],
            f"canon/entities/characters/{char_slug}.yaml", spec["protagonist"]["summary"]),
        "README.md": from_template("README.md", title),
        "CLAUDE.md": from_template("CLAUDE.md", title),
        # Executable: the story's own gate, pointing at the shared validator.
        "bin/validate": ((TEMPLATES / "bin-validate.sh").read_text(), 0o755),
    }
    if place_id:
        files[f"canon/entities/places/{place_slug}.yaml"] = render_place(spec, place_id)
        files[f"docs/entities/places/{place_slug}.md"] = render_article(
            place_id, spec["place"]["name"],
            f"canon/entities/places/{place_slug}.yaml", spec["place"]["summary"])
    # Deliberately absent: view.yaml, assets/, .claude/settings.json (per-
    # machine, generated by hooks/install-hooks.mjs), docs/style.md (a
    # skeleton of unfilled markers is placeholder content; the contract grows
    # by extraction once there is prose to extract from), vision/world (the
    # author has not said).
    return files


def write_tree(base: Path, files: dict) -> None:
    for rel, content in sorted(files.items()):
        text, mode = content if isinstance(content, tuple) else (content, None)
        p = base / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        if mode:
            p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--into", required=True, help="parent directory; the story lands at <into>/<slug>")
    ap.add_argument("--spec", default="-", help="spec YAML file, or - for stdin (default)")
    ap.add_argument("--dry-run", action="store_true", help="print the tree and every file; write nothing")
    ap.add_argument("--force", action="store_true",
                    help="replace a non-empty target — refused anyway if it holds a canon/ directory")
    args = ap.parse_args()

    try:
        import yaml
    except ImportError:
        fail("pyyaml is required — install arc-core's requirements (pip install -r requirements.txt)")

    raw = sys.stdin.read() if args.spec == "-" else Path(args.spec).read_text()
    spec = yaml.safe_load(raw)
    files = emit(spec)
    slug = slug_or_fail(str(spec["title"]), "title")

    if args.dry_run:
        print(f"{slug}/  (dry run — nothing written)")
        for rel in sorted(files):
            print(f"  {rel}")
        for rel in sorted(files):
            content = files[rel][0] if isinstance(files[rel], tuple) else files[rel]
            print(f"\n===== {rel} =====\n{content}", end="")
        return 0

    parent = Path(args.into).resolve()
    if not parent.is_dir():
        fail(f"--into {parent} is not a directory")
    target = parent / slug

    # NEVER OVERWRITE AN EXISTING STORY ACCIDENTALLY — the invariant the rest
    # of the tool hangs off. A canon/ directory means someone's story, and no
    # flag reaches past that.
    if target.exists() and any(target.iterdir()):
        if (target / "canon").exists():
            fail(f"{target} contains a canon/ directory — that is a story, and no flag overwrites one")
        if not args.force:
            fail(f"{target} exists and is not empty — remove it, or pass --force if it is scratch")

    # Atomic: build beside the target, self-validate, then move into place.
    tmp = parent / f".new-story-{slug}.tmp"
    if tmp.exists():
        shutil.rmtree(tmp)
    try:
        write_tree(tmp, files)
        check = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "validate.py"), str(tmp)],
            capture_output=True, text=True)
        if check.returncode != 0:
            sys.stderr.write(check.stdout + check.stderr)
            fail("the generated story failed its own validation — nothing was created "
                 "(this is a bug in new-story.py, not in your answers)")
        if target.exists():
            shutil.rmtree(target)         # empty, or --force on scratch: checked above
        tmp.rename(target)
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)

    print(f"created {target}")
    print(f"  validate:  {target / 'bin' / 'validate'}")
    print(f"  {check.stdout.strip().splitlines()[-1] if check.stdout.strip() else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
