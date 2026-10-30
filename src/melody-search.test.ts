import { describe, expect, it, vi } from "vitest";
import { encodeMonophonicMidi, twinkleMidi, twinkleNotes } from "./melody-catalog";
import { parseMidi } from "./midi";
import {
  chooseMelodyTrack,
  commonsSearchUrl,
  isFreeMelodyLicense,
  melodySearchMessage,
  resolveMelody,
  searchMelody,
  sungNotes,
  type MelodyHit,
} from "./melody-search";
import { slotsForTrackChoice } from "./slots";
import { mapMelody } from "./tone-0243";

function midiResponse(bytes: Uint8Array, status = 200): Response {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Response(copy, { status });
}

const FILE = "https://upload.wikimedia.org/wikipedia/commons/9/91/Twinkle_Twinkle_in_unison.mid";
const PAGE = "https://commons.wikimedia.org/wiki/File:Twinkle_Twinkle_in_unison.mid";

function commonsPage(options: {
  title: string;
  index: number;
  mime?: string;
  url?: string;
  license?: string;
  descriptionUrl?: string;
}) {
  return {
    pageid: options.index,
    ns: 6,
    index: options.index,
    title: options.title,
    imageinfo: [
      {
        mime: options.mime ?? "audio/midi",
        url: options.url ?? FILE,
        descriptionurl: options.descriptionUrl ?? PAGE,
        extmetadata: {
          LicenseShortName: { value: options.license ?? "Public domain" },
        },
      },
    ],
  };
}

function commonsBody(pages: Record<string, object> | null) {
  if (!pages) return { batchcomplete: "" };
  return { batchcomplete: "", query: { pages } };
}

