/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MelodyLookup } from "./MelodyLookup";
import type { MelodyHit, MelodyQuery, MelodyResolveOutcome, MelodySearchOutcome, ResolvedMelody } from "../melody-search";

const melody: ResolvedMelody = {
  title: "小星星",
  tracks: [{ name: "Twinkle", notes: [{ pitch: 60, startBeat: 0, beats: 1, bar: 1 }] }],
  trackIndex: 0,
  source: "內置公有領域",
  sourceUrl: "https://en.wikipedia.org/wiki/Twinkle,_Twinkle,_Little_Star",
  warnings: [],
};

function hit(id: string, label: string): MelodyHit {
  return {
    id,
    label,
    detail: "Public domain",
    title: label,
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.mid",
    ref: {
      kind: "commons",
      fileUrl: `https://upload.wikimedia.org/${id}.mid`,
      pageUrl: "https://commons.wikimedia.org/wiki/File:Example.mid",
      license: "Public domain",
      fileTitle: label,
    },
  };
}

describe("MelodyLookup", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  function render(
    search: (query: MelodyQuery) => Promise<MelodySearchOutcome>,
    onFound: (found: ResolvedMelody) => void,
    resolve: (item: MelodyHit) => Promise<MelodyResolveOutcome> = async () => ({ ok: true, melody }),
  ) {
    const node = document.createElement("div");
    document.body.appendChild(node);
    host = node;
    const mounted = createRoot(node);
    root = mounted;
    act(() => {
      mounted.render(createElement(MelodyLookup, { search, resolve, onFound }));
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

  function submit(node: ParentNode) {
    const form = node.querySelector("form");
    if (!(form instanceof HTMLFormElement)) throw new Error("missing form");
    return act(async () => {
      form.requestSubmit();
    });
  }

  it("does not search without a title and credits a melody source, not lyrics", () => {
    const search = vi.fn();
    const node = render(search, vi.fn());
    const button = node.querySelector("button[type='submit']");
    expect(button?.textContent).toBe("用歌名搵旋律");
    expect(button).toHaveProperty("disabled", true);
    expect(node.querySelector("a")?.getAttribute("href")).toBe("https://commons.wikimedia.org/");
    expect(node.textContent).toContain("免費 MIDI");
    expect(node.textContent).toContain("唔係歌詞");
    expect(node.textContent).not.toContain("LRCLIB");
  });

  it("shows a miss", async () => {
    const search = vi.fn(async (): Promise<MelodySearchOutcome> => ({ ok: false, failure: { status: "not-found" } }));
    const onFound = vi.fn();
    const node = render(search, onFound);
    type(node, "旋律歌名", "冇呢首");
    type(node, "旋律歌手", "某人");
    await submit(node);
    expect(search).toHaveBeenCalledWith({ trackName: "冇呢首", artistName: "某人" });
    expect(onFound).not.toHaveBeenCalled();
    expect(node.textContent).toContain("搵唔到免費授權嘅旋律");
  });

  it("resolves the only hit into melody notes", async () => {
    const search = vi.fn(async (): Promise<MelodySearchOutcome> => ({ ok: true, hits: [hit("one", "小星星")] }));
    const resolve = vi.fn(async (): Promise<MelodyResolveOutcome> => ({ ok: true, melody }));
    const onFound = vi.fn();
    const node = render(search, onFound, resolve);
    type(node, "旋律歌名", "小星星");
    await submit(node);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(onFound).toHaveBeenCalledWith(melody);
    expect(node.textContent).not.toContain("揀一段");
  });

  it("lets the user pick one of several MIDI files", async () => {
    const search = vi.fn(
      async (): Promise<MelodySearchOutcome> => ({ ok: true, hits: [hit("a", "甲"), hit("b", "乙")] }),
    );
    const resolve = vi.fn(async (): Promise<MelodyResolveOutcome> => ({ ok: true, melody }));
    const onFound = vi.fn();
    const node = render(search, onFound, resolve);
    type(node, "旋律歌名", "朋友");
    await submit(node);
    expect(onFound).not.toHaveBeenCalled();
    expect(node.textContent).toContain("搵到幾段旋律，揀一段。");
    const buttons = [...node.querySelectorAll(".hit-list button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["甲Public domain", "乙Public domain"]);
    await act(async () => {
      buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    expect(onFound).toHaveBeenCalledWith(melody);
  });

  it("shows a network error and ignores an older reply", async () => {
    const pending: Array<(outcome: MelodySearchOutcome) => void> = [];
    const search = vi.fn(
      () =>
        new Promise<MelodySearchOutcome>((resolveSearch) => {
          pending.push(resolveSearch);
        }),
    );
    const onFound = vi.fn();
    const node = render(search, onFound);
    type(node, "旋律歌名", "第一首");
    const form = node.querySelector("form");
    if (!(form instanceof HTMLFormElement)) throw new Error("missing form");
    act(() => {
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(node.textContent).toContain("搵緊旋律…");
    await act(async () => {
      pending[1]({ ok: false, failure: { status: "network" } });
    });
    expect(node.textContent).toContain("連唔到 Wikimedia Commons");
    await act(async () => {
      pending[0]({ ok: true, hits: [hit("old", "舊")] });
    });
    expect(onFound).not.toHaveBeenCalled();
    expect(node.textContent).toContain("連唔到 Wikimedia Commons");
  });

  it("shows an empty MIDI without calling onFound", async () => {
    const search = vi.fn(async (): Promise<MelodySearchOutcome> => ({ ok: true, hits: [hit("empty", "空")] }));
    const resolve = vi.fn(async (): Promise<MelodyResolveOutcome> => ({ ok: false, failure: { status: "empty" } }));
    const onFound = vi.fn();
    const node = render(search, onFound, resolve);
    type(node, "旋律歌名", "空");
    await submit(node);
    expect(onFound).not.toHaveBeenCalled();
    expect(node.textContent).toContain("冇旋律音");
  });
});
