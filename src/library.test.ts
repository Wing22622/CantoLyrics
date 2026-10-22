import { describe, expect, it } from "vitest";
import { filterSongs, formatUpdated, lyricPreview } from "./library";
import type { StoredSong } from "./storage";

function song(partial: Partial<StoredSong> & Pick<StoredSong, "id" | "title">): StoredSong {
  return {
    updatedAt: 1,
    jianpu: "",
    sourceLyrics: "",
    slots: [],
    ...partial,
  };
}

describe("song library search", () => {
  const songs = [
    song({
      id: "mon",
      title: "星期一",
      updatedAt: 1,
      sourceLyrics: "不要眼淚掉",
      slots: [
        { pitch: 60, beats: 1, label: "1", bar: 1, mapped: "4", override: null, source: "", melisma: false, character: "歡", reading: null },
        { pitch: 62, beats: 1, label: "2", bar: 1, mapped: "4", override: null, source: "", melisma: false, character: "", reading: null },
      ],
    }),
    song({
      id: "tue",
      title: "世界真細小",
      updatedAt: 2,
      sourceLyrics: "",
      slots: [
        { pitch: 64, beats: 1, label: "3", bar: 1, mapped: "0", override: null, source: "", melisma: false, character: "但", reading: null },
        { pitch: 65, beats: 1, label: "4", bar: 1, mapped: "2", override: null, source: "", melisma: false, character: "係", reading: null },
      ],
    }),
  ];

  it("returns every song when the query is blank", () => {
    expect(filterSongs(songs, "  ").map((item) => item.id)).toEqual(["mon", "tue"]);
  });

  it("matches a title, a typed character, or the source lyric", () => {
    expect(filterSongs(songs, "世界").map((item) => item.id)).toEqual(["tue"]);
    expect(filterSongs(songs, "歡").map((item) => item.id)).toEqual(["mon"]);
    expect(filterSongs(songs, "眼淚").map((item) => item.id)).toEqual(["mon"]);
    expect(filterSongs(songs, "但係").map((item) => item.id)).toEqual(["tue"]);
    expect(filterSongs(songs, "沒有")).toEqual([]);
  });

  it("matches titles without caring about case", () => {
    const named = [song({ id: "en", title: "Hello World" })];
    expect(filterSongs(named, "hello").map((item) => item.id)).toEqual(["en"]);
  });

  it("previews typed characters, then the source lyric, then an empty label", () => {
    expect(lyricPreview(songs[0])).toBe("歡");
    expect(lyricPreview(song({ id: "src", title: "只得原詞", sourceLyrics: "你好嗎" }))).toBe("你好嗎");
    expect(lyricPreview(song({ id: "empty", title: "空" }))).toBe("未有歌詞");
    const long = song({
      id: "long",
      title: "長",
      slots: Array.from({ length: 30 }, () => ({
        pitch: 60,
        beats: 1,
        label: "1",
        bar: 1,
        mapped: "4" as const,
        override: null,
        source: "",
        melisma: false,
        character: "字",
        reading: null,
      })),
    });
    expect(lyricPreview(long)).toBe(`${"字".repeat(24)}…`);
    expect(Array.from(lyricPreview(long)).length).toBe(25);
  });

  it("formats the updated time in local calendar fields", () => {
    const when = new Date(2026, 9, 22, 7, 5).getTime();
    expect(formatUpdated(when)).toBe("2026年10月22日 07:05");
  });
});
