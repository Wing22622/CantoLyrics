import { describe, expect, it } from "vitest";
import { parseJianpu } from "./jianpu";
import { mapMelody } from "./tone-0243";

describe("parseJianpu", () => {
  it("parses scale degrees, octaves, durations, rests and bars", () => {
    const { notes, warnings } = parseJianpu("1=C\n1 2 3' 5, | 1- 1_ 0 5 - - |");
    expect(warnings).toEqual([]);
    expect(notes.map((note) => note.pitch)).toEqual([
      60, 62, 76, 55, 60, 60, null, 67,
    ]);
    expect(notes.map((note) => note.beats)).toEqual([1, 1, 1, 1, 2, 0.5, 1, 3]);
    expect(notes.map((note) => note.bar)).toEqual([1, 1, 1, 1, 2, 2, 2, 2]);
    expect(notes[2].label).toBe("3'");
    expect(notes[3].label).toBe("5,");
  });

  it("accepts a leading dot as a low octave and fullwidth digits", () => {
    const { notes, warnings } = parseJianpu("１． .5 1'/");
    expect(warnings).toEqual([]);
    expect(notes.map((note) => [note.pitch, note.beats])).toEqual([
      [60, 1.5],
      [55, 1],
      [72, 0.5],
    ]);
  });

  it("moves the tonic when 1=G", () => {
    const { notes, tonicName } = parseJianpu("1=G 1 7 4");
    expect(tonicName).toBe("G");
    // G4, F#5 (ti), C5 (fa)
    expect(notes.map((note) => note.pitch)).toEqual([67, 78, 72]);
  });

  it("warns on junk and still keeps the notes around it", () => {
    const { notes, warnings } = parseJianpu("1 foo 3");
    expect(notes.map((note) => note.degree)).toEqual([1, 3]);
    expect(warnings).toEqual(["唔識呢個符號：foo"]);
  });

  it("maps octave marks, a rest, and a tie onto the 世界真細小 codes", () => {
    const { notes, warnings } = parseJianpu("3 4 5 3' 1' - | 0 | 2' 1' 1' 7 7_");
    expect(warnings).toEqual([]);
    expect(notes.map((note) => note.pitch)).toEqual([
      64, 65, 67, 76, 72, null, 74, 72, 72, 71, 71,
    ]);
    expect(notes.map((note) => note.beats)).toEqual([1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 0.5]);
    expect(notes.map((note) => note.label)).toEqual([
      "3", "4", "5", "3'", "1'", "0", "2'", "1'", "1'", "7", "7",
    ]);
    expect(mapMelody(notes.map((note) => ({ pitch: note.pitch })))).toEqual([
      "0", "0", "0", "3", "4", null, "3", "4", "4", "2", "2",
    ]);
  });

  it("feeds the 世界真細小 opening into the 0243 mapper", () => {
    const { notes } = parseJianpu("3 4 5 3' 1' | 2' 1' 1' 7 7");
    const codes = mapMelody(notes.map((note) => ({ pitch: note.pitch })));
    expect(codes.slice(0, 5)).toEqual(["0", "0", "0", "3", "4"]);
    expect(codes.slice(5)).toEqual(["3", "4", "4", "2", "2"]);
    expect(codes).toHaveLength(10);
    expect(codes.every((code) => code != null)).toBe(true);
  });
});
