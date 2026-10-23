/** Why the lyric line just changed. An import keeps the pre-import backup; a real edit drops it. */
export type SlotChange = "user" | "import";

/**
 * What wrote the slots.
 * A character or code edit drops the import backup.
 * Choosing a track, or re-parsing the melody, does not.
 */
export type SlotWrite = "edit" | "reparse" | "track" | "import";

export function slotChangeFor(write: SlotWrite): SlotChange {
  return write === "edit" ? "user" : "import";
}

/**
 * The line to restore when the user picks another track of the same file.
 * Only a real edit drops it. Calling this twice with the same change is the
 * same result, so a doubled effect does not clear an import by mistake.
 */
export function importedLineAfterChange<T>(backup: T | null, change: SlotChange): T | null {
  return change === "user" ? null : backup;
}
