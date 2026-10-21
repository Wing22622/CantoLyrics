import { describe, expect, it } from "vitest";
import { MidiError, midiNoteName, parseMidi } from "./midi";
import { mapMelody } from "./tone-0243";

function varLen(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.push((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes.reverse();
}

function track(events: { delta: number; data: number[] }[]): Uint8Array {
  const body: number[] = [];
  for (const event of events) body.push(...varLen(event.delta), ...event.data);
  body.push(...varLen(0), 0xff, 0x2f, 0x00);
  const out = [0x4d, 0x54, 0x72, 0x6b, (body.length >> 24) & 0xff, (body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff, ...body];
  return Uint8Array.from(out);
}

function file(tracks: Uint8Array[], ppq = 480): Uint8Array {
  const header = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, tracks.length > 1 ? 0x01 : 0x00,
    0x00, tracks.length,
    (ppq >> 8) & 0xff, ppq & 0xff,
  ];
  const parts = [Uint8Array.from(header), ...tracks];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function note(delta: number, pitch: number, duration: number, channel = 0): { delta: number; data: number[] }[] {
  return [
    { delta, data: [0x90 | channel, pitch, 80] },
    { delta: duration, data: [0x80 | channel, pitch, 0] },
  ];
}

describe("parseMidi", () => {
  it("reads pitches and quarter-note durations", () => {
    const data = file([
      track([
        ...note(0, 60, 480),
        ...note(0, 62, 240),
        ...note(0, 64, 960),
      ]),
    ]);
    const parsed = parseMidi(data);
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0].notes.map((item) => [item.pitch, item.beats, item.startBeat])).toEqual([
      [60, 1, 0],
      [62, 0.5, 1],
      [64, 2, 1.5],
    ]);
    expect(midiNoteName(60)).toBe("C4");
  });

  it("keeps the top note of a chord and trims legato overlap", () => {
    const chord = track([
      { delta: 0, data: [0x90, 60, 80] },
      { delta: 0, data: [0x90, 67, 80] },
      { delta: 480, data: [0x80, 60, 0] },
      { delta: 0, data: [0x80, 67, 0] },
    ]);
    expect(parseMidi(file([chord])).tracks[0].notes).toEqual([
      { pitch: 67, startBeat: 0, beats: 1 },
    ]);

    const legato = track([
      { delta: 0, data: [0x90, 60, 90] },
      { delta: 480, data: [0x90, 64, 90] },
      { delta: 480, data: [0x80, 60, 0] },
      { delta: 0, data: [0x80, 64, 0] },
    ]);
    expect(parseMidi(file([legato])).tracks[0].notes.map((item) => [item.pitch, item.beats])).toEqual([
      [60, 1],
      [64, 1],
    ]);
  });

  it("lists every track that has notes, including a named melody track", () => {
    const piano = track([
      { delta: 0, data: [0xff, 0x03, 0x05, ...Array.from("Piano").map((ch) => ch.charCodeAt(0))] },
      ...note(0, 48, 480),
    ]);
    const melody = track([
      { delta: 0, data: [0xff, 0x03, 0x06, ...Array.from("Melody").map((ch) => ch.charCodeAt(0))] },
      ...note(0, 76, 240),
      ...note(0, 77, 240),
    ]);
    const empty = track([
      { delta: 0, data: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] },
    ]);
    const parsed = parseMidi(file([empty, piano, melody]));
    expect(parsed.tracks.map((item) => item.name)).toEqual(["Piano", "Melody"]);
    expect(parsed.tracks[1].notes.map((item) => item.pitch)).toEqual([76, 77]);
  });

  it("accepts running status", () => {
    // After the first note-on, velocity 0 is a note-off and the next pair is another note.
    const body = track([
      { delta: 0, data: [0x90, 60, 80] },
      { delta: 480, data: [60, 0] },
      { delta: 0, data: [62, 70] },
      { delta: 240, data: [62, 0] },
    ]);
    const parsed = parseMidi(file([body]));
    expect(parsed.tracks[0].notes.map((item) => item.pitch)).toEqual([60, 62]);
    expect(parsed.tracks[0].notes[1].beats).toBe(0.5);
  });

  it("maps the 世界真細小 pitches, including the octave leap, to 0033434422", () => {
    const pitches = [64, 65, 67, 76, 72, 74, 72, 72, 71, 71];
    const events = pitches.flatMap((pitch) => note(0, pitch, 480));
    const parsed = parseMidi(file([track(events)]));
    expect(parsed.warnings).toEqual([]);
    expect(parsed.tracks[0].notes.map((item) => item.pitch)).toEqual(pitches);
    expect(mapMelody(parsed.tracks[0].notes.map((item) => ({ pitch: item.pitch })))).toEqual([
      "0", "0", "0", "3", "4", "3", "4", "4", "2", "2",
    ]);
  });

  it("throws a readable error on a buffer that is not MIDI", () => {
    expect(() => parseMidi(Uint8Array.from([1, 2, 3, 4]))).toThrow(MidiError);
    expect(() => parseMidi(new ArrayBuffer(0))).toThrow("唔係 MIDI 檔");
    const smpte = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, 0x00, 0x00, 0x80, 0x00,
    ]);
    expect(() => parseMidi(smpte)).toThrow("未支援 SMPTE 時間碼嘅 MIDI");
  });

  it("warns when the header names tracks the file does not contain", () => {
    const data = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
    ]);
    const parsed = parseMidi(data);
    expect(parsed.tracks).toEqual([]);
    expect(parsed.warnings).toContain("MIDI 音軌數量同檔案唔夾");
    expect(parsed.warnings).toContain("檔案入面冇旋律音");
  });

  it("throws when a track ends in the middle of a note event", () => {
    const body = [0x00, 0x90, 0x3c];
    const data = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
      0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, body.length,
      ...body,
    ]);
    expect(() => parseMidi(data)).toThrow("MIDI 音軌唔完整");
  });
});
