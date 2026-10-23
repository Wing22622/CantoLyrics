/**
 * Split a lyric line into alignable syllables.
 *
 * Three segmenters share one interface (`segmenters[lang].segment`):
 * - `en`: English syllabification (vowel nuclei, not whitespace-only)
 * - `ja`: Japanese morae. Kana youon sticks to a full-size base; っ and ん
 *   are their own morae. Kanji stay one character — there is no reading dictionary.
 * - `cmn`: one syllable per character, including 儿. Punctuation is not a syllable.
 *
 * `splitSyllables` is the Cantonese editor path: it infers a language and
 * still syllabifies Latin inside a Japanese line, and keeps Han characters
 * one-per-slot inside an English line.
 */

export type LyricLang = "en" | "ja" | "cmn";

export interface Segmenter {
  segment(text: string): string[];
}

const YOUON = new Set("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ");
const ONE_SYLLABLE_NT = new Set(["do", "ca", "wo", "are", "were", "ai", "sha"]);

/** A few lyric spellings the letter rules cannot see. Parts must join to the word. */
const IRREGULAR: Record<string, string[]> = {
  poem: ["po", "em"],
  poems: ["po", "ems"],
  poetry: ["po", "et", "ry"],
  poetic: ["po", "e", "tic"],
  evening: ["eve", "ning"],
  evenings: ["eve", "nings"],
  business: ["busi", "ness"],
};

const COMPOUNDS: Array<[string, string]> = [
  ["some", "times"],
  ["some", "thing"],
  ["some", "where"],
  ["some", "time"],
  ["some", "how"],
  ["some", "one"],
  ["some", "body"],
  ["some", "day"],
  ["any", "thing"],
  ["any", "one"],
  ["any", "where"],
  ["any", "time"],
  ["any", "body"],
  ["any", "way"],
  ["any", "more"],
  ["every", "thing"],
  ["every", "one"],
  ["every", "where"],
  ["every", "body"],
  ["every", "time"],
  ["may", "be"],
  ["good", "bye"],
];

function prepare(text: string): string {
  return text.normalize("NFKC").replace(/[’‘]/g, "'");
}

function baseChar(ch: string): string {
  return ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function isIgnored(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    code === 0xfeff ||
    code === 0x200b ||
    code === 0x200c ||
    code === 0x200d ||
    (code >= 0xfe00 && code <= 0xfe0f)
  );
}

function isCjkPunct(code: number): boolean {
  if (code < 0x3000 || code > 0x303f) return false;
  // 々 〆 〇 are characters, not breaks.
  return code !== 0x3005 && code !== 0x3006 && code !== 0x3007;
}

function isPunct(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0x3000 || /\s/u.test(ch)) return true;
  if (isCjkPunct(code)) return true;
  return /[!"(),.:;?\[\]{}~·・〜～、。！？，：；、「」『』〈〉《》〔〕〖〗【】（）…—–\-⋯«»‹›"'“”‘’｡､･]/.test(ch);
}

function isLatinLetter(ch: string): boolean {
  return /^[A-Za-z]$/.test(baseChar(ch));
}

function isKana(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0x30fb || code === 0x30a0) return false;
  return (code >= 0x3040 && code <= 0x30ff) || code === 0x30fc;
}

function isVowelAt(word: string, index: number): boolean {
  const ch = word[index];
  if (!ch) return false;
  const base = baseChar(ch);
  if (base === "u" && index > 0 && baseChar(word[index - 1]) === "q") return false;
  if ("aeiou".includes(base)) return true;
  if (base !== "y") return false;
  const next = baseChar(word[index + 1] ?? "");
  // "".includes is true, so an empty next must be handled before includes.
  if (!next || !"aeiou".includes(next)) return true;
  if (index === 0) return false;
  const prev = baseChar(word[index - 1]);
  if (!"aeiou".includes(prev)) return false;
  for (let later = index + 2; later < word.length; later++) {
    const tail = baseChar(word[later]);
    if (tail !== "'" && !"aeiouy".includes(tail)) return false;
  }
  return true;
}

function hasVowelLetter(word: string): boolean {
  return /[aeiouy]/i.test(word);
}

function hasVowelBefore(word: string, index: number): boolean {
  for (let i = 0; i < index; i++) {
    if (isVowelAt(word, i)) return true;
  }
  return false;
}

function reslice(word: string, parts: string[]): string[] {
  if (parts.join("") !== word.toLowerCase()) return parts;
  let cursor = 0;
  return parts.map((part) => {
    const slice = word.slice(cursor, cursor + part.length);
    cursor += part.length;
    return slice;
  });
}

function matchCompound(word: string): string[] | null {
  const lower = word.toLowerCase();
  for (const [head, tail] of COMPOUNDS) {
    if (lower === head + tail) return [word.slice(0, head.length), word.slice(head.length)];
  }
  return null;
}

function compoundParts(word: string): string[] | null {
  return matchCompound(word);
}

