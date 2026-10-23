import { describe, expect, it } from "vitest";
import { alignLyric, alignSources, alignmentNote, toggleMelisma } from "./align";
import {
  englishSyllables,
  inferLyricLang,
  japaneseMorae,
  segmentLyric,
  segmenters,
  splitSyllables,
} from "./syllables";

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

  it("drops title marks instead of giving them a slot", () => {
    expect(splitSyllables("《世界真細小》")).toEqual(["世", "界", "真", "細", "小"]);
  });
});

describe("english segmenter", () => {
  it.each([
    ["hello", ["hel", "lo"]],
    ["world", ["world"]],
    ["smile", ["smile"]],
    ["it's", ["it's"]],
    ["small", ["small"]],
    ["the", ["the"]],
    ["you", ["you"]],
    ["one", ["one"]],
    ["ago", ["a", "go"]],
    ["any", ["a", "ny"]],
    ["happy", ["hap", "py"]],
    ["baby", ["ba", "by"]],
    ["city", ["ci", "ty"]],
    ["going", ["go", "ing"]],
    ["being", ["be", "ing"]],
    ["seeing", ["see", "ing"]],
    ["doing", ["do", "ing"]],
    ["playing", ["play", "ing"]],
    ["trying", ["try", "ing"]],
    ["crying", ["cry", "ing"]],
    ["flying", ["fly", "ing"]],
    ["running", ["run", "ning"]],
    ["feeling", ["feel", "ing"]],
    ["walking", ["walk", "ing"]],
    ["singing", ["sing", "ing"]],
    ["morning", ["morn", "ing"]],
    ["nothing", ["noth", "ing"]],
    ["walked", ["walked"]],
    ["loved", ["loved"]],
    ["danced", ["danced"]],
    ["played", ["played"]],
    ["smiled", ["smiled"]],
    ["wanted", ["want", "ed"]],
    ["needed", ["need", "ed"]],
    ["makes", ["makes"]],
    ["loves", ["loves"]],
    ["goes", ["goes"]],
    ["boxes", ["bo", "xes"]],
    ["don't", ["don't"]],
    ["can't", ["can't"]],
    ["aren't", ["aren't"]],
    ["I'm", ["I'm"]],
    ["it's", ["it's"]],
    ["we're", ["we're"]],
    ["isn't", ["is", "n't"]],
    ["didn't", ["did", "n't"]],
    ["doesn't", ["does", "n't"]],
    ["haven't", ["have", "n't"]],
    ["something", ["some", "thing"]],
    ["someone", ["some", "one"]],
    ["somewhere", ["some", "where"]],
    ["somehow", ["some", "how"]],
    ["sometimes", ["some", "times"]],
    ["maybe", ["may", "be"]],
    ["anyone", ["a", "ny", "one"]],
    ["anything", ["a", "ny", "thing"]],
    ["everything", ["e", "ve", "ry", "thing"]],
    ["lonely", ["lone", "ly"]],
    ["lovely", ["love", "ly"]],
    ["hopeful", ["hope", "ful"]],
    ["careful", ["care", "ful"]],
    ["useful", ["use", "ful"]],
    ["movement", ["move", "ment"]],
    ["safety", ["safe", "ty"]],
    ["goodbye", ["good", "bye"]],
    ["create", ["cre", "ate"]],
    ["created", ["cre", "at", "ed"]],
    ["creating", ["cre", "at", "ing"]],
    ["creative", ["cre", "a", "tive"]],
    ["creation", ["cre", "a", "tion"]],
    ["creature", ["crea", "ture"]],
    ["idea", ["i", "de", "a"]],
    ["lion", ["li", "on"]],
    ["video", ["vi", "de", "o"]],
    ["radio", ["ra", "di", "o"]],
    ["piano", ["pi", "a", "no"]],
    ["nation", ["na", "tion"]],
    ["action", ["ac", "tion"]],
    ["sea", ["sea"]],
    ["please", ["please"]],
    ["real", ["real"]],
    ["chaos", ["cha", "os"]],
    ["neon", ["ne", "on"]],
    ["people", ["peo", "ple"]],
    ["little", ["lit", "tle"]],
    ["table", ["ta", "ble"]],
    ["apple", ["ap", "ple"]],
    ["social", ["so", "cial"]],
    ["quiet", ["qui", "et"]],
    ["science", ["sci", "ence"]],
    ["client", ["cli", "ent"]],
    ["believe", ["be", "lieve"]],
    ["beyond", ["be", "yond"]],
    ["yellow", ["yel", "low"]],
    ["poem", ["po", "em"]],
    ["poetry", ["po", "et", "ry"]],
    ["evening", ["eve", "ning"]],
    ["business", ["busi", "ness"]],
    ["eye", ["eye"]],
    ["fire", ["fire"]],
    ["Hello", ["Hel", "lo"]],
  ] as const)("syllabifies %s", (word, parts) => {
    expect(englishSyllables(word)).toEqual([...parts]);
  });

  it("splits a line on spaces and hyphens, and keeps Han one character each", () => {
    expect(segmenters.en.segment("hello, world!")).toEqual(["hel", "lo", "world"]);
    expect(segmentLyric("well-known", "en")).toEqual(["well", "known"]);
    expect(segmentLyric("o'clock", "en")).toEqual(["o'", "clock"]);
    expect(segmentLyric("rock'n'roll", "en")).toEqual(["rock", "n", "roll"]);
    expect(segmentLyric("hello 世界", "en")).toEqual(["hel", "lo", "世", "界"]);
    expect(segmentLyric("きょう", "en")).toEqual(["き", "ょ", "う"]);
  });
});

