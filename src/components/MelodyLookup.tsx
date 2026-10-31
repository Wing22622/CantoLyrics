import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import {
  melodyFromOwnMidi,
  melodySearchMessage,
  midiBytesFromText,
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
  const [pasted, setPasted] = useState("");
  const [ownOpen, setOwnOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const request = useRef(0);
  const loading = phase.kind === "loading";
  const showOwn = ownOpen || phase.kind === "error";

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

  function ownTitle(fallback: string): string {
    return trackName.trim() || fallback.replace(/\.midi?$/i, "").trim() || "未命名";
  }

  function useOwnBytes(bytes: Uint8Array, fallback: string) {
    const resolved = melodyFromOwnMidi(bytes, ownTitle(fallback));
    if (!resolved.ok) {
      setOwnOpen(true);
      setPhase({ kind: "error", message: melodySearchMessage(resolved.failure) });
      return;
    }
    setOwnOpen(false);
    setPhase({ kind: "idle" });
    onFound(resolved.melody);
  }

  async function takeFile(file: File | null) {
    if (!file || loading) return;
    try {
      useOwnBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch {
      setOwnOpen(true);
      setPhase({ kind: "error", message: melodySearchMessage({ status: "unreadable" }) });
    }
  }

  function importPasted() {
    const bytes = midiBytesFromText(pasted);
    if (!bytes) {
      setOwnOpen(true);
      setPhase({ kind: "error", message: "貼上嘅文字唔係 MIDI。可以貼 Base64 或 data URL，或者上載檔案。" });
      return;
    }
    useOwnBytes(bytes, "貼上嘅 MIDI");
  }

  function onPasteFile(event: ClipboardEvent) {
    const file = event.clipboardData?.files?.[0];
    if (!file) return;
    event.preventDefault();
    void takeFile(file);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const track = trackName.trim();
    if (!track || loading) return;
    const id = request.current + 1;
    request.current = id;
    setOwnOpen(false);
    setPhase({ kind: "loading" });
    const outcome = await search({ trackName: track, artistName });
    if (request.current !== id) return;
    if (!outcome.ok || outcome.hits.length === 0) {
      const failure = outcome.ok ? { status: "not-found" as const } : outcome.failure;
      setOwnOpen(true);
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
      {showOwn ? (
        <div className="own-midi" onPaste={onPasteFile}>
          <p className="hint">上載 MIDI 檔，或者貼上 Base64／data URL。匯入之後會變成聲調碼，可以再改。</p>
          <label className="file">
            上載自己嘅 MIDI
            <input
              type="file"
              accept=".mid,.midi,audio/midi"
              aria-label="上載自己嘅 MIDI"
              onChange={(event) => {
                void takeFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          <label className="block">
            貼上 MIDI
            <textarea
              value={pasted}
              rows={3}
              spellCheck={false}
              aria-label="貼上 MIDI"
              placeholder="data:audio/midi;base64,…"
              onChange={(event) => setPasted(event.target.value)}
            />
          </label>
          <button type="button" disabled={loading || !pasted.trim()} onClick={importPasted}>
            匯入貼上嘅 MIDI
          </button>
        </div>
      ) : (
        <button type="button" className="ghost lookup-status" onClick={() => setOwnOpen(true)}>
          上載或貼上自己嘅 MIDI
        </button>
      )}
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
        同{" "}
        <a href="https://archive.org/" target="_blank" rel="noreferrer">
          Internet Archive
        </a>{" "}
        嘅免費 MIDI，或者內置公有領域《小星星》首句七音。唔係歌詞。搵唔到可以上載或者貼上自己嘅 MIDI。
      </p>
    </form>
  );
}
