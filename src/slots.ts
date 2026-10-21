import { mapMelody, type Code0243 } from "./tone-0243";

export interface LyricSlot {
  pitch: number;
  beats: number;
  label: string;
  bar: number;
  /** Code from the 0243 mapper for this melody. */
  mapped: Code0243;
  /** Hand edit. Null means the mapped code is what the line shows. */
  override: Code0243 | null;
  source: string;
  melisma: boolean;
  character: string;
  reading: string | null;
}

export interface IncomingNote {
  rest: boolean;
  pitch: number | null;
  beats: number;
  label: string;
  bar: number;
}

const CODE_SET = new Set<Code0243>(["0", "2", "4", "3"]);

export function isCode(value: unknown): value is Code0243 {
  return typeof value === "string" && CODE_SET.has(value as Code0243);
}

export function effectiveCode(slot: Pick<LyricSlot, "mapped" | "override">): Code0243 {
  return slot.override ?? slot.mapped;
}

/** Picking the mapped code again clears the hand edit. */
export function withCode(slot: LyricSlot, code: Code0243): LyricSlot {
  return { ...slot, override: code === slot.mapped ? null : code };
}

export function clearOverrides(slots: readonly LyricSlot[]): LyricSlot[] {
  return slots.map((slot) => ({ ...slot, override: null }));
}

/**
 * Apply one MIDI track.
 * A fresh import drops hand-edited codes.
 * Until the user edits, every track in that file keeps text from the line
 * that existed before the file, not from the short track shown by default.
 */
export function slotsForTrackChoice(
  notes: readonly IncomingNote[],
  current: readonly LyricSlot[],
  lineBeforeImport: readonly LyricSlot[] | null,
): LyricSlot[] {
  return slotsFromNotes(notes, lineBeforeImport ?? current, false);
}

/**
 * Build sung slots from a melody.
 * Typed text stays on the same sung-note index.
 * Hand-edited codes stay too, unless `keepOverrides` is false (a fresh import).
 */
export function slotsFromNotes(
  notes: readonly IncomingNote[],
  prev: readonly LyricSlot[],
  keepOverrides: boolean,
): LyricSlot[] {
  const codes = mapMelody(notes.map((note) => ({ pitch: note.rest ? null : note.pitch })));
  const next: LyricSlot[] = [];
  notes.forEach((note, index) => {
    const mapped = codes[index];
    if (note.rest || mapped == null || note.pitch == null) return;
    const old = prev[next.length];
    next.push({
      pitch: note.pitch,
      beats: note.beats,
      label: note.label,
      bar: note.bar,
      mapped,
      override: keepOverrides ? (old?.override ?? null) : null,
      source: old?.source ?? "",
      melisma: old?.melisma ?? false,
      character: old?.character ?? "",
      reading: old?.reading ?? null,
    });
  });
  return next;
}

/** Accepts a current slot or an older save that only stored `code`. */
export function normalizeSlot(raw: unknown): LyricSlot {
  const slot = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mapped = isCode(slot.mapped) ? slot.mapped : isCode(slot.code) ? slot.code : "4";
  const override = isCode(slot.override) ? slot.override : null;
  return {
    pitch: typeof slot.pitch === "number" ? slot.pitch : 60,
    beats: typeof slot.beats === "number" ? slot.beats : 1,
    label: typeof slot.label === "string" ? slot.label : "",
    bar: typeof slot.bar === "number" ? slot.bar : 1,
    mapped,
    override,
    source: typeof slot.source === "string" ? slot.source : "",
    melisma: slot.melisma === true,
    character: typeof slot.character === "string" ? slot.character : "",
    reading: typeof slot.reading === "string" ? slot.reading : null,
  };
}
