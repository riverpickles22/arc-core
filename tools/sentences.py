"""THE sentence rule, Python side (graph/sentence-vectors.json).

The mirror of graph/sentences.ts. Two surfaces must agree on where a sentence
ends — the viewer, which knows which sentence was clicked, and the backend,
which applies the decision to the author's file — so the rule is specified once
and both languages are held to it by the shared vectors.

Worth stating plainly, as arc-core does elsewhere when a thing looks unused:
no Python caller needs this today. arc's backend is TypeScript, and validate.py
has no business splitting prose. It exists because a rule proven in one
language is a rule that can fork in the other, and the date rule earned that
lesson already. When a Python consumer arrives — a manuscript importer, a
prose-side check — the rule is here and is provably the same one.

THE BIAS: when unsure, do not split. An unsplit pair costs a coarser judgment;
a wrong split costs half a sentence landing in the author's book.
"""
from __future__ import annotations

import re
from typing import NamedTuple


class Sentence(NamedTuple):
    """The exact substring, plus where it came from."""
    text: str
    start: int
    end: int   # exclusive


# Words ending in a period without ending a sentence. Lowercased, no dot.
ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "st", "sr", "jr", "rev", "fr",
    "gen", "col", "capt", "lt", "sgt", "maj", "cpl", "adm",
    "mt", "ave", "blvd", "rd", "no", "vol", "pp", "ed",
    "inc", "ltd", "co", "corp", "dept", "univ",
    "etc", "vs", "al", "cf", "approx", "est",
}

CLOSERS = {'"', "'", ")", "]", "}", "”", "’", "»"}

_WORD_CHAR = re.compile(r"[A-Za-z.]")


def _at(text: str, i: int) -> str | None:
    return text[i] if 0 <= i < len(text) else None


def _is_digit(c: str | None) -> bool:
    return c is not None and c.isdigit() and c.isascii()


def _is_space(c: str | None) -> bool:
    return c is not None and c.isspace()


def _is_lower(c: str | None) -> bool:
    """A letter with a distinct upper form — used only to spot a speech tag."""
    return c is not None and c != c.upper() and c == c.lower()


def _word_before(text: str, i: int) -> str:
    j = i
    while j > 0 and _WORD_CHAR.match(text[j - 1]):
        j -= 1
    return text[j:i]


def _terminates_at(text: str, i: int) -> bool:
    c = text[i]

    # An ellipsis trails off; it does not terminate.
    if c == "." and (_at(text, i + 1) == "." or _at(text, i - 1) == "."):
        return False
    if _at(text, i - 1) == "…" or c == "…":
        return False

    if c == ".":
        # 3.14 — a period between digits is never a boundary.
        if _is_digit(_at(text, i - 1)) and _is_digit(_at(text, i + 1)):
            return False
        word = _word_before(text, i)
        # A single letter is an initial: J. R. R. Tolkien.
        if len(word) == 1 and word.isalpha():
            return False
        if word.lower().replace(".", "") in ABBREVIATIONS:
            return False

    # Step past closing quotes and brackets.
    j = i + 1
    while j < len(text) and text[j] in CLOSERS:
        j += 1

    if j >= len(text):
        return True
    if not _is_space(_at(text, j)):
        return False

    # `"Get out!" he said.` — a lowercase word after the mark is a speech tag.
    k = j
    while k < len(text) and _is_space(text[k]):
        k += 1
    if k >= len(text):
        return True
    return not _is_lower(_at(text, k))


def split_sentences(paragraph: str) -> list[Sentence]:
    """Split a paragraph into sentences that TILE it.

    Contiguous, gapless, covering the paragraph end to end — trailing
    whitespace belongs to the sentence it follows, so
    ``"".join(s.text for s in split_sentences(p)) == p`` holds by construction.
    """
    if paragraph == "":
        return []
    out: list[Sentence] = []
    start = 0
    i = 0
    while i < len(paragraph):
        c = paragraph[i]
        if c not in (".", "!", "?", "…") or not _terminates_at(paragraph, i):
            i += 1
            continue

        end = i + 1
        while end < len(paragraph) and paragraph[end] in CLOSERS:
            end += 1
        while end < len(paragraph) and paragraph[end].isspace():
            end += 1

        out.append(Sentence(paragraph[start:end], start, end))
        start = end
        i = end

    if start < len(paragraph):
        out.append(Sentence(paragraph[start:], start, len(paragraph)))
    return out


def sentence_at(paragraph: str, offset: int) -> int:
    """Which sentence covers this offset? -1 when the paragraph has none."""
    sentences = split_sentences(paragraph)
    for idx, s in enumerate(sentences):
        if s.start <= offset < s.end:
            return idx
    return len(sentences) - 1 if sentences else -1
