import { afterEach, describe, expect, it, vi } from "vitest";
import { melodyFromAudioData } from "./audio-import";
import { framesFromSamples, melodyFromFrames } from "./audio-melody";
import { slotsForTrackChoice } from "./slots";
import { mapMelody } from "./tone-0243";
import { fetchYoutubeAudio, youtubeAudioMessage, YoutubeAudioError } from "./youtube-audio";

const ID = "dQw4w9WgXcQ";
const WATCH = `https://youtu.be/${ID}`;
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;
const PROXY = "https://youtube-audio.example";

function sine(hz: number, seconds: number, sampleRate = 16000, amplitude = 0.4): Float32Array {
  const length = Math.floor(seconds * sampleRate);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return samples;
}

function concatSamples(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    samples.set(part, offset);
    offset += part.length;
  }
  return samples;
}

function installSineDecoder(samples: Float32Array, seen: ArrayBuffer[], sampleRate = 16000) {
  class FakeBuffer {
    readonly length = samples.length;
    readonly duration = samples.length / sampleRate;
    readonly sampleRate = sampleRate;
    readonly numberOfChannels = 1;
    getChannelData(): Float32Array {
      return samples;
    }
  }
  class FakeAudioContext {
    decodeAudioData(data: ArrayBuffer): Promise<FakeBuffer> {
      seen.push(data.slice(0));
      return Promise.resolve(new FakeBuffer());
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }
  class FakeOffline {
    readonly destination = {};
    createBufferSource(): { buffer: unknown; connect: () => void; start: () => void } {
      return { buffer: null, connect() {}, start() {} };
    }
    startRendering(): Promise<FakeBuffer> {
      return Promise.resolve(new FakeBuffer());
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("OfflineAudioContext", FakeOffline);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fetchYoutubeAudio", () => {
  it("does not call the network when the proxy URL is unset", async () => {
    vi.stubEnv("VITE_YOUTUBE_AUDIO_PROXY_URL", "");
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(fetchYoutubeAudio(WATCH, { fetchImpl })).rejects.toMatchObject({
      code: "missing-proxy",
      message: youtubeAudioMessage("missing-proxy"),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a non-YouTube URL before calling the proxy", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      fetchYoutubeAudio("https://evil.example/watch?v=dQw4w9WgXcQ", { fetchImpl, proxyBase: PROXY }),
    ).rejects.toBeInstanceOf(YoutubeAudioError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requests the canonical watch URL and reads an audio body", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(bytes, { status: 200, headers: { "content-type": "audio/mp4" } }),
    );
    await expect(
      fetchYoutubeAudio("https://music.youtube.com/shorts-not", { fetchImpl, proxyBase: PROXY }),
    ).rejects.toMatchObject({ code: "bad-url" });
    expect(fetchImpl).not.toHaveBeenCalled();

    vi.stubEnv("VITE_YOUTUBE_AUDIO_PROXY_URL", `${PROXY}/`);
    const audio = await fetchYoutubeAudio(`https://music.youtube.com/watch?v=${ID}&si=abc`, { fetchImpl });
    expect(new Uint8Array(audio)).toEqual(bytes);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${PROXY}/audio?url=${encodeURIComponent(CANONICAL)}`);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ headers: { Accept: "audio/*,application/json" } });
  });

  it("maps worker error codes without treating them as audio", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "too-long" }, { status: 413 }),
    );
    await expect(fetchYoutubeAudio(WATCH, { fetchImpl, proxyBase: PROXY })).rejects.toMatchObject({
      code: "too-long",
    });
  });
});

describe("YouTube audio and an uploaded recording", () => {
  it("runs the fetched bytes through the same decode, melody, and 0243 slot path", async () => {
    const samples = concatSamples([sine(261.63, 0.6), sine(329.63, 0.6)]);
    const seen: ArrayBuffer[] = [];
    installSineDecoder(samples, seen);
    const fileBytes = new Uint8Array([9, 8, 7, 6]).buffer;
    const youtubeBytes = new Uint8Array([4, 5, 6, 7]);
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(youtubeBytes, { status: 200, headers: { "content-type": "audio/mp4" } }),
    );

    const fromUpload = await melodyFromAudioData(fileBytes.slice(0));
    const fetched = await fetchYoutubeAudio(WATCH, { fetchImpl, proxyBase: PROXY });
    const fromYoutube = await melodyFromAudioData(fetched);

    expect(new Uint8Array(seen[0]).slice(0, 4)).toEqual(new Uint8Array(fileBytes));
    expect(new Uint8Array(seen[1])).toEqual(youtubeBytes);
    expect(fromYoutube.notes).toEqual(fromUpload.notes);
    expect(fromYoutube.notes.length).toBeGreaterThan(0);

    const direct = melodyFromFrames(framesFromSamples(samples, 16000));
    expect(fromYoutube.notes).toEqual(direct);
    const youtubeSlots = slotsForTrackChoice(fromYoutube.notes, [], null);
    const uploadSlots = slotsForTrackChoice(fromUpload.notes, [], null);
    const mapped = mapMelody(direct.map((note) => ({ pitch: note.rest ? null : note.pitch })));
    expect(youtubeSlots.map((slot) => slot.mapped)).toEqual(uploadSlots.map((slot) => slot.mapped));
    expect(youtubeSlots.map((slot) => slot.mapped)).toEqual(mapped.filter((code) => code != null));
    expect(youtubeSlots.every((slot) => slot.override == null)).toBe(true);
  });
});
