#!/usr/bin/env python3
"""arc canon validator.

Usage: python3 tools/validate.py [--skip-schema] <path-to-story>

The schema-conformance pass requires the jsonschema package; without it the
validator fails loudly rather than passing silently. --skip-schema runs the
other checks without it — and says so in the output.

The story may live anywhere — its own repo, a sibling checkout, a subdirectory
of this one. Only the schemas are resolved relative to arc-core.

Checks, per conventions.md §8:
  1. Every canon YAML parses and conforms to its JSON Schema.
  2. Referential integrity: every referenced ID (entities, events, eras,
     timepoints, relationships) resolves to a defined ID.
  3. Every wikilink [[id]] / [[id|label]] in docs resolves.
  4. Every docs entity article's `canon:` frontmatter resolves, and every
     entity has an article.
  5. Every timeref's date falls inside its declared era's span.
  6. Every grounding slug resolves to research/topics/<slug>.md.
  7. Every [@citation-key] in research topics resolves in sources.yaml.

Exit 0 = clean, 1 = findings.
"""
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pyyaml required: pip install pyyaml")

try:
    import jsonschema
    from referencing import Registry, Resource
    HAVE_JSONSCHEMA = True
except ImportError:
    HAVE_JSONSCHEMA = False

CORE = Path(__file__).resolve().parent.parent
SCHEMA_DIR = CORE / "schema"

ID_RE = re.compile(r"^[a-z]+\.[a-z0-9-]+(\.[a-z0-9-]+)*$")
WIKILINK_RE = re.compile(r"\[\[([a-z]+\.[a-z0-9.-]+)(?:\|[^\]]*)?\]\]")
CITE_RE = re.compile(r"\[@([a-z0-9-]+)\]")
ID_FIELD_RE = re.compile(
    r"^(char|place|faction|obj|event|era|tp|rel|ch)\.[a-z0-9-]+(\.[a-z0-9-]+)*$"
)

# The format version this arc-core speaks. A story declares its own in
# canon/story.yaml as `arc_format:`; see STORY-FORMAT.md. The schemas are
# additionalProperties: false, so adding a field is a breaking change for
# every story that lacks it — this integer is the only thing that lets arc
# tell "written before that field existed" from "wrong".
#
# It is a bare integer on purpose. A story either conforms to a format or it
# does not; minor and patch numbers on a data format invite distinctions
# nobody enforces.
ARC_FORMAT = 1

# The canon files a story cannot omit (conventions §9). Everything else under
# canon/ is optional; these three are read unconditionally by export-canon.py,
# so a story without them parses fine here and then 500s the viewer.
REQUIRED_CANON = (
    ("story.yaml", "the story manifest — slug, title, logline, protagonists"),
    ("timeline.yaml", "at least one era; every timeref anchors to one"),
    ("relationships.yaml", "a relationships: key, which may be empty"),
)

findings = []
warnings = []


def flag(path, msg):
    findings.append(f"{path}: {msg}")


def warn(path, msg):
    """Something the author should know that does not make the story invalid.
    Warnings are reported and never change the exit code — a check that should
    block a commit is a finding, and calling it a warning is how a rule quietly
    stops being one."""
    warnings.append(f"{path}: {msg}")


def load_yaml(path):
    try:
        return yaml.safe_load(path.read_text())
    except yaml.YAMLError as e:
        flag(path, f"YAML parse error: {e}")
        return None


def schema_for(path, story_dir):
    # Unknown locations return None so the caller reports "no schema mapping"
    # — a story that invents canon/entities/dragons/ gets told so, rather than
    # taking the validator down with it.
    rel = path.relative_to(story_dir / "canon")
    parts = rel.parts
    if parts[0] == "entities":
        sub = parts[1] if len(parts) > 1 else ""
        return {"characters": "character", "places": "place",
                "factions": "faction", "objects": "object"}.get(sub)
    if parts[0] == "events":
        return "event"
    return {"relationships.yaml": "relationship", "timeline.yaml": "timeline",
            "story.yaml": "story", "chapters.yaml": "chapters",
            "themes.yaml": "themes"}.get(parts[0])


