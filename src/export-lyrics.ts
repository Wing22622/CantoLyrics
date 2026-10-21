export interface ExportSlot {
  character: string;
  melisma: boolean;
  bar: number;
}

export function exportLyrics(title: string, slots: readonly ExportSlot[]): string {
  if (slots.length === 0) return title ? `${title}\n` : "";
  const lines: string[][] = [];
  let bar = slots[0].bar;
  let line: string[] = [];
  const push = (token: string) => {
    line.push(token);
  };
  for (const slot of slots) {
    if (slot.bar !== bar) {
      lines.push(line);
      line = [];
      bar = slot.bar;
    }
    if (slot.melisma) {
      if (line.length === 0) push("～");
      else line[line.length - 1] += "～";
    } else {
      push(slot.character || "□");
    }
  }
  if (line.length) lines.push(line);
  const body = lines.map((tokens) => tokens.join(" ")).join("\n");
  return title.trim() ? `${title.trim()}\n${body}\n` : `${body}\n`;
}
