import { LRCLIB_CLIENT } from "../../../src/lrclib-config";

const UPSTREAM = "https://lrclib.net/api/search";
const SEARCH_PATH = "/api/search";
const SEARCH_KEYS = ["track_name", "artist_name", "q"] as const;

const CLIENT_HEADERS = {
  Accept: "application/json",
  "User-Agent": LRCLIB_CLIENT,
  "Lrclib-Client": LRCLIB_CLIENT,
};

export async function proxyLrclibSearch(request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== SEARCH_PATH) return withCors(new Response(null, { status: 404 }));
  if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
  if (request.method !== "GET") return withCors(new Response(null, { status: 405 }));

  const params = allowedSearchParams(url.searchParams);
  if (!params) return withCors(new Response(null, { status: 400 }));

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${UPSTREAM}?${params.toString()}`, {
      method: "GET",
      redirect: "manual",
      headers: CLIENT_HEADERS,
    });
  } catch {
    return withCors(new Response(null, { status: 502 }));
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return withCors(new Response(null, { status: 502 }));
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) headers.set("retry-after", retryAfter);
  const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
  return withCors(new Response(body, { status: upstream.status, headers }));
}

function allowedSearchParams(searchParams: URLSearchParams): URLSearchParams | null {
  const seen = new Set<string>();
  for (const key of searchParams.keys()) {
    if (seen.has(key) || !(SEARCH_KEYS as readonly string[]).includes(key)) return null;
    seen.add(key);
  }
  const params = new URLSearchParams();
  for (const key of SEARCH_KEYS) {
    const value = searchParams.get(key)?.trim() ?? "";
    if (value) params.set(key, value);
  }
  return params.size > 0 ? params : null;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "Accept, Content-Type, User-Agent, Lrclib-Client");
  headers.set("access-control-expose-headers", "Retry-After");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  fetch(request: Request): Promise<Response> {
    return proxyLrclibSearch(request);
  },
};
