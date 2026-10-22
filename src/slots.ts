import { mapMelody, type Code0243 } from "./tone-0243";

export interface LyricSlot {
  /** Stays with this syllable when the melody is re-parsed. */
  id: string;
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

function newSlotId(): string {
  return crypto.randomUUID();
}

function noteKey(note: { pitch: number; label: string; beats: number }): string {
  return `${note.pitch}|${note.label}|${note.beats}`;
}

/** Where `prev` sits as one contiguous block inside `next`. */
function contiguousStart(prevKeys: readonly string[], nextKeys: readonly string[]): number | null {
  if (prevKeys.length === 0) return 0;
  const starts: number[] = [];
  for (let start = 0; start + prevKeys.length <= nextKeys.length; start++) {
    const same = prevKeys.every((key, offset) => nextKeys[start + offset] === key);
    if (same) starts.push(start);
  }
  return starts.length === 1 ? starts[0] : null;
}

/**
 * Previous sung slots lined up with the new sung notes.
 * A block of identical notes stays together, so a note added at the front
 * does not take the first character. Otherwise match the longest common
 * subsequence, still in order. A fresh import passes `keepOverrides` false
 * and keeps using the sung-note index instead.
 */
function alignKeptSlots(
  prev: readonly LyricSlot[],
  sung: readonly { pitch: number; label: string; beats: number }[],
): (LyricSlot | undefined)[] {
  const prevKeys = prev.map((slot) => noteKey(slot));
  const nextKeys = sung.map((note) => noteKey(note));
  const block = contiguousStart(prevKeys, nextKeys);
  if (block != null) {
    return nextKeys.map((_, index) => {
      const prevIndex = index - block;
      return prevIndex >= 0 && prevIndex < prev.length ? prev[prevIndex] : undefined;
    });
  }
  const n = prevKeys.length;
  const m = nextKeys.length;
  const score: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      score[i][j] = prevKeys[i] === nextKeys[j]
        ? score[i + 1][j + 1] + 1
        : Math.max(score[i + 1][j], score[i][j + 1]);
    }
  }
  const matched: (LyricSlot | undefined)[] = Array(m).fill(undefined);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (prevKeys[i] === nextKeys[j]) {
      matched[j] = prev[i];
      i += 1;
      j += 1;
    } else if (score[i + 1][j] >= score[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matched;
}

/**
 * Build sung slots from a melody.
 * While hand edits are kept, typed text and overrides follow the same note
 * (pitch, label, duration) and keep that slot's id. `bar` comes from the new note.
 * A fresh import (`keepOverrides` false) still follows the sung-note index and drops overrides.
 */
export function slotsFromNotes(
  notes: readonly IncomingNote[],
  prev: readonly LyricSlot[],
  keepOverrides: boolean,
): LyricSlot[] {
  const codes = mapMelody(notes.map((note) => ({ pitch: note.rest ? null : note.pitch })));
  const sung: { pitch: number; beats: number; label: string; bar: number; mapped: Code0243 }[] = [];
  notes.forEach((note, index) => {
    const mapped = codes[index];
    if (note.rest || mapped == null || note.pitch == null) return;
    sung.push({ pitch: note.pitch, beats: note.beats, label: note.label, bar: note.bar, mapped });
  });
  const aligned = keepOverrides ? alignKeptSlots(prev, sung) : sung.map((_, index) => prev[index]);
  return sung.map((note, index) => {
    const old = aligned[index];
    return {
      id: old?.id ?? newSlotId(),
      pitch: note.pitch,
      beats: note.beats,
      label: note.label,
      bar: note.bar,
      mapped: note.mapped,
      override: keepOverrides ? (old?.override ?? null) : null,
      source: old?.source ?? "",
      melisma: old?.melisma ?? false,
      character: old?.character ?? "",
      reading: old?.reading ?? null,
    };
  });
}

/** Accepts a current slot or an older save that only stored `code`. */
export function normalizeSlot(raw: unknown): LyricSlot {
  const slot = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mapped = isCode(slot.mapped) ? slot.mapped : isCode(slot.code) ? slot.code : "4";
  const override = isCode(slot.override) ? slot.override : null;
  const id = typeof slot.id === "string" && slot.id.trim() ? slot.id : newSlotId();
  return {
    id,
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
