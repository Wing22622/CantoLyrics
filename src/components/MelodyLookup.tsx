import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  melodySearchMessage,
  resolveMelody,
  searchMelody,
  type MelodyHit,
  type MelodyQuery,
  type MelodyResolveOutcome,
  type MelodySearchOutcome,
  type ResolvedMelody,
} from "../melody-search";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "pick"; hits: MelodyHit[] };

export function MelodyLookup({
  onFound,
  search = searchMelody,
  resolve = resolveMelody,
}: {
  onFound: (found: ResolvedMelody) => void;
  search?: (query: MelodyQuery) => Promise<MelodySearchOutcome>;
  resolve?: (hit: MelodyHit) => Promise<MelodyResolveOutcome>;
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

  async function finish(id: number, hit: MelodyHit) {
    setPhase({ kind: "loading" });
    const resolved = await resolve(hit);
    if (request.current !== id) return;
    if (!resolved.ok) {
      setPhase({ kind: "error", message: melodySearchMessage(resolved.failure) });
      return;
    }
    setPhase({ kind: "idle" });
    onFound(resolved.melody);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const track = trackName.trim();
    if (!track || loading) return;
    const id = request.current + 1;
    request.current = id;
    setPhase({ kind: "loading" });
    const outcome = await search({ trackName: track, artistName });
    if (request.current !== id) return;
    if (!outcome.ok || outcome.hits.length === 0) {
      const failure = outcome.ok ? { status: "not-found" as const } : outcome.failure;
      setPhase({ kind: "error", message: melodySearchMessage(failure) });
      return;
    }
    if (outcome.hits.length === 1) {
      await finish(id, outcome.hits[0]);
      return;
    }
    setPhase({ kind: "pick", hits: outcome.hits });
  }

  return (
    <form className="melody-lookup" aria-busy={loading} onSubmit={(event) => void onSubmit(event)}>
      <label>
        歌名
        <input
          value={trackName}
          aria-label="旋律歌名"
          onChange={(event) => setTrackName(event.target.value)}
        />
      </label>
      <label>
        歌手
        <input
          value={artistName}
          aria-label="旋律歌手"
          placeholder="可留空"
          onChange={(event) => setArtistName(event.target.value)}
        />
      </label>
      <button type="submit" disabled={loading || !trackName.trim()}>
        {loading ? "搵緊…" : "用歌名搵旋律"}
      </button>
      {loading ? <p className="hint lookup-status">搵緊旋律…</p> : null}
      {phase.kind === "error" ? <p className="warnings lookup-status">{phase.message}</p> : null}
      {phase.kind === "pick" ? (
        <>
          <p className="hint lookup-status">搵到幾段旋律，揀一段。</p>
          <ul className="hit-list">
            {phase.hits.map((hit) => (
              <li key={hit.id}>
                <button type="button" onClick={() => void finish(request.current, hit)}>
                  {hit.label}
                  {hit.detail ? <span className="meta">{hit.detail}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="credit lookup-status">
        旋律來自{" "}
        <a href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">
          Wikimedia Commons
        </a>{" "}
        嘅免費 MIDI，或者內置公有領域《小星星》首句七音。唔係歌詞。
      </p>
    </form>
  );
}
