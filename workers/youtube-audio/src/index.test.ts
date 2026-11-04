import { describe, expect, it, vi } from "vitest";
import worker, {
  ANDROID_VR_UA,
  ANDROID_VR_VERSION,
  DEFAULT_LIMITS,
  PLAYER_ENDPOINT,
  VISITOR_ENDPOINT,
  type AudioLimits,
  proxyYoutubeAudio,
} from "./index";

const ID = "dQw4w9WgXcQ";
const WATCH = `https://www.youtube.com/watch?v=${ID}`;
const PAGES = "https://wing22622.github.io";
const AUDIO = "https://rr1---sn-test.googlevideo.com/videoplayback?id=1";

const limits: AudioLimits = {
  maxBytes: 8,
  chunkBytes: 4,
  maxDurationSeconds: 8 * 60,
  timeoutMs: 5_000,
};

function audioRequest(
  youtubeUrl = WATCH,
  init?: { method?: string; origin?: string | null; path?: string; query?: string },
): Request {
  const path = init?.path ?? "/audio";
  const query = init?.query ?? (youtubeUrl ? `?url=${encodeURIComponent(youtubeUrl)}` : "");
  const headers = new Headers();
  if (init?.origin) headers.set("origin", init.origin);
  return new Request(`https://cantolyrics-youtube-audio.example${path}${query}`, {
    method: init?.method ?? "GET",
    headers,
  });
}

function playerBody(extra?: Record<string, unknown>): unknown {
  return {
    playabilityStatus: { status: "OK" },
    videoDetails: { videoId: ID, lengthSeconds: "12", isLiveContent: false },
    streamingData: {
      adaptiveFormats: [
        {
          itag: 18,
          mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
          url: AUDIO,
        },
        {
          itag: 251,
          mimeType: 'audio/webm; codecs="opus"',
          bitrate: 160000,
          contentLength: "6",
          url: AUDIO,
        },
        {
          itag: 140,
          mimeType: 'audio/mp4; codecs="mp4a.40.2"',
          bitrate: 128000,
          contentLength: "6",
          url: AUDIO,
        },
      ],
    },
    ...extra,
  };
}

function rangeBody(range: string | null): Response {
  if (range === "bytes=0-3") {
    return new Response(Uint8Array.from([97, 98, 99, 100]), {
      status: 206,
      headers: { "content-range": "bytes 0-3/6", "content-length": "4", "content-type": "audio/mp4" },
    });
  }
  if (range === "bytes=4-5") {
    return new Response(Uint8Array.from([101, 102]), {
      status: 206,
      headers: { "content-range": "bytes 4-5/6", "content-length": "2", "content-type": "audio/mp4" },
    });
  }
  return new Response(null, { status: 416 });
}

function youtubeFetch(player: unknown = playerBody()) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const href = String(input);
    if (href.startsWith(VISITOR_ENDPOINT)) {
      return Response.json({ responseContext: { visitorData: "visitor-token" } });
    }
    if (href.startsWith(PLAYER_ENDPOINT)) {
      return Response.json(player);
    }
    if (href.startsWith("https://rr1---sn-test.googlevideo.com/") || href.startsWith("https://rr2---sn-test.googlevideo.com/")) {
      const range = new Headers(init?.headers).get("range");
      return rangeBody(range);
    }
    return new Response("unexpected", { status: 599 });
  });
}

