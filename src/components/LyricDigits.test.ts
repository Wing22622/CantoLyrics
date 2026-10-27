/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { LyricDigitsPanel } from "./LyricDigits";
import type { LyricReading } from "../lyric-0243";

const fake: Record<string, LyricReading[]> = {
  人: [
    { jyutping: "jan4", tone: 4, percent: 90 },
    { jyutping: "jan2", tone: 2, percent: 10 },
  ],
  笑: [{ jyutping: "siu3", tone: 3, percent: 100 }],
};

function readingsFor(char: string): readonly LyricReading[] {
  return fake[char] ?? [];
}

describe("LyricDigitsPanel", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  function render(ready = true) {
    const node = document.createElement("div");
    document.body.appendChild(node);
    host = node;
    const mounted = createRoot(node);
    root = mounted;
    act(() => {
      mounted.render(
        createElement(LyricDigitsPanel, {
          readingsFor,
          lexiconReady: ready,
        }),
      );
    });
    return node;
  }

  function typePhrase(node: ParentNode, value: string) {
    const input = node.querySelector("textarea");
    if (!input) throw new Error("missing phrase field");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("shows digits from a typed phrase and updates one character's reading", () => {
    const node = render();
    typePhrase(node, "人人");
    const digits = node.querySelector(".lyric-digits");
    expect(digits?.textContent).toBe("00");
    const cells = [...node.querySelectorAll(".lyric-cell")];
    expect(cells).toHaveLength(2);
    const alternate = [...cells[1].querySelectorAll("button")].find((button) => button.textContent?.includes("jan2"));
    if (!alternate) throw new Error("missing jan2");
    act(() => {
      alternate.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(node.querySelector(".lyric-digits")?.textContent).toBe("03");
    expect(alternate.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a placeholder for an unknown character and skips Latin", () => {
    const node = render();
    typePhrase(node, "人𠀀，ok 笑");
    expect(node.querySelector(".lyric-digits")?.textContent).toBe("0«?» 4");
    expect(node.textContent).toContain("未收");
  });

  it("stays quiet for an empty phrase", () => {
    const node = render();
    expect(node.querySelector(".lyric-digits")).toBeNull();
    typePhrase(node, "   ");
    expect(node.querySelector(".lyric-digits")).toBeNull();
    typePhrase(node, "abc");
    expect(node.querySelector(".lyric-digits")).toBeNull();
    expect(node.textContent).toContain("呢段冇漢字");
  });

  it("does not invent digits before the lexicon is ready", () => {
    const node = render(false);
    typePhrase(node, "人");
    expect(node.querySelector(".lyric-digits")).toBeNull();
    expect(node.textContent).toContain("詞庫載入緊");
  });
});
