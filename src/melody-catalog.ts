/**
 * Bundled public-domain melody for title search.
 *
 * 《小星星》 is the French folk tune Ah! vous dirai-je, maman (1761),
 * also known as Twinkle, Twinkle, Little Star. The melody is public domain.
 * These bytes are written here from that tune. Nothing is downloaded from a
 * sheet-music or MIDI site.
 *
 * Rhythm is the usual 4/4 reading: each phrase is six quarter notes and a
 * half note, in C, starting on C4.
 */

const PHRASES: readonly (readonly number[])[] = [
  [60, 60, 67, 67, 69, 69, 67],
  [65, 65, 64, 64, 62, 62, 60],
  [67, 67, 65, 65, 64, 64, 62],
  [67, 67, 65, 65, 64, 64, 62],
  [60, 60, 67, 67, 69, 69, 67],
  [65, 65, 64, 64, 62, 62, 60],
];

export const TWINKLE_SOURCE_URL = "https://en.wikipedia.org/wiki/Twinkle,_Twinkle,_Little_Star";

export interface CatalogNote {
  pitch: number;
  beats: number;
}

export function twinkleNotes(): CatalogNote[] {
  return PHRASES.flatMap((phrase) =>
    phrase.map((pitch, index) => ({ pitch, beats: index === phrase.length - 1 ? 2 : 1 })),
  );
}

const PPQ = 480;

function varLen(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.push((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes.reverse();
}

function ascii(text: string): number[] {
  return Array.from(text).map((char) => char.charCodeAt(0) & 0x7f);
}

function track(events: { delta: number; data: number[] }[]): Uint8Array {
  const body: number[] = [];
  for (const event of events) body.push(...varLen(event.delta), ...event.data);
  body.push(...varLen(0), 0xff, 0x2f, 0x00);
  return Uint8Array.from([
    0x4d, 0x54, 0x72, 0x6b,
    (body.length >> 24) & 0xff,
    (body.length >> 16) & 0xff,
    (body.length >> 8) & 0xff,
    body.length & 0xff,
    ...body,
  ]);
}

/** Format 0, one monophonic track, 4/4, 480 ticks per quarter. */
export function encodeMonophonicMidi(name: string, notes: readonly CatalogNote[]): Uint8Array {
  const events: { delta: number; data: number[] }[] = [
    { delta: 0, data: [0xff, 0x58, 0x04, 4, 2, 24, 8] },
    { delta: 0, data: [0xff, 0x03, Math.min(name.length, 127), ...ascii(name).slice(0, 127)] },
  ];
  for (const note of notes) {
    const ticks = Math.max(1, Math.round(note.beats * PPQ));
    const pitch = Math.max(0, Math.min(127, note.pitch));
    events.push({ delta: 0, data: [0x90, pitch, 80] });
    events.push({ delta: ticks, data: [0x80, pitch, 0] });
  }
  const body = track(events);
  const header = Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, 0x00, 0x01, (PPQ >> 8) & 0xff, PPQ & 0xff,
  ]);
  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}

export function twinkleMidi(): Uint8Array {
  return encodeMonophonicMidi("Twinkle", twinkleNotes());
}