function isSimpleContraction(word: string): boolean {
  return /n't$/i.test(word) || /'(s|re|ve|ll|d|m)$/i.test(word);
}

function splitApostrophe(word: string): string[] | null {
  if (!word.includes("'") || isSimpleContraction(word)) return null;
  const bits = word.split("'").filter((bit) => bit.length > 0);
  if (bits.length <= 1) return null;
  if (bits.length === 2 && bits[0].length <= 2) {
    return [word.slice(0, bits[0].length) + "'", ...englishSyllables(bits[1])];
  }
  return bits.flatMap((bit) => englishSyllables(bit));
}

function peelSuffix(word: string, suffix: string): string[] | null {
  if (word.length <= suffix.length || !word.toLowerCase().endsWith(suffix)) return null;
  const stem = word.slice(0, -suffix.length);
  if (!hasVowelLetter(stem)) return null;
  return [...englishSyllables(stem), word.slice(-suffix.length)];
}

function silentVowelIndices(word: string): Set<number> {
  const silent = new Set<number>();
  const lower = word.toLowerCase();
  const last = word.length - 1;
  if (lower.endsWith("e") && word.length > 2) {
    const syllabicLe = lower.endsWith("le") && !isVowelAt(word, word.length - 3);
    if (!syllabicLe && !isVowelAt(word, last - 1) && hasVowelBefore(word, last - 1)) silent.add(last);
  }
  if (lower.endsWith("ed") && word.length > 3) {
    const before = lower[word.length - 3];
    if (before !== "t" && before !== "d" && hasVowelLetter(word.slice(0, -2))) silent.add(word.length - 2);
  }
  if (lower.endsWith("es") && word.length > 3) {
    const eIndex = word.length - 2;
    const before = lower[eIndex - 1];
    const syllabic =
      "sxzcg".includes(before) || lower.endsWith("ches") || lower.endsWith("shes");
    if (!syllabic && !isVowelAt(word, eIndex - 1) && hasVowelBefore(word, eIndex)) silent.add(eIndex);
  }
  return silent;
}

function splitVowelGroup(word: string, start: number, end: number): Array<[number, number]> {
  const run = word.slice(start, end).toLowerCase();
  if (run === "eau" || run === "iou" || run.length < 2) return [[start, end]];
  const after = word.slice(end).toLowerCase();
  if (run === "ia" && !after.startsWith("l")) return [[start, start + 1], [start + 1, end]];
  if (run === "io") {
    const protect = after.startsWith("n") && hasVowelBefore(word, start);
    if (!protect) return [[start, start + 1], [start + 1, end]];
  }
  if (run === "eo") {
    const alone = after.length === 0 && !hasVowelBefore(word, start);
    if (!after.startsWith("ple") && !alone) return [[start, start + 1], [start + 1, end]];
  }
  if (run === "ea" && end === word.length && hasVowelBefore(word, start)) {
    return [[start, start + 1], [start + 1, end]];
  }
  if (run === "ie" && (/^nc/.test(after) || after === "t" || after === "nt" || after === "n")) {
    return [[start, start + 1], [start + 1, end]];
  }
  if (run === "ao") return [[start, start + 1], [start + 1, end]];
  return [[start, end]];
}

function coreEnglish(word: string): string[] {
  const silent = silentVowelIndices(word);
  const groups: Array<[number, number]> = [];
  let index = 0;
  while (index < word.length) {
    if (!silent.has(index) && isVowelAt(word, index)) {
      const start = index;
      while (index < word.length && !silent.has(index) && isVowelAt(word, index)) index++;
      groups.push(...splitVowelGroup(word, start, index));
      continue;
    }
    index++;
  }
  if (groups.length <= 1) return [word];
  const parts: string[] = [];
  let prev = 0;
  for (let group = 0; group < groups.length; group++) {
    if (group === groups.length - 1) {
      parts.push(word.slice(prev));
      break;
    }
    const clusterStart = groups[group][1];
    const clusterEnd = groups[group + 1][0];
    const clusterLen = clusterEnd - clusterStart;
    const splitAt = clusterLen <= 1 ? clusterStart : clusterStart + clusterLen - 1;
    parts.push(word.slice(prev, splitAt));
    prev = splitAt;
  }
  return parts.filter((part) => part.length > 0);
}

