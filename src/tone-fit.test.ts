import { describe, expect, it } from "vitest";
import { checkFit } from "./tone-fit";
import { codesForTone } from "./tone-0243";

/**
 * Readings for the 世界真細小 line 人人常歡笑 / 夜裏群星照,
 * as 黃志華 codes them 00334 and 24034.
 * 人 jan4, 常 soeng4, 歡 fun1, 笑 siu3, 夜 je6, 裏 leoi5, 群 kwan4, 星 sing1, 照 ziu3.
 */

describe("checkFit", () => {
  it("accepts 人人常歡笑 on 00334 and rejects a level tone on the wrong code", () => {
    const line = [
      { jyutping: "jan4", tone: 4, code: "0" as const },
      { jyutping: "jan4", tone: 4, code: "0" as const },
      { jyutping: "soeng4", tone: 4, code: "0" as const },
      { jyutping: "fun1", tone: 1, code: "3" as const },
      { jyutping: "siu3", tone: 3, code: "4" as const },
    ];
    for (const item of line) {
      const fit = checkFit("字", item.code, [{ jyutping: item.jyutping, tone: item.tone }], null);
      expect(fit.status).toBe("fit");
    }
    const wrong = checkFit("常", "3", [{ jyutping: "soeng4", tone: 4 }], null);
    expect(wrong.status).toBe("mismatch");
    const fixed = checkFit("歡", "3", [{ jyutping: "fun1", tone: 1 }], null);
    expect(fixed.status).toBe("fit");
  });

  it("lets 裏 leoi5 fill both 4 and 2, and shows that", () => {
    expect(codesForTone(5)).toEqual(["4", "2"]);
    const onFour = checkFit("裏", "4", [{ jyutping: "leoi5", tone: 5 }], null);
    const onTwo = checkFit("裏", "2", [{ jyutping: "leoi5", tone: 5 }], null);
    const onZero = checkFit("裏", "0", [{ jyutping: "leoi5", tone: 5 }], null);
    expect(onFour.status).toBe("fit");
    expect(onTwo.status).toBe("fit");
    expect(onFour.readings[0].codes).toEqual(["4", "2"]);
    expect(onZero.status).toBe("mismatch");
  });

  it("treats 人 as polyphonic and only flags the reading the user picked", () => {
    const readings = [
      { jyutping: "jan4", tone: 4 },
      { jyutping: "jan2", tone: 2 },
    ];
    const open = checkFit("人", "3", readings, null);
    expect(open.status).toBe("fit");
    expect(open.active).toBe("jan2");
    expect(open.readings.map((reading) => reading.fits)).toEqual([false, true]);

    const picked = checkFit("人", "3", readings, "jan4");
    expect(picked.status).toBe("mismatch");
    expect(picked.active).toBe("jan4");
  });

  it("maps entering-tone numbers the same way as their pitch level", () => {
    expect(codesForTone(1)).toEqual(["3"]);
    expect(codesForTone(7)).toEqual(["3"]);
    expect(codesForTone(8)).toEqual(["4"]);
    expect(codesForTone(9)).toEqual(["2"]);
    expect(codesForTone(2)).toEqual(["3", "4"]);
  });

  it("distinguishes an empty slot from an unknown character", () => {
    expect(checkFit("", "3", [], null).status).toBe("empty");
    expect(checkFit("𠜎", "3", [], null).status).toBe("unknown");
  });
});
