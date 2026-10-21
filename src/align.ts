export interface AlignSlot {
  source: string;
  melisma: boolean;
}

/** One syllable per slot, in order. Clears melisma. Extra syllables are dropped. */
export function alignSources(slots: readonly AlignSlot[], syllables: readonly string[]): AlignSlot[] {
  return slots.map((_, index) => ({
    melisma: false,
    source: syllables[index] ?? "",
  }));
}

/**
 * Mark slot `index` as a continuation of the previous syllable, or undo that.
 * Sources of the remaining syllable-slots shift so the continued note does
 * not keep its own syllable. The last syllable can fall off the end.
 */
export function toggleMelisma(slots: readonly AlignSlot[], index: number): AlignSlot[] {
  if (index <= 0 || index >= slots.length) return slots.map((slot) => ({ ...slot }));
  const sources = slots.filter((slot) => !slot.melisma).map((slot) => slot.source);
  const next = slots.map((slot) => ({ ...slot }));
  next[index].melisma = !next[index].melisma;
  let cursor = 0;
  for (const slot of next) {
    if (slot.melisma) slot.source = "";
    else slot.source = sources[cursor++] ?? "";
  }
  return next;
}
