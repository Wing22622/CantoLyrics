const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MAX_URL_LENGTH = 2048;

export interface YoutubeVideo {
  videoId: string;
  /** Normalised watch URL. The worker is called with this, not the raw paste. */
  canonical: string;
}

/**
 * Accept only YouTube watch, Shorts, embed, live, and youtu.be links.
 * The host is an exact allowlist. Anything else, including a lookalike domain, is rejected.
 */
export function parseYoutubeUrl(input: string): YoutubeVideo | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;
  const videoId = videoIdFrom(host, url);
  if (!videoId || !VIDEO_ID.test(videoId)) return null;
  return { videoId, canonical: `https://www.youtube.com/watch?v=${videoId}` };
}

function videoIdFrom(host: string, url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be" || host === "www.youtu.be") {
    return parts.length === 1 ? parts[0] : null;
  }
  if (parts.length === 1 && parts[0] === "watch") return url.searchParams.get("v")?.trim() ?? null;
  if (parts.length === 2 && (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v")) {
    return parts[1];
  }
  return null;
}
