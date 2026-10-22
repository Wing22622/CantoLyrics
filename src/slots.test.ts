import { describe, expect, it } from "vitest";
import { checkFit } from "./tone-fit";
import {
  clearOverrides,
  effectiveCode,
  normalizeSlot,
  slotsForTrackChoice,
  slotsFromNotes,
  withCode,
  type IncomingNote,
  type LyricSlot,
} from "./slots";

function note(pitch: number | null, label: string, bar = 1): IncomingNote {
  return { rest: pitch == null, pitch, beats: 1, label, bar };
}

const laughter: IncomingNote[] = [
  note(64, "3"),
  note(65, "4"),
  note(67, "5"),
  note(76, "3'"),
  note(72, "1'"),
];

describe("slotsFromNotes", () => {
  it("uses the mapped 0243 codes when nothing has been edited", () => {
    const slots = slotsFromNotes(laughter, [], true);
    expect(slots.map(effectiveCode)).toEqual(["0", "0", "0", "3", "4"]);
    expect(slots.every((slot) => slot.override == null)).toBe(true);
  });

  it("keeps a hand edit across a re-parse and drops it on a fresh import", () => {
    const first = slotsFromNotes(laughter, [], true);
    const edited = first.map((slot, index) => (index === 3 ? withCode(slot, "0") : slot));
    edited[3] = { ...edited[3], character: "常", reading: "soeng4" };
    const again = slotsFromNotes(
      [...laughter, note(null, "0", 2), note(74, "2'", 2)],
      edited,
      true,
    );
    expect(again[3].mapped).toBe("3");
    expect(again[3].override).toBe("0");
    expect(effectiveCode(again[3])).toBe("0");
    expect(again[3].character).toBe("常");
    expect(again.map(effectiveCode)).toEqual(["0", "0", "0", "0", "4", "4"]);

    const imported = slotsFromNotes(laughter, edited, false);
    expect(imported[3].override).toBe(null);
    expect(effectiveCode(imported[3])).toBe("3");
    expect(imported[3].character).toBe("常");
  });

  it("clears the mark when the user picks the mapped code again", () => {
    const [slot] = slotsFromNotes([note(60, "1")], [], true);
    const edited = withCode(slot, "0");
    expect(edited.override).toBe("0");
    expect(withCode(edited, slot.mapped).override).toBe(null);
    expect(clearOverrides([edited])[0].override).toBe(null);
  });

  it("checks fit and would suggest against the code on screen", () => {
    const slots = slotsFromNotes(laughter, [], true);
    const edited = slots.map((slot, index) => (index === 3 ? withCode(slot, "0") : slot));
    const code = effectiveCode(edited[3]);
    expect(checkFit("常", code, [{ jyutping: "soeng4", tone: 4 }], null).status).toBe("fit");
    expect(checkFit("歡", code, [{ jyutping: "fun1", tone: 1 }], null).status).toBe("mismatch");
    const seen = edited.map(effectiveCode);
    expect(seen).toEqual(["0", "0", "0", "0", "4"]);
  });
});

describe("slotsForTrackChoice", () => {
  it("keeps lyric text from before the file when the melody track replaces a one-note default track", () => {
    const before = slotsFromNotes(laughter, [], false).map((slot, index) =>
      index === 3 ? { ...withCode(slot, "0"), character: "歡", reading: "fun1" } : slot,
    );
    const piano = slotsForTrackChoice([note(48, "C3")], before, null);
    expect(piano).toHaveLength(1);
    expect(piano[0].character).toBe("");

    const melody = slotsForTrackChoice(laughter, piano, before);
    expect(melody.map((slot) => slot.character)).toEqual(["", "", "", "歡", ""]);
    expect(melody[3].override).toBe(null);
    expect(effectiveCode(melody[3])).toBe("3");
    expect(melody[3].reading).toBe("fun1");
  });

  it("uses the current line after the user has edited since the import", () => {
    const current = slotsFromNotes([note(64, "E4"), note(65, "F4")], [], false).map((slot, index) =>
      index === 0 ? { ...slot, character: "但" } : slot,
    );
    const next = slotsForTrackChoice([note(72, "C5")], current, null);
    expect(next[0].character).toBe("但");
    expect(next[0].override).toBe(null);
  });
});

describe("normalizeSlot", () => {
  it("reads an older save that only had code", () => {
    const slot = normalizeSlot({
      pitch: 76,
      beats: 1,
      label: "3'",
      bar: 1,
      code: "3",
      source: "歡",
      melisma: false,
      character: "歡",
      reading: "fun1",
    });
    expect(slot.mapped).toBe("3");
    expect(slot.override).toBe(null);
    expect(effectiveCode(slot)).toBe("3");
  });

  it("keeps a stored override", () => {
    const slot = normalizeSlot({ mapped: "3", override: "0", character: "常" } satisfies Partial<LyricSlot>);
    expect(effectiveCode(slot)).toBe("0");
  });
});
