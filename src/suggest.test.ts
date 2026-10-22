import { describe, expect, it } from "vitest";
import { suggestWords, type WordEntry } from "./suggest";

const words: WordEntry[] = [
  { text: "真係", jyutping: ["zan1", "hai6"], tones: [1, 6], frequency: 100 },
  { text: "可以", jyutping: ["ho2", "ji5"], tones: [2, 5], frequency: 1000 },
  { text: "開心", jyutping: ["hoi1", "sam1"], tones: [1, 1], frequency: 50 },
  { text: "開花", jyutping: ["hoi1", "faa1"], tones: [1, 1], frequency: 5 },
  { text: "歷史", jyutping: ["lik6", "si2"], tones: [6, 2], frequency: 40 },
  { text: "測試", jyutping: ["cak1", "si3"], tones: [1, 3], frequency: 10 },
  { text: "細世界", jyutping: ["sai3", "sai3", "gaai3"], tones: [3, 3, 3], frequency: 8 },
];

describe("suggestWords", () => {
  it("ranks a primary-code match above a more common rising-tone match", () => {
    const found = suggestWords(words, ["3", "2"]);
    expect(found.map((word) => word.text)).toEqual(["真係", "可以"]);
  });

  it("filters by length, starting character, and frequency", () => {
    expect(suggestWords(words, ["3", "3"]).map((word) => word.text)).toEqual(["開心", "開花"]);
    expect(suggestWords(words, ["3", "3"], { startsWith: "開" }).map((word) => word.text)).toEqual([
      "開心",
      "開花",
    ]);
    expect(suggestWords(words, ["3", "3"], { startsWith: "花" })).toEqual([]);
    expect(suggestWords(words, ["4", "4", "4"]).map((word) => word.text)).toEqual(["細世界"]);
    expect(suggestWords(words, ["3", "3"], { limit: 1 })).toHaveLength(1);
  });

  it("lets 歷史 fill 2 then either 3 or 4", () => {
    expect(suggestWords(words, ["2", "3"]).map((word) => word.text)).toEqual(["歷史"]);
    expect(suggestWords(words, ["2", "4"]).map((word) => word.text)).toContain("歷史");
    expect(suggestWords(words, ["2", "0"])).toEqual([]);
  });
});
