import { describe, expect, it } from "vitest";
import { exportLyrics } from "./export-lyrics";

describe("exportLyrics", () => {
  it("writes one line per bar, a box for an empty slot, and a tilde for a melisma", () => {
    const text = exportLyrics("世界真細小", [
      { character: "人", melisma: false, bar: 1 },
      { character: "", melisma: false, bar: 1 },
      { character: "常", melisma: false, bar: 1 },
      { character: "", melisma: true, bar: 1 },
      { character: "但", melisma: false, bar: 2 },
      { character: "係", melisma: false, bar: 2 },
    ]);
    expect(text).toBe("世界真細小\n人 □ 常～\n但 係\n");
  });

  it("omits a blank title and still ends with a newline", () => {
    expect(exportLyrics("  ", [{ character: "笑", melisma: false, bar: 1 }])).toBe("笑\n");
    expect(exportLyrics("", [])).toBe("");
  });
});
