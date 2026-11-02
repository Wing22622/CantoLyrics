import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchYoutubeAudio, YoutubeAudioError, youtubeAudioMessage, youtubeAudioProxyBase } from "../youtube-audio";

type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

export function YoutubeAudioForm({ onAudio }: { onAudio: (data: ArrayBuffer) => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const request = useRef(0);
  const proxyReady = youtubeAudioProxyBase(import.meta.env.VITE_YOUTUBE_AUDIO_PROXY_URL) != null;
  const loading = phase.kind === "loading";

  useEffect(() => {
    const current = request;
    return () => {
      current.current += 1;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || loading) return;
    const id = request.current + 1;
    request.current = id;
    setPhase({ kind: "loading" });
    try {
      const data = await fetchYoutubeAudio(trimmed);
      if (request.current !== id) return;
      await onAudio(data);
      if (request.current !== id) return;
      setPhase({ kind: "idle" });
    } catch (error) {
      if (request.current !== id) return;
      const message = error instanceof YoutubeAudioError ? error.message : youtubeAudioMessage("upstream");
      setPhase({ kind: "error", message });
    }
  }

  return (
    <form className="youtube-audio" aria-busy={loading} onSubmit={(event) => void onSubmit(event)}>
      <label>
        YouTube 連結
        <input
          value={url}
          aria-label="YouTube 連結"
          inputMode="url"
          spellCheck={false}
          placeholder="https://www.youtube.com/watch?v=… 或 youtu.be/…"
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <button type="submit" disabled={loading || !proxyReady || !url.trim()}>
        {loading ? "抽緊音訊…" : "抽出旋律"}
      </button>
      <p className="hint lookup-status">貼上 YouTube、Shorts 或 YouTube Music 連結。音訊只係自己練詞，跟錄音一樣抽出旋律。</p>
      {!proxyReady ? <p className="warnings lookup-status">{youtubeAudioMessage("missing-proxy")}</p> : null}
      {loading ? <p className="hint lookup-status">抽緊音訊…</p> : null}
      {phase.kind === "error" ? <p className="warnings lookup-status">{phase.message}</p> : null}
    </form>
  );
}
