import type { StoredSong } from "./storage";

/** Short line for a library card. Typed characters win; otherwise the source lyric. */
export function lyricPreview(song: Pick<StoredSong, "slots" | "sourceLyrics">, limit = 24): string {
  const typed = song.slots.map((slot) => (slot.melisma ? "" : slot.character)).join("").trim();
  const text = typed || song.sourceLyrics.trim();
  if (!text) return "未有歌詞";
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  return `${chars.slice(0, limit).join("")}…`;
}

export function formatUpdated(updatedAt: number): string {
  const date = new Date(updatedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Match a title, the source lyric, or characters already typed into slots. */
export function filterSongs(songs: readonly StoredSong[], query: string): StoredSong[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...songs];
  return songs.filter((song) => {
    const typed = song.slots.map((slot) => slot.character).join("");
    const haystack = `${song.title}\n${song.sourceLyrics}\n${typed}`.toLowerCase();
    return haystack.includes(needle);
  });
}
