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
 *
 * A picked reading is tied to one occurrence. `reconcileChoices` moves it
 * only when that occurrence is still unambiguous after an edit. If two
 * copies of the character could have traded places, the pick is dropped
 * instead of sticking to the other one.
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

/**
 * Move picks onto the Han characters they still belong to.
 * An edit that only adds spaces or punctuation keeps every pick.
 * A deleted character loses its pick. A character that still has one
 * possible place keeps it. Repeated characters with more than one
 * possible alignment lose the pick.
 */
export function reconcileChoices(
  before: string,
  after: string,
  choices: readonly ReadingChoice[],
): readonly ReadingChoice[] {
  if (choices.length === 0) return choices;
  const prev = hanSequence(before);
  const next = hanSequence(after);
  const picked = lastChoiceAt(choices);
  if (sameChars(prev, next)) {
    const kept = picked.filter((choice) => prev[choice.index] === choice.char);
    return kept.length === choices.length ? choices : kept;
  }
  const moved = uniqueHanMatches(prev, next);
  const kept: ReadingChoice[] = [];
  for (const choice of picked) {
    if (prev[choice.index] !== choice.char) continue;
    const index = moved.get(choice.index);
    if (index == null || next[index] !== choice.char) continue;
    kept.push({ index, char: choice.char, jyutping: choice.jyutping });
  }
  return kept;
}

function hanSequence(text: string): string[] {
  const chars: string[] = [];
  for (const char of text.normalize("NFKC")) {
    if (isQuiet(char) || !isHan(char)) continue;
    chars.push(char);
  }
  return chars;
}

function sameChars(prev: readonly string[], next: readonly string[]): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

function lastChoiceAt(choices: readonly ReadingChoice[]): ReadingChoice[] {
  const byIndex = new Map<number, ReadingChoice>();
  for (const choice of choices) {
    if (!Number.isInteger(choice.index) || choice.index < 0) continue;
    byIndex.set(choice.index, choice);
  }
  return [...byIndex.values()];
}

/**
 * Old Han index → new Han index, for matches that every longest common
 * subsequence agrees on. An index that could land on two places is omitted.
 */
function uniqueHanMatches(before: readonly string[], after: readonly string[]): Map<number, number> {
  const n = before.length;
  const m = after.length;
  const prefix = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  const suffix = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      prefix[i][j] =
        before[i - 1] === after[j - 1]
          ? prefix[i - 1][j - 1] + 1
          : Math.max(prefix[i - 1][j], prefix[i][j - 1]);
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      suffix[i][j] =
        before[i] === after[j] ? suffix[i + 1][j + 1] + 1 : Math.max(suffix[i + 1][j], suffix[i][j + 1]);
    }
  }
  const total = prefix[n][m];
  const options = new Map<number, number[]>();
  const claimedBy = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (before[i] !== after[j]) continue;
      if (prefix[i][j] + 1 + suffix[i + 1][j + 1] !== total) continue;
      const list = options.get(i);
      if (list) list.push(j);
      else options.set(i, [j]);
      claimedBy.set(j, (claimedBy.get(j) ?? 0) + 1);
    }
  }
  const unique = new Map<number, number>();
  for (const [index, targets] of options) {
    if (targets.length === 1 && claimedBy.get(targets[0]) === 1) unique.set(index, targets[0]);
  }
  return unique;
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
