/**
 * Song title → melody (MIDI notes). Not lyrics.
 *
 * 《小星星》 / Twinkle Twinkle / Ah! vous dirai-je, maman comes from the
 * bundled public-domain MIDI in `melody-catalog.ts` (opening seven notes).
 * Any other title is looked up on Wikimedia Commons first. If that has no
 * free-licensed MIDI, the same title is looked up on Internet Archive.
 * Only a free license is kept (public domain, CC0, CC BY, CC BY-SA), and
 * only from an allowlisted host. A file the user uploads or pastes is read
 * with the same MIDI parser and does not go through those hosts.
 *
 * This module stops at notes. The editor imports them with
 * `slotsForTrackChoice`, the same step a recording uses after
 * `melodyFromFrames`. Pitch → 0243 stays in `mapMelody`.
 */
import { twinkleMidi, TWINKLE_SOURCE_URL } from "./melody-catalog";
import { midiNoteName, parseMidi, type MidiTrack } from "./midi";
import type { IncomingNote } from "./slots";

export const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
export const ARCHIVE_API = "https://archive.org/advancedsearch.php";
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
  | { kind: "commons"; fileUrl: string; pageUrl: string; license: string; fileTitle: string }
  | { kind: "archive"; identifier: string; pageUrl: string; license: string; itemTitle: string }
  | { kind: "own" };

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
      return "搵唔到免費授權嘅旋律。可以改歌名或者歌手再搵，或者喺下面上載、貼上自己嘅 MIDI。";
    case "network":
      return "連唔到 Wikimedia Commons 同 Internet Archive。檢查網絡之後再試，或者喺下面上載、貼上自己嘅 MIDI。";
    case "bad-response":
      return "旋律庫回覆睇唔明。可以再試，或者喺下面上載、貼上自己嘅 MIDI。";
    case "rate-limit":
      return "旋律庫限制咗查詢。等一陣再試，或者喺下面上載、貼上自己嘅 MIDI。";
    case "empty":
      return "呢個 MIDI 入面冇旋律音。可以揀另一首，或者上載、貼上自己嘅 MIDI。";
    case "unreadable":
      return "呢個 MIDI 讀唔到。可以揀另一首，或者上載、貼上自己嘅 MIDI。";
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
  const text = raw.toLowerCase().replace(/<[^>]*>/g, " ").trim();
  if (!text || text === "none") return false;
  if (/non-?commercial|\bnc\b|no ?derivatives|\bnd\b|fair use|all rights reserved|copyrighted/.test(text)) {
    return false;
  }
  if (/public[-\s]?domain|\bcc0\b|\bcc[-\s]?by\b|gfdl|free art|no restrictions|\bpd\b/.test(text)) return true;
  return /creativecommons\.org\/(?:publicdomain\/(?:zero|mark)|licenses\/by(?:-sa)?\/)/.test(text);
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
  const narrowed = { trackName, artistName: query.artistName.trim() };
  const commons = await searchCommons(narrowed, fetchImpl);
  if (commons.ok && commons.hits.length > 0) return commons;
  const archive = await searchArchive(narrowed, fetchImpl);
  if (archive.ok && archive.hits.length > 0) return archive;
  return { ok: false, failure: strongerFailure(commons, archive) };
}

export async function resolveMelody(hit: MelodyHit, fetchImpl: typeof fetch = fetch): Promise<MelodyResolveOutcome> {
  if (hit.ref.kind === "bundle") return midiOutcome(hit, twinkleMidi(), bundleSource());
  if (hit.ref.kind === "own") return { ok: false, failure: { status: "unreadable" } };
  if (hit.ref.kind === "archive") return resolveArchive(hit, fetchImpl);
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

/** Bytes the user uploaded or pasted. Same parser as a searched file. */
export function melodyFromOwnMidi(bytes: Uint8Array, title: string): MelodyResolveOutcome {
  const name = title.trim() || "未命名";
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MIDI_BYTES) {
    return { ok: false, failure: { status: "unreadable" } };
  }
  return midiOutcome(
    {
      id: "own",
      label: name,
      detail: "自己嘅 MIDI",
      title: name,
      sourceUrl: "",
      ref: { kind: "own" },
    },
    bytes,
    "旋律來自你上載或者貼上嘅 MIDI。呢段唔係歌詞。",
  );
}

