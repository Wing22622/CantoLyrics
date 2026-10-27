import { useState } from "react";
import {
  mapLyricDigits,
  reconcileChoices,
  UNKNOWN_DIGIT,
  type LyricCharToken,
  type LyricReading,
  type ReadingChoice,
} from "../lyric-0243";

interface LyricDigitsPanelProps {
  readingsFor: (char: string) => readonly LyricReading[];
  lexiconReady: boolean;
  lexiconError?: string;
}

export function LyricDigitsPanel({ readingsFor, lexiconReady, lexiconError = "" }: LyricDigitsPanelProps) {
  const [text, setText] = useState("");
  const [choices, setChoices] = useState<readonly ReadingChoice[]>([]);
  const result = lexiconReady ? mapLyricDigits(text, readingsFor, choices) : null;

  function onChoose(token: LyricCharToken, jyutping: string) {
    setChoices((prev) => [
      ...prev.filter((choice) => choice.index !== token.index),
      { index: token.index, char: token.char, jyutping },
    ]);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>字／名 → 0243</h2>
      </div>
      <label className="block">
        輸入名字或者一句詞
        <textarea
          value={text}
          rows={2}
          spellCheck={false}
          placeholder="陳大文"
          onChange={(event) => {
            const next = event.target.value;
            setChoices((current) => reconcileChoices(text, next, current));
            setText(next);
          }}
        />
      </label>
      <p className="hint">
        每個漢字跟詞庫百分比最高嘅讀音轉成 0243。多過一個讀音可以喺下面改。字典未收嘅字顯示 {UNKNOWN_DIGIT}。空格、標點、英文、數字同假名唔計；夾喺漢字中間會留一個空格。呢度唔使旋律，亦唔會改填詞行由旋律計出嚟嘅聲調碼。
      </p>
      {lexiconError ? <p className="warnings">{lexiconError}</p> : null}
      {!lexiconReady && !lexiconError ? <p className="hint">詞庫載入緊，未計到聲調碼。</p> : null}
      {result && text.trim() && result.tokens.length === 0 ? (
        <p className="hint">呢段冇漢字，所以冇聲調碼。</p>
      ) : null}
      {result && result.tokens.length > 0 ? (
        <>
          <p className="lyric-digits" aria-live="polite" aria-label={`聲調碼 ${result.digits}`}>
            {result.tokens.map((token, index) => {
              if (token.kind === "gap") return <span key={`gap-${index}`}> </span>;
              if (!token.code) {
                return (
                  <span key={token.index} className="lyric-unknown">
                    {UNKNOWN_DIGIT}
                  </span>
                );
              }
              return (
                <span key={token.index} data-code={token.code}>
                  {token.code}
                </span>
              );
            })}
          </p>
          <div className="lyric-cells">
            {result.tokens.map((token, index) => {
              if (token.kind === "gap") return <span key={`cell-gap-${index}`} className="lyric-gap" aria-hidden="true" />;
              return (
                <span key={token.index} className="lyric-cell">
                  <span className="lyric-char">{token.char}</span>
                  <span className={token.code ? "lyric-code" : "lyric-code lyric-unknown"} data-code={token.code ?? undefined}>
                    {token.code ?? UNKNOWN_DIGIT}
                  </span>
                  {token.readings.length > 1 ? (
                    <span className="readings">
                      {token.readings.map((reading) => (
                        <button
                          key={reading.jyutping}
                          type="button"
                          className={reading.jyutping === token.jyutping ? "reading on" : "reading"}
                          aria-pressed={reading.jyutping === token.jyutping}
                          onClick={() => onChoose(token, reading.jyutping)}
                        >
                          {reading.jyutping}
                          <span>{reading.percent}%</span>
                        </button>
                      ))}
                    </span>
                  ) : token.jyutping ? (
                    <span className="lyric-jyutping">{token.jyutping}</span>
                  ) : (
                    <span className="flag unknown">未收</span>
                  )}
                </span>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
