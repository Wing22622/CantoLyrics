import { useEffect, useRef, useState } from "react";
import { alignSources, alignmentNote, toggleMelisma } from "./align";
import { SuggestPanel } from "./components/SuggestPanel";
import { SlotRow, type Slot } from "./components/SlotRow";
import { EXAMPLE_JIANPU, EXAMPLE_LYRICS, EXAMPLE_TITLE } from "./example";
import { exportLyrics } from "./export-lyrics";
import { parseJianpu } from "./jianpu";
import { loadLexicon, type Lexicon } from "./lexicon";
import { midiNoteName, parseMidi, type MidiTrack } from "./midi";
import { splitSyllables } from "./syllables";
import { clearOverrides, effectiveCode, slotsForTrackChoice, slotsFromNotes, withCode, type IncomingNote } from "./slots";
import { deleteSong, listSongs, saveSong, type StoredSong } from "./storage";
import type { Code0243 } from "./tone-0243";
import type { WordEntry } from "./suggest";

function toSlots(notes: IncomingNote[], prev: Slot[], keepOverrides: boolean): Slot[] {
  return slotsFromNotes(notes, prev, keepOverrides);
}

function fromJianpu(text: string): { notes: IncomingNote[]; warnings: string[]; tonic: string } {
  const parsed = parseJianpu(text);
  return {
    tonic: parsed.tonicName,
    warnings: parsed.warnings,
    notes: parsed.notes.map((note) => ({
      rest: note.rest,
      pitch: note.pitch,
      beats: note.beats,
      label: note.label,
      bar: note.bar,
    })),
  };
}

function fromTrack(track: MidiTrack): IncomingNote[] {
  return track.notes.map((note) => ({
    rest: false,
    pitch: note.pitch,
    beats: note.beats,
    label: midiNoteName(note.pitch),
    bar: note.bar,
  }));
}

function emptyRun(slots: Slot[], selection: number[]): number[] | null {
  if (selection.length === 0) return null;
  const sorted = [...selection].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return null;
  }
  if (sorted.some((index) => slots[index].melisma || slots[index].character)) return null;
  return sorted;
}

