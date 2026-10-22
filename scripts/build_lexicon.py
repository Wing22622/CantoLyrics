#!/usr/bin/env python3
"""Build public/lexicon.json from pinned rime-cantonese files.

The raw files are CC BY 4.0 (CanCLID). This script filters them; it does not
fetch words.hk. Re-run from the repo root:

    python3 scripts/build_lexicon.py

If data/raw is empty, the pinned revision is downloaded.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "lexicon.json"

PIN = "259f0e48bba840c3a2e0d117539e96937f3d89bc"
BASE = f"https://raw.githubusercontent.com/rime/rime-cantonese/{PIN}"
FILES = {
    "jyut6ping3.words.dict.yaml": "words.dict.yaml",
    "jyut6ping3.chars.dict.yaml": "chars.dict.yaml",
    "essay-cantonese.txt": "essay-cantonese.txt",
}

# Orthographic variants that show up as different code points for the same
# word. Used only when looking up a frequency, not when displaying the word.
VARIANTS = {
    "為": "爲",
    "爲": "為",
    "裡": "裏",
    "裏": "裡",
    "著": "着",
    "着": "著",
    "羣": "群",
    "群": "羣",
    "綫": "線",
    "線": "綫",
    "峯": "峰",
    "峰": "峯",
    "眾": "衆",
    "衆": "眾",
    "說": "説",
    "説": "說",
    "戶": "户",
    "户": "戶",
    "啟": "啓",
    "啓": "啟",
    "恆": "恒",
    "恒": "恆",
    "溫": "温",
    "温": "溫",
    # 我哋 is often written 我地 in the frequency list.
    "哋": "地",
    "地": "哋",
}

SYLLABLE = re.compile(r"^[a-z]+[1-6]$")


def is_han(text: str) -> bool:
    if not text:
        return False
    for ch in text:
        code = ord(ch)
        if not (
            0x3400 <= code <= 0x9FFF
            or 0xF900 <= code <= 0xFAFF
            or 0x20000 <= code <= 0x3FFFF
        ):
            return False
    return True


def ensure_raw() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for remote, local in FILES.items():
        path = RAW / local
        if path.exists() and path.stat().st_size > 0:
            continue
        url = f"{BASE}/{remote}"
        print(f"downloading {url}")
        urllib.request.urlretrieve(url, path)


def read_body(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    body: list[str] = []
    started = False
    for line in lines:
        if line.strip() == "...":
            started = True
            continue
        if not started or not line or line.startswith("#"):
            continue
        body.append(line.split(" #", 1)[0].rstrip())
    return body


def parse_percent(field: str | None) -> int:
    """Unmarked readings are the head reading (sort as 100)."""
    if not field:
        return 100
    text = field.strip()
    if text.endswith("%"):
        text = text[:-1]
    try:
        return int(round(float(text)))
    except ValueError:
        return 0


def load_essay() -> dict[str, int]:
    essay: dict[str, int] = {}
    for line in (RAW / "essay-cantonese.txt").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        word, freq = line.split("\t")
        essay[word] = int(freq)
    return essay


def frequency_for(word: str, essay: dict[str, int]) -> int:
    best = essay.get(word, 0)
    indexes = [i for i, ch in enumerate(word) if ch in VARIANTS]
    if not indexes or len(indexes) > 6:
        return best
    chars = list(word)
    for mask in range(1, 1 << len(indexes)):
        for bit, index in enumerate(indexes):
            chars[index] = (
                VARIANTS[word[index]] if mask & (1 << bit) else word[index]
            )
        best = max(best, essay.get("".join(chars), 0))
    return best


def load_chars() -> list[list[object]]:
    best: dict[tuple[str, str], int] = {}
    order: list[tuple[str, str]] = []
    for line in read_body(RAW / "chars.dict.yaml"):
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        char, jyutping = parts[0], parts[1].strip()
        if len(char) != 1 or not is_han(char) or not SYLLABLE.match(jyutping):
            continue
        percent = parse_percent(parts[2] if len(parts) > 2 else None)
        key = (char, jyutping)
        if key not in best:
            order.append(key)
            best[key] = percent
        else:
            best[key] = max(best[key], percent)
    rows = [[char, jyutping, best[(char, jyutping)]] for char, jyutping in order]
    rows.sort(key=lambda row: (-int(row[2]), str(row[1])))
    return rows


def load_words(essay: dict[str, int]) -> list[list[object]]:
    seen: set[tuple[str, str]] = set()
    rows: list[list[object]] = []
    for line in read_body(RAW / "words.dict.yaml"):
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        text, jyutping = parts[0].strip(), parts[1].strip()
        if not (2 <= len(text) <= 4) or not is_han(text):
            continue
        syllables = jyutping.split()
        if len(syllables) != len(text) or not all(SYLLABLE.match(s) for s in syllables):
            continue
        key = (text, " ".join(syllables))
        if key in seen:
            continue
        seen.add(key)
        rows.append([text, key[1], frequency_for(text, essay)])
    rows.sort(key=lambda row: (-int(row[2]), str(row[0]), str(row[1])))
    return rows


def main() -> None:
    ensure_raw()
    essay = load_essay()
    chars = load_chars()
    words = load_words(essay)
    attested = sum(1 for row in words if int(row[2]) > 0)
    payload = {
        "meta": {
            "name": "CantoLyrics lexicon",
            "source": "rime-cantonese",
            "sourceUrl": "https://github.com/rime/rime-cantonese",
            "commit": PIN,
            "dictVersion": "2026.08.10",
            "license": "CC BY 4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
            "attribution": "粵語計算語言學基礎建設組 CanCLID（rime-cantonese）",
            "modified": (
                "Filtered to 2–4 character words with one Jyutping syllable per "
                "character. Character readings kept. Frequency is the count in "
                "essay-cantonese.txt, also checked against a short list of "
                "orthographic variants (為/爲, 哋/地, and similar). Unlisted "
                "words have frequency 0."
            ),
            "wordsHk": (
                "Not included. words.hk dictionary data is under the "
                "Non-Commercial Open Data License / CC BY-NC, which is not "
                "used here."
            ),
        },
        "chars": chars,
        "words": words,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"chars {len(chars)} words {len(words)} attested {attested} bytes {OUT.stat().st_size}")


if __name__ == "__main__":
    main()