describe("japanese segmenter", () => {
  it.each([
    ["きょう", ["きょ", "う"]],
    ["かって", ["か", "っ", "て"]],
    ["がっこう", ["が", "っ", "こ", "う"]],
    ["びょういん", ["びょ", "う", "い", "ん"]],
    ["こんにちは", ["こ", "ん", "に", "ち", "は"]],
    ["パーティー", ["パ", "ー", "ティ", "ー"]],
    ["コーヒー", ["コ", "ー", "ヒ", "ー"]],
    ["チェック", ["チェ", "ッ", "ク"]],
    ["ファイル", ["ファ", "イ", "ル"]],
    ["しゃちょう", ["しゃ", "ちょ", "う"]],
    ["んょ", ["ん", "ょ"]],
    ["っょ", ["っ", "ょ"]],
  ] as const)("splits %s into morae", (text, morae) => {
    expect(japaneseMorae(text)).toEqual([...morae]);
    expect(segmenters.ja.segment(text)).toEqual([...morae]);
  });

  it("normalizes halfwidth kana and keeps kanji as one character", () => {
    expect(segmentLyric("ｷｮｳ", "ja")).toEqual(["キョ", "ウ"]);
    expect(segmentLyric("愛してる", "ja")).toEqual(["愛", "し", "て", "る"]);
    expect(segmentLyric("東京の夜", "ja")).toEqual(["東", "京", "の", "夜"]);
    expect(segmentLyric("I love あなた", "ja")).toEqual(["I", "love", "あ", "な", "た"]);
  });
});

describe("mandarin segmenter", () => {
  it("keeps one Han character per syllable, including erhua", () => {
    expect(segmenters.cmn.segment("你好，世界！")).toEqual(["你", "好", "世", "界"]);
    expect(segmentLyric("《你好》", "cmn")).toEqual(["你", "好"]);
    expect(segmentLyric("花儿", "cmn")).toEqual(["花", "儿"]);
    expect(segmentLyric("這兒", "cmn")).toEqual(["這", "兒"]);
    expect(segmentLyric("这儿", "cmn")).toEqual(["这", "儿"]);
  });

  it("does not syllabify Latin or combine kana", () => {
    expect(segmentLyric("Hello", "cmn")).toEqual(["H", "e", "l", "l", "o"]);
    expect(segmentLyric("helloきょう", "cmn")).toEqual(["h", "e", "l", "l", "o", "き", "ょ", "う"]);
  });

  it("counts a non-BMP Han character once and skips zero-width marks", () => {
    const ext = "\u{20000}";
    expect(ext.length).toBe(2);
    expect(segmentLyric(`${ext}人`, "cmn")).toEqual([ext, "人"]);
    expect(segmentLyric("你\u200b好", "cmn")).toEqual(["你", "好"]);
  });
});