/** `data:audio/midi;base64,…` or raw base64 whose bytes start with `MThd`. */
export function midiBytesFromText(text: string): Uint8Array | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const dataUrl = /^data:([^,]*),([\s\S]+)$/i.exec(trimmed);
  let payload = trimmed;
  if (dataUrl) {
    const header = dataUrl[1].toLowerCase();
    if (!header.includes("base64") || !/midi|octet-stream/.test(header)) return null;
    payload = dataUrl[2];
  } else if (!/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    return null;
  }
  const clean = payload.replace(/\s+/g, "");
  if (clean.length < 16 || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    return null;
  }
  if (binary.length < 14 || binary.length > MAX_MIDI_BYTES) return null;
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "MThd") return null;
  return bytes;
}

function bundleSource(): string {
  return "旋律來自內置公有領域曲《小星星》首句七音（Ah! vous dirai-je, maman）。呢段 MIDI 寫喺程式入面，唔係成首歌，亦唔係歌詞。";
}

function commonsSource(ref: Extract<MelodySource, { kind: "commons" }>): string {
  return `旋律來自 Wikimedia Commons「${ref.fileTitle}」（${ref.license}）。`;
}

function archiveSource(ref: Extract<MelodySource, { kind: "archive" }>, fileName: string): string {
  return `旋律來自 Internet Archive「${ref.itemTitle}」（${licenseLabel(ref.license)}，檔案 ${fileName}）。`;
}

const FAILURE_RANK: Record<MelodyFailure["status"], number> = {
  "not-found": 0,
  empty: 1,
  unreadable: 1,
  "bad-response": 2,
  network: 3,
  "rate-limit": 4,
};

function strongerFailure(first: MelodySearchOutcome, second: MelodySearchOutcome): MelodyFailure {
  const left = first.ok ? ({ status: "not-found" } as const) : first.failure;
  const right = second.ok ? ({ status: "not-found" } as const) : second.failure;
  return FAILURE_RANK[left.status] >= FAILURE_RANK[right.status] ? left : right;
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

const ARCHIVE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/;

export function archiveSearchUrl(query: MelodyQuery): string {
  const title = query.trackName.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  const q = `format:(MIDI) AND (title:("${title}") OR description:("${title}"))`;
  const params = new URLSearchParams({
    q,
    output: "json",
    rows: SEARCH_LIMIT,
  });
  for (const field of ["identifier", "title", "licenseurl", "rights"]) params.append("fl[]", field);
  return `${ARCHIVE_API}?${params.toString()}`;
}

async function searchArchive(query: MelodyQuery, fetchImpl: typeof fetch): Promise<MelodySearchOutcome> {
  const response = await request(archiveSearchUrl(query), fetchImpl, "application/json");
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
  const docs = (body as { response?: { docs?: unknown } }).response?.docs;
  if (!Array.isArray(docs)) return { ok: false, failure: { status: "not-found" } };
  const hits = archiveHits(docs, query.trackName);
  if (hits.length === 0) return { ok: false, failure: { status: "not-found" } };
  return { ok: true, hits };
}

async function resolveArchive(hit: MelodyHit, fetchImpl: typeof fetch): Promise<MelodyResolveOutcome> {
  if (hit.ref.kind !== "archive") return { ok: false, failure: { status: "unreadable" } };
  const metaUrl = archiveHttps(`https://archive.org/metadata/${encodeURIComponent(hit.ref.identifier)}`);
  if (!metaUrl) return { ok: false, failure: { status: "unreadable" } };
  const response = await request(metaUrl, fetchImpl, "application/json");
  if (response === "network") return { ok: false, failure: { status: "network" } };
  if (response.status === 429) return { ok: false, failure: { status: "rate-limit" } };
  if (!response.ok) return { ok: false, failure: { status: "unreadable" } };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, failure: { status: "bad-response" } };
  }
  if (!body || typeof body !== "object") return { ok: false, failure: { status: "bad-response" } };
  const meta = (body as { metadata?: unknown }).metadata;
  const license = metadataLicense(meta && typeof meta === "object" ? meta : {}, hit.ref.license);
  if (!license) return { ok: false, failure: { status: "not-found" } };
  const fileName = pickArchiveMidi((body as { files?: unknown }).files);
  if (!fileName) return { ok: false, failure: { status: "empty" } };
  const fileUrl = archiveFileUrl(hit.ref.identifier, fileName);
  if (!fileUrl) return { ok: false, failure: { status: "unreadable" } };
  const downloaded = await request(fileUrl, fetchImpl, "audio/midi");
  if (downloaded === "network") return { ok: false, failure: { status: "network" } };
  if (downloaded.status === 429) return { ok: false, failure: { status: "rate-limit" } };
  if (!downloaded.ok) return { ok: false, failure: { status: "unreadable" } };
  const bytes = new Uint8Array(await downloaded.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MIDI_BYTES) {
    return { ok: false, failure: { status: "unreadable" } };
  }
  const ref = { ...hit.ref, license };
  return midiOutcome({ ...hit, ref }, bytes, archiveSource(ref, fileName));
}

