import {
  codesForTone,
  primaryCode,
  type Code0243,
} from "./tone-0243";

export interface ReadingInput {
  jyutping: string;
  tone: number;
}

export interface ReadingFit {
  jyutping: string;
  tone: number;
  codes: Code0243[];
  primary: Code0243 | null;
  fits: boolean;
}

export type FitStatus = "empty" | "unknown" | "fit" | "mismatch";

export interface FitResult {
  status: FitStatus;
  readings: ReadingFit[];
  /** Highlighted reading. Auto-picks the first one that fits when the user has not chosen. */
  active: string | null;
}

export function parseTone(jyutping: string): number | null {
  const match = /([1-9])$/.exec(jyutping.trim());
  if (!match) return null;
  const tone = Number(match[1]);
  return tone >= 1 && tone <= 9 ? tone : null;
}

export function checkFit(
  character: string,
  code: Code0243,
  readings: readonly ReadingInput[],
  chosen: string | null,
): FitResult {
  if (!character) return { status: "empty", readings: [], active: null };
  const detailed: ReadingFit[] = [];
  for (const reading of readings) {
    const tone = reading.tone || parseTone(reading.jyutping);
    if (tone == null) continue;
    const codes = [...codesForTone(tone)];
    detailed.push({
      jyutping: reading.jyutping,
      tone,
      codes,
      primary: primaryCode(tone),
      fits: codes.includes(code),
    });
  }
  if (detailed.length === 0) return { status: "unknown", readings: [], active: null };

  const chosenReading = chosen ? detailed.find((reading) => reading.jyutping === chosen) : undefined;
  if (chosenReading) {
    return {
      status: chosenReading.fits ? "fit" : "mismatch",
      readings: detailed,
      active: chosenReading.jyutping,
    };
  }
  const fitting = detailed.find((reading) => reading.fits);
  if (fitting) return { status: "fit", readings: detailed, active: fitting.jyutping };
  return { status: "mismatch", readings: detailed, active: detailed[0].jyutping };
}