describe("inferLyricLang", () => {
  it("picks Japanese when kana is present, else English when Latin is, else Mandarin", () => {
    expect(inferLyricLang("人人常歡笑，不要眼淚掉")).toBe("cmn");
    expect(inferLyricLang("hello world")).toBe("en");
    expect(inferLyricLang("hello 世界")).toBe("en");
    expect(inferLyricLang("きょう")).toBe("ja");
    expect(inferLyricLang("愛してる")).toBe("ja");
    expect(inferLyricLang("東京")).toBe("cmn");
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

  it("drops extra syllables, leaves a short line blank, and says so", () => {
    const slots = Array.from({ length: 4 }, () => ({ source: "舊", melisma: true }));
    expect(alignSources(slots, ["人", "人", "常", "歡", "笑"]).map((slot) => slot.source)).toEqual([
      "人", "人", "常", "歡",
    ]);
    expect(alignSources(slots, ["hel", "lo"]).map((slot) => slot.source)).toEqual(["hel", "lo", "", ""]);
    expect(alignmentNote(3, 10)).toBe(
      "音節 3 個，音符 10 個。多出嚟嘅音節會被擱低，未有音節嘅格會空住。",
    );
    expect(alignmentNote(12, 10)).toBe(
      "音節 12 個，音符 10 個。多出嚟嘅音節會被擱低，未有音節嘅格會空住。",
    );
    expect(alignmentNote(10, 10)).toBe("");
  });
});

describe("alignLyric", () => {
  it("returns one source per slot and does not join leftovers into the last slot", () => {
    const slots = [
      { id: "1", source: "舊", melisma: false, character: "甲" },
      { id: "2", source: "舊", melisma: false, character: "乙" },
    ];
    const aligned = alignLyric(slots, "going home", "en");
    expect(aligned).toHaveLength(slots.length);
    expect(aligned.map((slot) => slot.source)).toEqual(["go", "ing"]);
    expect(aligned.map((slot) => slot.id)).toEqual(["1", "2"]);
    expect(aligned.map((slot) => slot.character)).toEqual(["甲", "乙"]);
  });

  it("leaves the extra slots empty when the line is short", () => {
    const slots = [
      { id: "a", source: "舊", melisma: true },
      { id: "b", source: "舊", melisma: false },
      { id: "c", source: "舊", melisma: false },
    ];
    expect(alignLyric(slots, "go", "en").map((slot) => slot.source)).toEqual(["go", "", ""]);
    expect(alignLyric(slots, "你好世界", "cmn").map((slot) => slot.source)).toEqual(["你", "好", "世"]);
    expect(alignLyric(slots, "きょう", "ja").map((slot) => slot.source)).toEqual(["きょ", "う", ""]);
  });

  it("keeps slot ids and manual edits the way a melody rematch keeps them", () => {
    const slots = [
      {
        id: "slot-a",
        source: "old",
        melisma: true,
        character: "歡",
        reading: "fun1",
        override: "0" as const,
        pitch: 64,
      },
      {
        id: "slot-b",
        source: "手改",
        melisma: false,
        character: "笑",
        reading: null,
        override: null,
        pitch: 65,
      },
    ];
    const aligned = alignLyric(slots, "你", "cmn");
    expect(aligned.map((slot) => slot.id)).toEqual(["slot-a", "slot-b"]);
    expect(aligned[0]).toMatchObject({
      source: "你",
      melisma: false,
      character: "歡",
      reading: "fun1",
      override: "0",
      pitch: 64,
    });
    expect(aligned[1]).toMatchObject({
      source: "",
      melisma: false,
      character: "笑",
      reading: null,
      override: null,
      pitch: 65,
    });
    expect(aligned[0].id).toBe(slots[0].id);
    expect(aligned[1].id).toBe(slots[1].id);
  });
});