def date_key(d):
    """'1959' -> (1959,1,1) for containment lower-bound comparisons."""
    parts = [int(p) for p in d.split("-")]
    return tuple(parts + [1] * (3 - len(parts)))


def date_key_end(d):
    parts = [int(p) for p in d.split("-")]
    return tuple(parts + [12, 31][len(parts) - 1:] if len(parts) < 3 else parts)


def ids_in(data, key):
    """The ids of a collection file's members. A member that is malformed or
    unnamed is the schema pass's finding to report, not this pass's to die on
    — which matters most under --skip-schema, where nothing else looks."""
    return [item["id"] for item in (data.get(key) or [])
            if isinstance(item, dict) and "id" in item]


def extract_span_date(v):
    """span start/end may be a bare date string or a dict with date/era."""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        return v.get("date")
    return None


def walk_ids(node, path, collect):
    """Collect every string that looks like an arc ID anywhere in the doc."""
    if isinstance(node, dict):
        for k, v in node.items():
            walk_ids(v, path, collect)
    elif isinstance(node, list):
        for v in node:
            walk_ids(v, path, collect)
    elif isinstance(node, str) and ID_FIELD_RE.match(node):
        collect.append(node)


def main():
    args = sys.argv[1:]
    skip_schema = "--skip-schema" in args
    args = [a for a in args if a != "--skip-schema"]
    if len(args) != 1:
        sys.exit(__doc__)
    if not HAVE_JSONSCHEMA and not skip_schema:
        sys.exit("FAIL — the schema pass needs the jsonschema package, which is not installed.\n"
                 "  install it:            pip install jsonschema referencing\n"
                 "  or skip schema checks: validate.py --skip-schema <path-to-story>")
    use_schema = HAVE_JSONSCHEMA and not skip_schema
    story_dir = Path(args[0]).resolve()
    if not (story_dir / "canon").is_dir():
        sys.exit(f"not a story directory (no canon/): {story_dir}")
    canon_dir = story_dir / "canon"
    docs_dir = story_dir / "docs"
    research_dir = story_dir / "research"

    # --- pass 0: the three files every story owes
    #
    # An app cannot load a story without these — export-canon.py reads all
    # three unconditionally — so their absence is a finding here rather than a
    # traceback later. Reported per file, naming what the file is for, because
    # this is the first thing a brand-new story gets wrong.
    for name, why in REQUIRED_CANON:
        if not (canon_dir / name).exists():
            flag(canon_dir / name, f"missing — every story needs canon/{name} ({why})")

    # --- which format does this story expect?
    #
    # Asked before anything else is read, because the answer decides whether
    # the rest of this run means anything. A story from the future is the case
    # that must not pass quietly: arc would check it against the wrong contract
    # and report either false findings or false silence, and both are worse
    # than being told to upgrade.
    story_file = canon_dir / "story.yaml"
    if story_file.exists():
        declared = (load_yaml(story_file) or {}).get("arc_format")
        if declared is None:
            warn(story_file,
                 f"declares no arc_format — read as format {ARC_FORMAT}. Add "
                 f"`arc_format: {ARC_FORMAT}` so a future arc knows which contract this story expects")
        elif isinstance(declared, int) and declared > ARC_FORMAT:
            flag(story_file,
                 f"declares arc_format {declared}, but this arc-core speaks {ARC_FORMAT} — "
                 f"it cannot check a story written against a newer contract. Update arc-core")
        elif isinstance(declared, int) and declared < ARC_FORMAT:
            warn(story_file,
                 f"declares arc_format {declared}; this arc-core speaks {ARC_FORMAT}. "
                 f"Still readable — see STORY-FORMAT.md for what changed")

    # --- load schemas
    registry = None
    schemas = {}
    if use_schema:
        resources = []
        for sf in SCHEMA_DIR.glob("*.schema.json"):
            data = json.loads(sf.read_text())
            schemas[sf.stem.replace(".schema", "")] = data
            resources.append((data["$id"], Resource.from_contents(data)))
            resources.append((sf.name, Resource.from_contents(data)))
        registry = Registry().with_resources(resources)

    # --- pass 1: parse all canon, collect defined IDs
    defined = {}
    docs_of = {}   # entity id -> canon file (for article coverage check)
    canon_files = sorted(canon_dir.rglob("*.yaml"))
    for f in canon_files:
        data = load_yaml(f)
        if data is None:
            continue
        name = schema_for(f, story_dir)
        if name is None:
            flag(f, "no schema mapping for this file location")
            continue
        # schema validation
        if use_schema and name in schemas:
            validator = jsonschema.Draft202012Validator(schemas[name], registry=registry)
            for err in validator.iter_errors(data):
                flag(f, f"schema: {'/'.join(str(p) for p in err.path)}: {err.message[:200]}")
        # defined IDs
        if name in ("character", "place", "faction", "object", "event"):
            if "id" in data:
                defined[data["id"]] = f
                if name != "event":
                    docs_of[data["id"]] = f
        elif name == "timeline":
            for eid in ids_in(data, "eras") + ids_in(data, "anchors"):
                defined[eid] = f
        elif name == "relationship":
            for rid in ids_in(data, "relationships"):
                defined[rid] = f
        elif name == "chapters":
            for cid in ids_in(data, "chapters"):
                defined[cid] = f
        elif name == "themes":
            for tid in ids_in(data, "themes"):
                defined[tid] = f

    # --- timeline spans for era containment
    # Absence is already reported by pass 0; read it only if it is there, so a
    # story missing its timeline gets that finding rather than a traceback.
    tl_file = canon_dir / "timeline.yaml"
    timeline = (load_yaml(tl_file) if tl_file.exists() else None) or {}
    era_spans = {}
    for era in timeline.get("eras", []):
        if not isinstance(era, dict) or "id" not in era:
            continue          # the schema pass reports the shape; don't crash on it
        s = extract_span_date((era.get("span") or {}).get("start"))
        e = extract_span_date((era.get("span") or {}).get("end"))
        era_spans[era["id"]] = (date_key(s) if s else None,
                                date_key_end(e) if e else None)

    # --- pass 2: referential integrity + era containment
    def check_timerefs(node, f):
        if isinstance(node, dict):
            if "era" in node and isinstance(node.get("era"), str) and node["era"].startswith("era."):
                era = node["era"]
                d = node.get("date")
                if era in era_spans and d:
                    lo, hi = era_spans[era]
                    if lo and date_key_end(d) < lo:
                        flag(f, f"timeref {d} precedes era {era} start")
                    if hi and date_key(d) > hi:
                        flag(f, f"timeref {d} exceeds era {era} end")
            for v in node.values():
                check_timerefs(v, f)
        elif isinstance(node, list):
            for v in node:
                check_timerefs(v, f)

    research_topics = {p.stem for p in (research_dir / "topics").glob("*.md")} \
        if (research_dir / "topics").is_dir() else set()

    # Source keys (research/sources.yaml) — consumed here by the provenance
    # check and again by pass 4's citation check.
    src_file = research_dir / "sources.yaml"
    source_keys = set()
    if src_file.exists():
        src = load_yaml(src_file) or {}
        source_keys = {s["key"] for s in src.get("sources", [])}

    for f in canon_files:
        data = load_yaml(f)
        if data is None:
            continue
        refs = []
        walk_ids(data, f, refs)
        for r in refs:
            if r not in defined:
                flag(f, f"unresolved ID reference: {r}")
        check_timerefs(data, f)
        # grounding slugs
        def check_grounding(node):
            if isinstance(node, dict):
                for slug in node.get("grounding", []) or []:
                    if slug not in research_topics:
                        flag(f, f"grounding topic not found: {slug}")
                for v in node.values():
                    check_grounding(v)
            elif isinstance(node, list):
                for v in node:
                    check_grounding(v)
        check_grounding(data)
        # provenance registers (conventions §13): historical needs sources,
        # inferred needs confidence, and every source key must resolve —
        # a cited history that cites nothing is the trust hole this closes.
        def check_provenance(node):
            if isinstance(node, dict):
                p = node.get("provenance")
                if isinstance(p, dict):
                    rid = node.get("id", "?")
                    reg = p.get("register")
                    if reg == "historical" and not p.get("sources"):
                        flag(f, f"{rid}: historical provenance requires sources")
                    if reg == "inferred" and not p.get("confidence"):
                        flag(f, f"{rid}: inferred provenance requires confidence")
                    for k in p.get("sources") or []:
                        if not src_file.exists():
                            flag(f, f"{rid}: provenance cites {k} but research/sources.yaml does not exist")
                        elif k not in source_keys:
                            flag(f, f"{rid}: provenance source not in sources.yaml: {k}")
                for v in node.values():
                    check_provenance(v)
            elif isinstance(node, list):
                for v in node:
                    check_provenance(v)
        check_provenance(data)

    # --- pass 3: docs — wikilinks + frontmatter binding + coverage
    articles = {}
    for f in sorted(docs_dir.rglob("*.md")):
        text = f.read_text()
        for m in WIKILINK_RE.finditer(text):
            if m.group(1) not in defined:
                flag(f, f"unresolved wikilink: [[{m.group(1)}]]")
        fm = re.match(r"^---\n(.*?)\n---\n", text, re.S)
        if fm:
            meta = yaml.safe_load(fm.group(1)) or {}
            cid = meta.get("canon")
            if cid:
                if cid not in defined:
                    flag(f, f"frontmatter canon id unresolved: {cid}")
                else:
                    articles[cid] = f
    for eid in docs_of:
        if eid not in articles:
            flag(docs_of[eid], f"entity {eid} has no docs article")

    # Material ids, collected before the prose pass: a scene's contract may
    # declare which obligations it discharges, and those are mat.* ids — never
    # canon ids, so they can't resolve against `defined`.
    material_dir = story_dir / "material"
    material_items = {}
    if material_dir.is_dir():
        for f in sorted(material_dir.glob("*.yaml")):
            item = load_yaml(f) or {}
            if item.get("id"):
                material_items[item["id"]] = (f, item)

    # --- pass 3.5: prose — scene frontmatter binding (conventions §10)
    prose_dir = story_dir / "prose"
    scene_ids = set()
    if prose_dir.is_dir():
        for f in sorted(prose_dir.rglob("*.md")):
            text = f.read_text()
            fm = re.match(r"^---\n(.*?)\n---\n", text, re.S)
            if not fm:
                continue   # READMEs and unbound drafts are allowed
            meta = yaml.safe_load(fm.group(1)) or {}
            if "scene" not in meta:
                continue
            if use_schema and "scene" in schemas:
                validator = jsonschema.Draft202012Validator(schemas["scene"], registry=registry)
                for err in validator.iter_errors(meta):
                    flag(f, f"scene frontmatter: {'/'.join(str(p) for p in err.path)}: {err.message[:200]}")
            sid = meta.get("scene")
            if sid in scene_ids:
                flag(f, f"duplicate scene id {sid}")
            scene_ids.add(sid)
            contract = meta.get("contract") or {}
            contract_wants = contract.get("wants") or {}
            for ref in [meta.get("chapter"), meta.get("pov"),
                        *(meta.get("events") or []), *(meta.get("facts") or []),
                        *contract_wants.keys()]:
                if ref and ref not in defined:
                    flag(f, f"scene {sid}: unresolved binding id: {ref}")
            for ref in contract.get("satisfies") or []:
                if ref not in material_items:
                    flag(f, f"scene {sid}: satisfies names unknown material: {ref}")

    # --- pass 3.75: story material (conventions §12) — the unplaced layer.
    # Only the linkage is validated: related ids and window/placement must
    # resolve. Everything else stays as vague as the author left it.
    if material_items:
        for f, item in material_items.values():
            if use_schema and "material" in schemas:
                validator = jsonschema.Draft202012Validator(schemas["material"], registry=registry)
                for err in validator.iter_errors(item):
                    flag(f, f"material: {'/'.join(str(p) for p in err.path)}: {err.message[:200]}")
            for ref in item.get("related") or []:
                if ref not in defined:
                    flag(f, f"material {item.get('id')}: unresolved related id: {ref}")
            win = item.get("window") or {}
            for edge in ("from", "to"):
                ch = win.get(edge)
                if ch and ch not in defined:
                    flag(f, f"material {item.get('id')}: window.{edge} names unknown chapter: {ch}")
            placed = item.get("placed_in")
            if placed and placed not in defined and not placed.startswith("sc."):
                flag(f, f"material {item.get('id')}: placed_in does not resolve: {placed}")
            # What discharges an obligation may be canon, another material item,
            # or a scene. A scene id that isn't written yet is the normal state
            # of an obligation in progress, so it resolves loosely — only an id
            # of no recognizable shape is an error.
            for ref in item.get("satisfied_by") or []:
                if ref in defined or ref in material_items or ref in scene_ids:
                    continue
                if ref.startswith("sc."):
                    continue   # a scene the author intends but hasn't drafted
                flag(f, f"material {item.get('id')}: satisfied_by does not resolve: {ref}")

    # --- pass 3.9: annotations (conventions §14) — thoughts anchored to prose.
    # Only the scene reference is validated. An anchor whose QUOTE has moved
    # or vanished is not a build failure: prose moves, and reporting where a
    # note now sits is the reports' business, not the validator's.
    ann_dir = story_dir / "annotations"
    if ann_dir.is_dir():
        for f in sorted(ann_dir.glob("*.yaml")):
            item = load_yaml(f) or {}
            if use_schema and "annotation" in schemas:
                validator = jsonschema.Draft202012Validator(schemas["annotation"], registry=registry)
                for err in validator.iter_errors(item):
                    flag(f, f"annotation: {'/'.join(str(p) for p in err.path)}: {err.message[:200]}")
            scene = (item.get("anchor") or {}).get("scene")
            if scene and scene not in scene_ids:
                flag(f, f"annotation {item.get('id')}: anchor names unknown scene: {scene}")
            for ref in item.get("links") or []:
                if ref not in defined and ref not in material_items and not ref.startswith("sc."):
                    flag(f, f"annotation {item.get('id')}: link does not resolve: {ref}")

    # --- pass 4: research citations
    if src_file.exists():
        for f in sorted((research_dir / "topics").glob("*.md")):
            for m in CITE_RE.finditer(f.read_text()):
                if m.group(1) not in source_keys:
                    flag(f, f"citation key not in sources.yaml: [@{m.group(1)}]")

    # --- report
    if not use_schema:
        print("⚠ schema pass SKIPPED (--skip-schema) — schema conformance was NOT checked")
    for x in warnings:
        print(f"⚠ {x}")
    if findings:
        print(f"FAIL — {len(findings)} finding(s):")
        for x in findings:
            print(f"  {x}")
        sys.exit(1)
    n_entities = len(docs_of)
    n_events = sum(1 for i in defined if i.startswith('event.'))
    print(f"OK — {len(canon_files)} canon files, {n_entities} entities, "
          f"{n_events} events, {len(defined)} IDs, all checks passed")


if __name__ == "__main__":
    main()
