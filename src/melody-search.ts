/**
 * Song title → melody (MIDI notes). Not lyrics.
 *
 * 《小星星》 / Twinkle Twinkle / Ah! vous dirai-je, maman comes from the
 * bundled public-domain MIDI in `melody-catalog.ts`. Any other title is
 * looked up on Wikimedia Commons, and only a free-licensed MIDI file
 * (public domain, CC0, CC BY, CC BY-SA) is kept.
 *
 * This module stops at notes. The editor imports them with
 * `slotsForTrackChoice`, the same step a recording uses after
 * `melodyFromFrames`. Pitch → 0243 stays in `mapMelody`.
 */
import { twinkleMidi, TWINKLE_SOURCE_URL } from "./melody-catalog";
import { midiNoteName, parseMidi, type MidiTrack } from "./midi";
import type { IncomingNote } from "./slots";

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const COMMONS_CLIENT = "CantoLyrics/0.1 (https://wing22622.github.io/CantoLyrics/)";
const SEARCH_LIMIT = "15";
const HIT_LIMIT = 5;
const MAX_MIDI_BYTES = 1_000_000;
const MELODY_TRACK = /melody|vocal|voice|\blead\b|sing|旋律|主唱/i;

export interface MelodyQuery {
  trackName: string;
  artistName: string;
}

export type MelodySource =
  | { kind: "bundle"; id: "twinkle" }
  | { kind: "commons"; fileUrl: string; pageUrl: string; license: string; fileTitle: string };

export interface MelodyHit {
  id: string;
  label: string;
  detail: string;
  /** Title the user typed. Stored on the song. */
  title: string;
  sourceUrl: string;
  ref: MelodySource;
}

export interface ResolvedMelody {
  title: string;
  tracks: MidiTrack[];
  trackIndex: number;
  source: string;
  sourceUrl: string;
  warnings: string[];
}

export type MelodyFailure =
  | { status: "not-found" }
  | { status: "network" }
  | { status: "bad-response" }
  | { status: "rate-limit" }
  | { status: "empty" }
  | { status: "unreadable" };

export type MelodySearchOutcome = { ok: true; hits: MelodyHit[] } | { ok: false; failure: MelodyFailure };

export type MelodyResolveOutcome = { ok: true; melody: ResolvedMelody } | { ok: false; failure: MelodyFailure };

export function melodySearchMessage(failure: MelodyFailure): string {
  switch (failure.status) {
    case "not-found":
      return "搵唔到免費授權嘅旋律。可以改歌名或者歌手再搵，又或者上載 MIDI。";
    case "network":
      return "連唔到 Wikimedia Commons。檢查網絡之後再試，或者上載 MIDI。";
    case "bad-response":
      return "旋律庫回覆睇唔明。可以再試，或者上載 MIDI。";
    case "rate-limit":
      return "Wikimedia Commons 限制咗查詢。等一陣再試，或者上載 MIDI。";
    case "empty":
      return "呢個 MIDI 入面冇旋律音。可以揀另一首，或者上載 MIDI。";
    case "unreadable":
      return "呢個 MIDI 讀唔到。可以揀另一首，或者上載 MIDI。";
  }
}

/** One MIDI track in the shape `melodyFromFrames` returns. */
export function sungNotes(track: MidiTrack): IncomingNote[] {
  return track.notes.map((note) => ({
    rest: false,
    pitch: note.pitch,
    beats: note.beats,
    label: midiNoteName(note.pitch),
    bar: note.bar,
  }));
}

/** Prefer a track named like a melody. Otherwise the one with the most notes. */
export function chooseMelodyTrack(tracks: readonly { name: string; notes: readonly unknown[] }[]): number {
  if (tracks.length === 0) return 0;
  const named = tracks.findIndex((track) => track.notes.length > 0 && MELODY_TRACK.test(track.name));
  if (named >= 0) return named;
  let best = 0;
  for (let index = 1; index < tracks.length; index++) {
    if (tracks[index].notes.length > tracks[best].notes.length) best = index;
  }
  return best;
}

