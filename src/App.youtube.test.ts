/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { framesFromSamples, melodyFromFrames } from "./audio-melody";
import { loadLexicon } from "./lexicon";
import { slotsForTrackChoice } from "./slots";
import { SONG_LIBRARY_KEY } from "./storage";
import { mapMelody } from "./tone-0243";
import { youtubeAudioMessage } from "./youtube-audio";

const ID = "dQw4w9WgXcQ";
const PROXY = "https://youtube-audio.example";

function sine(hz: number, seconds: number, sampleRate = 16000, amplitude = 0.4): Float32Array {
  const length = Math.floor(seconds * sampleRate);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return samples;
}

function concatSamples(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    samples.set(part, offset);
    offset += part.length;
  }
  return samples;
}

const samples = concatSamples([sine(261.63, 0.6), sine(329.63, 0.6)]);

function installSineDecoder() {
  class FakeBuffer {
    readonly length = samples.length;
    readonly duration = samples.length / 16000;
    readonly sampleRate = 16000;
    readonly numberOfChannels = 1;
    getChannelData(): Float32Array {
      return samples;
    }
  }
  class FakeAudioContext {
    decodeAudioData(): Promise<FakeBuffer> {
      return Promise.resolve(new FakeBuffer());
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }
  class FakeOffline {
    readonly destination = {};
    createBufferSource(): { buffer: unknown; connect: () => void; start: () => void } {
      return { buffer: null, connect() {}, start() {} };
    }
    startRendering(): Promise<FakeBuffer> {
      return Promise.resolve(new FakeBuffer());
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("OfflineAudioContext", FakeOffline);
}

describe("YouTube URL in the editor", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    localStorage.removeItem(SONG_LIBRARY_KEY);
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
    return button;
  }

  function setValue(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function codes(node: ParentNode): string[] {
    return [...node.querySelectorAll<HTMLSelectElement>(".syllable select.code")].map((select) => select.value);
  }

  it("shows the deploy hint and does not convert when the proxy URL is unset", async () => {
    vi.stubEnv("VITE_YOUTUBE_AUDIO_PROXY_URL", "");
    const node = await mount();
    await act(async () => {
      click(node, "開新歌").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(node.textContent).toContain(youtubeAudioMessage("missing-proxy"));
    const input = node.querySelector<HTMLInputElement>("input[aria-label='YouTube 連結']");
    const button = click(node, "抽出旋律");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("fills the same 0243 slots as an uploaded recording", async () => {
    vi.stubEnv("VITE_YOUTUBE_AUDIO_PROXY_URL", PROXY);
    installSineDecoder();
    const calls: string[] = [];
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push(href);
      if (href.startsWith(`${PROXY}/audio`)) {
        return Promise.resolve(new Response(Uint8Array.from([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "audio/mp4" },
        }));
      }
      return realFetch(input, init);
    });

    const node = await mount();
    await act(async () => {
      click(node, "開新歌").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const input = node.querySelector<HTMLInputElement>("input[aria-label='YouTube 連結']");
    if (!input) throw new Error("missing YouTube field");
    act(() => setValue(input, `https://youtu.be/${ID}?t=10`));
    await act(async () => {
      click(node, "抽出旋律").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const notes = melodyFromFrames(framesFromSamples(samples, 16000));
    const expected = slotsForTrackChoice(notes, [], null).map((slot) => slot.mapped);
    const mapped = mapMelody(notes.map((note) => ({ pitch: note.rest ? null : note.pitch }))).filter(
      (code) => code != null,
    );
    expect(expected).toEqual(mapped);
    expect(expected.length).toBeGreaterThan(0);
    expect(codes(node)).toEqual(expected);
    expect(calls.some((href) => href === `${PROXY}/audio?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`)}`)).toBe(true);

    const select = [...node.querySelectorAll("section")]
      .find((section) => section.querySelector("h2")?.textContent === "旋律")
      ?.querySelector("select");
    if (!(select instanceof HTMLSelectElement)) throw new Error("missing 輸入方法");
    expect(select.options[select.selectedIndex]?.text).toBe("錄音");

    const fileInput = [...node.querySelectorAll("input")].find(
      (item): item is HTMLInputElement => item instanceof HTMLInputElement && item.accept.startsWith("audio/*"),
    );
    if (!fileInput) throw new Error("missing recording upload");
    const file = new File([Uint8Array.from([8, 8, 8])], "clip.mp3", { type: "audio/mpeg" });
    Object.defineProperty(fileInput, "files", { configurable: true, value: [file] });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(codes(node)).toEqual(expected);
  });
});
