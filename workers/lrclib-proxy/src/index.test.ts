import { describe, expect, it, vi } from "vitest";
import worker, { proxyLrclibSearch } from "./index";

const CLIENT = "CantoLyrics/0.1 (https://wing22622.github.io/CantoLyrics/)";

function searchRequest(query: string, method = "GET", path = "/api/search"): Request {
  return new Request(`https://cantolyrics-lrclib.example${path}${query ? `?${query}` : ""}`, { method });
}

describe("proxyLrclibSearch", () => {
  it("forwards search params to lrclib and sets the client headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json([{ id: 1 }], { headers: { "retry-after": "0" } }),
    );
    const response = await proxyLrclibSearch(
      searchRequest("track_name=%E6%B5%B7%E9%97%8A%E5%A4%A9%E7%A9%BA&artist_name=Beyond"),
      fetchImpl,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-expose-headers")).toBe("Retry-After");
    expect(response.headers.get("retry-after")).toBe("0");
    expect(await response.json()).toEqual([{ id: 1 }]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    const upstream = new URL(String(url));
    expect(`${upstream.origin}${upstream.pathname}`).toBe("https://lrclib.net/api/search");
    expect(upstream.searchParams.get("track_name")).toBe("海闊天空");
    expect(upstream.searchParams.get("artist_name")).toBe("Beyond");
    expect([...upstream.searchParams.keys()]).toEqual(["track_name", "artist_name"]);
    expect(init?.headers).toEqual({
      Accept: "application/json",
      "User-Agent": CLIENT,
      "Lrclib-Client": CLIENT,
    });
  });

  it("forwards q alone and passes 429 and 503 with Retry-After", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValueOnce(new Response("slow", { status: 429, headers: { "retry-after": "12" } }));
    const limited = await proxyLrclibSearch(searchRequest("q=%E6%B5%B7%E9%97%8A%E5%A4%A9%E7%A9%BA"), fetchImpl);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("12");
    expect(await limited.text()).toBe("slow");

    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 503, headers: { "Retry-After": "3" } }));
    const busy = await proxyLrclibSearch(searchRequest("track_name=Beyond"), fetchImpl);
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("3");

    const qUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(qUrl.pathname).toBe("/api/search");
    expect(qUrl.searchParams.get("q")).toBe("海闊天空");
    expect(qUrl.host).toBe("lrclib.net");
  });

  it("rejects other paths, methods, and query keys without calling upstream", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const cases: Array<[Request, number]> = [
      [searchRequest("track_name=x", "POST"), 405],
      [searchRequest("track_name=x", "GET", "/api/get/1"), 404],
      [searchRequest("", "GET", "/"), 404],
      [searchRequest("url=https://evil.example/secret"), 400],
      [searchRequest("track_name=x&track_name=y"), 400],
      [searchRequest(""), 400],
    ];

    for (const [request, status] of cases) {
      const response = await proxyLrclibSearch(request, fetchImpl);
      expect(response.status).toBe(status);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
    expect(fetchImpl).not.toHaveBeenCalled();

    const entry = await worker.fetch(new Request("https://evil.example/api/get/1"));
    expect(entry.status).toBe(404);
    expect(entry.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("forwards a search from any request host only to lrclib.net", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json([]));
    const response = await proxyLrclibSearch(new Request("https://evil.example/api/search?track_name=x"), fetchImpl);
    expect(response.status).toBe(200);
    const upstream = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(`${upstream.origin}${upstream.pathname}`).toBe("https://lrclib.net/api/search");
    expect(upstream.searchParams.get("track_name")).toBe("x");
  });

  it("answers a search preflight and does not follow an upstream redirect", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const preflight = await proxyLrclibSearch(searchRequest("track_name=x", "OPTIONS"), fetchImpl);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Lrclib-Client");
    expect(fetchImpl).not.toHaveBeenCalled();

    fetchImpl.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://evil.example/open" } }),
    );
    const redirected = await proxyLrclibSearch(searchRequest("track_name=x"), fetchImpl);
    expect(redirected.status).toBe(502);
    expect(redirected.headers.get("location")).toBeNull();

    fetchImpl.mockRejectedValueOnce(new TypeError("offline"));
    const offline = await proxyLrclibSearch(searchRequest("q=x"), fetchImpl);
    expect(offline.status).toBe(502);
  });
});
