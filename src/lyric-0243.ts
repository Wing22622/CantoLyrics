/**
 * Name or lyric phrase → 0243 digits, from lexicon tones.
 *
 * Each Han character (Unicode Script=Han, after NFKC) uses the
 * highest-percent reading, unless a choice names another reading of that
 * same character. The digit is `primaryCode` of that reading's tone.
 * A Han character with no usable code is «?».
 *
 * Spaces, punctuation, Latin, digits, and kana are not digits. A run of
 * them between Han characters becomes one space. Runs at either end are
 * dropped. Invisible characters and combining marks are ignored.
 *
 * This path does not look at a melody. Melody codes stay on `mapMelody`.
 */
import { primaryCode, type Code0243 } from "./tone-0243";

export const UNKNOWN_DIGIT = "«?»";

export interface LyricReading {
  jyutping: string;
  tone: number;
  percent: number;
}

/** A reading the user picked for one Han character in the phrase. */
export interface ReadingChoice {
  /** Index among Han characters, starting at 0. */
  index: number;
  char: string;
  jyutping: string;
}

export interface LyricCharToken {
  kind: "char";
  index: number;
  char: string;
  readings: LyricReading[];
  /** Reading used for the digit. Null when the character has none. */
  jyutping: string | null;
  code: Code0243 | null;
}

export interface LyricGapToken {
  kind: "gap";
}

export type LyricToken = LyricCharToken | LyricGapToken;

export interface LyricDigitsResult {
  tokens: LyricToken[];
  /** Digit string. Unknown Han is «?». Interior non-Han runs are one space. */
  digits: string;
}

export function mapLyricDigits(
  text: string,
  readingsFor: (char: string) => readonly LyricReading[],
  choices: readonly ReadingChoice[] = [],
): LyricDigitsResult {
  const choiceAt = new Map<number, ReadingChoice>();
  for (const choice of choices) {
    if (!Number.isInteger(choice.index) || choice.index < 0) continue;
    choiceAt.set(choice.index, choice);
  }

  const tokens: LyricToken[] = [];
  const parts: string[] = [];
  let hanIndex = 0;
  let pendingGap = false;
  let started = false;

  for (const char of text.normalize("NFKC")) {
    if (isQuiet(char)) continue;
    if (!isHan(char)) {
      if (started) pendingGap = true;
      continue;
    }

    const listed = readingsFor(char);
    const readings = ranked(Array.isArray(listed) ? listed : []);
    const choice = choiceAt.get(hanIndex);
    const chosen =
      choice && choice.char === char
        ? readings.find((reading) => reading.jyutping === choice.jyutping)
        : undefined;
    const reading = chosen ?? readings[0] ?? null;
    const code = reading ? primaryCode(reading.tone) : null;
    if (pendingGap) {
      tokens.push({ kind: "gap" });
      parts.push(" ");
      pendingGap = false;
    }
    tokens.push({
      kind: "char",
      index: hanIndex,
      char,
      readings,
      jyutping: reading?.jyutping ?? null,
      code,
    });
    parts.push(code ?? UNKNOWN_DIGIT);
    hanIndex += 1;
    started = true;
  }

  return { tokens, digits: parts.join("") };
}

function isHan(char: string): boolean {
  return /^\p{Script=Han}$/u.test(char);
}

function isQuiet(char: string): boolean {
  return /^\p{Default_Ignorable_Code_Point}$/u.test(char) || /^\p{M}$/u.test(char);
}

function ranked(readings: readonly LyricReading[]): LyricReading[] {
  const copy: LyricReading[] = [];
  for (const reading of readings) {
    if (!reading || typeof reading.jyutping !== "string" || reading.jyutping === "") continue;
    if (typeof reading.tone !== "number" || !Number.isFinite(reading.tone)) continue;
    if (typeof reading.percent !== "number" || !Number.isFinite(reading.percent)) continue;
    copy.push({ jyutping: reading.jyutping, tone: reading.tone, percent: reading.percent });
  }
  copy.sort((a, b) => b.percent - a.percent || a.jyutping.localeCompare(b.jyutping));
  return copy;
}
