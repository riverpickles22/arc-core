#!/usr/bin/env python3
"""Holds validate.py's date_key/date_key_end to the shared date-ordering
vectors in graph/date-vectors.json — the same spec the TS canon-graph module
runs, so the rule at the heart of the temporal model cannot silently fork.

Usage: python3 tools/test_date_vectors.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate import date_key, date_key_end  # noqa: E402

SPEC = json.loads((Path(__file__).resolve().parent.parent / "graph" / "date-vectors.json").read_text())


def key(date, end):
    return date_key_end(date) if end else date_key(date)


def main():
    failures = 0
    for v in SPEC["vectors"]:
        got = key(v["date"], v["end"])
        want = (v["y"], v["m"], v["d"])
        if tuple(got) != want:
            failures += 1
            print(f"FAIL {'date_key_end' if v['end'] else 'date_key'}({v['date']!r}) = {got}, want {want}",
                  file=sys.stderr)
    for p in SPEC["orderings"]["pairs"]:
        ka = key(p["a"]["date"], p["a"]["end"])
        kb = key(p["before"]["date"], p["before"]["end"])
        if not ka < kb:
            failures += 1
            print(f"FAIL ordering: {p['a']} = {ka} not < {p['before']} = {kb}", file=sys.stderr)
    for p in SPEC["equalities"]["pairs"]:
        ka = key(p["a"]["date"], p["a"]["end"])
        kb = key(p["equals"]["date"], p["equals"]["end"])
        if not tuple(ka) == tuple(kb):
            failures += 1
            print(f"FAIL equality: {p['a']} = {ka} != {p['equals']} = {kb}", file=sys.stderr)
    # SPEC["eras"] is TS-only: era resolution lives in the graph layer.
    if failures:
        sys.exit(f"date vectors: {failures} failure(s)")
    print(f"date vectors: {len(SPEC['vectors'])} vectors + {len(SPEC['orderings']['pairs'])} orderings"
          f" + {len(SPEC['equalities']['pairs'])} equalities OK (Python date_key)")


if __name__ == "__main__":
    main()
