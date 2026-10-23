/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { LyricSlot } from "../slots";
import { SlotRow } from "./SlotRow";

function slot(id: string, label: string): LyricSlot {
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
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  function mount(slots: LyricSlot[]) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(renderRow(slots)));
  }

  it("keeps the focused character field when a note is inserted earlier", () => {
    const first = slot("a", "3");
    const second = slot("b", "4");
    mount([first, second]);
    const input = host?.querySelector('[data-slot-id="b"] input.char');
    expect(input).toBeInstanceOf(HTMLInputElement);
    act(() => (input as HTMLInputElement).focus());
    expect(document.activeElement).toBe(input);

    act(() => root?.render(renderRow([slot("new", "1"), first, second])));

    expect(document.activeElement).toBe(input);
    expect((input as HTMLElement).closest("[data-slot-id]")?.getAttribute("data-slot-id")).toBe("b");
    expect(host?.querySelector('[data-slot-id="new"] .pitch')?.textContent).toBe("1");
  });
});
