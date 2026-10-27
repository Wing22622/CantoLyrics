import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildLexicon } from "./lexicon";
import {
  mapLyricDigits,
  reconcileChoices,
  UNKNOWN_DIGIT,
  type LyricReading,
  type ReadingChoice,
} from "./lyric-0243";

const lexicon = buildLexicon(JSON.parse(readFileSync(new URL("../public/lexicon.json", import.meta.url), "utf8")));

function reading(jyutping: string, tone: number, percent: number): LyricReading {
  return { jyutping, tone, percent };
}

const fake: Record<string, LyricReading[]> = {
  人: [reading("jan2", 2, 10), reading("jan4", 4, 90)],
  常: [reading("soeng4", 4, 100)],
  歡: [reading("fun1", 1, 100)],
  笑: [reading("siu3", 3, 100)],
  行: [reading("hang4", 4, 5), reading("haang4", 4, 5)],
  壞: [reading("waai6", 0, 90), reading("waai6b", 6, 10)],
};

function lookup(char: string): readonly LyricReading[] {
  return fake[char] ?? [];
}

function choice(index: number, char: string, jyutping: string): ReadingChoice {
  return { index, char, jyutping };
}

describe("mapLyricDigits", () => {
  it("maps each Han character from its highest-percent reading", () => {
    // 常 soeng4 is lexical 0. The melody filling 00334 is a different path.
    const result = mapLyricDigits("人人常歡笑", lookup);
    expect(result.digits).toBe("00034");
    expect(result.tokens.filter((token) => token.kind === "char").map((token) => token.jyutping)).toEqual([
      "jan4",
      "jan4",
      "soeng4",
      "fun1",
      "siu3",
    ]);
  });

  it("uses primary codes, so a rising tone does not take its second level", () => {
    const rising = mapLyricDigits("上", () => [reading("soeng5", 5, 80), reading("soeng6", 6, 20)]);
    expect(rising.digits).toBe("4");
  });

  it("switches one character when another reading is chosen", () => {
    const result = mapLyricDigits("人人", lookup, [choice(1, "人", "jan2")]);
    expect(result.digits).toBe("03");
    const chars = result.tokens.filter((token) => token.kind === "char");
    expect(chars[0]?.jyutping).toBe("jan4");
    expect(chars[1]?.jyutping).toBe("jan2");
    expect(chars[1]?.code).toBe("3");
  });

  it("ignores a choice for a different character or an unknown reading", () => {
    expect(mapLyricDigits("人", lookup, [choice(0, "笑", "siu3")]).digits).toBe("0");
    expect(mapLyricDigits("人", lookup, [choice(0, "人", "nope")]).digits).toBe("0");
    expect(
      mapLyricDigits("人人", lookup, [choice(1, "人", "jan4"), choice(1, "人", "jan2")]).digits,
    ).toBe("03");
  });

  it("breaks percent ties by jyutping", () => {
    expect(mapLyricDigits("行", lookup).digits).toBe("0");
    const token = mapLyricDigits("行", lookup).tokens[0];
    expect(token?.kind === "char" && token.jyutping).toBe("haang4");
  });

  it("marks a Han character with no usable code and does not throw", () => {
    expect(mapLyricDigits("人𠀀笑", lookup).digits).toBe(`0${UNKNOWN_DIGIT}4`);
    expect(mapLyricDigits("壞", lookup).digits).toBe(UNKNOWN_DIGIT);
    expect(() => mapLyricDigits("𠀀", () => [])).not.toThrow();
    expect(mapLyricDigits("𠀀", () => []).digits).toBe(UNKNOWN_DIGIT);
  });

  it("returns an empty result for empty input", () => {
    expect(mapLyricDigits("", lookup)).toEqual({ tokens: [], digits: "" });
    expect(mapLyricDigits("   \n", lookup).digits).toBe("");
  });

  it("skips non-Han and keeps one space between Han runs", () => {
    const seen: string[] = [];
    const result = mapLyricDigits("  hello 人人，笑!! 行", (char) => {
      seen.push(char);
      return lookup(char);
    });
    expect(result.digits).toBe("00 4 0");
    expect(seen).toEqual(["人", "人", "笑", "行"]);
    expect(result.tokens.map((token) => token.kind)).toEqual(["char", "char", "gap", "char", "gap", "char"]);
    expect(mapLyricDigits("人ABC", lookup).digits).toBe("0");
    expect(mapLyricDigits("ABC人", lookup).digits).toBe("0");
    expect(mapLyricDigits("ok", lookup).digits).toBe("");
  });

  it("ignores invisible characters instead of splitting digits", () => {
    expect(mapLyricDigits("人\u200b\ufe0f笑", lookup).digits).toBe("04");
  });

  it("does not call the lexicon for an empty phrase", () => {
    const readingsFor = vi.fn(lookup);
    mapLyricDigits("", readingsFor);
    expect(readingsFor).not.toHaveBeenCalled();
  });
});

describe("reconcileChoices", () => {
  it("drops a pick that an insert or delete could move onto another copy", () => {
    const inserted = reconcileChoices("人人", "人人人", [choice(1, "人", "jan2")]);
    expect(inserted).toEqual([]);
    expect(mapLyricDigits("人人人", lookup, inserted).digits).toBe("000");
    expect(mapLyricDigits("人人人", lookup, inserted).tokens.filter((token) => token.kind === "char").map((token) => token.jyutping)).toEqual([
      "jan4",
      "jan4",
      "jan4",
    ]);

    const deleted = reconcileChoices("人人", "人", [choice(0, "人", "jan2")]);
    expect(deleted).toEqual([]);
    const survivor = mapLyricDigits("人", lookup, deleted);
    expect(survivor.digits).toBe("0");
    expect(survivor.tokens[0]).toMatchObject({ char: "人", jyutping: "jan4" });
  });

  it("keeps a pick on the same occurrence when the edit cannot trade two copies", () => {
    expect(reconcileChoices("人笑", "人，笑", [choice(0, "人", "jan2")])).toEqual([choice(0, "人", "jan2")]);
    expect(mapLyricDigits("人，笑", lookup, reconcileChoices("人笑", "人，笑", [choice(0, "人", "jan2")])).digits).toBe(
      "3 4",
    );

    const shifted = reconcileChoices("人人", "人笑人", [choice(1, "人", "jan2")]);
    expect(shifted).toEqual([choice(2, "人", "jan2")]);
    const phrase = mapLyricDigits("人笑人", lookup, shifted);
    expect(phrase.digits).toBe("043");
    expect(phrase.tokens.filter((token) => token.kind === "char").map((token) => token.jyutping)).toEqual([
      "jan4",
      "siu3",
      "jan2",
    ]);
  });
});

describe("mapLyricDigits with the shipped lexicon", () => {
  it("reads 陳大文 from the highest-percent tones", () => {
    const result = mapLyricDigits("陳大文", (char) => lexicon.readingsFor(char));
    expect(result.digits).toBe("020");
    expect(result.tokens.filter((token) => token.kind === "char").map((token) => token.jyutping)).toEqual([
      "can4",
      "daai6",
      "man4",
    ]);
  });

  it("lets a second reading replace one digit", () => {
    const switched = mapLyricDigits("陳大文", (char) => lexicon.readingsFor(char), [choice(2, "文", "man2")]);
    expect(switched.digits).toBe("023");
    expect(mapLyricDigits("陳 大，文", (char) => lexicon.readingsFor(char)).digits).toBe("0 2 0");
  });
});
