/**
 * 黃志華 0243（類音階）melody → tone-code scaffold.
 *
 * Pitch order, low to high: 0 < 2 < 4 < 3.
 * Each adjacent pair of notes is scored by how far its semitone interval is
 * from the pair's 自然音距. The phrase is the assignment with the smallest
 * total gap (最佳逼近 / 真值 when the gap is 0). Ties break toward the
 * embedded contour, then toward code 4, then toward the lower code.
 *
 * Natural intervals (semitones, positive = second code is higher):
 *
 *   pair     natural          source
 *   0↔2      2 or 4           黃志華 Patreon「○四、二三能否交換」：○二／四三係 2 或 4 個半音
 *   4↔3      2 or 4           same
 *   2↔4      1 or 3           和弦文：do mi sol 填 024 係真值，mi–sol 係小三度（+3）。
 *                             〈節點斷開〉續篇：「不要眼淚掉」（三四四二二）配 re' do' do' ti ti
 *                             係真值，當中四→二坐喺 do'→ti 嘅下行小二度（−1）上面。
 *                             大二度（2）唔係自然音距：若果係，do re mi 就可以 024 零差距，
 *                             但黃話 do re mi 無真值填法。
 *   0↔4      5                Patreon：○四／二三自然音距係 5 個半音
 *   2↔3      5                same；〈節點斷開〉「希望」三二配下行純四度
 *   0↔3      7                和弦文：零三配純五度係真值
 *   same     0                〈節點斷開〉「人人」同碼，音程差距 = 樂音音程
 *
 * 0 and 3 are 外張, 2 and 4 are 內斂. This module does not invent 節點斷開
 * or offer a second filling. See README.
 */
import type { MelodyEvent, ToneSystem } from "./tone-system";

export const CODES = ["0", "2", "4", "3"] as const;
export type Code0243 = (typeof CODES)[number];

const HEIGHT: Record<Code0243, number> = { "0": 0, "2": 3, "4": 6, "3": 9 };
const BIAS: Record<Code0243, number> = { "4": 0, "2": 1, "0": 2, "3": 2 };
const RANK: Record<Code0243, number> = { "0": 0, "2": 1, "4": 2, "3": 3 };

const NATURAL: Record<Code0243, Record<Code0243, readonly number[]>> = {
  "0": { "0": [0], "2": [2, 4], "4": [5], "3": [7] },
  "2": { "0": [-2, -4], "2": [0], "4": [3, 1], "3": [5] },
  "4": { "0": [-5], "2": [-3, -1], "4": [0], "3": [2, 4] },
  "3": { "0": [-7], "2": [-5], "4": [-2, -4], "3": [0] },
};

export interface IntervalGap {
  /** Natural interval closest to the melody, in semitones. */
  natural: number;
  /** melodic − natural. Positive: the second note is sharper than the natural relative pitch. */
  signed: number;
}

export function intervalGap(from: Code0243, to: Code0243, melodic: number): IntervalGap {
  const options = NATURAL[from][to];
  let natural = options[0];
  let signed = melodic - natural;
  let best = Math.abs(signed);
  for (let i = 1; i < options.length; i++) {
    const nextSigned = melodic - options[i];
    const abs = Math.abs(nextSigned);
    if (abs < best) {
      best = abs;
      natural = options[i];
      signed = nextSigned;
    }
  }
  return { natural, signed };
}

export interface Cost {
  gap: number;
  register: number;
  bias: number;
  path: string;
}

/** Negative when `a` is the better scaffold. */
export function compareCost(a: Cost, b: Cost): number {
  if (a.gap !== b.gap) return a.gap - b.gap;
  if (a.register !== b.register) return a.register - b.register;
  if (a.bias !== b.bias) return a.bias - b.bias;
  const length = Math.min(a.path.length, b.path.length);
  for (let i = 0; i < length; i++) {
    const diff = RANK[a.path[i] as Code0243] - RANK[b.path[i] as Code0243];
    if (diff !== 0) return diff;
  }
  return a.path.length - b.path.length;
}

