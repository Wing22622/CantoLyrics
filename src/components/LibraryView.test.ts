/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryView } from "./LibraryView";
import type { StoredSong } from "../storage";

const song: StoredSong = {
  id: "a",
  title: "星期一",
  updatedAt: 1,
  jianpu: "",
  sourceLyrics: "",
  slots: [],
};

describe("library create", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  function render(songs: StoredSong[], onCreate: (title?: string) => void) {
    const node = document.createElement("div");
    document.body.appendChild(node);
    host = node;
    const mounted = createRoot(node);
    root = mounted;
    act(() => {
      mounted.render(
        createElement(LibraryView, {
          songs,
          query: "",
          storageError: "",
          onQuery: () => {},
          onCreate,
          onOpen: () => {},
          onRename: () => {},
          onDelete: () => {},
          onFoundLyrics: () => {},
          onFoundMelody: () => {},
        }),
      );
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

  function typeTitle(node: ParentNode, value: string) {
    const input = node.querySelector<HTMLInputElement>("input[aria-label='新歌歌名']");
    if (!input) throw new Error("missing title field");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("offers one 開新歌 button when the library is empty", () => {
    const onCreate = vi.fn();
    const node = render([], onCreate);
    expect(node.querySelector("button.text-link")).toBeNull();
    expect(node.textContent).toContain("用歌名搵旋律");
    expect(node.textContent).toContain("上網搵歌詞");
    expect(node.querySelector("a[href='https://commons.wikimedia.org/']")).not.toBeNull();
    expect(node.querySelector("a[href='https://lrclib.net/']")).not.toBeNull();
    click(node, "開新歌");
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith();
  });

  it("asks for a title and waits for 建立 when songs already exist", () => {
    const onCreate = vi.fn();
    const node = render([song], onCreate);
    expect([...node.querySelectorAll("button")].some((button) => button.textContent === "開新歌")).toBe(false);
    click(node, "新歌");
    expect(onCreate).not.toHaveBeenCalled();
    const create = [...node.querySelectorAll("button")].find((button) => button.textContent === "建立");
    expect(create?.disabled).toBe(true);
    typeTitle(node, "  細細歌  ");
    click(node, "建立");
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("細細歌");
  });

  it("does not create a song when the title prompt is cancelled", () => {
    const onCreate = vi.fn();
    const node = render([song], onCreate);
    click(node, "新歌");
    click(node, "取消");
    expect(onCreate).not.toHaveBeenCalled();
    expect(node.querySelector("input[aria-label='新歌歌名']")).toBeNull();
    expect([...node.querySelectorAll("button")].some((button) => button.textContent === "新歌")).toBe(true);
  });
});
