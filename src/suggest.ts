import { primaryCode, toneFitsCode, type Code0243 } from "./tone-0243";

export interface WordEntry {
  text: string;
  jyutping: string[];
  tones: number[];
  frequency: number;
}

export interface SuggestOptions {
  startsWith?: string;
  limit?: number;
}

/**
 * Words whose Jyutping tones can fill `codes`, one character per code.
 * Primary-code matches rank above matches that only work because a rising
 * tone also fits a second code. Frequency breaks ties inside each group.
 */
export function suggestWords(
  words: readonly WordEntry[],
  codes: readonly Code0243[],
  options: SuggestOptions = {},
): WordEntry[] {
  const prefix = options.startsWith?.trim() ?? "";
  const limit = options.limit ?? 40;
  const ranked: { word: WordEntry; tier: number }[] = [];
  for (const word of words) {
    if (word.tones.length !== codes.length) continue;
    if (prefix && !word.text.startsWith(prefix)) continue;
    let tier = 0;
    let ok = true;
    for (let i = 0; i < codes.length; i++) {
      const tone = word.tones[i];
      if (!toneFitsCode(tone, codes[i])) {
        ok = false;
        break;
      }
      if (primaryCode(tone) !== codes[i]) tier = 1;
    }
    if (ok) ranked.push({ word, tier });
  }
  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.word.frequency !== b.word.frequency) return b.word.frequency - a.word.frequency;
    return a.word.text < b.word.text ? -1 : a.word.text > b.word.text ? 1 : 0;
  });
  return ranked.slice(0, limit).map((item) => item.word);
}
