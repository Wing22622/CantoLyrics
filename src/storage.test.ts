// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { effectiveCode } from "./slots";
import {
  SONG_LIBRARY_KEY,
  StorageFullError,
  deleteSong,
  listSongs,
  renameSong,
  saveSong,
  type StoredSong,
} from "./storage";

function song(id: string, title: string, updatedAt: number, character = "歌"): StoredSong {
  return {
    id,
    title,
    updatedAt,
    jianpu: "1 2 3",
    sourceLyrics: "hello",
    slots: [
      {
        pitch: 60,
        beats: 1,
        label: "1",
        bar: 1,
        mapped: "4",
        override: "0",
        source: "hel",
        melisma: false,
        character,
        reading: "go1",
      },
    ],
  };
}

describe("song storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a song through localStorage and lists the newest first", () => {
    saveSong(song("a", "舊歌", 1));
    saveSong(song("b", "新歌", 2));
    expect(listSongs().map((item) => item.title)).toEqual(["新歌", "舊歌"]);
    expect(listSongs()[1].slots[0].character).toBe("歌");
    expect(listSongs()[1].slots[0].override).toBe("0");
    expect(JSON.parse(localStorage.getItem(SONG_LIBRARY_KEY) ?? "[]")).toHaveLength(2);
  });

  it("keeps other songs when one song is saved again", () => {
    saveSong(song("a", "星期一", 1, "歡"));
    saveSong(song("b", "星期二", 2, "但"));
    saveSong(song("a", "星期一改", 3, "笑"));
    const songs = listSongs();
    expect(songs.map((item) => item.title)).toEqual(["星期一改", "星期二"]);
    expect(songs[0].slots[0].character).toBe("笑");
    expect(songs[1].slots[0].character).toBe("但");
  });

  it("renames a song and deletes it", () => {
    saveSong(song("a", "舊名", 1));
    saveSong(song("b", "另一首", 2, "係"));
    const renamed = renameSong("a", "  新名  ", 4);
    expect(renamed.find((item) => item.id === "a")?.title).toBe("新名");
    expect(renamed.find((item) => item.id === "b")?.slots[0].character).toBe("係");
    expect(deleteSong("a").map((item) => item.id)).toEqual(["b"]);
    expect(deleteSong("b")).toEqual([]);
  });

  it("stores a blank title as 未命名", () => {
    const [saved] = saveSong(song("a", "   ", 1));
    expect(saved.title).toBe("未命名");
    expect(renameSong("a", "  ")[0].title).toBe("未命名");
  });

  it("reads an older save that only stored code", () => {
    localStorage.setItem(
      SONG_LIBRARY_KEY,
      JSON.stringify([
        {
          id: "old",
          title: "舊格式",
          updatedAt: 1,
          jianpu: "1",
          sourceLyrics: "",
          slots: [
            {
              pitch: 60,
              beats: 1,
              label: "1",
              bar: 1,
              code: "3",
              source: "",
              melisma: false,
              character: "歡",
              reading: null,
            },
          ],
        },
      ]),
    );
    const slot = listSongs()[0].slots[0];
    expect(slot.mapped).toBe("3");
    expect(slot.override).toBe(null);
    expect(effectiveCode(slot)).toBe("3");
    expect(slot.character).toBe("歡");
  });

  it("migrates a single song object into the library", () => {
    localStorage.setItem(
      SONG_LIBRARY_KEY,
      JSON.stringify({
        title: "舊單一",
        jianpu: "1 2",
        sourceLyrics: "你好",
        updatedAt: 9,
        slots: [
          {
            pitch: 60,
            beats: 1,
            label: "1",
            bar: 1,
            code: "3",
            character: "你",
            melisma: false,
            source: "你",
            reading: null,
          },
        ],
      }),
    );
    const songs = listSongs();
    expect(songs).toHaveLength(1);
    expect(songs[0].title).toBe("舊單一");
    expect(songs[0].sourceLyrics).toBe("你好");
    expect(songs[0].slots[0].character).toBe("你");
    expect(songs[0].slots[0].mapped).toBe("3");
    expect(songs[0].id).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem(SONG_LIBRARY_KEY) ?? "[]") as StoredSong[];
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(songs[0].id);
    expect(listSongs()[0].id).toBe(songs[0].id);
  });

  it("still lists a single-song save when rewriting the library is out of space", () => {
    localStorage.setItem(
      SONG_LIBRARY_KEY,
      JSON.stringify({ title: "舊單一", jianpu: "1", sourceLyrics: "你", slots: [], updatedAt: 3 }),
    );
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    try {
      expect(listSongs()[0].title).toBe("舊單一");
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("fills an id when an M1 song was stored without one", () => {
    localStorage.setItem(
      SONG_LIBRARY_KEY,
      JSON.stringify([{ title: "冇 id", updatedAt: 2, jianpu: "", sourceLyrics: "笑", slots: [] }]),
    );
    const first = listSongs()[0];
    expect(first.title).toBe("冇 id");
    expect(first.id).toBeTruthy();
    expect(listSongs()[0].id).toBe(first.id);
  });

  it("treats corrupt storage as an empty list", () => {
    localStorage.setItem(SONG_LIBRARY_KEY, "{");
    expect(listSongs()).toEqual([]);
    localStorage.setItem(SONG_LIBRARY_KEY, JSON.stringify({ nope: true }));
    expect(listSongs()).toEqual([]);
    expect(localStorage.getItem(SONG_LIBRARY_KEY)).toBe(JSON.stringify({ nope: true }));
  });

  it("throws a readable error when localStorage is full and keeps the earlier song", () => {
    saveSong(song("a", "仲喺度", 1, "歡"));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    try {
      expect(() => saveSong(song("b", "新歌", 2))).toThrow(StorageFullError);
      expect(() => saveSong(song("b", "新歌", 2))).toThrow(/儲存空間滿咗/);
    } finally {
      Storage.prototype.setItem = original;
    }
    expect(listSongs().map((item) => item.id)).toEqual(["a"]);
    expect(listSongs()[0].slots[0].character).toBe("歡");
  });
});
