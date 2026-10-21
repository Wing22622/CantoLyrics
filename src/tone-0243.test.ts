import { describe, expect, it } from "vitest";
import {
  CODES,
  compareCost,
  intervalGap,
  mapMelody,
  mapPhrase,
  scoreAssignment,
  type Code0243,
} from "./tone-0243";

/**
 * 《世界真細小》（It's a Small World），黃霑填詞。
 * 黃志華，〈「節點斷開效應」續篇——以《世界真細小》為例〉，《虛詞》，2022-04-14。
 * https://p-articles.com/critics/2896.html
 *
 * 樂句 mi fa so mi' do'。1=C 時係 E4 F4 G4 E5 C5。
 * 黃誌「人人常歡笑」為 0 0 0 3 4。
 * mi→fa 配「人人」（兩個 0），音程差距 +1。
 * 「希望」（3→2）配 re'→ti（下行小三度，−3），自然音距係下行純四度（−5），
 * 相差 2 個半音。黃喺圖上標做負 2（壓縮）；呢度 signed = 樂音 − 自然 = +2。
 *
 * 自然音距亦對過：
 * - 黃志華，〈西洋和弦與類音階之配合之再探〉，ChinaUnix。
 *   http://www.chinaunix.net/uid-20375883-id-5827796.html
 *   do mi sol 填 0 2 4、la do mi 填 2 4 3 係真值；0↔3 配純五度係真值。
 * - 黃志華，〈「○四」、「二三」能否交換使用？〉，Patreon。
 *   https://www.patreon.com/u66411509/posts/si-er-san-neng-108634507
 *   0↔2 同 4↔3 係 2 或 4 個半音；0↔4 同 2↔3 係 5 個半音。
 */

function brute(pitches: number[]): Code0243[] {
  let best = scoreAssignment(pitches, Array.from({ length: pitches.length }, () => "0" as Code0243));
  const walk = (index: number, acc: Code0243[]) => {
    if (index === pitches.length) {
      const cost = scoreAssignment(pitches, acc);
      if (compareCost(cost, best) < 0) best = cost;
      return;
    }
    for (const code of CODES) {
      acc.push(code);
      walk(index + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return best.path.split("") as Code0243[];
}

describe("0243 natural intervals", () => {
  it("matches the chord-article true values", () => {
    expect(intervalGap("0", "2", 4).signed).toBe(0);
    expect(intervalGap("2", "4", 3).signed).toBe(0);
    expect(intervalGap("4", "3", 4).signed).toBe(0);
    // 不要眼淚掉：四→二 on do'→ti, a descending semitone, is a true value.
    expect(intervalGap("4", "2", -1)).toEqual({ natural: -1, signed: 0 });
    // A major 2nd is not natural for 二四, or do re mi could be filled 024 with gap 0.
    expect(intervalGap("2", "4", 2)).toEqual({ natural: 3, signed: -1 });
    expect(intervalGap("0", "3", 7).signed).toBe(0);
    // do–sol is a perfect fifth, not the natural fourth of 0↔4
    expect(intervalGap("0", "4", 7)).toEqual({ natural: 5, signed: 2 });
    expect(intervalGap("2", "3", 7)).toEqual({ natural: 5, signed: 2 });
  });

  it("cites 人人 and 希望 from 世界真細小", () => {
    expect(intervalGap("0", "0", 1)).toEqual({ natural: 0, signed: 1 });
    expect(intervalGap("3", "2", -3)).toEqual({ natural: -5, signed: 2 });
  });
});

describe("mapPhrase", () => {
  it("maps do mi sol to 024 and la do mi to 243, both true values", () => {
    expect(mapPhrase([60, 64, 67])).toEqual(["0", "2", "4"]);
    expect(scoreAssignment([60, 64, 67], ["0", "2", "4"]).gap).toBe(0);
    expect(mapPhrase([69, 72, 76])).toEqual(["2", "4", "3"]);
    expect(scoreAssignment([69, 72, 76], ["2", "4", "3"]).gap).toBe(0);
  });

  it("maps the 世界真細小 laughter phrase to 人人常歡笑", () => {
    const laughter = [64, 65, 67, 76, 72];
    const published: Code0243[] = ["0", "0", "0", "3", "4"];
    expect(mapPhrase(laughter)).toEqual(published);
    expect(mapPhrase(laughter)).toEqual(brute(laughter));
    const night: Code0243[] = ["2", "4", "0", "3", "4"];
    expect(scoreAssignment(laughter, night).gap).toBeGreaterThan(
      scoreAssignment(laughter, published).gap,
    );
  });

  it("has no true-value filling for do re mi", () => {
    const codes = mapPhrase([60, 62, 64]);
    expect(scoreAssignment([60, 62, 64], codes).gap).toBeGreaterThan(0);
    expect(codes).toEqual(brute([60, 62, 64]));
  });

  it("uses code 4 for a single note or a repeated pitch", () => {
    expect(mapPhrase([60])).toEqual(["4"]);
    expect(mapPhrase([60, 60, 60])).toEqual(["4", "4", "4"]);
  });

  it("maps an ascending semitone to 24, the true value of 二四", () => {
    expect(mapPhrase([60, 61])).toEqual(["2", "4"]);
    expect(scoreAssignment([60, 61], ["2", "4"]).gap).toBe(0);
  });

  it("maps 不要眼淚掉 on re' do' do' ti ti to 34422, a true value", () => {
    // 《世界真細小》second phrase. 1=C: D5 C5 C5 B4 B4.
    // 黃志華 2022：不要眼淚掉、反照世事妙 are 三四四二二 and 真值填法.
    const tears = [74, 72, 72, 71, 71];
    const published: Code0243[] = ["3", "4", "4", "2", "2"];
    expect(mapPhrase(tears)).toEqual(published);
    expect(mapPhrase(tears)).toEqual(brute(tears));
    expect(scoreAssignment(tears, published).gap).toBe(0);
    const sameHigh: Code0243[] = ["3", "3", "3", "3", "3"];
    expect(scoreAssignment(tears, sameHigh).gap).toBeGreaterThan(0);
  });

  it("puts 0 then 3 on an octave leap", () => {
    expect(mapPhrase([60, 72])).toEqual(["0", "3"]);
    expect(mapPhrase([72, 60])).toEqual(["3", "0"]);
  });

  it("splits phrases at rests", () => {
    expect(
      mapMelody([
        { pitch: 60 },
        { pitch: 64 },
        { pitch: 67 },
        { pitch: null },
        { pitch: 69 },
        { pitch: 72 },
        { pitch: 76 },
      ]),
    ).toEqual(["0", "2", "4", null, "2", "4", "3"]);
  });
});
