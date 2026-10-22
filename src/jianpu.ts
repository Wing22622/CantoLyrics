/**
 * Text 簡譜.
 *
 *   1=C
 *   3 4 5 3' 1' | 2' 1' 1' 7 7 | 5 - - |
 *
 * - 1–7 are do–ti in the major scale. 0 is a rest.
 * - `'` raises an octave, `,` lowers one. A leading `.` also lowers (` .5 `).
 * - A bare note is a quarter (1 beat). Each `-` adds a beat, including a
 *   separate `-` token. `.` after the number is a dot (×1.5). `_` or `/`
 *   halves the duration, and can repeat.
 * - `|` is a barline. `1=C` / `1=F#` sets the tonic (default C4) for later notes.
 * - `4/4` is accepted and ignored.
 */

export interface JianpuNote {
  rest: boolean;
  /** MIDI pitch when it is not a rest. */
  pitch: number | null;
  /** 0 rest, 1–7 scale degree. */
  degree: number;
  octave: number;
  beats: number;
  /** 1-based bar number. */
  bar: number;
  /** Pitch label without the duration, e.g. `3'`. */
  label: string;
}

export interface JianpuParse {
  notes: JianpuNote[];
  warnings: string[];
  tonicName: string;
}

const SCALE = [0, 2, 4, 5, 7, 9, 11];
const PITCH_CLASS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function normalize(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\u2018\u2019\u2032\u00b4]/g, "'")
    .replace(/[|｜]/g, " | ");
}

function tonicMidi(letter: string, accidental: string): number {
  let semi = PITCH_CLASS[letter.toUpperCase()];
  if (accidental === "#") semi += 1;
  if (accidental === "b") semi -= 1;
  return 60 + semi;
}

function formatLabel(degree: number, octave: number): string {
  if (degree === 0) return "0";
  let label = String(degree);
  if (octave > 0) label += "'".repeat(octave);
  if (octave < 0) label += ",".repeat(-octave);
  return label;
}

interface ParsedToken {
  degree: number;
  octave: number;
  beats: number;
}

function parseNoteToken(token: string): ParsedToken | null {
  const match = /^(\.*)([0-7])([',]*)(.*)$/.exec(token);
  if (!match) return null;
  const tail = match[4];
  if (!/^[-._/]*$/.test(tail)) return null;
  let octave = -match[1].length;
  for (const mark of match[3]) octave += mark === "'" ? 1 : -1;
  const dashes = (tail.match(/-/g) ?? []).length;
  const halves = (tail.match(/[/_]/g) ?? []).length;
  let beats = 1 + dashes;
  if (tail.includes(".")) beats *= 1.5;
  beats /= 2 ** halves;
  return { degree: Number(match[2]), octave, beats };
}

export function parseJianpu(text: string): JianpuParse {
  const warnings: string[] = [];
  const notes: JianpuNote[] = [];
  let tonic = 60;
  let tonicName = "C";
  let bar = 1;

  for (const token of normalize(text).split(/\s+/).filter(Boolean)) {
    if (token === "|") {
      if (notes.length > 0) bar += 1;
      continue;
    }
    const key = /^1=([#b]?)([A-Ga-g])([#b]?)$/.exec(token);
    if (key) {
      const accidental = key[1] || key[3];
      if (key[1] && key[3]) {
        warnings.push(`調號唔清楚：${token}`);
        continue;
      }
      tonicName = `${key[2].toUpperCase()}${accidental}`;
      tonic = tonicMidi(key[2], accidental);
      continue;
    }
    if (/^\d+\/\d+$/.test(token)) continue;
    if (/^-+$/.test(token)) {
      const prev = notes[notes.length - 1];
      if (!prev) {
        warnings.push("開頭唔可以係延長線");
        continue;
      }
      prev.beats += token.length;
      continue;
    }
    const parsed = parseNoteToken(token);
    if (!parsed || parsed.beats <= 0) {
      warnings.push(`唔識呢個符號：${token}`);
      continue;
    }
    const rest = parsed.degree === 0;
    const pitch = rest ? null : tonic + SCALE[parsed.degree - 1] + parsed.octave * 12;
    notes.push({
      rest,
      pitch,
      degree: parsed.degree,
      octave: rest ? 0 : parsed.octave,
      beats: parsed.beats,
      bar,
      label: formatLabel(parsed.degree, rest ? 0 : parsed.octave),
    });
  }

  return { notes, warnings, tonicName };
}

export function formatBeats(beats: number): string {
  if (beats === 1) return "";
  if (beats === 0.5) return "½";
  if (beats === 0.25) return "¼";
  if (beats === 1.5) return "1½";
  if (beats === 2) return "2拍";
  if (beats === 3) return "3拍";
  if (beats === 4) return "4拍";
  const rounded = Math.round(beats * 1000) / 1000;
  return `${rounded}拍`;
}
