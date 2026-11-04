import { parseYoutubeUrl } from "../../../src/youtube-url";

/**
 * Free-plan Worker. Cloudflare Workers cannot run yt-dlp.
 * The ANDROID_VR innertube client returns a direct googlevideo audio URL
 * (no signature cipher, no API key). Versions above 1.65.x switch to SABR
 * streams that have no `url` field, so do not bump past that line.
 * Bytes are proxied because googlevideo does not send CORS for the browser.
 */
export const ANDROID_VR_VERSION = "1.65.10";
export const ANDROID_VR_UA =
  "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";
export const VISITOR_ENDPOINT = "https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false";
export const PLAYER_ENDPOINT = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

const PAGES_ORIGIN = "https://wing22622.github.io";
const AUDIO_PATH = "/audio";

export interface AudioLimits {
  maxBytes: number;
  chunkBytes: number;
  maxDurationSeconds: number;
  timeoutMs: number;
}

/** About eight minutes of 128 kbps AAC, in 1 MiB ranges so a free Worker does not hang. */
export const DEFAULT_LIMITS: AudioLimits = {
  maxBytes: 8 * 1024 * 1024,
  chunkBytes: 1024 * 1024,
  maxDurationSeconds: 8 * 60,
  timeoutMs: 20_000,
};

export type AudioError = "bad-url" | "no-audio" | "unavailable" | "live" | "too-long" | "upstream" | "timeout";

const ERROR_STATUS: Record<AudioError, number> = {
  "bad-url": 400,
  "no-audio": 404,
  unavailable: 403,
  live: 409,
  "too-long": 413,
  upstream: 502,
  timeout: 504,
};

interface AudioFormat {
  url: string;
  mimeType: string;
  contentLength: number | null;
}

interface StreamReady {
  ok: true;
  format: AudioFormat;
}

interface StreamFailed {
  ok: false;
  error: AudioError;
  retry: boolean;
}

export async function proxyYoutubeAudio(
  request: Request,
  fetchImpl: typeof fetch = fetch,
  limits: AudioLimits = DEFAULT_LIMITS,
): Promise<Response> {
  const early = earlyResponse(request);
  if (early) return early;
  try {
    const response = await withTimeout(limits.timeoutMs, (signal) => handleAudio(request, fetchImpl, limits, signal));
    return withCors(request, response);
  } catch (error) {
    return withCors(request, errorResponse(isTimeout(error) ? "timeout" : "upstream"));
  }
}