describe("proxyYoutubeAudio", () => {
  it("proxies itag 140 in ranged chunks and allows the Pages origin", async () => {
    const fetchImpl = youtubeFetch();
    const response = await proxyYoutubeAudio(audioRequest(WATCH, { origin: PAGES }), fetchImpl, limits);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mp4");
    expect(response.headers.get("access-control-allow-origin")).toBe(PAGES);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from([97, 98, 99, 100, 101, 102]));

    const playerCall = fetchImpl.mock.calls.find((call) => String(call[0]).startsWith(PLAYER_ENDPOINT));
    expect(playerCall).toBeTruthy();
    const init = playerCall?.[1];
    const body = JSON.parse(String(init?.body)) as {
      videoId: string;
      context: { client: { clientName: string; clientVersion: string; visitorData: string } };
    };
    expect(body.videoId).toBe(ID);
    expect(body.context.client.clientName).toBe("ANDROID_VR");
    expect(body.context.client.clientVersion).toBe(ANDROID_VR_VERSION);
    expect(body.context.client.visitorData).toBe("visitor-token");
    expect(new Headers(init?.headers).get("user-agent")).toBe(ANDROID_VR_UA);

    const ranges = fetchImpl.mock.calls
      .filter((call) => String(call[0]).includes("googlevideo.com"))
      .map((call) => new Headers(call[1]?.headers).get("range"));
    expect(ranges).toEqual(["bytes=0-3", "bytes=4-5"]);
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes("evil."))).toBe(false);
  });

  it("accepts a Shorts URL and a local Vite origin", async () => {
    const fetchImpl = youtubeFetch();
    const response = await proxyYoutubeAudio(
      audioRequest(`https://www.youtube.com/shorts/${ID}?feature=share`, { origin: "http://localhost:5173" }),
      fetchImpl,
      limits,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const playerCall = fetchImpl.mock.calls.find((call) => String(call[0]).startsWith(PLAYER_ENDPOINT));
    const body = JSON.parse(String(playerCall?.[1]?.body)) as { videoId: string };
    expect(body.videoId).toBe(ID);
  });

  it("rejects other origins, paths, methods, and non-YouTube URLs without fetching", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const cases: Array<[Request, number]> = [
      [audioRequest(WATCH, { origin: "https://evil.example" }), 403],
      [audioRequest(WATCH, { method: "POST", origin: PAGES }), 405],
      [audioRequest(WATCH, { method: "OPTIONS", origin: PAGES, path: "/audio" }), 204],
      [audioRequest("", { path: "/", origin: PAGES }), 404],
      [audioRequest("https://evil.example/watch?v=dQw4w9WgXcQ", { origin: PAGES }), 400],
      [audioRequest("", { query: "?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ&next=1", origin: PAGES }), 400],
      [audioRequest("", { query: "", origin: PAGES }), 400],
    ];
    for (const [request, status] of cases) {
      const response = await proxyYoutubeAudio(request, fetchImpl, limits);
      expect(response.status, request.url).toBe(status);
      if (status === 204) {
        expect(response.headers.get("access-control-allow-origin")).toBe(PAGES);
        expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
      }
      if (request.headers.get("origin") === "https://evil.example") {
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      }
    }
    expect(fetchImpl).not.toHaveBeenCalled();

    const entry = await worker.fetch(new Request("https://cantolyrics-youtube-audio.example/other"));
    expect(entry.status).toBe(404);
  });

  it("does not fetch a stream host outside googlevideo", async () => {
    const fetchImpl = youtubeFetch({
      playabilityStatus: { status: "OK" },
      videoDetails: { lengthSeconds: "12", isLiveContent: false },
      streamingData: {
        adaptiveFormats: [
          { itag: 140, mimeType: "audio/mp4", url: "https://evil.example/secret.mp4", contentLength: "6" },
          { itag: 140, mimeType: "audio/mp4", signatureCipher: "s=1" },
        ],
      },
    });
    const response = await proxyYoutubeAudio(audioRequest(), fetchImpl, limits);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "no-audio" });
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes("evil.example"))).toBe(false);
  });

  it("does not follow a googlevideo redirect off that host", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const href = String(input);
      if (href.startsWith(VISITOR_ENDPOINT)) return Response.json({ responseContext: { visitorData: "v" } });
      if (href.startsWith(PLAYER_ENDPOINT)) return Response.json(playerBody());
      if (href.startsWith(AUDIO)) {
        return new Response(null, { status: 302, headers: { location: "https://evil.example/open.mp4" } });
      }
      return new Response(String(init?.method ?? ""), { status: 599 });
    });
    const response = await proxyYoutubeAudio(audioRequest(WATCH, { origin: "http://127.0.0.1:5173" }), fetchImpl, limits);
    expect(response.status).toBe(502);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5173");
    expect(fetchImpl.mock.calls.some((call) => String(call[0]).includes("evil.example"))).toBe(false);
  });

  it("follows a redirect that stays on googlevideo", async () => {
    const next = "https://rr2---sn-test.googlevideo.com/videoplayback?id=2";
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const href = String(input);
      if (href.startsWith(VISITOR_ENDPOINT)) return Response.json({ responseContext: { visitorData: "v" } });
      if (href.startsWith(PLAYER_ENDPOINT)) {
        return Response.json(playerBody({
          streamingData: {
            adaptiveFormats: [
              { itag: 140, mimeType: "audio/mp4", bitrate: 128000, contentLength: "4", url: AUDIO },
            ],
          },
        }));
      }
      if (href.startsWith(AUDIO)) return new Response(null, { status: 302, headers: { location: next } });
      if (href.startsWith(next)) return new Response(Uint8Array.from([1, 2, 3, 4]), { status: 206 });
      return new Response(null, { status: 599 });
    });
    const response = await proxyYoutubeAudio(audioRequest(), fetchImpl, { ...limits, chunkBytes: 8 });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it("rejects live video, over-long audio, and a hung fetch", async () => {
    const live = youtubeFetch({
      playabilityStatus: { status: "OK" },
      videoDetails: { lengthSeconds: "30", isLiveContent: true },
      streamingData: { adaptiveFormats: [] },
    });
    expect((await proxyYoutubeAudio(audioRequest(), live, limits)).status).toBe(409);

    const tooLong = youtubeFetch(playerBody({
      videoDetails: { lengthSeconds: "30", isLiveContent: false },
      streamingData: {
        adaptiveFormats: [
          { itag: 140, mimeType: "audio/mp4", contentLength: "9", url: AUDIO },
        ],
      },
    }));
    const limited = await proxyYoutubeAudio(audioRequest(), tooLong, limits);
    expect(limited.status).toBe(413);
    expect(await limited.json()).toEqual({ error: "too-long" });
    expect(tooLong.mock.calls.some((call) => String(call[0]).includes("googlevideo.com"))).toBe(false);

    const duration = youtubeFetch(playerBody({
      videoDetails: { lengthSeconds: String(DEFAULT_LIMITS.maxDurationSeconds + 1), isLiveContent: false },
    }));
    expect((await proxyYoutubeAudio(audioRequest(), duration, DEFAULT_LIMITS)).status).toBe(413);

    const hanging = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (init?.signal?.aborted) {
          abort();
          return;
        }
        init?.signal?.addEventListener("abort", abort, { once: true });
      });
    });
    const timed = await proxyYoutubeAudio(audioRequest(), hanging, { ...limits, timeoutMs: 30 });
    expect(timed.status).toBe(504);
    expect(await timed.json()).toEqual({ error: "timeout" });
  });

  it("retries once when the player asks for a visitor", async () => {
    let players = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const href = String(input);
      if (href.startsWith(VISITOR_ENDPOINT)) {
        return Response.json({ responseContext: { visitorData: "visitor-token" } });
      }
      if (href.startsWith(PLAYER_ENDPOINT)) {
        players += 1;
        if (players === 1) return Response.json({ playabilityStatus: { status: "LOGIN_REQUIRED" } });
        return Response.json(playerBody());
      }
      return rangeBody(new Headers(init?.headers).get("range"));
    });
    const response = await proxyYoutubeAudio(audioRequest(`https://music.youtube.com/watch?v=${ID}`), fetchImpl, limits);
    expect(response.status).toBe(200);
    expect(players).toBe(2);
  });
});
