/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { loadLexicon } from "./lexicon";
import { twinkleMidi } from "./melody-catalog";
import { resolveMelody, searchMelody, sungNotes } from "./melody-search";
import { slotsForTrackChoice } from "./slots";
import { SONG_LIBRARY_KEY, type StoredSong } from "./storage";
import { mapMelody } from "./tone-0243";

const lexiconJson = readFileSync(resolve("public/lexicon.json"), "utf8");

async function expectedTwinkle() {
  const found = await searchMelody({ trackName: "小星星", artistName: "" });
  if (!found.ok) throw new Error("bundle miss");
  const resolved = await resolveMelody(found.hits[0]);
  if (!resolved.ok) throw new Error("bundle unreadable");
  const notes = sungNotes(resolved.melody.tracks[resolved.melody.trackIndex]);
  const slots = slotsForTrackChoice(notes, [], null);
  const mapped = slots.map((slot) => slot.mapped);
  expect(mapped.join("")).toBe("0044334");
  expect(mapped.join("")).toBe(mapMelody(notes.map((note) => ({ pitch: note.pitch }))).join(""));
  return { notes, mapped };
}

describe("melody from a song title", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.unstubAllGlobals();
  });

  function installFetch(commons: () => Response | Promise<Response>) {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("lexicon.json")) {
        return new Response(lexiconJson, { status: 200, headers: { "Content-Type": "application/json" } });
      }
      urls.push(url);
      return commons();
    });
    return urls;
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
      await loadLexicon().catch(() => undefined);
    });
    return node;
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

  async function submitMelody(node: ParentNode) {
    const form = node.querySelector("form.melody-lookup");
    if (!(form instanceof HTMLFormElement)) throw new Error("missing melody lookup");
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

  function codes(node: ParentNode): string[] {
    return [...node.querySelectorAll<HTMLSelectElement>(".syllable select.code")].map((select) => select.value);
  }

  beforeEach(() => {
    localStorage.removeItem(SONG_LIBRARY_KEY);
  });

  it("opens 小星星 as editable 0243 from the melody, not from lyrics", async () => {
    const urls = installFetch(() => {
      throw new Error("commons should not be called");
    });
    const { notes, mapped } = await expectedTwinkle();
    const node = await mount();
    type(node, "旋律歌名", "小星星");
    await submitMelody(node);

    expect(urls).toEqual([]);
    expect(node.querySelector("h1")?.textContent).toBe("粵語填詞");
    expect(node.querySelector<HTMLInputElement>(".song-actions input")?.value).toBe("小星星");
    expect(sourceLyrics(node)).toBe("");
    expect(node.querySelector(".lyric-digits")).toBeNull();
    expect(codes(node)).toEqual(mapped);
    expect(codes(node).join("")).toBe("0044334");
    expect([...node.querySelectorAll(".pitch")].map((item) => item.textContent)).toEqual([
      "C4",
      "C4",
      "G4",
      "G4",
      "A4",
      "A4",
      "G4",
    ]);
    expect(node.textContent).toContain("公有領域");
    expect(node.textContent).toContain("唔係歌詞");
    expect(node.querySelector(".melody-credit a")?.getAttribute("href")).toContain("Twinkle");
    const melody = [...node.querySelectorAll("section")].find((item) => item.querySelector("h2")?.textContent === "旋律");
    expect(melody?.querySelector("select")?.selectedOptions[0]?.text).toBe("MIDI");

    const stored = JSON.parse(localStorage.getItem(SONG_LIBRARY_KEY) ?? "[]") as StoredSong[];
    expect(stored).toHaveLength(1);
    expect(stored[0].sourceLyrics).toBe("");
    expect(stored[0].jianpu).toBe("");
    expect(stored[0].slots.map((slot) => slot.mapped)).toEqual(mapped);
    expect(stored[0].slots[0].pitch).toBe(notes[0].pitch);
  });

  it("stays on the library when Commons has no free MIDI", async () => {
    installFetch(() => new Response(JSON.stringify({ batchcomplete: "" }), { status: 200 }));
    const node = await mount();
    type(node, "旋律歌名", "冇呢段旋律");
    await submitMelody(node);
    expect(node.querySelector("h1")?.textContent).toBe("歌曲庫");
    expect(node.textContent).toContain("搵唔到免費授權嘅旋律");
    expect(node.textContent).toContain("上載自己嘅 MIDI");
    expect(localStorage.getItem(SONG_LIBRARY_KEY)).toBeNull();
  });

  it("imports a pasted MIDI after a miss and opens editable 0243", async () => {
    installFetch(() => new Response(JSON.stringify({ batchcomplete: "" }), { status: 200 }));
    const node = await mount();
    type(node, "旋律歌名", "冇呢段旋律");
    await submitMelody(node);
    let binary = "";
    for (const byte of twinkleMidi()) binary += String.fromCharCode(byte);
    const box = node.querySelector<HTMLTextAreaElement>("textarea[aria-label='貼上 MIDI']");
    if (!box) throw new Error("missing paste box");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(box, `data:audio/midi;base64,${btoa(binary)}`);
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = [...node.querySelectorAll("button")].find((item) => item.textContent === "匯入貼上嘅 MIDI");
    if (!button) throw new Error("missing import");
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(node.querySelector("h1")?.textContent).toBe("粵語填詞");
    expect(node.querySelector<HTMLInputElement>(".song-actions input")?.value).toBe("冇呢段旋律");
    expect(codes(node).join("")).toBe("0044334");
    expect(sourceLyrics(node)).toBe("");
    const melody = [...node.querySelectorAll("section")].find((item) => item.querySelector("h2")?.textContent === "旋律");
    expect(melody?.querySelector("select")?.selectedOptions[0]?.text).toBe("MIDI");
  });

  it("shows a network error and does not create a song", async () => {
    installFetch(() => {
      throw new Error("offline");
    });
    const node = await mount();
    type(node, "旋律歌名", "Ode to Joy");
    await submitMelody(node);
    expect(node.querySelector("h1")?.textContent).toBe("歌曲庫");
    expect(node.textContent).toContain("連唔到 Wikimedia Commons");
    expect(localStorage.getItem(SONG_LIBRARY_KEY)).toBeNull();
  });

  it("keeps typed characters, drops hand-edited codes, and leaves lyrics empty", async () => {
    installFetch(() => {
      throw new Error("commons should not be called");
    });
    const { mapped } = await expectedTwinkle();
    const node = await mount();
    const create = [...node.querySelectorAll("button")].find((button) => button.textContent === "開新歌");
    act(() => {
      create?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    type(node, "旋律歌名", "小星星");
    await submitMelody(node);
    expect(node.querySelector<HTMLInputElement>(".song-actions input")?.value).toBe("小星星");

    const character = node.querySelector<HTMLInputElement>("input.char");
    const select = node.querySelector<HTMLSelectElement>(".syllable select.code");
    if (!character || !select) throw new Error("missing syllable");
    const other = mapped[0] === "0" ? "3" : "0";
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(character, "笑");
      character.dispatchEvent(new Event("input", { bubbles: true }));
      const setCode = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setCode?.call(select, other);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(node.querySelector(".edit-mark")?.textContent).toBe("改");

    await submitMelody(node);
    expect(node.querySelector<HTMLInputElement>("input.char")?.value).toBe("笑");
    expect(codes(node)).toEqual(mapped);
    expect(node.querySelector(".edit-mark")).toBeNull();
    expect(sourceLyrics(node)).toBe("");
    expect(node.querySelector(".lyric-digits")).toBeNull();
  });
});