function archiveHits(docs: unknown[], title: string): MelodyHit[] {
  const hits: MelodyHit[] = [];
  for (const doc of docs) {
    const hit = archiveHit(doc, title);
    if (!hit) continue;
    hits.push(hit);
    if (hits.length >= HIT_LIMIT) break;
  }
  return hits;
}

function archiveHit(doc: unknown, title: string): MelodyHit | null {
  if (!doc || typeof doc !== "object") return null;
  const identifier = iaText((doc as { identifier?: unknown }).identifier);
  if (!ARCHIVE_ID.test(identifier)) return null;
  const license = archiveLicense(doc);
  if (!license) return null;
  const itemTitle = iaText((doc as { title?: unknown }).title) || identifier;
  const pageUrl = `https://archive.org/details/${encodeURIComponent(identifier)}`;
  return {
    id: `archive:${identifier}`,
    label: itemTitle,
    detail: licenseLabel(license),
    title,
    sourceUrl: pageUrl,
    ref: { kind: "archive", identifier, pageUrl, license, itemTitle },
  };
}

function archiveLicense(record: object): string {
  const url = meaningful(iaText((record as { licenseurl?: unknown }).licenseurl));
  const rights = meaningful(iaText((record as { rights?: unknown }).rights));
  if (url) return isFreeMelodyLicense(url) ? url : "";
  if (rights && isFreeMelodyLicense(rights)) return rights;
  return "";
}

function metadataLicense(meta: object, fallback: string): string {
  const stated = archiveLicense(meta);
  if (stated) return stated;
  const url = meaningful(iaText((meta as { licenseurl?: unknown }).licenseurl));
  if (url) return "";
  return isFreeMelodyLicense(fallback) ? fallback : "";
}

function pickArchiveMidi(files: unknown): string {
  if (!Array.isArray(files)) return "";
  const rows = files.flatMap((file) => {
    if (!file || typeof file !== "object") return [];
    const name = iaText((file as { name?: unknown }).name);
    if (!safeMidiName(name)) return [];
    const size = Number((file as { size?: unknown }).size);
    if (Number.isFinite(size) && size > MAX_MIDI_BYTES) return [];
    return [
      {
        name,
        format: iaText((file as { format?: unknown }).format),
        source: iaText((file as { source?: unknown }).source),
      },
    ];
  });
  const melody = rows.find((row) => MELODY_TRACK.test(row.name));
  if (melody) return melody.name;
  const original = rows.find((row) => row.source === "original" && /midi/i.test(row.format));
  if (original) return original.name;
  return rows.find((row) => /midi/i.test(row.format))?.name ?? rows[0]?.name ?? "";
}

function archiveFileUrl(identifier: string, fileName: string): string {
  if (!ARCHIVE_ID.test(identifier) || !safeMidiName(fileName)) return "";
  return archiveHttps(
    `https://archive.org/cors/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`,
  );
}

function safeMidiName(name: string): boolean {
  if (name.length < 5 || name.length > 180) return false;
  if (/[\\/\u0000?#%]/.test(name) || name.includes("..")) return false;
  return /\.midi?$/i.test(name);
}

function iaText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first.trim() : "";
  }
  return "";
}

function meaningful(value: string): string {
  const text = value.trim();
  if (!text || text.toLowerCase() === "none") return "";
  return text;
}

function licenseLabel(raw: string): string {
  const text = raw.toLowerCase();
  if (/publicdomain\/zero|\bcc0\b/.test(text)) return "CC0";
  if (/public[-\s]?domain|publicdomain/.test(text)) return "Public domain";
  if (/by-sa|by sa/.test(text)) return "CC BY-SA";
  if (/\/licenses\/by\/|\bcc[-\s]?by\b/.test(text)) return "CC BY";
  if (text.includes("gfdl")) return "GFDL";
  const plain = plainText(raw);
  return plain.length > 80 ? `${plain.slice(0, 77)}…` : plain;
}

function archiveHttps(value: string): string {
  return allowedHttps(value, "archive.org");
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
