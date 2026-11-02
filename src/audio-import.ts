import { clipSamples, decodeToMono } from "./audio-file";
import { framesFromSamples, melodyFromFrames } from "./audio-melody";
import type { IncomingNote } from "./slots";

/** Same rate the recording upload analyses at. */
export const AUDIO_RATE = 16000;

/**
 * Recording upload and YouTube audio both land here:
 * decode → clip → YIN melody. 0243 stays in `slotsForTrackChoice` / `mapMelody`.
 */
export async function melodyFromAudioData(
  data: ArrayBuffer,
  sampleRate = AUDIO_RATE,
): Promise<{ notes: IncomingNote[]; clipped: boolean }> {
  const decoded = await decodeToMono(data, sampleRate);
  const samples = clipSamples(decoded, sampleRate);
  return {
    notes: melodyFromFrames(framesFromSamples(samples, sampleRate)),
    clipped: samples.length < decoded.length,
  };
}
