// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { deleteSong, listSongs, saveSong, type StoredSong } from "./storage";

function song(id: string, title: string, updatedAt: number): StoredSong {
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
        code: "4",
        source: "hel",
        melisma: false,
        character: "歌",
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
    expect(JSON.parse(localStorage.getItem("cantolyrics.songs.v1") ?? "[]")).toHaveLength(2);
  });

  it("replaces a song with the same id and deletes it", () => {
    saveSong(song("a", "舊名", 1));
    const saved = saveSong({ ...song("a", "新名", 3), jianpu: "5 6" });
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe("新名");
    expect(saved[0].jianpu).toBe("5 6");
    expect(deleteSong("a")).toEqual([]);
    expect(listSongs()).toEqual([]);
  });

  it("treats corrupt storage as an empty list", () => {
    localStorage.setItem("cantolyrics.songs.v1", "{");
    expect(listSongs()).toEqual([]);
    localStorage.setItem("cantolyrics.songs.v1", JSON.stringify({ nope: true }));
    expect(listSongs()).toEqual([]);
  });
});
