import { describe, expect, it } from "vitest";
import { EXAMPLE_JIANPU, EXAMPLE_TITLE } from "./example";
import { exampleMelodyMidi } from "./example-melody";
import { exportLyrics } from "./export-lyrics";
import { parseJianpu } from "./jianpu";
import { parseMidi } from "./midi";
import { slotsForTrackChoice, slotsFromNotes, type IncomingNote } from "./slots";

/** Cells on each exported line. A melisma is not its own cell. */
function slotsPerLine(text: string): number[] {
  const lines = text.replace(/\n$/, "").split("\n").slice(1);
  return lines.map((line) => (line.length === 0 ? 0 : line.split(" ").length));
}

function sung(pitch: number, bar: number): IncomingNote {
  return { rest: false, pitch, beats: 1, label: String(pitch), bar };
}

describe("exportLyrics", () => {
  it("writes one line per bar, a box for an empty slot, and a tilde for a melisma", () => {
    const text = exportLyrics("世界真細小", [
      { character: "人", melisma: false, bar: 1 },
      { character: "", melisma: false, bar: 1 },
      { character: "常", melisma: false, bar: 1 },
      { character: "", melisma: true, bar: 1 },
      { character: "但", melisma: false, bar: 2 },
      { character: "係", melisma: false, bar: 2 },
    ]);
    expect(text).toBe("世界真細小\n人 □ 常～\n但 係\n");
  });

  it("omits a blank title and still ends with a newline", () => {
    expect(exportLyrics("  ", [{ character: "笑", melisma: false, bar: 1 }])).toBe("笑\n");
    expect(exportLyrics("", [])).toBe("");
  });

  it("exports a fixed 5+5 bar fixture as two lines of five slots", () => {
    const bars = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2];
    const slots = bars.map((bar) => ({ character: "", melisma: false, bar }));
    expect(slotsPerLine(exportLyrics("t", slots))).toEqual([5, 5]);
  });

  it("exports a fixed 4+4+2 bar fixture as lines of four, four, and two", () => {
    const bars = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3];
    const slots = bars.map((bar) => ({ character: "", melisma: false, bar }));
    expect(slotsPerLine(exportLyrics("t", slots))).toEqual([4, 4, 2]);
  });

  it("gives the jianpu example and the 5/4 melody five slots on each line", () => {
    const fiveFive = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2];
    const jianpu = parseJianpu(EXAMPLE_JIANPU);
    const jSlots = slotsFromNotes(
      jianpu.notes.map((note) => ({
        rest: note.rest,
        pitch: note.pitch,
        beats: note.beats,
        label: note.label,
        bar: note.bar,
      })),
      [],
      false,
    );
    const melody = parseMidi(exampleMelodyMidi()).tracks.find((track) => track.name === "Melody");
    const mSlots = slotsFromNotes(
      (melody?.notes ?? []).map((note) => ({
        rest: false,
        pitch: note.pitch,
        beats: note.beats,
        label: "",
        bar: note.bar,
      })),
      [],
      false,
    );
    expect(jSlots.map((slot) => slot.bar)).toEqual(fiveFive);
    expect(mSlots.map((slot) => slot.bar)).toEqual(fiveFive);
    expect(slotsPerLine(exportLyrics(EXAMPLE_TITLE, jSlots))).toEqual([5, 5]);
    expect(slotsPerLine(exportLyrics(EXAMPLE_TITLE, mSlots))).toEqual([5, 5]);
  });

  it("keeps typed characters and takes bar from the new melody", () => {
    const previous = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2].map((bar, index) => sung(60 + index, bar));
    const before = slotsFromNotes(previous, [], false).map((slot, index) =>
      index === 3 ? { ...slot, character: "歡" } : slot,
    );
    const incoming = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3].map((bar, index) => sung(72 + index, bar));
    const next = slotsForTrackChoice(incoming, [], before);
    expect(next.map((slot) => slot.bar)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3]);
    expect(next[3].character).toBe("歡");
    expect(slotsPerLine(exportLyrics("t", next))).toEqual([4, 4, 2]);
  });
});
