import { useState } from "react";
import { LyricLookup } from "./LyricLookup";
import { MelodyLookup } from "./MelodyLookup";
import { filterSongs, formatUpdated, lyricPreview } from "../library";
import type { FoundLyrics } from "../lyrics-fetch";
import type { ResolvedMelody } from "../melody-search";
import type { StoredSong } from "../storage";

interface LibraryViewProps {
  songs: readonly StoredSong[];
  query: string;
  storageError: string;
  onQuery: (query: string) => void;
  onCreate: (title?: string) => void;
  onOpen: (song: StoredSong) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onFoundLyrics: (found: FoundLyrics) => void;
  onFoundMelody: (found: ResolvedMelody) => void;
}

export function CreateSongPrompt({
  onConfirm,
  onCancel,
}: {
  onConfirm: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  return (
    <form
      className="create-song"
      onSubmit={(event) => {
        event.preventDefault();
        const next = title.trim();
        if (!next) return;
        onConfirm(next);
      }}
    >
      <label>
        新歌歌名
        <input
          value={title}
          aria-label="新歌歌名"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <button type="submit" disabled={!title.trim()}>
        建立
      </button>
      <button type="button" className="ghost" onClick={onCancel}>
        取消
      </button>
    </form>
  );
}

export function LibraryView({
  songs,
  query,
  storageError,
  onQuery,
  onCreate,
  onOpen,
  onRename,
  onDelete,
  onFoundLyrics,
  onFoundMelody,
}: LibraryViewProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const shown = filterSongs(songs, query);

  function startRename(song: StoredSong) {
    setConfirmId(null);
    setRenamingId(song.id);
    setRenameTitle(song.title);
  }

  function finishRename(id: string) {
    onRename(id, renameTitle);
    setRenamingId(null);
  }

  return (
    <div className="library">
      <header className="top">
        <div>
          <p className="eyebrow">CantoLyrics</p>
          <h1>歌曲庫</h1>
        </div>
      </header>
      <label className="search">
        搜尋歌名或歌詞
        <input
          value={query}
          placeholder="例如：世界、歡"
          onChange={(event) => onQuery(event.target.value)}
        />
      </label>
      {storageError ? <p className="warnings">{storageError}</p> : null}
      <section className="panel">
        <h2>用歌名搵旋律</h2>
        <p className="hint">打歌名，可加歌手。搵到旋律就會開一首新歌，聲調碼由旋律計出嚟，可以再改。唔會填歌詞。</p>
        <MelodyLookup onFound={onFoundMelody} />
      </section>
      <section className="panel">
        <h2>上網搵歌詞</h2>
        <p className="hint">打歌名，可加歌手。搵到就會開一首新歌，歌詞放進原詞，並轉成聲調碼。</p>
        <LyricLookup onFound={onFoundLyrics} />
      </section>
      {songs.length > 0 ? (
        drafting ? (
          <CreateSongPrompt
            onConfirm={(title) => {
              setDrafting(false);
              onCreate(title);
            }}
            onCancel={() => setDrafting(false)}
          />
        ) : (
          <button type="button" className="text-link" onClick={() => setDrafting(true)}>
            新歌
          </button>
        )
      ) : null}
      {songs.length === 0 ? (
        <section className="panel empty">
          <h2>未有歌曲</h2>
          <p className="hint">歌會儲存喺呢個瀏覽器。開一首新歌，之後可以喺度搵返。</p>
          <button type="button" onClick={() => onCreate()}>
            開新歌
          </button>
        </section>
      ) : shown.length === 0 ? (
        <section className="panel empty">
          <h2>搵唔到</h2>
          <p className="hint">冇歌嘅歌名或歌詞包含「{query.trim()}」。</p>
        </section>
      ) : (
        <ul className="song-list">
          {shown.map((song) => (
            <li key={song.id} className="song-card">
              {renamingId === song.id ? (
                <form
                  className="rename-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    finishRename(song.id);
                  }}
                >
                  <label>
                    歌名
                    <input
                      value={renameTitle}
                      aria-label={`改名 ${song.title}`}
                      onChange={(event) => setRenameTitle(event.target.value)}
                    />
                  </label>
                  <button type="submit">完成</button>
                  <button type="button" className="ghost" onClick={() => setRenamingId(null)}>
                    取消
                  </button>
                </form>
              ) : (
                <h2>{song.title}</h2>
              )}
              <p className="meta">
                <time dateTime={new Date(song.updatedAt).toISOString()}>{formatUpdated(song.updatedAt)}</time>
              </p>
              <p className="preview">{lyricPreview(song)}</p>
              {confirmId === song.id ? (
                <div className="confirm">
                  <p>刪除「{song.title}」？呢首歌會喺呢個瀏覽器消失。</p>
                  <button type="button" className="danger" onClick={() => onDelete(song.id)}>
                    確定刪除
                  </button>
                  <button type="button" className="ghost" onClick={() => setConfirmId(null)}>
                    取消
                  </button>
                </div>
              ) : (
                <div className="card-actions">
                  <button type="button" onClick={() => onOpen(song)}>
                    開啟
                  </button>
                  <button type="button" className="ghost" onClick={() => startRename(song)}>
                    改名
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setRenamingId(null);
                      setConfirmId(song.id);
                    }}
                  >
                    刪除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
