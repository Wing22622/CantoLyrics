import { Fragment, useEffect, useRef } from "react";
import { indexFromPoint, nextDragIndex } from "../drag-select";
import { formatBeats } from "../jianpu";
import type { CharReading } from "../lexicon";
import { effectiveCode, type LyricSlot } from "../slots";
import { checkFit } from "../tone-fit";
import { CODES, type Code0243 } from "../tone-0243";
import { CharField } from "./CharField";

export type Slot = LyricSlot;

interface SlotRowProps {
  slots: Slot[];
  selection: number[];
  readingsFor: (char: string) => CharReading[];
  lexiconReady: boolean;
  onSelect: (index: number, shift: boolean) => void;
  onCommit: (index: number, value: string) => void;
  onReading: (index: number, jyutping: string) => void;
  onMelisma: (index: number) => void;
  onSource: (index: number, value: string) => void;
  onCode: (index: number, code: Code0243) => void;
  registerInput: (index: number, node: HTMLInputElement | null) => void;
}

export function SlotRow({
  slots,
  selection,
  readingsFor,
  lexiconReady,
  onSelect,
  onCommit,
  onReading,
  onMelisma,
  onSource,
  onCode,
  registerInput,
}: SlotRowProps) {
  const selected = new Set(selection);
  const drag = useRef(false);
  const dragged = useRef(false);
  const dragIndex = useRef<number | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const stop = () => {
      drag.current = false;
    };
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      const next = nextDragIndex(dragIndex.current, indexFromPoint(document.elementFromPoint(event.clientX, event.clientY)));
      if (next == null) return;
      dragIndex.current = next;
      dragged.current = true;
      onSelectRef.current(next, true);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <div className="line" role="list">
      {slots.map((slot, index) => {
        const code = effectiveCode(slot);
        const readings = lexiconReady && slot.character ? readingsFor(slot.character) : [];
        const fit =
          !slot.melisma && slot.character && lexiconReady
            ? checkFit(slot.character, code, readings, slot.reading)
            : null;
        const showBar = index > 0 && slot.bar !== slots[index - 1].bar;
        const beat = formatBeats(slot.beats);
        const hand = slot.override != null;
        return (
          <Fragment key={slot.id}>
            {showBar ? <span className="phrase-break" aria-hidden="true">｜</span> : null}
            <span
              role="listitem"
              tabIndex={slot.melisma ? -1 : undefined}
              className={[
                "syllable",
                selected.has(index) ? "is-selected" : "",
                !slot.melisma && !slot.character ? "is-empty" : "",
                slot.melisma ? "is-melisma" : "",
                hand ? "is-override" : "",
                fit?.status === "mismatch" ? "is-bad" : "",
                fit?.status === "unknown" ? "is-unknown" : "",
              ].filter(Boolean).join(" ")}
              data-code={code}
              data-slot={index}
              data-slot-id={slot.id}
              title={`${slot.label}${beat ? ` ${beat}` : ""}${hand ? "，手改聲調碼" : ""}`}
              onMouseDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("input, select, button")) return;
                // Keep the caret and IME composition when the press is on the
                // syllable chrome rather than the character field.
                event.preventDefault();
              }}
              onPointerDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("input, select, button")) return;
                drag.current = true;
                dragged.current = false;
                dragIndex.current = index;
                onSelect(index, event.shiftKey);
              }}
              onClick={(event) => {
                if (dragged.current) {
                  dragged.current = false;
                  return;
                }
                onSelect(index, event.shiftKey);
                const target = event.target as HTMLElement;
                if (target.closest("input, select, button")) return;
                if (event.shiftKey) return;
                const field = event.currentTarget.querySelector<HTMLInputElement>("input.char");
                if (field) {
                  if (document.activeElement !== field) field.focus();
                  return;
                }
                if (document.activeElement !== event.currentTarget) event.currentTarget.focus();
              }}
            >
              <span className="pitch">{slot.label}</span>
              <span className="code-row">
                <select
                  className="code"
                  aria-label={`第 ${index + 1} 個聲調碼${hand ? "，手改" : ""}`}
                  value={code}
                  onChange={(event) => onCode(index, event.target.value as Code0243)}
                  onClick={(event) => event.stopPropagation()}
                >
                  {CODES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {hand ? <span className="edit-mark">改</span> : null}
              </span>
              {slot.melisma ? (
                <span className="glyph melisma">～</span>
              ) : (
                <CharField
                  value={slot.character}
                  label={`第 ${index + 1} 個字，聲調碼 ${code}`}
                  bad={fit?.status === "mismatch"}
                  inputRef={(node) => registerInput(index, node)}
                  onCommit={(value) => onCommit(index, value)}
                />
              )}
              {slot.melisma ? (
                <span className="source-pad" aria-hidden="true" />
              ) : (
                <input
                  className="source"
                  aria-label={`第 ${index + 1} 個原詞音節`}
                  value={slot.source}
                  placeholder="·"
                  onChange={(event) => onSource(index, event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                />
              )}
              {fit?.status === "mismatch" ? <span className="flag">唔啱</span> : null}
              {fit?.status === "unknown" ? <span className="flag unknown">未收</span> : null}
              {selected.has(index) && ((fit && fit.readings.length > 1) || index > 0) ? (
                <span className="slot-tools">
                  {fit && fit.readings.length > 1 ? (
                    <span className="readings">
                      {fit.readings.map((reading) => (
                        <button
                          key={reading.jyutping}
                          type="button"
                          className={reading.jyutping === fit.active ? "reading on" : "reading"}
                          onClick={(event) => {
                            event.stopPropagation();
                            onReading(index, reading.jyutping);
                          }}
                        >
                          {reading.jyutping}
                          <span>{reading.codes.join("／")}</span>
                        </button>
                      ))}
                    </span>
                  ) : null}
                  {index > 0 ? (
                    <button
                      type="button"
                      className="linkish"
                      onClick={(event) => {
                        event.stopPropagation();
                        onMelisma(index);
                      }}
                    >
                      {slot.melisma ? "取消拖音" : "拖音"}
                    </button>
                  ) : null}
                </span>
              ) : null}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
