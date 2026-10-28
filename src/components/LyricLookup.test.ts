/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LyricLookup } from "./LyricLookup";
import type { FoundLyrics, LyricQuery, LyricSearchOutcome } from "../lyrics-fetch";

describe("LyricLookup", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  function render(search: (query: LyricQuery) => Promise<LyricSearchOutcome>, onFound: (found: FoundLyrics) => void) {
    const node = document.createElement("div");
    document.body.appendChild(node);
    host = node;
    const mounted = createRoot(node);
    root = mounted;
    act(() => {
      mounted.render(createElement(LyricLookup, { search, onFound }));
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

  it("does not search without a title and credits LRCLIB", () => {
    const search = vi.fn();
    const onFound = vi.fn();
    const node = render(search, onFound);
    const button = node.querySelector("button[type='submit']");
    expect(button?.textContent).toBe("上網搵歌詞");
    expect(button).toHaveProperty("disabled", true);
    expect(node.querySelector("a")?.getAttribute("href")).toBe("https://lrclib.net/");
    expect(node.textContent).toContain("歌詞來自");
  });

  it("shows a miss without replacing pasted lyrics", async () => {
    const search = vi.fn(async (): Promise<LyricSearchOutcome> => ({ ok: false, failure: { status: "not-found" } }));
    const onFound = vi.fn();
    const node = render(search, onFound);
    type(node, "搵歌詞歌名", "冇呢首");
    type(node, "歌手", "某人");
    await submit(node);
    expect(search).toHaveBeenCalledWith({ trackName: "冇呢首", artistName: "某人" });
    expect(onFound).not.toHaveBeenCalled();
    expect(node.textContent).toContain("搵唔到有歌詞嘅版本");
    expect(node.textContent).toContain("自己貼上");
  });

  it("applies the only hit", async () => {
    const search = vi.fn(
      async (): Promise<LyricSearchOutcome> => ({
        ok: true,
        hits: [{ id: 1, trackName: "喜帖街", artistName: "謝安琪", albumName: "Binary", lyrics: "忘掉種過的花" }],
      }),
    );
    const onFound = vi.fn();
    const node = render(search, onFound);
    type(node, "搵歌詞歌名", "喜帖街");
    await submit(node);
    expect(onFound).toHaveBeenCalledWith({ title: "喜帖街", lyrics: "忘掉種過的花" });
    expect(node.textContent).not.toContain("揀一首");
  });

  it("lets the user pick one of several hits", async () => {
    const search = vi.fn(
      async (): Promise<LyricSearchOutcome> => ({
        ok: true,
        hits: [
          { id: 1, trackName: "朋友", artistName: "譚詠麟", albumName: "甲", lyrics: "甲詞" },
          { id: 2, trackName: "朋友", artistName: "周華健", albumName: "乙", lyrics: "乙詞" },
        ],
      }),
    );
    const onFound = vi.fn();
    const node = render(search, onFound);
    type(node, "搵歌詞歌名", "朋友");
    await submit(node);
    expect(onFound).not.toHaveBeenCalled();
    expect(node.textContent).toContain("搵到幾首，揀一首。");
    const buttons = [...node.querySelectorAll(".hit-list button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["朋友譚詠麟 · 甲", "朋友周華健 · 乙"]);
    act(() => {
      buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onFound).toHaveBeenCalledWith({ title: "朋友", lyrics: "乙詞" });
    expect(node.querySelector(".hit-list")).toBeNull();
  });

  it("shows a busy message and ignores an older reply", async () => {
    const pending: Array<(outcome: LyricSearchOutcome) => void> = [];
    const search = vi.fn(
      () =>
        new Promise<LyricSearchOutcome>((resolve) => {
          pending.push(resolve);
        }),
    );
    const onFound = vi.fn();
    const node = render(search, onFound);
    type(node, "搵歌詞歌名", "第一首");
    const form = node.querySelector("form");
    if (!(form instanceof HTMLFormElement)) throw new Error("missing form");
    act(() => {
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(pending).toHaveLength(2);
    expect(node.textContent).toContain("搵緊歌詞…");
    expect(node.querySelector("button[type='submit']")?.textContent).toBe("搵緊…");

    await act(async () => {
      pending[1]({ ok: false, failure: { status: "network" } });
    });
    expect(node.textContent).toContain("連唔到 LRCLIB");

    await act(async () => {
      pending[0]({
        ok: true,
        hits: [{ id: 1, trackName: "第一首", artistName: "", albumName: "", lyrics: "舊回覆" }],
      });
    });
    expect(onFound).not.toHaveBeenCalled();
    expect(node.textContent).toContain("連唔到 LRCLIB");
  });
});