describe("bundled 小星星", () => {
  it("resolves the public-domain tune without fetching", async () => {
    const fetchImpl = vi.fn();
    const found = await searchMelody({ trackName: "  小星星 ", artistName: "莫扎特" }, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.hits).toHaveLength(1);
    expect(found.hits[0].label).toBe("小星星");
    expect(found.hits[0].title).toBe("小星星");

    const resolved = await resolveMelody(found.hits[0], fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const track = resolved.melody.tracks[resolved.melody.trackIndex];
    expect(track.notes.map((note) => note.pitch)).toEqual(twinkleNotes().map((note) => note.pitch));
    expect(track.notes.map((note) => note.beats)).toEqual(twinkleNotes().map((note) => note.beats));
    expect(resolved.melody.source).toContain("公有領域");
    expect(resolved.melody.source).toContain("唔係歌詞");

    const notes = sungNotes(track);
    const slots = slotsForTrackChoice(notes, [], null);
    expect(slots.map((slot) => slot.mapped)).toEqual(mapMelody(notes.map((note) => ({ pitch: note.pitch }))));
    expect(slots.every((slot) => slot.override == null)).toBe(true);
    expect(parseMidi(twinkleMidi()).tracks[0].notes.map((note) => note.pitch)).toEqual(
      twinkleNotes().map((note) => note.pitch),
    );
  });

  it("matches the English and French names of the same tune", async () => {
    for (const title of ["Twinkle Twinkle Little Star", "Ah! vous dirai-je, maman", "一閃一閃亮晶晶"]) {
      const found = await searchMelody({ trackName: title, artistName: "" }, vi.fn());
      expect(found.ok).toBe(true);
      if (!found.ok) continue;
      expect(found.hits[0].ref).toEqual({ kind: "bundle", id: "twinkle" });
    }
  });
});

describe("Wikimedia Commons MIDI", () => {
  it("keeps a free MIDI and drops a non-commercial file and a PDF", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify(
          commonsBody({
            late: commonsPage({ title: "File:Ode_to_Joy.mid", index: 3, license: "CC BY-SA 4.0" }),
            pdf: commonsPage({
              title: "File:Score.pdf",
              index: 1,
              mime: "application/pdf",
              url: "https://upload.wikimedia.org/wikipedia/commons/score.pdf",
              license: "Public domain",
            }),
            nc: commonsPage({
              title: "File:Paid.mid",
              index: 2,
              url: "https://upload.wikimedia.org/wikipedia/commons/paid.mid",
              license: "CC BY-NC-SA 4.0",
            }),
            offsite: commonsPage({
              title: "File:Elsewhere.mid",
              index: 4,
              url: "https://evil.example/tune.mid",
              license: "Public domain",
            }),
          }),
        ),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const found = await searchMelody({ trackName: "Ode to Joy", artistName: "Beethoven" }, fetchImpl);
    expect(found).toEqual({
      ok: true,
      hits: [
        {
          id: FILE,
          label: "Ode to Joy",
          detail: "CC BY-SA 4.0",
          title: "Ode to Joy",
          sourceUrl: PAGE,
          ref: {
            kind: "commons",
            fileUrl: FILE,
            pageUrl: PAGE,
            license: "CC BY-SA 4.0",
            fileTitle: "Ode to Joy",
          },
        },
      ],
    });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe(commonsSearchUrl({ trackName: "Ode to Joy", artistName: "Beethoven" }));
    expect(urls[0]).toContain("commons.wikimedia.org");
    expect(urls[0]).not.toContain("lrclib");
  });

  it("parses the downloaded MIDI with the existing reader and maps it like a recording", async () => {
    const hit: MelodyHit = {
      id: FILE,
      label: "Twinkle Twinkle in unison",
      detail: "Public domain",
      title: "Twinkle",
      sourceUrl: PAGE,
      ref: { kind: "commons", fileUrl: FILE, pageUrl: PAGE, license: "Public domain", fileTitle: "Twinkle Twinkle in unison" },
    };
    const fetchImpl = vi.fn(async () => midiResponse(twinkleMidi()));
    const resolved = await resolveMelody(hit, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(FILE, expect.objectContaining({ headers: expect.any(Object) }));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const notes = sungNotes(resolved.melody.tracks[resolved.melody.trackIndex]);
    const slots = slotsForTrackChoice(notes, [], null);
    expect(slots.map((slot) => slot.mapped)).toEqual(mapMelody(notes.map((note) => ({ pitch: note.pitch }))));
    expect(resolved.melody.source).toContain("Wikimedia Commons");
    expect(resolved.melody.source).toContain("Public domain");
  });

  it("reports an empty file, an unreadable file, a miss, and a network error", async () => {
    const emptyHit: MelodyHit = {
      id: FILE,
      label: "空",
      detail: "Public domain",
      title: "空",
      sourceUrl: PAGE,
      ref: { kind: "commons", fileUrl: FILE, pageUrl: PAGE, license: "Public domain", fileTitle: "空" },
    };
    const empty = await resolveMelody(emptyHit, async () => midiResponse(encodeMonophonicMidi("Empty", [])));
    expect(empty).toEqual({ ok: false, failure: { status: "empty" } });
    expect(melodySearchMessage({ status: "empty" })).toContain("冇旋律音");

    const broken = await resolveMelody(emptyHit, async () => new Response("not midi", { status: 200 }));
    expect(broken).toEqual({ ok: false, failure: { status: "unreadable" } });

    const offline = await resolveMelody(emptyHit, async () => {
      throw new Error("offline");
    });
    expect(offline).toEqual({ ok: false, failure: { status: "network" } });
    expect(melodySearchMessage({ status: "network" })).toContain("連唔到 Wikimedia Commons");

    const missed = await searchMelody({ trackName: "冇呢段旋律", artistName: "" }, async () => {
      return new Response(JSON.stringify(commonsBody(null)), { status: 200 });
    });
    expect(missed).toEqual({ ok: false, failure: { status: "not-found" } });
    expect(melodySearchMessage({ status: "not-found" })).toContain("免費授權");
  });
});

describe("melody track choice and licenses", () => {
  it("prefers a melody-named track over a longer accompaniment", () => {
    expect(
      chooseMelodyTrack([
        { name: "Piano", notes: [1, 2, 3, 4] },
        { name: "Melody", notes: [1] },
      ]),
    ).toBe(1);
    expect(
      chooseMelodyTrack([
        { name: "Piano", notes: [1] },
        { name: "Strings", notes: [1, 2, 3] },
      ]),
    ).toBe(1);
  });

  it("accepts public domain and CC BY and rejects NC and ND", () => {
    expect(isFreeMelodyLicense("Public domain")).toBe(true);
    expect(isFreeMelodyLicense("CC0")).toBe(true);
    expect(isFreeMelodyLicense("CC BY 4.0")).toBe(true);
    expect(isFreeMelodyLicense("CC BY-SA 3.0")).toBe(true);
    expect(isFreeMelodyLicense("CC BY-NC-SA 4.0")).toBe(false);
    expect(isFreeMelodyLicense("CC BY-ND 4.0")).toBe(false);
    expect(isFreeMelodyLicense("")).toBe(false);
    expect(isFreeMelodyLicense("All rights reserved")).toBe(false);
  });
});
