/** Syllable under the pointer, or null when the pointer is on a gap or control. */
export function indexFromPoint(hit: Element | null): number | null {
  const slot = hit?.closest?.("[data-slot]");
  if (!(slot instanceof Element)) return null;
  const raw = slot.getAttribute("data-slot");
  if (raw == null || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/**
 * Dragging extends the selection only when the pointer moves onto another
 * syllable. A pointerenter at the same spot — the line reflowing under a
 * still pointer — is not a drag.
 */
export function nextDragIndex(current: number | null, hit: number | null): number | null {
  if (hit == null || hit === current) return null;
  return hit;
}
