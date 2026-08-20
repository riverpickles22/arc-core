#!/usr/bin/env python3
"""Holds tools/sentences.py to the shared sentence vectors in
graph/sentence-vectors.json — the same spec graph/test-sentences.ts runs, so
the rule that decides where a sentence ends cannot silently fork between the
viewer that names a sentence and the server that acts on it.

Usage: python3 tools/test_sentence_vectors.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sentences import sentence_at, split_sentences  # noqa: E402

SPEC = json.loads(
    (Path(__file__).resolve().parent.parent / "graph" / "sentence-vectors.json").read_text()
)


def main():
    failures = 0

    for v in SPEC["splits"]:
        got = [s.text for s in split_sentences(v["paragraph"])]
        if got != v["sentences"]:
            failures += 1
            print(f"FAIL split ({v['why']})\n  paragraph: {v['paragraph']!r}\n"
                  f"  got:  {got!r}\n  want: {v['sentences']!r}", file=sys.stderr)
        rejoined = "".join(got)
        if rejoined != v["paragraph"]:
            failures += 1
            print(f"FAIL rejoin ({v['why']}): {rejoined!r} != {v['paragraph']!r}", file=sys.stderr)

    for v in SPEC["offsets"]:
        got = [[s.start, s.end] for s in split_sentences(v["paragraph"])]
        if got != v["spans"]:
            failures += 1
            print(f"FAIL offsets ({v['why']})\n  got:  {got!r}\n  want: {v['spans']!r}", file=sys.stderr)
        for s in split_sentences(v["paragraph"]):
            if v["paragraph"][s.start:s.end] != s.text:
                failures += 1
                print(f"FAIL offset/text disagreement at {s.start}..{s.end} "
                      f"in {v['paragraph']!r}", file=sys.stderr)

    p = "He shipped the oars. The swell ran heavy."
    for i in range(len(p)):
        idx = sentence_at(p, i)
        spans = split_sentences(p)
        if idx < 0 or not (spans[idx].start <= i < spans[idx].end):
            failures += 1
            print(f"FAIL sentence_at({i}) = {idx}, which does not contain offset {i}", file=sys.stderr)
    if sentence_at("", 0) != -1:
        failures += 1
        print("FAIL sentence_at on an empty paragraph should be -1", file=sys.stderr)

    if failures:
        print(f"{failures} FAILURES", file=sys.stderr)
        return 1
    print(f"sentence vectors: {len(SPEC['splits'])} splits + "
          f"{len(SPEC['offsets'])} offset cases OK (python)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
