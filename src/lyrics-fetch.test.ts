import { describe, expect, it, vi } from "vitest";
import {
  LRCLIB_CLIENT,
  lyricSearchMessage,
  readRetryAfter,
  searchLyrics,
  stripTimingTags,
  type LyricHit,
} from "./lyrics-fetch";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    trackName: "喜帖街",
    artistName: "謝安琪",
    albumName: "Binary",
    instrumental: false,
    plainLyrics: "忘掉種過的花",
    syncedLyrics: "[00:01.00] 另一段",
    ...overrides,
  };
}

describe("stripTimingTags", () => {
  it("drops timestamps, word tags, and metadata lines", () => {
    const synced = [
      "[ti:喜帖街]",
      "[ar:謝安琪]",
      "[00:01.00] 忘掉種過的花",
      "[00:05.20]<00:05.20>再<00:05.40>讓<00:05.80>我",
      "[01:02:03] 只剩時間",
      "[03:25.72] ",
    ].join("\n");
    expect(stripTimingTags(synced)).toBe("忘掉種過的花\n再讓我\n只剩時間");
  });
});

describe("readRetryAfter", () => {
  const now = Date.parse("Wed, 28 Oct 2026 00:00:00 GMT");

  it("reads delay seconds and an HTTP date", () => {
    expect(readRetryAfter("12", now)).toBe(12);
    expect(readRetryAfter("1.2", now)).toBe(2);
    expect(readRetryAfter("Wed, 28 Oct 2026 00:00:30 GMT", now)).toBe(30);
    expect(readRetryAfter("soon", now)).toBeNull();
    expect(readRetryAfter(null, now)).toBeNull();
  });
});

