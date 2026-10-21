import type { Code0243 } from "./tone-0243";

const KEY = "cantolyrics.songs.v1";

export interface StoredSlot {
  pitch: number;
  beats: number;
  label: string;
  bar: number;
  code: Code0243;
  source: string;
  melisma: boolean;
  character: string;
  reading: string | null;
}

export interface StoredSong {
  id: string;
  title: string;
  updatedAt: number;
  jianpu: string;
  sourceLyrics: string;
  slots: StoredSlot[];
}

function readAll(): StoredSong[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredSong[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function listSongs(): StoredSong[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveSong(song: StoredSong): StoredSong[] {
  const all = readAll().filter((item) => item.id !== song.id);
  all.push(song);
  localStorage.setItem(KEY, JSON.stringify(all));
  return listSongs();
}

export function deleteSong(id: string): StoredSong[] {
  const all = readAll().filter((item) => item.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
  return listSongs();
}
