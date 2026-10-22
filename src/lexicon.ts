import { parseTone, type ReadingInput } from "./tone-fit";
import type { WordEntry } from "./suggest";

interface LexiconFile {
  meta: {
    license: string;
    attribution: string;
    sourceUrl: string;
  };
  chars: [string, string, number][];
  words: [string, string, number][];
}

export interface CharReading extends ReadingInput {
  percent: number;
}

export interface Lexicon {
  meta: LexiconFile["meta"];
  readingsFor(char: string): CharReading[];
  wordsOfLength(length: number): readonly WordEntry[];
}

let pending: Promise<Lexicon> | null = null;

export function loadLexicon(): Promise<Lexicon> {
  if (!pending) pending = fetchLexicon();
  return pending;
}

export function buildLexicon(data: LexiconFile): Lexicon {
  const byChar = new Map<string, CharReading[]>();
  for (const [char, jyutping, percent] of data.chars) {
    const tone = parseTone(jyutping);
    if (tone == null) continue;
    const list = byChar.get(char) ?? [];
    list.push({ jyutping, tone, percent });
    byChar.set(char, list);
  }
  for (const list of byChar.values()) {
    list.sort((a, b) => b.percent - a.percent || a.jyutping.localeCompare(b.jyutping));
  }

  const byLength = new Map<number, WordEntry[]>();
  for (const [text, raw, frequency] of data.words) {
    const jyutping = raw.split(" ");
    const tones: number[] = [];
    let ok = true;
    for (const syllable of jyutping) {
      const tone = parseTone(syllable);
      if (tone == null) {
        ok = false;
        break;
      }
      tones.push(tone);
    }
    if (!ok || tones.length !== text.length) continue;
    const entry: WordEntry = { text, jyutping, tones, frequency };
    const bucket = byLength.get(text.length) ?? [];
    bucket.push(entry);
    byLength.set(text.length, bucket);
  }

  return {
    meta: data.meta,
    readingsFor(char: string) {
      return byChar.get(char) ?? [];
    },
    wordsOfLength(length: number) {
      return byLength.get(length) ?? [];
    },
  };
}

async function fetchLexicon(): Promise<Lexicon> {
  const response = await fetch(`${import.meta.env.BASE_URL}lexicon.json`);
  if (!response.ok) throw new Error("詞庫載入唔到");
  return buildLexicon((await response.json()) as LexiconFile);
}
