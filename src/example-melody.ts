/**
 * Two-track MIDI of the《世界真細小》opening.
 * A conductor track with no notes carries 5/4, matching the jianpu bars
 * `3 4 5 3' 1' | 2' 1' 1' 7 7 |`.
 */

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
  return Uint8Array.from([
    0x4d, 0x54, 0x72, 0x6b,
    (body.length >> 24) & 0xff,
    (body.length >> 16) & 0xff,
    (body.length >> 8) & 0xff,
    body.length & 0xff,
    ...body,
  ]);
}

function note(delta: number, pitch: number, duration: number): { delta: number; data: number[] }[] {
  return [
    { delta, data: [0x90, pitch, 80] },
    { delta: duration, data: [0x80, pitch, 0] },
  ];
}

function name(text: string): number[] {
  return [0xff, 0x03, text.length, ...Array.from(text).map((char) => char.charCodeAt(0))];
}

export function exampleMelodyMidi(): Uint8Array {
  const conductor = track([{ delta: 0, data: [0xff, 0x58, 0x04, 5, 2, 24, 8] }]);
  const piano = track([{ delta: 0, data: name("Piano") }, ...note(0, 48, 480)]);
  const pitches = [64, 65, 67, 76, 72, 74, 72, 72, 71, 71];
  const melody = track([
    { delta: 0, data: name("Melody") },
    ...pitches.flatMap((pitch) => note(0, pitch, 480)),
  ]);
  const tracks = [conductor, piano, melody];
  const header = Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x01, 0x00, tracks.length, 0x01, 0xe0,
  ]);
  const total = tracks.reduce((sum, part) => sum + part.length, header.length);
  const out = new Uint8Array(total);
  let offset = 0;
  out.set(header, offset);
  offset += header.length;
  for (const part of tracks) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
