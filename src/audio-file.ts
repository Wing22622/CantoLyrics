/** Resample a decoded audio buffer to mono at `targetRate`. */
export async function decodeToMono(data: ArrayBuffer, targetRate = 16000): Promise<Float32Array> {
  if (typeof AudioContext === "undefined" || typeof OfflineAudioContext === "undefined") {
    throw new Error("AudioContext missing");
  }
  const audio = new AudioContext();
  try {
    const decoded = await audio.decodeAudioData(data.slice(0));
    if (decoded.length === 0 || decoded.duration === 0) return new Float32Array();
    const length = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, length, targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return new Float32Array(rendered.getChannelData(0));
  } finally {
    await audio.close();
  }
}

/** Keep analysis short enough to stay on the main thread. */
export const MAX_AUDIO_SECONDS = 90;

export function clipSamples(samples: Float32Array, sampleRate: number, maxSeconds = MAX_AUDIO_SECONDS): Float32Array {
  const cap = Math.floor(sampleRate * maxSeconds);
  if (samples.length <= cap) return samples;
  return samples.subarray(0, cap);
}