describe("searchLyrics", () => {
  it("searches by track and artist and sends the CantoLyrics client headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([record()]));
    const outcome = await searchLyrics({ trackName: " 喜帖街 ", artistName: " 謝安琪 " }, fetchImpl);
    expect(outcome).toEqual({
      ok: true,
      hits: [{ id: 7, trackName: "喜帖街", artistName: "謝安琪", albumName: "Binary", lyrics: "忘掉種過的花" }],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(
      "https://lrclib.net/api/search?track_name=%E5%96%9C%E5%B8%96%E8%A1%97&artist_name=%E8%AC%9D%E5%AE%89%E7%90%AA",
    );
    expect(init?.headers).toEqual({
      Accept: "application/json",
      "User-Agent": LRCLIB_CLIENT,
      "Lrclib-Client": LRCLIB_CLIENT,
    });
  });

  it("asks again with q when a traditional artist filter has no lyrics", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValueOnce(jsonResponse([]));
    fetchImpl.mockResolvedValueOnce(jsonResponse([record({ artistName: "谢安琪", plainLyrics: "忘掉種過的花" })]));
    const outcome = await searchLyrics({ trackName: "喜帖街", artistName: "謝安琪" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.hits[0]).toMatchObject({ artistName: "谢安琪", lyrics: "忘掉種過的花" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "https://lrclib.net/api/search?track_name=%E5%96%9C%E5%B8%96%E8%A1%97&artist_name=%E8%AC%9D%E5%AE%89%E7%90%AA",
    );
    expect(String(fetchImpl.mock.calls[1][0])).toBe(
      "https://lrclib.net/api/search?q=%E5%96%9C%E5%B8%96%E8%A1%97+%E8%AC%9D%E5%AE%89%E7%90%AA",
    );
  });

  it("does not broaden the search when the field query already has lyrics or the request fails", async () => {
    const found = vi.fn<typeof fetch>(async () => jsonResponse([record()]));
    await searchLyrics({ trackName: "喜帖街", artistName: "謝安琪" }, found);
    expect(found).toHaveBeenCalledTimes(1);

    const limited = vi.fn<typeof fetch>(async () => jsonResponse({ name: "RateLimitExceeded" }, 429));
    await searchLyrics({ trackName: "喜帖街", artistName: "謝安琪" }, limited);
    expect(limited).toHaveBeenCalledTimes(1);

    const titleOnly = vi.fn<typeof fetch>(async () => jsonResponse([]));
    const missed = await searchLyrics({ trackName: "喜帖街", artistName: "" }, titleOnly);
    expect(missed).toEqual({ ok: false, failure: { status: "not-found" } });
    expect(titleOnly).toHaveBeenCalledTimes(1);
  });

  it("omits a blank artist", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([record()]));
    await searchLyrics({ trackName: "喜帖街", artistName: "  " }, fetchImpl);
    const [url] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://lrclib.net/api/search?track_name=%E5%96%9C%E5%B8%96%E8%A1%97");
  });

  it("does not call the network for a blank title", async () => {
    const fetchImpl = vi.fn();
    const outcome = await searchLyrics({ trackName: "  ", artistName: "謝安琪" }, fetchImpl);
    expect(outcome).toEqual({ ok: false, failure: { status: "not-found" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("prefers plain lyrics and falls back to synced text", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        record({ id: 1, plainLyrics: "明文", syncedLyrics: "[00:01.00] 同步" }),
        record({
          id: 2,
          trackName: "只有同步",
          plainLyrics: "  ",
          syncedLyrics: "[ti:標題]\n[00:01.00] 同步歌詞",
        }),
      ]),
    );
    const outcome = await searchLyrics({ trackName: "喜帖街", artistName: "" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.hits.map((hit) => hit.lyrics)).toEqual(["明文", "同步歌詞"]);
  });

  it("skips instrumental rows, empty lyrics, and broken rows", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        record({ instrumental: true, plainLyrics: "唔應該出" }),
        record({ plainLyrics: null, syncedLyrics: null }),
        record({ plainLyrics: "   ", syncedLyrics: "[00:01.00]   " }),
        null,
        "nope",
        record({ trackName: "  ", name: "", plainLyrics: "冇名" }),
        record({ id: 9, trackName: "", name: "用別名", plainLyrics: "有詞" }),
      ]),
    );
    const outcome = await searchLyrics({ trackName: "喜帖街", artistName: "" }, fetchImpl);
    expect(outcome).toEqual({
      ok: true,
      hits: [{ id: 9, trackName: "用別名", artistName: "謝安琪", albumName: "Binary", lyrics: "有詞" }],
    });
  });

  it("keeps several usable hits in response order", async () => {
    const hits = [
      record({ id: 1, trackName: "甲", albumName: "專輯甲", plainLyrics: "一" }),
      record({ id: 2, trackName: "乙", artistName: "乙歌手", albumName: "專輯乙", plainLyrics: "二" }),
    ];
    const fetchImpl = vi.fn(async () => jsonResponse(hits));
    const outcome = await searchLyrics({ trackName: "歌", artistName: "" }, fetchImpl);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.hits.map((hit: LyricHit) => hit.trackName)).toEqual(["甲", "乙"]);
    expect(outcome.hits[1]).toMatchObject({ artistName: "乙歌手", albumName: "專輯乙", lyrics: "二" });
  });

  it("reports no lyrics when every row is instrumental or empty", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([record({ instrumental: true })]));
    const outcome = await searchLyrics({ trackName: "前奏", artistName: "" }, fetchImpl);
    expect(outcome).toEqual({ ok: false, failure: { status: "not-found" } });
    expect(lyricSearchMessage({ status: "not-found" })).toBe(
      "搵唔到有歌詞嘅版本。可以改歌名或者歌手再搵，又或者自己貼上。",
    );
  });

  it("reports a network failure when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("offline");
    });
    const outcome = await searchLyrics({ trackName: "喜帖街", artistName: "" }, fetchImpl);
    expect(outcome).toEqual({ ok: false, failure: { status: "network" } });
    expect(lyricSearchMessage({ status: "network" })).toContain("連唔到 LRCLIB");
  });

  it("reports rate limit and busy responses with Retry-After", async () => {
    const limited = vi.fn(async () => jsonResponse({ name: "RateLimitExceeded" }, 429, { "retry-after": "12" }));
    expect(await searchLyrics({ trackName: "喜帖街", artistName: "" }, limited)).toEqual({
      ok: false,
      failure: { status: "rate-limit", retryAfterSeconds: 12 },
    });
    expect(lyricSearchMessage({ status: "rate-limit", retryAfterSeconds: 12 })).toBe(
      "LRCLIB 限制咗查詢。等約 12 秒再試，或者自己貼上歌詞。",
    );
    expect(lyricSearchMessage({ status: "rate-limit", retryAfterSeconds: null })).toContain("等一陣再試");

    const busy = vi.fn(async () => new Response("busy", { status: 503, headers: { "retry-after": "1" } }));
    expect(await searchLyrics({ trackName: "喜帖街", artistName: "" }, busy)).toEqual({
      ok: false,
      failure: { status: "unavailable", retryAfterSeconds: 1 },
    });
    expect(lyricSearchMessage({ status: "unavailable", retryAfterSeconds: null })).toContain("LRCLIB 而家好忙");

    const broken = vi.fn(async () => new Response("nope", { status: 500 }));
    expect(await searchLyrics({ trackName: "喜帖街", artistName: "" }, broken)).toEqual({
      ok: false,
      failure: { status: "unavailable", retryAfterSeconds: null },
    });
  });

  it("reports a 404 as no lyrics and any other failure as an unreadable reply", async () => {
    const missing = vi.fn(async () => jsonResponse({ name: "TrackNotFound" }, 404));
    expect(await searchLyrics({ trackName: "喜帖街", artistName: "" }, missing)).toEqual({
      ok: false,
      failure: { status: "not-found" },
    });

    const bad = vi.fn(async () => new Response("nope", { status: 400 }));
    expect(await searchLyrics({ trackName: "喜帖街", artistName: "" }, bad)).toEqual({
      ok: false,
      failure: { status: "bad-response" },
    });

    const html = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect(await searchLyrics({ trackName: "喜帖街", artistName: "" }, html)).toEqual({
      ok: false,
      failure: { status: "bad-response" },
    });

    const objectBody = vi.fn(async () => jsonResponse({ trackName: "不是陣列" }));
    expect(await searchLyrics({ trackName: "喜帖街", artistName: "" }, objectBody)).toEqual({
      ok: false,
      failure: { status: "bad-response" },
    });
    expect(lyricSearchMessage({ status: "bad-response" })).toContain("自己貼上歌詞");
  });
});
