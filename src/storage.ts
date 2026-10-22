import { normalizeSlot, type LyricSlot } from "./slots";

export const SONG_LIBRARY_KEY = "cantolyrics.songs.v1";

export type StoredSlot = LyricSlot;

export interface StoredSong {
  id: string;
  title: string;
  updatedAt: number;
  jianpu: string;
  sourceLyrics: string;
  slots: StoredSlot[];
}

export class StorageFullError extends Error {
  constructor() {
    super("呢個瀏覽器嘅儲存空間滿咗，呢次儲存唔到。");
    this.name = "StorageFullError";
  }
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const code = "code" in error ? Number(error.code) : 0;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22;
}

function writeAll(songs: readonly StoredSong[]): void {
  try {
    localStorage.setItem(SONG_LIBRARY_KEY, JSON.stringify(songs));
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError();
    throw error;
  }
}

function record(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function looksLikeSong(value: Record<string, unknown>): boolean {
  return (
    typeof value.title === "string" ||
    typeof value.jianpu === "string" ||
    typeof value.sourceLyrics === "string" ||
    Array.isArray(value.slots)
  );
}

function toSong(value: Record<string, unknown>, id: string): StoredSong {
  const title = typeof value.title === "string" ? value.title.trim() : "";
  return {
    id,
    title: title || "未命名",
    updatedAt: typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now(),
    jianpu: typeof value.jianpu === "string" ? value.jianpu : "",
    sourceLyrics: typeof value.sourceLyrics === "string" ? value.sourceLyrics : "",
    slots: Array.isArray(value.slots) ? value.slots.map((slot) => normalizeSlot(slot)) : [],
  };
}

/** One stored song. A missing id is filled so later saves can find it. */
function normalizeSong(raw: unknown): { song: StoredSong; filledId: boolean } | null {
  const value = record(raw);
  if (!value || !looksLikeSong(value)) return null;
  const id = typeof value.id === "string" && value.id.trim() ? value.id : crypto.randomUUID();
  return { song: toSong(value, id), filledId: id !== value.id };
}

/**
 * Read the library.
 * M1 already stored an array under `cantolyrics.songs.v1`.
 * A single song object at that key is wrapped into the array and written back,
 * so that older payload is not dropped on the next read.
 */
function readAll(): StoredSong[] {
  try {
    const raw = localStorage.getItem(SONG_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      let filledId = false;
      const songs = parsed.flatMap((item) => {
        const normalized = normalizeSong(item);
        if (!normalized) return [];
        if (normalized.filledId) filledId = true;
        return [normalized.song];
      });
      if (filledId) writeBack(songs);
      return songs;
    }
    const single = normalizeSong(parsed);
    if (!single) return [];
    const songs = [single.song];
    writeBack(songs);
    return songs;
  } catch {
    return [];
  }
}

/** Migration writes are best-effort. A full disk still returns the songs. */
function writeBack(songs: readonly StoredSong[]): void {
  try {
    writeAll(songs);
  } catch (error) {
    if (error instanceof StorageFullError) return;
    throw error;
  }
}

export function listSongs(): StoredSong[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function blankSong(title = "未命名", now = Date.now()): StoredSong {
  return {
    id: crypto.randomUUID(),
    title: title.trim() || "未命名",
    updatedAt: now,
    jianpu: "",
    sourceLyrics: "",
    slots: [],
  };
}

export function saveSong(song: StoredSong): StoredSong[] {
  const all = readAll().filter((item) => item.id !== song.id);
  const title = song.title.trim() || "未命名";
  all.push({ ...song, title });
  writeAll(all);
  return listSongs();
}

export function renameSong(id: string, title: string, updatedAt = Date.now()): StoredSong[] {
  const all = readAll();
  const next = all.map((song) =>
    song.id === id ? { ...song, title: title.trim() || "未命名", updatedAt } : song,
  );
  writeAll(next);
  return listSongs();
}

export function deleteSong(id: string): StoredSong[] {
  const all = readAll().filter((item) => item.id !== id);
  writeAll(all);
  return listSongs();
}
