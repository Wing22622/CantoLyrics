/**
 * A tone system maps melody pitches to per-note codes and says which codes
 * a Jyutping tone may fill.
 *
 * M1 implements only 0243 (`tone-0243.ts`). A 六聲 or 九聲 system can implement
 * this same interface later without changing the editor.
 */
export interface MelodyEvent {
  /** MIDI pitch. Null is a rest, which has no tone code. */
  pitch: number | null;
}

export interface ToneSystem<Code extends string> {
  id: string;
  /** Low to high. For 0243 this is 0, 2, 4, 3 — not numeric order. */
  codesLowToHigh: readonly Code[];
  mapMelody(events: readonly MelodyEvent[]): (Code | null)[];
  /** The level this tone is usually sung on, if it has one. */
  primaryCode(tone: number): Code | null;
  /** Every code this tone may fill, primary first. */
  codesForTone(tone: number): readonly Code[];
}
