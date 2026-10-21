import { describe, expect, it } from "vitest";
import { EXAMPLE_JIANPU, EXAMPLE_TITLE } from "./example";
import { exampleMelodyMidi } from "./example-melody";
import { exportLyrics } from "./export-lyrics";
import { parseJianpu } from "./jianpu";
import { parseMidi } from "./midi";
import { slotsFromNotes } from "./slots";

const FILLED = ["", "", "", "歡", "", "", "", "", "但", "係"];
const FILLED_EXPORT = "世界真細小\n□ □ □ 歡 □\n□ □ □ 但 係\n";

function fill<T extends { character: string }>(slots: T[]): T[] {
  return slots.map((slot, index) => ({ ...slot, character: FILLED[index] ?? "" }));
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

  it("exports the jianpu example and the 5/4 MIDI melody as the same file", () => {
    const jianpu = parseJianpu(EXAMPLE_JIANPU);
    const jSlots = fill(
      slotsFromNotes(
        jianpu.notes.map((note) => ({
          rest: note.rest,
          pitch: note.pitch,
          beats: note.beats,
          label: note.label,
          bar: note.bar,
        })),
        [],
        false,
      ),
    );
    const midi = parseMidi(exampleMelodyMidi());
    const melody = midi.tracks.find((track) => track.name === "Melody");
    expect(midi.tracks.map((track) => track.name)).toEqual(["Piano", "Melody"]);
    expect(melody?.notes.map((note) => note.bar)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
    const mSlots = fill(
      slotsFromNotes(
        (melody?.notes ?? []).map((note) => ({
          rest: false,
          pitch: note.pitch,
          beats: note.beats,
          label: "",
          bar: note.bar,
        })),
        [],
        false,
      ),
    );
    expect(exportLyrics(EXAMPLE_TITLE, jSlots)).toBe(FILLED_EXPORT);
    expect(exportLyrics(EXAMPLE_TITLE, mSlots)).toBe(FILLED_EXPORT);
  });
});
