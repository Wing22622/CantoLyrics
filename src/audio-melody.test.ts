import { describe, expect, it } from "vitest";
import { framesFromSamples, hzToMidi, melodyFromFrames, yinPitch, type PitchFrame } from "./audio-melody";
import { slotsForTrackChoice } from "./slots";

function sine(hz: number, seconds: number, sampleRate = 16000, amplitude = 0.4): Float32Array {
  const length = Math.floor(seconds * sampleRate);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  }
  return samples;
}

function framesOf(midi: number | null, count: number, hop = 0.032, start = 0): PitchFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    time: start + index * hop,
    midi,
  }));
}

describe("yinPitch", () => {
  it("hears A4 in a 440 Hz sine", () => {
    const samples = sine(440, 0.2);
    const frame = samples.subarray(0, 1024);
    const hz = yinPitch(frame, 16000);
    expect(hz).not.toBeNull();
    expect(hzToMidi(hz!)).toBe(69);
  });

  it("stays quiet on silence", () => {
    const samples = new Float32Array(16000);
    const frames = framesFromSamples(samples, 16000);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame.midi == null)).toBe(true);
    expect(melodyFromFrames(frames)).toEqual([]);
  });
});

describe("melodyFromFrames", () => {
  it("turns a steady pitch into one note on the 120 BPM grid", () => {
    const notes = melodyFromFrames(framesOf(69, 32));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ rest: false, pitch: 69, label: "A4", bar: 1, beats: 2 });
  });

  it("drops a blip shorter than a sung note", () => {
    expect(melodyFromFrames(framesOf(60, 3))).toEqual([]);
  });

  it("splits two pitches and starts the next bar after four beats", () => {
    const notes = melodyFromFrames([...framesOf(60, 16), ...framesOf(64, 16, 0.032, 0.512)]);
    expect(notes.map((note) => note.pitch)).toEqual([60, 64]);
    expect(notes[1].bar).toBe(1);

    const later = melodyFromFrames(framesOf(67, 8, 0.032, 2));
    expect(later[0].bar).toBe(2);
  });

  it("feeds the same slot import as MIDI and keeps typed characters by index", () => {
    const samples = sine(440, 0.5);
    const notes = melodyFromFrames(framesFromSamples(samples, 16000));
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].pitch).toBe(69);
    const previous = [
      {
        id: "old",
        pitch: 60,
        beats: 1,
        label: "C4",
        bar: 1,
        mapped: "4" as const,
        override: "3" as const,
        source: "人",
        melisma: false,
        character: "歡",
        reading: "fun1",
      },
    ];
    const slots = slotsForTrackChoice(notes, previous, null);
    expect(slots[0].character).toBe("歡");
    expect(slots[0].override).toBeNull();
    expect(slots[0].pitch).toBe(69);
  });
});