export function scoreAssignment(pitches: readonly number[], codes: readonly Code0243[]): Cost {
  if (pitches.length !== codes.length) {
    throw new Error("pitch and code sequences differ in length");
  }
  let gap = 0;
  let register = 0;
  let bias = 0;
  for (let i = 0; i < codes.length; i++) {
    bias += BIAS[codes[i]];
    if (i === 0) continue;
    const melodic = pitches[i] - pitches[i - 1];
    gap += Math.abs(intervalGap(codes[i - 1], codes[i], melodic).signed);
    register += Math.abs(melodic - (HEIGHT[codes[i]] - HEIGHT[codes[i - 1]]));
  }
  return { gap, register, bias, path: codes.join("") };
}

/** One rest-free phrase. A single note is code 4 (單音無協事；平手預設取四). */
export function mapPhrase(pitches: readonly number[]): Code0243[] {
  if (pitches.length === 0) return [];
  const dp: Cost[][] = [];
  for (let i = 0; i < pitches.length; i++) {
    const row: Cost[] = [];
    for (let ci = 0; ci < CODES.length; ci++) {
      const code = CODES[ci];
      if (i === 0) {
        row.push({ gap: 0, register: 0, bias: BIAS[code], path: code });
        continue;
      }
      let best: Cost | null = null;
      for (let pi = 0; pi < CODES.length; pi++) {
        const prev = CODES[pi];
        const prevCost = dp[i - 1][pi];
        const melodic = pitches[i] - pitches[i - 1];
        const candidate: Cost = {
          gap: prevCost.gap + Math.abs(intervalGap(prev, code, melodic).signed),
          register: prevCost.register + Math.abs(melodic - (HEIGHT[code] - HEIGHT[prev])),
          bias: prevCost.bias + BIAS[code],
          path: prevCost.path + code,
        };
        if (!best || compareCost(candidate, best) < 0) best = candidate;
      }
      row.push(best!);
    }
    dp.push(row);
  }
  let best = dp[dp.length - 1][0];
  for (let ci = 1; ci < CODES.length; ci++) {
    const candidate = dp[dp.length - 1][ci];
    if (compareCost(candidate, best) < 0) best = candidate;
  }
  return best.path.split("") as Code0243[];
}

export function mapMelody(events: readonly MelodyEvent[]): (Code0243 | null)[] {
  const out: (Code0243 | null)[] = [];
  let index = 0;
  while (index < events.length) {
    if (events[index].pitch == null) {
      out.push(null);
      index++;
      continue;
    }
    const start = index;
    while (index < events.length && events[index].pitch != null) index++;
    const phrase: number[] = [];
    for (let i = start; i < index; i++) phrase.push(events[i].pitch as number);
    out.push(...mapPhrase(phrase));
  }
  return out;
}

/**
 * Jyutping tone → 0243.
 *
 * Level tones sit on one level. Rising tones (陰上 35, 陽上 23) cross two,
 * so they are accepted on both; the primary is the level 黃志華 treats as
 * the usual one (陰上 with 三, 陽上 with 四). Entering tones 7/8/9, when a
 * dictionary still uses them, follow the same pitch as 陰平 / 陰去 / 陽去.
 */
export function primaryCode(tone: number): Code0243 | null {
  switch (tone) {
    case 1:
    case 7:
    case 2:
      return "3";
    case 3:
    case 8:
    case 5:
      return "4";
    case 4:
      return "0";
    case 6:
    case 9:
      return "2";
    default:
      return null;
  }
}

export function codesForTone(tone: number): readonly Code0243[] {
  switch (tone) {
    case 1:
    case 7:
      return ["3"];
    case 2:
      return ["3", "4"];
    case 3:
    case 8:
      return ["4"];
    case 4:
      return ["0"];
    case 5:
      return ["4", "2"];
    case 6:
    case 9:
      return ["2"];
    default:
      return [];
  }
}

export function toneFitsCode(tone: number, code: Code0243): boolean {
  return codesForTone(tone).includes(code);
}

export const system0243: ToneSystem<Code0243> = {
  id: "0243",
  codesLowToHigh: ["0", "2", "4", "3"],
  mapMelody,
  primaryCode,
  codesForTone,
};
