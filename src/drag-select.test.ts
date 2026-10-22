/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlotRow } from "./components/SlotRow";
import { indexFromPoint, nextDragIndex } from "./drag-select";
import type { LyricSlot } from "./slots";

function slot(label: string): LyricSlot {
  return {
    id: label,
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

function row(onSelect: (index: number, shift: boolean) => void): ReactElement {
  return createElement(SlotRow, {
    slots: [slot("3'"), slot("1'"), slot("2'")],
    selection: [],
    readingsFor: () => [],
    lexiconReady: false,
    onSelect,
    onCommit: () => {},
    onReading: () => {},
    onMelisma: () => {},
    onSource: () => {},
    onCode: () => {},
    registerInput: () => {},
  });
}

describe("drag selection", () => {
  it("reads the syllable under the pointer and ignores gaps", () => {
    document.body.innerHTML =
      '<div class="line"><span data-slot="4" class="syllable"><span class="pitch"></span></span></div>';
    const pitch = document.querySelector(".pitch");
    expect(indexFromPoint(pitch)).toBe(4);
    expect(indexFromPoint(document.querySelector(".line"))).toBe(null);
    expect(nextDragIndex(3, 4)).toBe(4);
    expect(nextDragIndex(4, 4)).toBe(null);
    expect(nextDragIndex(3, null)).toBe(null);
  });
});

describe("SlotRow drag", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    vi.restoreAllMocks();
  });

  function render(onSelect: (index: number, shift: boolean) => void) {
    const node = document.createElement("div");
    document.body.appendChild(node);
    host = node;
    const mounted = createRoot(node);
    root = mounted;
    act(() => {
      mounted.render(row(onSelect));
    });
    return [...node.querySelectorAll<HTMLElement>(".syllable")];
  }

  it("does not extend when a reflow slides the next syllable under a still pointer", () => {
    const onSelect = vi.fn();
    const [first, second] = render(onSelect);
    act(() => {
      first.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 191, clientY: 814 }));
      second.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, clientX: 191, clientY: 814 }));
      second.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, clientX: 191, clientY: 814 }));
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(0, false);
  });

  it("extends along a real pointer move", () => {
    const onSelect = vi.fn();
    const syllables = render(onSelect);
    document.elementFromPoint = ((x: number) => (Number(x) > 200 ? syllables[1] : syllables[0])) as typeof document.elementFromPoint;
    act(() => {
      syllables[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 180, clientY: 20 }));
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 220, clientY: 20 }));
    });
    expect(onSelect).toHaveBeenLastCalledWith(1, true);
  });
});