export function isFreeMelodyLicense(raw: string): boolean {
  const text = raw.toLowerCase().replace(/<[^>]*>/g, " ");
  if (!text.trim()) return false;
  if (/non-?commercial|\bnc\b|no ?derivatives|\bnd\b|fair use|all rights reserved|copyrighted/.test(text)) return false;
  return /public domain|\bcc0\b|\bcc[-\s]?by\b|gfdl|free art|no restrictions|\bpd\b/.test(text);
}

export function normalizeMelodyTitle(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();
}

function isBundledTwinkle(title: string): boolean {
  const norm = normalizeMelodyTitle(title);
  if (!norm) return false;
  if (norm.includes("小星星") || norm.includes("一閃一閃")) return true;
  if (norm === "twinkle twinkle" || norm.startsWith("twinkle twinkle ")) return true;
  return norm.includes("vous dirai");
}

function bundleHit(title: string): MelodyHit {
  return {
    id: "bundle:twinkle",
    label: "小星星",
    detail: "內置公有領域",
    title,
    sourceUrl: TWINKLE_SOURCE_URL,
    ref: { kind: "bundle", id: "twinkle" },
  };
}

export async function searchMelody(query: MelodyQuery, fetchImpl: typeof fetch = fetch): Promise<MelodySearchOutcome> {
  const trackName = query.trackName.trim();
  if (!trackName) return { ok: false, failure: { status: "not-found" } };
  if (isBundledTwinkle(trackName)) return { ok: true, hits: [bundleHit(trackName)] };
  return searchCommons({ trackName, artistName: query.artistName.trim() }, fetchImpl);
}

export async function resolveMelody(hit: MelodyHit, fetchImpl: typeof fetch = fetch): Promise<MelodyResolveOutcome> {
  if (hit.ref.kind === "bundle") return midiOutcome(hit, twinkleMidi(), bundleSource());
  const response = await request(hit.ref.fileUrl, fetchImpl, "audio/midi");
  if (response === "network") return { ok: false, failure: { status: "network" } };
  if (response.status === 429) return { ok: false, failure: { status: "rate-limit" } };
  if (!response.ok) return { ok: false, failure: { status: "unreadable" } };
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MIDI_BYTES) {
    return { ok: false, failure: { status: "unreadable" } };
  }
  return midiOutcome(hit, bytes, commonsSource(hit.ref));
}

function bundleSource(): string {
  return "旋律來自內置公有領域曲《小星星》首句七音（Ah! vous dirai-je, maman）。呢段 MIDI 寫喺程式入面，唔係成首歌，亦唔係歌詞。";
}

function commonsSource(ref: Extract<MelodySource, { kind: "commons" }>): string {
  return `旋律來自 Wikimedia Commons「${ref.fileTitle}」（${ref.license}）。`;
}

function midiOutcome(hit: MelodyHit, bytes: Uint8Array, source: string): MelodyResolveOutcome {
  let parsed: ReturnType<typeof parseMidi>;
  try {
    parsed = parseMidi(bytes);
  } catch {
    return { ok: false, failure: { status: "unreadable" } };
  }
  if (parsed.tracks.length === 0) return { ok: false, failure: { status: "empty" } };
  const trackIndex = chooseMelodyTrack(parsed.tracks);
  return {
    ok: true,
    melody: {
      title: hit.title,
      tracks: parsed.tracks,
      trackIndex,
      source,
      sourceUrl: hit.sourceUrl,
      warnings: parsed.warnings,
    },
  };
}

async function searchCommons(query: MelodyQuery, fetchImpl: typeof fetch): Promise<MelodySearchOutcome> {
  const response = await request(commonsSearchUrl(query), fetchImpl, "application/json");
  if (response === "network") return { ok: false, failure: { status: "network" } };
  if (response.status === 429) return { ok: false, failure: { status: "rate-limit" } };
  if (response.status === 404) return { ok: false, failure: { status: "not-found" } };
  if (!response.ok) return { ok: false, failure: { status: "bad-response" } };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, failure: { status: "bad-response" } };
  }
  if (!body || typeof body !== "object") return { ok: false, failure: { status: "bad-response" } };
  if ("error" in body) return { ok: false, failure: { status: "bad-response" } };
  const hits = commonsHits(body, query.trackName);
  if (hits.length === 0) return { ok: false, failure: { status: "not-found" } };
  return { ok: true, hits };
}