function earlyResponse(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== AUDIO_PATH) return withCors(request, new Response(null, { status: 404 }));
  const origin = request.headers.get("origin");
  if (origin && !allowedPageOrigin(origin)) {
    return new Response(JSON.stringify({ error: "origin" }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (request.method === "OPTIONS") return withCors(request, new Response(null, { status: 204 }));
  if (request.method !== "GET") return withCors(request, new Response(null, { status: 405 }));
  return null;
}

async function handleAudio(
  request: Request,
  fetchImpl: typeof fetch,
  limits: AudioLimits,
  signal: AbortSignal,
): Promise<Response> {
  const url = new URL(request.url);
  const youtubeUrl = onlyUrlParam(url.searchParams);
  if (youtubeUrl == null) return errorResponse("bad-url");
  const parsed = parseYoutubeUrl(youtubeUrl);
  if (!parsed) return errorResponse("bad-url");

  let visitor = await fetchVisitor(fetchImpl, signal);
  let resolved = await resolveStream(parsed.videoId, visitor, fetchImpl, limits, signal);
  if (!resolved.ok && resolved.retry) {
    visitor = await fetchVisitor(fetchImpl, signal);
    resolved = await resolveStream(parsed.videoId, visitor, fetchImpl, limits, signal);
  }
  if (!resolved.ok) return errorResponse(resolved.error);

  const audio = await downloadAudio(resolved.format, fetchImpl, limits, signal);
  if (!audio.ok) return errorResponse(audio.error);
  return new Response(arrayBuffer(audio.body), {
    status: 200,
    headers: {
      "content-type": audioContentType(resolved.format.mimeType),
      "content-length": String(audio.body.byteLength),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function onlyUrlParam(searchParams: URLSearchParams): string | null {
  const keys = [...searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "url") return null;
  const value = searchParams.get("url")?.trim() ?? "";
  return value ? value : null;
}

async function resolveStream(
  videoId: string,
  visitorData: string,
  fetchImpl: typeof fetch,
  limits: AudioLimits,
  signal: AbortSignal,
): Promise<StreamReady | StreamFailed> {
  let response: Response;
  try {
    response = await fetchImpl(PLAYER_ENDPOINT, {
      method: "POST",
      redirect: "manual",
      signal,
      headers: playerHeaders(visitorData),
      body: JSON.stringify(playerBody(videoId, visitorData)),
    });
  } catch (error) {
    return { ok: false, error: isTimeout(error) ? "timeout" : "upstream", retry: false };
  }
  if (response.status >= 300 && response.status < 400) return { ok: false, error: "upstream", retry: false };
  if (!response.ok) return { ok: false, error: "upstream", retry: response.status >= 500 };

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: "upstream", retry: true };
  }

  if (isLive(data)) return { ok: false, error: "live", retry: false };
  const status = playability(data);
  if (status === "LOGIN_REQUIRED") return { ok: false, error: "unavailable", retry: true };
  if (status && status !== "OK") return { ok: false, error: "unavailable", retry: false };

  const length = lengthSeconds(data);
  if (length != null && length > limits.maxDurationSeconds) return { ok: false, error: "too-long", retry: false };

  const format = pickAudioFormats(adaptiveFormats(data));
  if (!format) return { ok: false, error: "no-audio", retry: true };
  if (format.contentLength != null && format.contentLength > limits.maxBytes) {
    return { ok: false, error: "too-long", retry: false };
  }
  return { ok: true, format };
}

function playerHeaders(visitorData: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": ANDROID_VR_UA,
    "X-YouTube-Client-Name": "28",
    "X-YouTube-Client-Version": ANDROID_VR_VERSION,
  };
  if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;
  return headers;
}

function playerBody(videoId: string, visitorData: string): unknown {
  const client: Record<string, unknown> = {
    clientName: "ANDROID_VR",
    clientVersion: ANDROID_VR_VERSION,
    deviceMake: "Oculus",
    deviceModel: "Quest 3",
    androidSdkVersion: 32,
    osName: "Android",
    osVersion: "12L",
    hl: "en",
    gl: "US",
  };
  if (visitorData) client.visitorData = visitorData;
  return {
    context: { client },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };
}

async function fetchVisitor(fetchImpl: typeof fetch, signal: AbortSignal): Promise<string> {
  try {
    const response = await fetchImpl(VISITOR_ENDPOINT, {
      method: "POST",
      redirect: "manual",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": ANDROID_VR_UA,
      },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID_VR", clientVersion: ANDROID_VR_VERSION } },
      }),
    });
    if (!response.ok || (response.status >= 300 && response.status < 400)) return "";
    const data = (await response.json()) as { responseContext?: { visitorData?: unknown } };
    const visitor = data.responseContext?.visitorData;
    return typeof visitor === "string" ? visitor : "";
  } catch {
    return "";
  }
}

function adaptiveFormats(data: unknown): unknown[] {
  const streaming = asRecord(asRecord(data)?.streamingData);
  const adaptive = streaming?.adaptiveFormats;
  const progressive = streaming?.formats;
  const list = [
    ...(Array.isArray(adaptive) ? adaptive : []),
    ...(Array.isArray(progressive) ? progressive : []),
  ];
  return list;
}

/**
 * Prefer itag 140 (128 kbps AAC in MP4). Browsers can decode that.
 * Opus in WebM is only a fallback. Cipher-only formats are skipped.
 */
function pickAudioFormats(formats: readonly unknown[]): AudioFormat | null {
  const ready: Array<AudioFormat & { itag: number | null; bitrate: number }> = [];
  for (const value of formats) {
    const record = asRecord(value);
    if (!record) continue;
    const mimeType = typeof record.mimeType === "string" ? record.mimeType.toLowerCase() : "";
    if (!mimeType.startsWith("audio/")) continue;
    if (typeof record.url !== "string" || !isGoogleVideoUrl(record.url)) continue;
    ready.push({
      url: record.url,
      mimeType,
      contentLength: positiveInt(record.contentLength),
      itag: typeof record.itag === "number" ? record.itag : null,
      bitrate: typeof record.bitrate === "number" ? record.bitrate : Number.MAX_SAFE_INTEGER,
    });
  }
  const mp4 = ready.filter((format) => format.mimeType.startsWith("audio/mp4"));
  const aac128 = mp4.find((format) => format.itag === 140);
  if (aac128) return aac128;
  mp4.sort((a, b) => a.bitrate - b.bitrate);
  if (mp4[0]) return mp4[0];
  const opus = ready.find((format) => format.itag === 251);
  return opus ?? ready[0] ?? null;
}

function isGoogleVideoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === "googlevideo.com" || host.endsWith(".googlevideo.com");
}

async function downloadAudio(
  format: AudioFormat,
  fetchImpl: typeof fetch,
  limits: AudioLimits,
  signal: AbortSignal,
): Promise<{ ok: true; body: Uint8Array } | { ok: false; error: AudioError }> {
  const target = format.contentLength ?? limits.maxBytes;
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let start = 0; start < target; start += limits.chunkBytes) {
    const end = Math.min(target, start + limits.chunkBytes) - 1;
    let response: Response;
    try {
      const fetched = await fetchGoogleVideo(format.url, {
        Range: `bytes=${start}-${end}`,
        "User-Agent": ANDROID_VR_UA,
        Accept: "*/*",
      }, fetchImpl, signal);
      if (!fetched) return { ok: false, error: "upstream" };
      response = fetched;
    } catch (error) {
      return { ok: false, error: isTimeout(error) ? "timeout" : "upstream" };
    }
    if (response.status !== 200 && response.status !== 206) return { ok: false, error: "upstream" };
    const complete = totalFromContentRange(response.headers.get("content-range"));
    if (complete != null && complete > limits.maxBytes) return { ok: false, error: "too-long" };
    const declared = positiveInt(response.headers.get("content-length"));
    if (response.status === 200 && declared != null && declared > limits.maxBytes) {
      return { ok: false, error: "too-long" };
    }
    const room = limits.maxBytes - total;
    const chunk = await readAtMost(response, room);
    if (chunk === "too-long") return { ok: false, error: "too-long" };
    if (chunk.byteLength === 0) break;
    parts.push(chunk);
    total += chunk.byteLength;
    if (response.status === 200 || chunk.byteLength < end - start + 1) break;
  }
  if (total === 0) return { ok: false, error: "upstream" };
  if (format.contentLength == null && total >= limits.maxBytes) return { ok: false, error: "too-long" };
  const body = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  return { ok: true, body };
}

async function fetchGoogleVideo(
  raw: string,
  headers: HeadersInit,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response | null> {
  let current = raw;
  for (let hop = 0; hop < 3; hop++) {
    if (!isGoogleVideoUrl(current)) return null;
    const response = await fetchImpl(current, { method: "GET", headers, redirect: "manual", signal });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) return null;
    current = new URL(location, current).toString();
  }
  return null;
}

async function readAtMost(response: Response, max: number): Promise<Uint8Array | "too-long"> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > max ? "too-long" : bytes;
  }
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.byteLength === 0) continue;
    if (total + value.byteLength > max) {
      await reader.cancel();
      return "too-long";
    }
    parts.push(value);
    total += value.byteLength;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.byteLength;
  }
  return body;
}

function playability(data: unknown): string | null {
  const status = asRecord(asRecord(data)?.playabilityStatus)?.status;
  return typeof status === "string" ? status : null;
}

function isLive(data: unknown): boolean {
  return asRecord(asRecord(data)?.videoDetails)?.isLiveContent === true;
}

function lengthSeconds(data: unknown): number | null {
  return positiveInt(asRecord(asRecord(data)?.videoDetails)?.lengthSeconds);
}

function totalFromContentRange(header: string | null): number | null {
  if (!header) return null;
  const match = /\/(\d+)\s*$/.exec(header);
  return match ? positiveInt(match[1]) : null;
}

function positiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function audioContentType(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim() ?? "";
  if (base === "audio/mp4" || base === "audio/webm" || base === "audio/mpeg") return base;
  return "application/octet-stream";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function errorResponse(error: AudioError): Response {
  return new Response(JSON.stringify({ error }), {
    status: ERROR_STATUS[error],
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function allowedPageOrigin(origin: string | null): string | null {
  if (!origin) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (origin === PAGES_ORIGIN && url.origin === PAGES_ORIGIN) return origin;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return null;
  if (url.username || url.password) return null;
  if (origin !== url.origin) return null;
  return origin;
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const origin = allowedPageOrigin(request.headers.get("origin"));
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "Accept, Content-Type");
  headers.set("access-control-max-age", "86400");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError());
    }, ms);
  });
  return Promise.race([run(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

function timeoutError(): Error {
  const error = new Error("timeout");
  error.name = "TimeoutError";
  return error;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export default {
  fetch(request: Request): Promise<Response> {
    return proxyYoutubeAudio(request);
  },
};
