import { describe, expect, it } from "vitest";
import { alignSources, toggleMelisma } from "./align";
import { splitSyllables } from "./syllables";

describe("splitSyllables", () => {
  it("splits the 世界真細小 line into characters and drops punctuation", () => {
    expect(splitSyllables("人人常歡笑，不要眼淚掉")).toEqual([
      "人", "人", "常", "歡", "笑", "不", "要", "眼", "淚", "掉",
    ]);
  });

  it("splits English words and Japanese morae", () => {
    expect(splitSyllables("hello world")).toEqual(["hel", "lo", "world"]);
    expect(splitSyllables("it's small")).toEqual(["it's", "small"]);
    expect(splitSyllables("smile")).toEqual(["smile"]);
    expect(splitSyllables("きょう")).toEqual(["きょ", "う"]);
    expect(splitSyllables("かって")).toEqual(["か", "っ", "て"]);
    expect(splitSyllables("hello 世界")).toEqual(["hel", "lo", "世", "界"]);
  });
});

describe("alignSources", () => {
  it("places one syllable on each note and can mark a melisma", () => {
    const slots = alignSources(
      Array.from({ length: 5 }, () => ({ source: "", melisma: false })),
      ["人", "人", "常", "歡", "笑"],
    );
    expect(slots.map((slot) => slot.source)).toEqual(["人", "人", "常", "歡", "笑"]);
    const merged = toggleMelisma(slots, 2);
    expect(merged.map((slot) => slot.melisma)).toEqual([false, false, true, false, false]);
    expect(merged.map((slot) => slot.source)).toEqual(["人", "人", "", "常", "歡"]);
  });
});
