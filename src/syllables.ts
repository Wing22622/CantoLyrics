/**
 * Split a lyric line into alignable syllables.
 * English: a small vowel-group split. Japanese kana: morae (よう音 sticks
 * to the previous kana; っ and ん are their own morae). Han characters,
 * including Mandarin or Cantonese, are one syllable each. Kanji inside
 * Japanese are also one character — there is no dictionary split.
 */

const YOUON = new Set("ゃゅょぁぃぅぇぉャュョァィゥェォ".split(""));

function isVowel(ch: string): boolean {
  return "aeiouy".includes(ch.toLowerCase());
}

export function englishSyllables(word: string): string[] {
  if (word.length <= 3) return [word];
  const groups: [number, number][] = [];
  let index = 0;
  while (index < word.length) {
    if (isVowel(word[index])) {
      const start = index;
      while (index < word.length && isVowel(word[index])) index++;
      groups.push([start, index]);
    } else {
      index++;
    }
  }
  if (groups.length === 0) return [word];
  const last = groups[groups.length - 1];
  // "apple" / "little" keep a syllabic -le. "smile" does not: the l follows a vowel.
  const syllabicLe =
    word.length >= 4 && word.endsWith("le") && !isVowel(word[word.length - 3]);
  if (
    groups.length > 1 &&
    word.endsWith("e") &&
    !syllabicLe &&
    last[0] === word.length - 1
  ) {
    groups.pop();
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
    const clusterLen = groups[group + 1][0] - clusterStart;
    const splitAt = clusterLen <= 1 ? clusterStart : clusterStart + clusterLen - 1;
    parts.push(word.slice(prev, splitAt));
    prev = splitAt;
  }
  return parts.filter((part) => part.length > 0);
}

function isKana(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x3040 && code <= 0x30ff) || code === 0x30fc;
}

export function japaneseMorae(text: string): string[] {
  const morae: string[] = [];
  for (const ch of text) {
    if (YOUON.has(ch) && morae.length > 0) morae[morae.length - 1] += ch;
    else morae.push(ch);
  }
  return morae;
}

function isPunctuation(ch: string): boolean {
  return /[\s，。、！？!?.,;:"“”‘’（）()[\]【】「」『』…—～~·・　]/.test(ch);
}

export function splitSyllables(input: string): string[] {
  const text = input.normalize("NFC");
  const out: string[] = [];
  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (isPunctuation(ch)) {
      index++;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let end = index + 1;
      while (end < text.length && /[A-Za-z']/.test(text[end])) end++;
      out.push(...englishSyllables(text.slice(index, end)));
      index = end;
      continue;
    }
    if (isKana(ch)) {
      let end = index + 1;
      while (end < text.length && isKana(text[end])) end++;
      out.push(...japaneseMorae(text.slice(index, end)));
      index = end;
      continue;
    }
    out.push(ch);
    index++;
  }
  return out;
}
