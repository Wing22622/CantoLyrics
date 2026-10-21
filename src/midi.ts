/**
 * Minimal Standard MIDI File reader (format 0 and 1).
 * One melody per track: same-onset chords keep the highest note; a later
 * overlapping note trims the previous one (legato).
 */

export interface MidiNote {
  pitch: number;
  /** Quarter lengths from the start of the track. */
  startBeat: number;
  beats: number;
}

export interface MidiTrack {
  name: string;
  notes: MidiNote[];
}

export interface MidiParse {
  ppq: number;
  tracks: MidiTrack[];
  warnings: string[];
}

export class MidiError extends Error {}

function readVarLen(data: Uint8Array, offset: number): { value: number; offset: number } {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    if (offset >= data.length) throw new MidiError("MIDI 檔唔完整");
    const byte = data[offset++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, offset };
  }
  throw new MidiError("MIDI 時間碼壞咗");
}

function readAscii(data: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i++) text += String.fromCharCode(data[offset + i]);
  return text;
}

interface RawNote {
  pitch: number;
  start: number;
  end: number;
}

function monophonic(notes: RawNote[]): RawNote[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || b.pitch - a.pitch);
  const out: RawNote[] = [];
  for (const note of sorted) {
    if (note.end <= note.start) continue;
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...note });
      continue;
    }
    if (note.start === last.start) continue;
    if (note.start < last.end) {
      last.end = note.start;
      if (last.end <= last.start) out.pop();
    }
    out.push({ ...note });
  }
  return out;
}

function parseTrack(data: Uint8Array, offset: number, length: number, ppq: number): MidiTrack {
  const end = offset + length;
  let time = 0;
  let running: number | null = null;
  let name = "";
  const open = new Map<number, number[]>();
  const raw: RawNote[] = [];

  const close = (pitch: number, when: number) => {
    const stack = open.get(pitch);
    if (!stack || stack.length === 0) return;
    const start = stack.pop() as number;
    if (when > start) raw.push({ pitch, start, end: when });
  };

  while (offset < end) {
    const delta = readVarLen(data, offset);
    offset = delta.offset;
    time += delta.value;
    if (offset >= end) break;
    let status = data[offset];
    if (status < 0x80) {
      if (running == null) throw new MidiError("MIDI 缺少狀態位元組");
      status = running;
    } else {
      offset++;
      if (status < 0xf0) running = status;
    }

    if (status === 0xff) {
      if (offset >= end) break;
      const type = data[offset++];
      const len = readVarLen(data, offset);
      offset = len.offset;
      if (type === 0x03) name = decodeName(data, offset, len.value);
      if (type === 0x2f) {
        offset += len.value;
        break;
      }
      offset += len.value;
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      const len = readVarLen(data, offset);
      offset = len.offset + len.value;
      running = null;
      continue;
    }
    const kind = status & 0xf0;
    const dataBytes = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
    if (offset + dataBytes > end) throw new MidiError("MIDI 音軌唔完整");
    const d1 = data[offset++];
    const d2 = dataBytes === 2 ? data[offset++] : 0;
    if (kind === 0x90 && d2 > 0) {
      const stack = open.get(d1) ?? [];
      stack.push(time);
      open.set(d1, stack);
    } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
      close(d1, time);
    }
  }

  for (const [pitch, stack] of open) {
    for (const start of stack) {
      if (time > start) raw.push({ pitch, start, end: time });
    }
  }

  const notes = monophonic(raw).map((note) => ({
    pitch: note.pitch,
    startBeat: note.start / ppq,
    beats: (note.end - note.start) / ppq,
  }));
  return { name, notes };
}

function decodeName(data: Uint8Array, offset: number, length: number): string {
  const bytes = data.slice(offset, offset + length);
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
  } catch {
    return readAscii(data, offset, length).trim();
  }
}

export function parseMidi(input: Uint8Array | ArrayBuffer): MidiParse {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (data.length < 14 || readAscii(data, 0, 4) !== "MThd") {
    throw new MidiError("唔係 MIDI 檔");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLength = view.getUint32(4);
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new MidiError("未支援 SMPTE 時間碼嘅 MIDI");
  if (format > 1) throw new MidiError("未支援呢種 MIDI 格式");
  const ppq = division || 480;
  const warnings: string[] = [];
  const tracks: MidiTrack[] = [];
  let offset = 8 + headerLength;
  for (let i = 0; i < trackCount; i++) {
    if (offset + 8 > data.length) {
      warnings.push("MIDI 音軌數量同檔案唔夾");
      break;
    }
    if (readAscii(data, offset, 4) !== "MTrk") {
      warnings.push(`第 ${i + 1} 軌唔係 MTrk`);
      break;
    }
    const length = view.getUint32(offset + 4);
    const track = parseTrack(data, offset + 8, length, ppq);
    offset += 8 + length;
    if (track.notes.length === 0) continue;
    tracks.push({
      name: track.name || `音軌 ${tracks.length + 1}`,
      notes: track.notes,
    });
  }
  if (tracks.length === 0) warnings.push("檔案入面冇旋律音");
  return { ppq, tracks, warnings };
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const name = NOTE_NAMES[((pitch % 12) + 12) % 12];
  return `${name}${octave}`;
}
