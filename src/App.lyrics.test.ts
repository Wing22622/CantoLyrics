/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { buildLexicon, loadLexicon } from "./lexicon";
import { mapLyricDigits } from "./lyric-0243";
import { LRCLIB_CLIENT } from "./lyrics-fetch";
import { SONG_LIBRARY_KEY } from "./storage";

const lexiconJson = readFileSync(resolve("public/lexicon.json"), "utf8");
const lexicon = buildLexicon(JSON.parse(lexiconJson) as Parameters<typeof buildLexicon>[0]);

const hit = {
  id: 7,
  trackName: "喜帖街",
  artistName: "謝安琪",
  albumName: "Binary",
  instrumental: false,
  plainLyrics: "人人常歡笑",
  syncedLyrics: null,
};

describe("LRCLIB lyrics", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  const realFetch = globalThis.fetch.bind(globalThis);

  beforeEach(() => {
    localStorage.removeItem(SONG_LIBRARY_KEY);
    vi.stubEnv("VITE_LRCLIB_PROXY_URL", "");
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function installFetch(body: unknown, status = 200) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("lexicon.json")) {
        return new Response(lexiconJson, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.startsWith("https://lrclib.net/")) {
        const headers = new Headers(init?.headers);
        expect(headers.get("lrclib-client")).toBe(LRCLIB_CLIENT);
        return new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return realFetch(input, init);
    });
  }

  async function mount(): Promise<HTMLDivElement> {
    const node = document.createElement("div");
    document.body.appendChild(node);
    host = node;
    const mounted = createRoot(node);
    root = mounted;
    await act(async () => {
      mounted.render(createElement(App));
    });
    await act(async () => {
      await loadLexicon();
    });
    return node;
  }

  function expectDigits(node: ParentNode, lyrics: string) {
    const digits = mapLyricDigits(lyrics, (char) => lexicon.readingsFor(char)).digits;
    expect(digits).toMatch(/[0234]/);
    expect(node.querySelector(".lyric-digits")?.textContent).toBe(digits);
  }

  function type(node: ParentNode, label: string, value: string) {
    const input = node.querySelector<HTMLInputElement>(`input[aria-label='${label}']`);
    if (!input) throw new Error(`missing ${label}`);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function submit(node: ParentNode) {
    const form = node.querySelector("form.lyric-lookup");
    if (!(form instanceof HTMLFormElement)) throw new Error("missing lookup");
    await act(async () => {
      form.requestSubmit();
    });
  }

  function sourceLyrics(node: ParentNode): string {
    const section = [...node.querySelectorAll("section")].find((item) => item.querySelector("h2")?.textContent === "原詞");
    const box = section?.querySelector("textarea");
    if (!(box instanceof HTMLTextAreaElement)) throw new Error("missing 原詞");
    return box.value;
  }

  it("asks the configured proxy for lyrics and still fills 0243", async () => {
    vi.stubEnv("VITE_LRCLIB_PROXY_URL", "https://proxy.example/");
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("lexicon.json")) {
        return new Response(lexiconJson, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      urls.push(url);
      return new Response(JSON.stringify([hit]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const node = await mount();
    type(node, "搵歌詞歌名", "喜帖街");
    type(node, "歌手", "謝安琪");
    await submit(node);
    expect(urls).toEqual([
      "https://proxy.example/api/search?track_name=%E5%96%9C%E5%B8%96%E8%A1%97&artist_name=%E8%AC%9D%E5%AE%89%E7%90%AA",
    ]);
    expect(sourceLyrics(node)).toBe("人人常歡笑");
    expectDigits(node, "人人常歡笑");
  });

  it("opens a new song and shows the lyric in 原詞 and the 0243 box", async () => {
    installFetch([hit]);
    const node = await mount();
    type(node, "搵歌詞歌名", "喜帖街");
    type(node, "歌手", "謝安琪");
    await submit(node);

    expect(node.querySelector("h1")?.textContent).toBe("粵語填詞");
    expect(node.querySelector<HTMLInputElement>(".song-actions input")?.value).toBe("喜帖街");
    expect(sourceLyrics(node)).toBe("人人常歡笑");
    expect(node.querySelector<HTMLTextAreaElement>("textarea[placeholder='陳大文']")?.value).toBe("人人常歡笑");
    expectDigits(node, "人人常歡笑");

    const back = [...node.querySelectorAll("button")].find((button) => button.textContent === "返回歌庫");
    act(() => {
      back?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(node.querySelector("h1")?.textContent).toBe("歌曲庫");
    expect(node.textContent).toContain("喜帖街");
    expect(node.textContent).toContain("人人常歡笑");
    const stored = JSON.parse(localStorage.getItem(SONG_LIBRARY_KEY) ?? "[]") as { sourceLyrics: string }[];
    expect(stored.map((song) => song.sourceLyrics)).toContain("人人常歡笑");
  });

  it("stays on the library when nothing usable comes back", async () => {
    installFetch([]);
    const node = await mount();
    type(node, "搵歌詞歌名", "冇呢首");
    await submit(node);
    expect(node.querySelector("h1")?.textContent).toBe("歌曲庫");
    expect(node.textContent).toContain("搵唔到有歌詞嘅版本");
    expect([...node.querySelectorAll("button")].some((button) => button.textContent === "開新歌")).toBe(true);
    expect(localStorage.getItem(SONG_LIBRARY_KEY)).toBeNull();
  });

  it("fills the open song and keeps a title the user already set", async () => {
    installFetch([hit]);
    const node = await mount();
    const create = [...node.querySelectorAll("button")].find((button) => button.textContent === "開新歌");
    act(() => {
      create?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const title = node.querySelector<HTMLInputElement>(".song-actions input");
    if (!title) throw new Error("missing title");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(title, "自定歌名");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    type(node, "搵歌詞歌名", "喜帖街");
    await submit(node);
    expect(title.value).toBe("自定歌名");
    expect(sourceLyrics(node)).toBe("人人常歡笑");
    expect(node.querySelector<HTMLTextAreaElement>("textarea[placeholder='陳大文']")?.value).toBe("人人常歡笑");
    expectDigits(node, "人人常歡笑");
  });

  it("names an untitled open song from the track", async () => {
    installFetch([hit]);
    const node = await mount();
    const create = [...node.querySelectorAll("button")].find((button) => button.textContent === "開新歌");
    act(() => {
      create?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    type(node, "搵歌詞歌名", "喜帖街");
    await submit(node);
    expect(node.querySelector<HTMLInputElement>(".song-actions input")?.value).toBe("喜帖街");
    expect(sourceLyrics(node)).toBe("人人常歡笑");
    expectDigits(node, "人人常歡笑");
  });
});
