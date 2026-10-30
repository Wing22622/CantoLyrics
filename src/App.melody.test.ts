/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { twinkleMidi } from "./melody-catalog";
import { EXAMPLE_JIANPU } from "./example";
import { loadLexicon } from "./lexicon";
import type { LyricSlot } from "./slots";
import { SONG_LIBRARY_KEY, type StoredSong } from "./storage";

describe("melody input", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  beforeEach(() => {
    localStorage.removeItem(SONG_LIBRARY_KEY);
  });

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

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

  function click(node: ParentNode, name: string) {
    const button = [...node.querySelectorAll("button")].find((item) => item.textContent === name);
    if (!button) throw new Error(`missing ${name}`);
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function melody(node: ParentNode): HTMLElement {
    const section = [...node.querySelectorAll("section")].find(
      (item) => item.querySelector("h2")?.textContent === "旋律",
    );
    if (!section) throw new Error("missing 旋律");
    return section;
  }

  function methodSelect(section: ParentNode): HTMLSelectElement {
    const select = section.querySelector("select");
    if (!(select instanceof HTMLSelectElement)) throw new Error("missing 輸入方法");
    return select;
  }

  function chooseMelody(section: ParentNode, label: string) {
    const select = methodSelect(section);
    const option = [...select.options].find((item) => item.text === label);
    if (!option) throw new Error(`missing ${label}`);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function typeNotation(section: ParentNode, value: string) {
    const textarea = section.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("missing notation");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, value);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function fileInputs(section: ParentNode): HTMLInputElement[] {
    return [...section.querySelectorAll("input")].filter(
      (input): input is HTMLInputElement => input instanceof HTMLInputElement && input.type === "file",
    );
  }

  function midiFile(section: ParentNode): HTMLInputElement | undefined {
    return fileInputs(section).find((input) => input.accept === ".mid,.midi,audio/midi");
  }

  function recordingFile(section: ParentNode): HTMLInputElement | undefined {
    return fileInputs(section).find((input) => input.accept.startsWith("audio/*"));
  }

  function noteCount(node: ParentNode): string {
    const section = [...node.querySelectorAll("section")].find(
      (item) => item.querySelector("h2")?.textContent === "填詞",
    );
    if (!section) throw new Error("missing 填詞");
    const count = [...section.querySelectorAll("p")].find((item) => /^\d+ 個音$/.test(item.textContent ?? ""));
    if (!count?.textContent) throw new Error("missing 個音");
    return count.textContent;
  }

  function openNewSong(node: ParentNode) {
    click(node, "開新歌");
  }

  it("starts a new song with the melody method unset and no input", async () => {
    const node = await mount();
    openNewSong(node);
    const section = melody(node);
    expect(section.querySelector("h2")?.textContent).toBe("旋律");
    expect([...section.querySelectorAll("button")].some((button) => button.textContent === "載入《世界真細小》例句")).toBe(
      true,
    );
    const shown = [...section.querySelectorAll("textarea"), ...fileInputs(section)].map((el) =>
      el instanceof HTMLTextAreaElement ? "textarea" : el.accept,
    );
    expect(shown).toEqual([]);
    const select = methodSelect(section);
    expect(select.options[select.selectedIndex]?.text).toBe("未揀");
    expect([...select.options].map((option) => option.text)).toEqual(["未揀", "簡譜", "MIDI", "錄音"]);
  });

  it("shows one melody input for the chosen method", async () => {
    const node = await mount();
    openNewSong(node);

    chooseMelody(melody(node), "簡譜");
    let section = melody(node);
    expect(section.querySelector("textarea")).not.toBeNull();
    expect(midiFile(section)).toBeUndefined();
    expect(recordingFile(section)).toBeUndefined();
    expect(section.querySelector("select")).toBeInstanceOf(HTMLSelectElement);

    chooseMelody(section, "MIDI");
    section = melody(node);
    expect(midiFile(section)).toBeInstanceOf(HTMLInputElement);
    expect(section.querySelector("textarea")).toBeNull();
    expect(recordingFile(section)).toBeUndefined();
    expect(section.querySelector("select")).toBeInstanceOf(HTMLSelectElement);

    chooseMelody(section, "錄音");
    section = melody(node);
    expect(recordingFile(section)).toBeInstanceOf(HTMLInputElement);
    expect(section.querySelector("textarea")).toBeNull();
    expect(midiFile(section)).toBeUndefined();
    expect(section.querySelector("select")).toBeInstanceOf(HTMLSelectElement);
    expect(section.querySelector("input[aria-label='上載自己嘅 MIDI']")).toBeNull();
  });

  it("keeps the method-menu MIDI upload as an editable 0243 line", async () => {
    const node = await mount();
    openNewSong(node);
    chooseMelody(melody(node), "MIDI");
    const input = midiFile(melody(node));
    if (!input) throw new Error("missing midi file");
    const bytes = twinkleMidi();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const file = new File([copy], "mine.mid", { type: "audio/midi" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const codes = [...node.querySelectorAll<HTMLSelectElement>(".syllable select.code")].map((select) => select.value);
    expect(codes.join("")).toBe("0044334");
    expect(melody(node).querySelector("input[aria-label='上載自己嘅 MIDI']")).toBeNull();
  });

  it("keeps typed notation and the note count when the method changes", async () => {
    const node = await mount();
    openNewSong(node);
    chooseMelody(melody(node), "簡譜");
    typeNotation(melody(node), "1 2 3");
    const count = noteCount(node);
    expect(count).not.toBe("0 個音");

    chooseMelody(melody(node), "MIDI");
    expect(melody(node).querySelector("textarea")).toBeNull();
    expect(noteCount(node)).toBe(count);

    chooseMelody(melody(node), "簡譜");
    const textarea = melody(node).querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("missing notation");
    expect(textarea.value).toBe("1 2 3");
    expect(noteCount(node)).toBe(count);
  });

  it("loads the example into the jianpu field", async () => {
    const node = await mount();
    openNewSong(node);
    click(melody(node), "載入《世界真細小》例句");
    const section = melody(node);
    const textarea = section.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("missing notation");
    expect(textarea.value).toBe(EXAMPLE_JIANPU);
    expect(methodSelect(section).options[methodSelect(section).selectedIndex]?.text).toBe("簡譜");
  });

  it("reopens a song with the method unset and restores the typed notation", async () => {
    const node = await mount();
    openNewSong(node);
    chooseMelody(melody(node), "簡譜");
    typeNotation(melody(node), "1 2 3");
    click(node, "返回歌庫");
    click(node, "開啟");
    const reopened = melody(node);
    expect(reopened.querySelector("textarea")).toBeNull();
    expect(fileInputs(reopened)).toEqual([]);
    expect(methodSelect(reopened).options[methodSelect(reopened).selectedIndex]?.text).toBe("未揀");
    chooseMelody(reopened, "簡譜");
    const textarea = melody(node).querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("missing notation");
    expect(textarea.value).toBe("1 2 3");
  });

  it("shows the midi caption after choosing 簡譜 for a saved song with no jianpu", async () => {
    const slot: LyricSlot = {
      id: "sung-1",
      pitch: 60,
      beats: 1,
      label: "C4",
      bar: 1,
      mapped: "4",
      override: null,
      source: "",
      melisma: false,
      character: "人",
      reading: null,
    };
    const song: StoredSong = {
      id: "saved-midi",
      title: "無簡譜",
      updatedAt: 1,
      jianpu: "",
      sourceLyrics: "",
      slots: [slot],
    };
    localStorage.setItem(SONG_LIBRARY_KEY, JSON.stringify([song]));
    const node = await mount();
    click(node, "開啟");
    const opened = melody(node);
    expect(opened.querySelector("textarea")).toBeNull();
    expect(fileInputs(opened)).toEqual([]);
    expect(methodSelect(opened).options[methodSelect(opened).selectedIndex]?.text).toBe("未揀");
    chooseMelody(opened, "簡譜");
    const section = melody(node);
    const textarea = section.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("missing notation");
    expect(textarea.value).toBe("");
    expect(section.textContent).toContain("而家顯示緊 MIDI 旋律");
  });
});