export function App() {
  const [title, setTitle] = useState("");
  const [jianpu, setJianpu] = useState("");
  const [source, setSource] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [tonic, setTonic] = useState("C");
  const [mode, setMode] = useState<"jianpu" | "midi">("jianpu");
  const [tracks, setTracks] = useState<MidiTrack[]>([]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [note, setNote] = useState("");
  const [selection, setSelection] = useState<number[]>([]);
  const [lexicon, setLexicon] = useState<Lexicon | null>(null);
  const [lexiconError, setLexiconError] = useState("");
  const [saved, setSaved] = useState<StoredSong[]>([]);
  const [songId, setSongId] = useState<string | null>(null);
  const [pickedSave, setPickedSave] = useState("");
  const anchor = useRef(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const lineBeforeImport = useRef<Slot[] | null>(null);

  function dropImportedLine() {
    lineBeforeImport.current = null;
  }

  useEffect(() => {
    loadLexicon()
      .then(setLexicon)
      .catch((error: unknown) => {
        setLexiconError(error instanceof Error ? error.message : "詞庫載入唔到");
      });
    setSaved(listSongs());
  }, []);

  function onJianpu(text: string) {
    dropImportedLine();
    setJianpu(text);
    setMode("jianpu");
    const parsed = fromJianpu(text);
    setTonic(parsed.tonic);
    setWarnings(parsed.warnings);
    setSlots((prev) => toSlots(parsed.notes, prev, true));
    setSelection([]);
  }

  function onAlign() {
    dropImportedLine();
    const syllables = splitSyllables(source);
    setSlots((prev) => {
      const aligned = alignSources(prev, syllables);
      return prev.map((slot, index) => ({
        ...slot,
        source: aligned[index].source,
        melisma: false,
      }));
    });
    setNote(alignmentNote(syllables.length, slots.length));
  }

  function loadExample() {
    dropImportedLine();
    setTitle(EXAMPLE_TITLE);
    setSource(EXAMPLE_LYRICS);
    setJianpu(EXAMPLE_JIANPU);
    setMode("jianpu");
    const parsed = fromJianpu(EXAMPLE_JIANPU);
    setTonic(parsed.tonic);
    setWarnings(parsed.warnings);
    const syllables = splitSyllables(EXAMPLE_LYRICS);
    const base = toSlots(parsed.notes, [], false);
    const aligned = alignSources(base, syllables);
    setSlots(
      base.map((slot, index) => ({
        ...slot,
        source: aligned[index].source,
        melisma: false,
      })),
    );
    setSelection([]);
    setNote("");
  }

  async function onMidiFile(file: File | null) {
    if (!file) return;
    try {
      const parsed = parseMidi(await file.arrayBuffer());
      setTracks(parsed.tracks);
      setWarnings(parsed.warnings);
      setTrackIndex(0);
      if (parsed.tracks.length > 0) {
        setMode("midi");
        setSlots((prev) => {
          lineBeforeImport.current = prev;
          return slotsForTrackChoice(fromTrack(parsed.tracks[0]), prev, null);
        });
        setSelection([]);
      }
    } catch (error) {
      setWarnings([error instanceof Error ? error.message : "MIDI 讀唔到"]);
    }
  }

  function chooseTrack(index: number) {
    setTrackIndex(index);
    setMode("midi");
    setSlots((prev) => slotsForTrackChoice(fromTrack(tracks[index]), prev, lineBeforeImport.current));
    setSelection([]);
  }

  function onSelect(index: number, shift: boolean) {
    if (shift) {
      const start = Math.min(anchor.current, index);
      const end = Math.max(anchor.current, index);
      const range: number[] = [];
      for (let i = start; i <= end; i++) range.push(i);
      setSelection(range);
      return;
    }
    anchor.current = index;
    setSelection([index]);
  }

  function onCommit(index: number, raw: string) {
    dropImportedLine();
    const chars = Array.from(raw.replace(/\s+/g, ""));
    if (chars.length === 0) {
      setSlots((prev) =>
        prev.map((slot, i) => (i === index ? { ...slot, character: "", reading: null } : slot)),
      );
      return;
    }
    let last = index;
    setSlots((prev) => {
      const next = prev.map((slot) => ({ ...slot }));
      let cursor = index;
      for (const char of chars) {
        while (cursor < next.length && next[cursor].melisma) cursor++;
        if (cursor >= next.length) break;
        next[cursor] = { ...next[cursor], character: char, reading: null };
        last = cursor;
        cursor++;
      }
      return next;
    });
    requestAnimationFrame(() => inputs.current[last + 1]?.focus());
  }

  function onCode(index: number, code: Code0243) {
    dropImportedLine();
    setSlots((prev) => prev.map((slot, i) => (i === index ? withCode(slot, code) : slot)));
  }

  function onClearCodes() {
    dropImportedLine();
    setSlots((prev) => clearOverrides(prev));
  }

  function onReading(index: number, jyutping: string) {
    dropImportedLine();
    setSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, reading: jyutping } : slot)),
    );
  }

  function onSource(index: number, value: string) {
    dropImportedLine();
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, source: value } : slot)));
  }

  function onMelisma(index: number) {
    dropImportedLine();
    setSlots((prev) => {
      const aligned = toggleMelisma(prev, index);
      return prev.map((slot, i) => ({
        ...slot,
        source: aligned[i].source,
        melisma: aligned[i].melisma,
        character: aligned[i].melisma ? "" : slot.character,
        reading: aligned[i].melisma ? null : slot.reading,
      }));
    });
    setSelection([]);
  }

  function onPick(word: WordEntry) {
    dropImportedLine();
    const run = emptyRun(slots, selection);
    if (!run) return;
    setSlots((prev) => {
      const next = prev.map((slot) => ({ ...slot }));
      run.slice(0, word.text.length).forEach((slotIndex, offset) => {
        next[slotIndex] = {
          ...next[slotIndex],
          character: word.text[offset],
          reading: word.jyutping[offset],
        };
      });
      return next;
    });
    setSelection([]);
  }

  function onSave() {
    const id = songId ?? crypto.randomUUID();
    const song: StoredSong = {
      id,
      title: title.trim() || "未命名",
      updatedAt: Date.now(),
      jianpu,
      sourceLyrics: source,
      slots,
    };
    setSongId(id);
    const list = saveSong(song);
    setSaved(list);
    setPickedSave(id);
    setNote("儲存咗喺呢個瀏覽器。");
  }

  function onLoad() {
    dropImportedLine();
    const song = saved.find((item) => item.id === pickedSave);
    if (!song) return;
    setSongId(song.id);
    setTitle(song.title);
    setJianpu(song.jianpu);
    setSource(song.sourceLyrics);
    setSlots(song.slots);
    setMode(song.jianpu.trim() ? "jianpu" : "midi");
    setSelection([]);
    setWarnings([]);
    setNote(`載入咗「${song.title}」。`);
  }

  function onDelete() {
    if (!pickedSave) return;
    const list = deleteSong(pickedSave);
    setSaved(list);
    if (songId === pickedSave) setSongId(null);
    setPickedSave(list[0]?.id ?? "");
  }

  function onNew() {
    dropImportedLine();
    setSongId(null);
    setTitle("");
    setJianpu("");
    setSource("");
    setSlots([]);
    setSelection([]);
    setWarnings([]);
    setNote("");
    setMode("jianpu");
    setTracks([]);
    setTonic("C");
  }

  function onExport() {
    const text = exportLyrics(title, slots);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.trim() || "lyrics"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const run = emptyRun(slots, selection);
  const suggestCodes: Code0243[] = run ? run.map((index) => effectiveCode(slots[index])) : [];
  const handEdited = slots.some((slot) => slot.override != null);

  return (
    <div className="app">
      <div className="main">
        <header className="top">
          <div>
            <p className="eyebrow">CantoLyrics</p>
            <h1>粵語填詞</h1>
          </div>
          <div className="song-actions">
            <label>
              歌名
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="未命名" />
            </label>
            <button type="button" onClick={onNew}>
              新歌
            </button>
            <button type="button" onClick={onSave}>
              儲存
            </button>
            <button type="button" onClick={onExport} disabled={slots.length === 0}>
              匯出歌詞
            </button>
          </div>
        </header>

        <div className="load-row">
          <label>
            載入已儲存
            <select value={pickedSave} onChange={(event) => setPickedSave(event.target.value)}>
              <option value="">揀一首</option>
              {saved.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={onLoad} disabled={!pickedSave}>
            載入
          </button>
          <button type="button" onClick={onDelete} disabled={!pickedSave}>
            刪除
          </button>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h2>旋律</h2>
            <button type="button" onClick={loadExample}>
              載入《世界真細小》例句
            </button>
          </div>
          <label className="block">
            貼上簡譜
            <textarea
              value={jianpu}
              rows={4}
              spellCheck={false}
              placeholder={"3 4 5 3' 1' | 2' 1' 1' 7 7 |"}
              onChange={(event) => onJianpu(event.target.value)}
            />
          </label>
          <p className="hint">
            1–7 係 do–ti，預設 1=C。高音加 '，低音加 , 或者寫喺數字前面加點。- 延長一拍，_ 或 /
            係半拍，0 係休止，| 係小節。而家調號 1={tonic}。
            {mode === "midi" ? " 而家顯示緊 MIDI 旋律；改上面嘅簡譜就會換返。" : ""}
          </p>
          <label className="file">
            上載 MIDI 檔
            <input
              type="file"
              accept=".mid,.midi,audio/midi"
              onChange={(event) => {
                void onMidiFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          {tracks.length > 1 ? (
            <fieldset>
              <legend>揀音軌</legend>
              {tracks.map((track, index) => (
                <label key={`${track.name}-${index}`}>
                  <input
                    type="radio"
                    name="track"
                    checked={trackIndex === index && mode === "midi"}
                    onChange={() => chooseTrack(index)}
                  />
                  {track.name}（{track.notes.length} 個音）
                </label>
              ))}
            </fieldset>
          ) : null}
          {tracks.length === 1 && mode === "midi" ? (
            <p className="hint">
              用緊音軌「{tracks[0].name}」，{tracks[0].notes.length} 個音。同一下有幾個音會留最高嗰個。
            </p>
          ) : null}
          {warnings.length > 0 ? (
            <ul className="warnings">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>原詞</h2>
            <button type="button" onClick={onAlign} disabled={slots.length === 0}>
              對齊原詞
            </button>
          </div>
          <textarea
            value={source}
            rows={3}
            placeholder="人人常歡笑，不要眼淚掉"
            onChange={(event) => setSource(event.target.value)}
          />
          <p className="hint">
            英文按音節拆，日文假名按拍拆，中文一個字一格。對齊之後可以改每格嘅原詞，或者撳「拖音」令一個音節跨幾個音。
          </p>
          {note ? <p className="note">{note}</p> : null}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>填詞</h2>
            <p className="hint">{slots.length} 個音</p>
            <p className="legend">
              <span data-code="0">0 最低</span>
              <span data-code="2">2 次低</span>
              <span data-code="4">4 次高</span>
              <span data-code="3">3 最高</span>
            </p>
            <button type="button" onClick={onClearCodes} disabled={!handEdited}>
              還原聲調碼
            </button>
          </div>
          <p className="hint">
            一行歌詞，每個音一個字。撳個聲調碼可以改；改過會標「改」，再改簡譜都唔會覆寫。重新載入例句、上載 MIDI 或者撳「還原聲調碼」先至用返計算出嚟嘅碼。撳住拖或者按住 Shift 可以連選空格。
          </p>
          {slots.length === 0 ? (
            <p className="hint">未有旋律。貼上簡譜或者上載 MIDI 之後，呢度會出一行歌詞。</p>
          ) : (
            <SlotRow
              slots={slots}
              selection={selection}
              readingsFor={(char) => lexicon?.readingsFor(char) ?? []}
              lexiconReady={lexicon != null}
              onSelect={onSelect}
              onCommit={onCommit}
              onReading={onReading}
              onMelisma={onMelisma}
              onSource={onSource}
              onCode={onCode}
              registerInput={(index, node) => {
                inputs.current[index] = node;
              }}
            />
          )}
          {lexiconError ? <p className="warnings">{lexiconError}</p> : null}
          <p className="credit">
            詞庫：{lexicon?.meta.attribution ?? "CanCLID rime-cantonese"}，
            {lexicon?.meta.license ?? "CC BY 4.0"}。
          </p>
        </section>
      </div>
      {run ? (
        <SuggestPanel lexicon={lexicon} codes={suggestCodes} onPick={onPick} />
      ) : null}
    </div>
  );
}