export function englishSyllables(word: string): string[] {
  if (!word) return [];
  const irregular = IRREGULAR[word.toLowerCase()];
  if (irregular) return reslice(word, irregular);

  const broken = splitApostrophe(word);
  if (broken) return broken;

  const compound = compoundParts(word);
  if (compound) return compound.flatMap((part) => englishSyllables(part));

  if (/n't$/i.test(word)) {
    const stem = word.slice(0, -3);
    if (ONE_SYLLABLE_NT.has(stem.toLowerCase())) return [word];
    if (hasVowelLetter(stem)) return [...englishSyllables(stem), word.slice(-3)];
  }

  if (word.length >= 4 && /le$/i.test(word) && !isVowelAt(word, word.length - 3)) {
    const head = word.slice(0, -3);
    if (hasVowelLetter(head)) return [...englishSyllables(head), word.slice(-3)];
  }

  for (const suffix of ["ment", "ness", "less", "ful", "ly"]) {
    const peeled = peelSuffix(word, suffix);
    if (peeled) return peeled;
  }

  if (/[aeiou][^aeiouy]ety$/i.test(word)) {
    const stem = word.slice(0, -2);
    if (hasVowelLetter(stem)) return [...englishSyllables(stem), word.slice(-2)];
  }

  if (/ing$/i.test(word) && word.length > 3) {
    let stem = word.slice(0, -3);
    let suffix = word.slice(-3);
    if (/([bcdfghjklmnpqrstvwxz])\1$/i.test(stem)) {
      suffix = stem.slice(-1) + suffix;
      stem = stem.slice(0, -1);
    }
    if (hasVowelLetter(stem)) return [...englishSyllables(stem), suffix];
  }

  if (/ed$/i.test(word) && word.length > 3) {
    const before = word[word.length - 3].toLowerCase();
    if ((before === "t" || before === "d") && hasVowelLetter(word.slice(0, -2))) {
      return [...englishSyllables(word.slice(0, -2)), word.slice(-2)];
    }
  }

  if (
    /^cre/i.test(word) &&
    word.length > 4 &&
    word[3].toLowerCase() === "a" &&
    word[4].toLowerCase() === "t" &&
    !/^creatur/i.test(word)
  ) {
    return [word.slice(0, 3), ...englishSyllables(word.slice(3))];
  }

  return coreEnglish(word);
}

function canTakeYouon(mora: string): boolean {
  const ch = [...mora].at(-1) ?? "";
  if (!ch || YOUON.has(ch) || "んンっッー".includes(ch)) return false;
  return isKana(ch);
}

export function japaneseMorae(text: string): string[] {
  const morae: string[] = [];
  for (const ch of prepare(text)) {
    if (isIgnored(ch) || isPunct(ch)) continue;
    if (YOUON.has(ch) && morae.length > 0 && canTakeYouon(morae[morae.length - 1])) {
      morae[morae.length - 1] += ch;
    } else {
      morae.push(ch);
    }
  }
  return morae;
}

function segmentEnglish(text: string): string[] {
  const chars = [...prepare(text)];
  const out: string[] = [];
  let index = 0;
  while (index < chars.length) {
    const ch = chars[index];
    if (isIgnored(ch)) {
      index++;
      continue;
    }
    if (isLatinLetter(ch) || (ch === "'" && isLatinLetter(chars[index + 1] ?? ""))) {
      let end = index + 1;
      while (end < chars.length && (isLatinLetter(chars[end]) || chars[end] === "'")) end++;
      const word = chars.slice(index, end).join("");
      if (word !== "'") out.push(...englishSyllables(word));
      index = end;
      continue;
    }
    if (isPunct(ch)) {
      index++;
      continue;
    }
    out.push(ch);
    index++;
  }
  return out;
}

function segmentJapanese(text: string): string[] {
  const chars = [...prepare(text)];
  const out: string[] = [];
  let index = 0;
  while (index < chars.length) {
    const ch = chars[index];
    if (isIgnored(ch) || isPunct(ch)) {
      index++;
      continue;
    }
    if (isKana(ch)) {
      let end = index + 1;
      while (end < chars.length && isKana(chars[end])) end++;
      out.push(...japaneseMorae(chars.slice(index, end).join("")));
      index = end;
      continue;
    }
    if (isLatinLetter(ch) || ch === "'") {
      let end = index + 1;
      while (end < chars.length && (isLatinLetter(chars[end]) || chars[end] === "'")) end++;
      const word = chars.slice(index, end).join("");
      if (word !== "'") out.push(...englishSyllables(word));
      index = end;
      continue;
    }
    out.push(ch);
    index++;
  }
  return out;
}

function segmentMandarin(text: string): string[] {
  const out: string[] = [];
  for (const ch of prepare(text)) {
    if (isIgnored(ch) || isPunct(ch)) continue;
    out.push(ch);
  }
  return out;
}

export const segmenters: Record<LyricLang, Segmenter> = {
  en: { segment: segmentEnglish },
  ja: { segment: segmentJapanese },
  cmn: { segment: segmentMandarin },
};

export function segmentLyric(text: string, lang: LyricLang): string[] {
  return segmenters[lang].segment(text);
}

/** Kana selects Japanese. Otherwise any Latin letter selects English, else Mandarin. */
export function inferLyricLang(text: string): LyricLang {
  let lang: LyricLang = "cmn";
  for (const ch of prepare(text)) {
    if (isIgnored(ch) || isPunct(ch)) continue;
    if (isKana(ch)) return "ja";
    if (isLatinLetter(ch)) lang = "en";
  }
  return lang;
}

export function splitSyllables(input: string): string[] {
  return segmentLyric(input, inferLyricLang(input));
}
