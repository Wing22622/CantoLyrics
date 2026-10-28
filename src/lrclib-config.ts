export const LRCLIB_CLIENT = "CantoLyrics/0.1 (https://wing22622.github.io/CantoLyrics/)";

const DIRECT_BASE = "https://lrclib.net";

export function lrclibSearchBase(configured: string | undefined): string {
  const trimmed = configured?.trim() ?? "";
  if (!trimmed) return DIRECT_BASE;
  return trimmed.replace(/\/+$/, "");
}