export function commonsSearchUrl(query: MelodyQuery): string {
  const text = [query.trackName.trim(), query.artistName.trim(), "midi"].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: text,
    gsrnamespace: "6",
    gsrlimit: SEARCH_LIMIT,
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiextmetadatafilter: "LicenseShortName|UsageTerms",
  });
  return `${COMMONS_API}?${params.toString()}`;
}

function commonsHits(body: object, title: string): MelodyHit[] {
  const pages = (body as { query?: { pages?: unknown } }).query?.pages;
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) return [];
  const ranked = Object.values(pages as Record<string, unknown>).flatMap((page) =>
    page && typeof page === "object" ? [page] : [],
  );
  ranked.sort((a, b) => pageIndex(a) - pageIndex(b));
  const hits: MelodyHit[] = [];
  for (const page of ranked) {
    const hit = commonsHit(page, title);
    if (!hit) continue;
    hits.push(hit);
    if (hits.length >= HIT_LIMIT) break;
  }
  return hits;
}

function pageIndex(page: object): number {
  const index = (page as { index?: unknown }).index;
  return typeof index === "number" && Number.isFinite(index) ? index : Number.MAX_SAFE_INTEGER;
}

function commonsHit(page: object, title: string): MelodyHit | null {
  const fileTitle = fileLabel(textField(page, "title"));
  const info = firstImage(page);
  if (!fileTitle || !info) return null;
  if (!isMidi(info.mime, info.url)) return null;
  const license = plainText(info.license);
  if (!isFreeMelodyLicense(license)) return null;
  const fileUrl = wikimediaUpload(info.url);
  if (!fileUrl) return null;
  const pageUrl = commonsPage(textField(page, "title"), info.descriptionUrl);
  return {
    id: fileUrl,
    label: fileTitle,
    detail: license,
    title,
    sourceUrl: pageUrl,
    ref: { kind: "commons", fileUrl, pageUrl, license, fileTitle },
  };
}

function firstImage(page: object): { url: string; descriptionUrl: string; mime: string; license: string } | null {
  const list = (page as { imageinfo?: unknown }).imageinfo;
  if (!Array.isArray(list) || !list[0] || typeof list[0] !== "object") return null;
  const info = list[0] as Record<string, unknown>;
  const url = typeof info.url === "string" ? info.url : "";
  const mime = typeof info.mime === "string" ? info.mime : "";
  const descriptionUrl = typeof info.descriptionurl === "string" ? info.descriptionurl : "";
  const metadata = info.extmetadata;
  const license = metadataText(metadata, "LicenseShortName") || metadataText(metadata, "UsageTerms");
  if (!url || !mime) return null;
  return { url, descriptionUrl, mime, license };
}

function metadataText(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== "object") return "";
  const entry = (metadata as Record<string, unknown>)[key];
  if (!entry || typeof entry !== "object") return "";
  const value = (entry as { value?: unknown }).value;
  return typeof value === "string" ? value : "";
}

function textField(page: object, key: string): string {
  const value = (page as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function fileLabel(title: string): string {
  return title.replace(/^File:/i, "").replace(/\.midi?$/i, "").replace(/_/g, " ").trim();
}

function plainText(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function isMidi(mime: string, url: string): boolean {
  const type = mime.toLowerCase().split(";")[0].trim();
  if (type === "audio/midi" || type === "audio/mid" || type === "audio/x-midi" || type === "application/x-midi") {
    return true;
  }
  const path = url.split("?")[0].toLowerCase();
  return path.endsWith(".mid") || path.endsWith(".midi");
}

function wikimediaUpload(value: string): string {
  return allowedHttps(value, "upload.wikimedia.org");
}

function commonsPage(title: string, descriptionUrl: string): string {
  const direct = allowedHttps(descriptionUrl, "commons.wikimedia.org");
  if (direct) return direct;
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function allowedHttps(value: string, host: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== host) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function request(url: string, fetchImpl: typeof fetch, accept: string): Promise<Response | "network"> {
  try {
    return await fetchImpl(url, {
      headers: {
        Accept: accept,
        "Api-User-Agent": COMMONS_CLIENT,
        "User-Agent": COMMONS_CLIENT,
      },
    });
  } catch {
    return "network";
  }
}
