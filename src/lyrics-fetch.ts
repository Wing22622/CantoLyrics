export const LRCLIB_CLIENT = "CantoLyrics/0.1 (https://wing22622.github.io/CantoLyrics/)";

const CLIENT_HEADERS = {
  Accept: "application/json",
  "User-Agent": LRCLIB_CLIENT,
  "Lrclib-Client": LRCLIB_CLIENT,
};

const SEARCH_URL = "https://lrclib.net/api/search";

const TIME_TAG = /\[(?:\d{1,3}:){1,2}\d{1,2}(?:[.:]\d{1,3})?\]/g;
const WORD_TAG = /<(?:\d{1,3}:){1,2}\d{1,2}(?:[.:]\d{1,3})?>/g;
const META_LINE = /^\s*\[[a-zA-Z][a-zA-Z0-9]*:[^\]]*\]\s*$/;

export interface LyricQuery {
  trackName: string;
  artistName: string;
}

export interface LyricHit {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  lyrics: string;
}

export interface FoundLyrics {
  title: string;
  lyrics: string;
}

export type LyricSearchFailure =
  | { status: "not-found" }
  | { status: "network" }
  | { status: "rate-limit"; retryAfterSeconds: number | null }
  | { status: "unavailable"; retryAfterSeconds: number | null }
  | { status: "bad-response" };

export type LyricSearchOutcome =
  | { ok: true; hits: LyricHit[] }
  | { ok: false; failure: LyricSearchFailure };

export function stripTimingTags(synced: string): string {
  return synced
    .split(/\r?\n/)
    .filter((line) => !META_LINE.test(line))
    .map((line) => line.replace(TIME_TAG, "").replace(WORD_TAG, "").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export function readRetryAfter(header: string | null, now: number): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Math.max(0, Math.ceil(Number(trimmed)));
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

export function lyricSearchMessage(failure: LyricSearchFailure): string {
  switch (failure.status) {
    case "not-found":
      return "搵唔到有歌詞嘅版本。可以改歌名或者歌手再搵，又或者自己貼上。";
    case "network":
      return "連唔到 LRCLIB。檢查網絡之後再試，或者自己貼上歌詞。";
    case "rate-limit":
      return `LRCLIB 限制咗查詢。${waitClause(failure.retryAfterSeconds)}，或者自己貼上歌詞。`;
    case "unavailable":
      return `LRCLIB 而家好忙。${waitClause(failure.retryAfterSeconds)}，或者自己貼上歌詞。`;
    case "bad-response":
      return "LRCLIB 回覆睇唔明。可以再試，或者自己貼上歌詞。";
  }
}

function waitClause(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "等一陣再試";
  return `等約 ${seconds} 秒再試`;
}

export async function searchLyrics(
  query: LyricQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<LyricSearchOutcome> {
  const trackName = query.trackName.trim();
  if (!trackName) return { ok: false, failure: { status: "not-found" } };
  const artistName = query.artistName.trim();

  const attempts: Record<string, string>[] = [{ track_name: trackName }];
  if (artistName) {
    attempts[0].artist_name = artistName;
    attempts.push({ q: `${trackName} ${artistName}` });
  }

  let outcome: LyricSearchOutcome = { ok: false, failure: { status: "not-found" } };
  for (const params of attempts) {
    outcome = await fetchSearch(params, fetchImpl);
    if (outcome.ok || outcome.failure.status !== "not-found") return outcome;
  }
  return outcome;
}

async function fetchSearch(
  params: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<LyricSearchOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(`${SEARCH_URL}?${new URLSearchParams(params).toString()}`, {
      headers: CLIENT_HEADERS,
    });
  } catch {
    return { ok: false, failure: { status: "network" } };
  }

  if (response.status === 429) {
    return {
      ok: false,
      failure: { status: "rate-limit", retryAfterSeconds: readRetryAfter(response.headers.get("retry-after"), Date.now()) },
    };
  }
  if (response.status === 404) return { ok: false, failure: { status: "not-found" } };
  if (response.status >= 500) {
    return {
      ok: false,
      failure: { status: "unavailable", retryAfterSeconds: readRetryAfter(response.headers.get("retry-after"), Date.now()) },
    };
  }
  if (!response.ok) return { ok: false, failure: { status: "bad-response" } };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, failure: { status: "bad-response" } };
  }
  if (!Array.isArray(body)) return { ok: false, failure: { status: "bad-response" } };

  const hits = body.flatMap((row) => {
    const hit = lyricHit(row);
    return hit ? [hit] : [];
  });
  if (hits.length === 0) return { ok: false, failure: { status: "not-found" } };
  return { ok: true, hits };
}

function lyricHit(row: unknown): LyricHit | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  if (record.instrumental === true) return null;
  const trackName = textField(record, "trackName") || textField(record, "name");
  const lyrics = usableLyrics(record);
  if (!trackName || !lyrics) return null;
  const id = typeof record.id === "number" && Number.isFinite(record.id) ? record.id : 0;
  return {
    id,
    trackName,
    artistName: textField(record, "artistName"),
    albumName: textField(record, "albumName"),
    lyrics,
  };
}

function usableLyrics(record: Record<string, unknown>): string {
  const plain = textField(record, "plainLyrics");
  if (plain) return plain;
  const synced = record.syncedLyrics;
  if (typeof synced !== "string") return "";
  return stripTimingTags(synced).trim();
}

function textField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}
