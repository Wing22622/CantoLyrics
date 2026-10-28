import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  lyricSearchMessage,
  searchLyrics,
  type FoundLyrics,
  type LyricHit,
  type LyricQuery,
  type LyricSearchOutcome,
} from "../lyrics-fetch";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "pick"; hits: LyricHit[] };

export function LyricLookup({
  onFound,
  search = searchLyrics,
}: {
  onFound: (found: FoundLyrics) => void;
  search?: (query: LyricQuery) => Promise<LyricSearchOutcome>;
}) {
  const [trackName, setTrackName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const request = useRef(0);
  const loading = phase.kind === "loading";

  useEffect(() => {
    const current = request;
    return () => {
      current.current += 1;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const track = trackName.trim();
    if (!track || loading) return;
    const id = request.current + 1;
    request.current = id;
    setPhase({ kind: "loading" });
    const outcome = await search({ trackName: track, artistName });
    if (request.current !== id) return;
    if (!outcome.ok) {
      setPhase({ kind: "error", message: lyricSearchMessage(outcome.failure) });
      return;
    }
    if (outcome.hits.length === 1) {
      setPhase({ kind: "idle" });
      onFound(foundFrom(outcome.hits[0]));
      return;
    }
    setPhase({ kind: "pick", hits: outcome.hits });
  }

  function choose(hit: LyricHit) {
    setPhase({ kind: "idle" });
    onFound(foundFrom(hit));
  }

  return (
    <form className="lyric-lookup" aria-busy={loading} onSubmit={(event) => void onSubmit(event)}>
      <label>
        歌名
        <input
          value={trackName}
          aria-label="搵歌詞歌名"
          onChange={(event) => setTrackName(event.target.value)}
        />
      </label>
      <label>
        歌手
        <input
          value={artistName}
          aria-label="歌手"
          placeholder="可留空"
          onChange={(event) => setArtistName(event.target.value)}
        />
      </label>
      <button type="submit" disabled={loading || !trackName.trim()}>
        {loading ? "搵緊…" : "上網搵歌詞"}
      </button>
      {loading ? <p className="hint lookup-status">搵緊歌詞…</p> : null}
      {phase.kind === "error" ? <p className="warnings lookup-status">{phase.message}</p> : null}
      {phase.kind === "pick" ? (
        <>
          <p className="hint lookup-status">搵到幾首，揀一首。</p>
          <ul className="hit-list">
            {phase.hits.map((hit, index) => {
              const meta = [hit.artistName, hit.albumName].filter(Boolean).join(" · ");
              return (
                <li key={`${hit.id}-${index}`}>
                  <button type="button" onClick={() => choose(hit)}>
                    {hit.trackName}
                    {meta ? <span className="meta">{meta}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <p className="credit lookup-status">
        歌詞來自 <a href="https://lrclib.net/" target="_blank" rel="noreferrer">LRCLIB</a>。
      </p>
    </form>
  );
}

function foundFrom(hit: LyricHit): FoundLyrics {
  return { title: hit.trackName, lyrics: hit.lyrics };
}
