import { midiNoteName } from "./midi";
import type { IncomingNote } from "./slots";

/** One analysis frame. `midi` is null when the frame is silent or unpitched. */
export interface PitchFrame {
  time: number;
  midi: number | null;
}

const WINDOW = 1024;
const HOP = 512;
const MIN_HZ = 60;
const MAX_HZ = 1200;
const RMS_GATE = 0.02;
const YIN_THRESHOLD = 0.15;
/** Drop blips shorter than this. A sung note is usually longer. */
const MIN_NOTE_SEC = 0.12;
/** Quarter note at 120 BPM. Rhythm is snapped to the nearest eighth. */
const QUARTER_SEC = 0.5;
const BAR_BEATS = 4;

export function hzToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

function acRms(frame: Float32Array): number {
  let mean = 0;
  for (let i = 0; i < frame.length; i++) mean += frame[i];
  mean /= frame.length;
  let energy = 0;
  for (let i = 0; i < frame.length; i++) {
    const delta = frame[i] - mean;
    energy += delta * delta;
  }
  return Math.sqrt(energy / frame.length);
}

function refineTau(cmnd: Float32Array, tau: number): number {
  const left = tau > 0 ? cmnd[tau - 1] : cmnd[tau];
  const mid = cmnd[tau];
  const right = tau + 1 < cmnd.length ? cmnd[tau + 1] : cmnd[tau];
  const denom = 2 * mid - right - left;
  if (denom === 0) return tau;
  return tau + (right - left) / (2 * denom);
}

/** Fundamental frequency of one window, or null when YIN finds nothing stable. */
export function yinPitch(frame: Float32Array, sampleRate: number): number | null {
  const n = frame.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  const tauMax = Math.min(n - 2, Math.floor(sampleRate / MIN_HZ));
  if (tauMax <= tauMin) return null;

  const diff = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    const limit = n - tau;
    for (let j = 0; j < limit; j++) {
      const delta = frame[j] - frame[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = running === 0 ? 1 : (diff[tau] * tau) / running;
  }

  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] >= YIN_THRESHOLD) continue;
    while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
    const hz = sampleRate / refineTau(cmnd, tau);
    if (hz < MIN_HZ || hz > MAX_HZ) return null;
    return hz;
  }
  return null;
}

/** Pitch of each hop. Silent and unpitched hops stay null. */
export function framesFromSamples(samples: Float32Array, sampleRate: number): PitchFrame[] {
  const frames: PitchFrame[] = [];
  if (sampleRate <= 0 || samples.length < WINDOW) return frames;
  for (let start = 0; start + WINDOW <= samples.length; start += HOP) {
    const slice = samples.subarray(start, start + WINDOW);
    const time = start / sampleRate;
    if (acRms(slice) < RMS_GATE) {
      frames.push({ time, midi: null });
      continue;
    }
    const hz = yinPitch(slice, sampleRate);
    frames.push({ time, midi: hz == null ? null : hzToMidi(hz) });
  }
  return frames;
}

function smoothMidi(frames: readonly PitchFrame[]): PitchFrame[] {
  const radius = 2;
  return frames.map((frame, index) => {
    if (frame.midi == null) return frame;
    const window: number[] = [];
    for (let i = index - radius; i <= index + radius; i++) {
      const midi = frames[i]?.midi;
      if (midi != null) window.push(midi);
    }
    window.sort((a, b) => a - b);
    return { time: frame.time, midi: window[Math.floor(window.length / 2)] ?? frame.midi };
  });
}

interface RawNote {
  pitch: number;
  start: number;
  end: number;
}

function groupFrames(frames: readonly PitchFrame[]): RawNote[] {
  if (frames.length === 0) return [];
  const hop = frames.length > 1 ? Math.max(0.001, frames[1].time - frames[0].time) : HOP / 16000;
  const groups: RawNote[] = [];
  let current: RawNote | null = null;
  for (const frame of frames) {
    const end = frame.time + hop;
    if (frame.midi == null) {
      if (current) groups.push(current);
      current = null;
      continue;
    }
    if (current && current.pitch === frame.midi) {
      current.end = end;
      continue;
    }
    if (current) groups.push(current);
    current = { pitch: frame.midi, start: frame.time, end };
  }
  if (current) groups.push(current);
  return groups.filter((group) => group.end - group.start >= MIN_NOTE_SEC - 1e-6);
}

/**
 * Monophonic melody in the same shape as a MIDI track.
 * Timing is a rough 120 BPM grid (nearest eighth, at least one eighth).
 * A bar is 4 beats. An empty list means the audio had no usable melody.
 */
export function melodyFromFrames(frames: readonly PitchFrame[]): IncomingNote[] {
  const groups = groupFrames(smoothMidi(frames));
  const notes = groups.map((group) => {
    const startBeat = Math.round((group.start / QUARTER_SEC) * 2) / 2;
    const beats = Math.max(0.5, Math.round(((group.end - group.start) / QUARTER_SEC) * 2) / 2);
    return { pitch: group.pitch, startBeat, beats };
  });
  notes.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
  const trimmed: { pitch: number; startBeat: number; beats: number }[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const next = notes[i + 1];
    let beats = note.beats;
    if (next && note.startBeat + beats > next.startBeat) beats = next.startBeat - note.startBeat;
    if (beats >= 0.5) trimmed.push({ pitch: note.pitch, startBeat: note.startBeat, beats });
  }
  return trimmed.map((note) => ({
    rest: false,
    pitch: note.pitch,
    beats: note.beats,
    label: midiNoteName(note.pitch),
    bar: Math.floor(note.startBeat / BAR_BEATS) + 1,
  }));
}
