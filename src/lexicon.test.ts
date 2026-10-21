import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLexicon } from "./lexicon";
import { suggestWords } from "./suggest";

const lexicon = buildLexicon(JSON.parse(readFileSync(new URL("../public/lexicon.json", import.meta.url), "utf8")));

describe("shipped lexicon", () => {
  it("is the CC BY rime-cantonese extract and can look words up", () => {
    expect(lexicon.meta.license).toBe("CC BY 4.0");
    const readings = lexicon.readingsFor("人").map((reading) => reading.jyutping);
    expect(readings).toContain("jan4");
    expect(readings).toContain("jan2");

    const pair = lexicon.wordsOfLength(2);
    const found = suggestWords(pair, ["3", "2"], { limit: pair.length });
    const real = found.find((word) => word.text === "真係");
    const rising = found.find((word) => word.text === "可以");
    expect(real?.jyutping).toEqual(["zan1", "hai6"]);
    expect(rising).toBeTruthy();
    expect(found.indexOf(real!)).toBeLessThan(found.indexOf(rising!));

    const ngo = pair.find((word) => word.text === "我哋");
    expect(ngo?.frequency).toBeGreaterThan(1000);

    const filtered = suggestWords(pair, ["3", "4"], { startsWith: "香", limit: 10 });
    expect(filtered.some((word) => word.text === "香港")).toBe(true);
    expect(filtered.every((word) => word.text.startsWith("香"))).toBe(true);
  });
});
