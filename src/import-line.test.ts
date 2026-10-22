import { describe, expect, it } from "vitest";
import { importedLineAfterChange } from "./import-line";

describe("importedLineAfterChange", () => {
  const backup = [{ id: "before" }];

  it("keeps the backup across an import, including a second pass", () => {
    expect(importedLineAfterChange(backup, "import")).toBe(backup);
    expect(importedLineAfterChange(backup, "import")).toBe(backup);
  });

  it("clears the backup only when the user edits", () => {
    expect(importedLineAfterChange(backup, "user")).toBeNull();
    expect(importedLineAfterChange(null, "user")).toBeNull();
    expect(importedLineAfterChange(null, "import")).toBeNull();
  });
});
