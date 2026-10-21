import { Fragment } from "react";
import { formatBeats } from "../jianpu";
import type { CharReading } from "../lexicon";
import { checkFit } from "../tone-fit";
import type { Code0243 } from "../tone-0243";
import { CharField } from "./CharField";

export interface Slot {
  pitch: number;
  beats: number;
  label: string;
  bar: number;
  code: Code0243;
  source: string;
  melisma: boolean;
  character: string;
  reading: string | null;
}

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
  registerInput,
}: SlotRowProps) {
  const selected = new Set(selection);
  return (
    <div className="slot-row" role="list">
      {slots.map((slot, index) => {
        const readings = lexiconReady && slot.character ? readingsFor(slot.character) : [];
        const fit =
          !slot.melisma && slot.character && lexiconReady
            ? checkFit(slot.character, slot.code, readings, slot.reading)
            : null;
        const showBar = index === 0 || slot.bar !== slots[index - 1].bar;
        const beat = formatBeats(slot.beats);
        return (
          <Fragment key={`${slot.bar}-${index}`}>
            {showBar && index > 0 ? <div className="bar-break" aria-hidden="true" /> : null}
            <article role="listitem"
              className={[
                "slot",
                selected.has(index) ? "is-selected" : "",
                slot.melisma ? "is-melisma" : "",
                fit?.status === "mismatch" ? "is-bad" : "",
                fit?.status === "unknown" ? "is-unknown" : "",
              ].filter(Boolean).join(" ")}
              data-code={slot.code}
              onClick={(event) => onSelect(index, event.shiftKey)}
            >
              <div className="slot-pitch">
                <span>{slot.label}</span>
                {beat ? <small>{beat}</small> : null}
              </div>
              <div className="code" title={codeTitle(slot.code)}>
                {slot.code}
              </div>
              {slot.melisma ? (
                <div className="source melisma">～</div>
              ) : (
                <input
                  className="source"
                  aria-label={`第 ${index + 1} 個原詞音節`}
                  value={slot.source}
                  placeholder="原詞"
                  onChange={(event) => onSource(index, event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                />
              )}
              {slot.melisma ? (
                <div className="melisma-mark">拖音</div>
              ) : (
                <CharField
                  value={slot.character}
                  label={`第 ${index + 1} 格，聲調碼 ${slot.code}`}
                  bad={fit?.status === "mismatch"}
                  inputRef={(node) => registerInput(index, node)}
                  onCommit={(value) => onCommit(index, value)}
                />
              )}
              {fit?.status === "mismatch" ? <p className="flag">唔啱聲調</p> : null}
              {fit?.status === "unknown" ? <p className="flag unknown">字典未收</p> : null}
              {fit && fit.readings.length > 0 ? (
                <div className="readings">
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
                </div>
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
            </article>
          </Fragment>
        );
      })}
    </div>
  );
}

function codeTitle(code: Code0243): string {
  if (code === "0") return "0 最低，陽平一類";
  if (code === "2") return "2 次低，陽去一類";
  if (code === "4") return "4 次高，陰去一類";
  return "3 最高，陰平一類";
}
