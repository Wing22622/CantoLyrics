/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlotRow } from "./SlotRow";
import type { LyricSlot } from "../slots";

const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

function slot(label: string, extra: Partial<LyricSlot> = {}): LyricSlot {
  return {
    id: label,
    pitch: 60,
    beats: 1,
    label,
    bar: 1,
    mapped: "4",
    override: null,
    source: "人",
    melisma: false,
    character: "常",
    reading: null,
    ...extra,
  };
}

describe("lyric slot focus", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    document.head.querySelectorAll("style").forEach((style) => style.remove());
    root = null;
    host = null;
  });

  function render(slots: LyricSlot[], selection: number[] = [], onCommit = () => {}, onSelect = () => {}) {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const node = document.createElement("div");
    document.body.appendChild(node);
    host = node;
    const mounted = createRoot(node);
    root = mounted;
    act(() => {
      mounted.render(
        createElement(SlotRow, {
          slots,
          selection,
          readingsFor: () => [],
          lexiconReady: false,
          onSelect,
          onCommit,
          onReading: () => {},
          onMelisma: () => {},
          onSource: () => {},
          onCode: () => {},
          registerInput: () => {},
        }),
      );
    });
    return node;
  }

  function px(element: Element, prop: "fontSize" | "width" = "fontSize") {
    return Number.parseFloat(getComputedStyle(element)[prop]);
  }

  it("enlarges the focused character, its 0243 code, and the pitch", () => {
    const node = render([slot("3"), slot("4"), slot("5", { character: "" })]);
    const syllables = [...node.querySelectorAll<HTMLElement>(".syllable")];
    const chars = [...node.querySelectorAll<HTMLInputElement>("input.char")];
    act(() => chars[1].focus());

    expect(syllables[1].matches(":focus-within")).toBe(true);
    expect(syllables[0].matches(":focus-within")).toBe(false);
    expect(syllables[2].matches(":focus-within")).toBe(false);
    expect(px(syllables[1].querySelector(".char")!)).toBeGreaterThan(px(syllables[0].querySelector(".char")!));
    expect(px(syllables[1].querySelector(".code")!)).toBeGreaterThan(px(syllables[0].querySelector(".code")!));
    expect(px(syllables[1].querySelector(".pitch")!)).toBeGreaterThan(px(syllables[0].querySelector(".pitch")!));
    expect(px(syllables[1].querySelector(".source")!)).toBe(px(syllables[0].querySelector(".source")!));
    expect(getComputedStyle(syllables[0].querySelector(".char")!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(syllables[0].querySelector(".char")!).borderTopWidth).toBe("0px");
    expect(getComputedStyle(syllables[1].querySelector(".char")!).boxShadow).toBe("none");
    expect(getComputedStyle(syllables[2].querySelector(".char")!).boxShadow).toContain("#e3d5c3");
    expect(syllables[2].classList.contains("is-empty")).toBe(true);
    expect(syllables[1].classList.contains("is-empty")).toBe(false);
  });

  it("moves the enlarge when another slot is tapped, and leaves a shift-click caret alone", () => {
    const onSelect = vi.fn();
    const node = render([slot("3"), slot("4")], [], () => {}, onSelect);
    const syllables = [...node.querySelectorAll<HTMLElement>(".syllable")];
    const chars = [...node.querySelectorAll<HTMLInputElement>("input.char")];
    act(() => {
      chars[0].focus();
      chars[0].setSelectionRange(0, 0);
    });

    const pitch = syllables[0].querySelector(".pitch")!;
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      pitch.dispatchEvent(down);
      pitch.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(chars[0]);
    expect(chars[0].selectionStart).toBe(0);

    const otherPitch = syllables[1].querySelector(".pitch")!;
    const otherDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      otherPitch.dispatchEvent(otherDown);
      otherPitch.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.activeElement).toBe(chars[0]);
    expect(chars[0].selectionStart).toBe(0);

    const code = syllables[0].querySelector("select.code")!;
    const codeDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      code.dispatchEvent(codeDown);
      code.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(codeDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(chars[0]);
    expect(chars[0].selectionStart).toBe(0);

    act(() => {
      chars[1].focus();
      chars[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(document.activeElement).toBe(chars[1]);
    expect(syllables[1].matches(":focus-within")).toBe(true);
    expect(px(syllables[1].querySelector(".char")!)).toBeGreaterThan(px(syllables[0].querySelector(".char")!));

    act(() => {
      syllables[0].querySelector(".pitch")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      );
    });
    expect(document.activeElement).toBe(chars[1]);
    expect(onSelect).toHaveBeenCalledWith(0, true);
  });

  it("moves across syllables with the arrow keys and ignores them during IME", () => {
    const node = render([
      slot("3", { character: "人" }),
      slot("4", { character: "常" }),
      slot("5", { melisma: true, character: "", source: "" }),
      slot("6", { character: "笑" }),
    ]);
    const chars = [...node.querySelectorAll<HTMLInputElement>("input.char")];
    act(() => {
      chars[0].focus();
      chars[0].setSelectionRange(1, 1);
      chars[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(chars[1]);
    expect(chars[1].closest(".syllable")?.matches(":focus-within")).toBe(true);
    expect(chars[0].closest(".syllable")?.matches(":focus-within")).toBe(false);

    act(() => {
      chars[1].setSelectionRange(1, 1);
      chars[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(chars[2]);

    act(() => {
      chars[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(chars[1]);

    act(() => {
      chars[1].setSelectionRange(1, 1);
      chars[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true, isComposing: true }));
    });
    expect(document.activeElement).toBe(chars[1]);
  });

  it("keeps the caret in the character field through an IME composition", () => {
    const onCommit = vi.fn();
    const node = render([slot("3", { character: "" })], [], onCommit);
    const input = node.querySelector<HTMLInputElement>("input.char")!;
    act(() => input.focus());
    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "常");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect(input.closest(".syllable")?.matches(":focus-within")).toBe(true);

    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(0, "常");
    expect(document.activeElement).toBe(input);
  });

  it("enlarges a melisma from the tone code and the pitch when that slot is focused", () => {
    const node = render([
      slot("3", { melisma: true, character: "", source: "" }),
      slot("4", { melisma: true, character: "", source: "" }),
    ]);
    const syllables = [...node.querySelectorAll<HTMLElement>(".syllable")];
    act(() => syllables[1].focus());
    expect(syllables[1].matches(":focus-within")).toBe(true);
    expect(syllables[0].matches(":focus-within")).toBe(false);
    expect(px(syllables[1].querySelector(".glyph")!)).toBeGreaterThan(px(syllables[0].querySelector(".glyph")!));
    expect(px(syllables[1].querySelector(".code")!)).toBeGreaterThan(px(syllables[0].querySelector(".code")!));
    expect(px(syllables[1].querySelector(".pitch")!)).toBeGreaterThan(px(syllables[0].querySelector(".pitch")!));
  });
});

function keyed(id: string, label: string): LyricSlot {
  return {
    id,
    pitch: 60,
    beats: 1,
    label,
    bar: 1,
    mapped: "4",
    override: null,
    source: "",
    melisma: false,
    character: "",
    reading: null,
  };
}

function renderRow(slots: LyricSlot[]) {
  return createElement(SlotRow, {
    slots,
    selection: [],
    readingsFor: () => [],
    lexiconReady: false,
    onSelect: () => {},
    onCommit: () => {},
    onReading: () => {},
    onMelisma: () => {},
    onSource: () => {},
    onCode: () => {},
    registerInput: () => {},
  });
}

describe("slot keys", () => {
  let keyRoot: Root | null = null;
  let keyHost: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => keyRoot?.unmount());
    keyHost?.remove();
    keyRoot = null;
    keyHost = null;
  });

  function mount(slots: LyricSlot[]) {
    keyHost = document.createElement("div");
    document.body.appendChild(keyHost);
    keyRoot = createRoot(keyHost);
    act(() => keyRoot?.render(renderRow(slots)));
  }

  it("keeps the focused character field when a note is inserted earlier", () => {
    const first = keyed("a", "3");
    const second = keyed("b", "4");
    mount([first, second]);
    const input = keyHost?.querySelector('[data-slot-id="b"] input.char');
    expect(input).toBeInstanceOf(HTMLInputElement);
    act(() => (input as HTMLInputElement).focus());
    expect(document.activeElement).toBe(input);

    act(() => keyRoot?.render(renderRow([keyed("new", "1"), first, second])));

    expect(document.activeElement).toBe(input);
    expect((input as HTMLElement).closest("[data-slot-id]")?.getAttribute("data-slot-id")).toBe("b");
    expect(keyHost?.querySelector('[data-slot-id="new"] .pitch')?.textContent).toBe("1");
  });
});
