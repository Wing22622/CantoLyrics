import { parseYoutubeUrl } from "./youtube-url";

export type YoutubeAudioFailure =
  | "missing-proxy"
  | "bad-url"
  | "network"
  | "no-audio"
  | "unavailable"
  | "live"
  | "too-long"
  | "timeout"
  | "upstream"
  | "bad-response";

const FAILURES = new Set<YoutubeAudioFailure>([
  "missing-proxy",
  "bad-url",
  "network",
  "no-audio",
  "unavailable",
  "live",
  "too-long",
  "timeout",
  "upstream",
  "bad-response",
]);

export class YoutubeAudioError extends Error {
  readonly code: YoutubeAudioFailure;

  constructor(code: YoutubeAudioFailure) {
    super(youtubeAudioMessage(code));
    this.name = "YoutubeAudioError";
    this.code = code;
  }
}

export function youtubeAudioMessage(code: YoutubeAudioFailure): string {
  switch (code) {
    case "missing-proxy":
      return "未設定 YouTube 音訊代理。請部署 workers/youtube-audio，再設定 VITE_YOUTUBE_AUDIO_PROXY_URL。";
    case "bad-url":
      return "只接受 youtube.com、youtu.be 同 music.youtube.com 嘅連結。";
    case "network":
      return "連唔到 YouTube 音訊代理。檢查網絡同代理網址之後再試。";
    case "no-audio":
      return "呢條片抽唔到音訊。可以上載錄音。";
    case "unavailable":
      return "YouTube 而家冇畀呢段音訊。可以上載錄音。";
    case "live":
      return "直播抽唔到音訊。請用已上載嘅片，或者上載錄音。";
    case "too-long":
      return "呢段片太長。代理最多攞約八分鐘嘅音訊，請用短啲嘅片或者上載錄音。";
    case "timeout":
      return "抽音訊太耐，代理已經停咗。可以再試，或者上載錄音。";
    case "upstream":
      return "抽唔到 YouTube 音訊。過一陣再試，或者上載錄音。";
    case "bad-response":
      return "音訊代理回覆睇唔明。可以再試，或者上載錄音。";
  }
}

/** Empty until the owner deploys `workers/youtube-audio` and sets the variable. */
export function youtubeAudioProxyBase(configured: string | undefined): string | null {
  const trimmed = configured?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

export async function fetchYoutubeAudio(
  input: string,
  options?: { fetchImpl?: typeof fetch; proxyBase?: string | null },
): Promise<ArrayBuffer> {
  const parsed = parseYoutubeUrl(input);
  if (!parsed) throw new YoutubeAudioError("bad-url");
  const base = options && "proxyBase" in options
    ? options.proxyBase ?? null
    : youtubeAudioProxyBase(import.meta.env.VITE_YOUTUBE_AUDIO_PROXY_URL);
  if (!base) throw new YoutubeAudioError("missing-proxy");

  const fetchImpl = options?.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${base}/audio?url=${encodeURIComponent(parsed.canonical)}`, {
      headers: { Accept: "audio/*,application/json" },
    });
  } catch {
    throw new YoutubeAudioError("network");
  }

  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || type.includes("application/json") || type.startsWith("text/")) {
    throw new YoutubeAudioError(await failureCode(response));
  }
  return response.arrayBuffer();
}

async function failureCode(response: Response): Promise<YoutubeAudioFailure> {
  let code: string | null = null;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") code = body.error;
  } catch {
    code = null;
  }
  if (code && FAILURES.has(code as YoutubeAudioFailure) && code !== "missing-proxy" && code !== "network") {
    return code as YoutubeAudioFailure;
  }
  if (response.status === 400) return "bad-url";
  if (response.status === 404) return "no-audio";
  if (response.status === 409) return "live";
  if (response.status === 413) return "too-long";
  if (response.status === 504) return "timeout";
  if (response.status === 403) return "unavailable";
  if (response.ok) return "bad-response";
  return "upstream";
}
