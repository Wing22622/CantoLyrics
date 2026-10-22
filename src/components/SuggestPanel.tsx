import { useEffect, useState } from "react";
import type { Lexicon } from "../lexicon";
import { suggestWords, type WordEntry } from "../suggest";
import type { Code0243 } from "../tone-0243";

interface SuggestPanelProps {
  lexicon: Lexicon | null;
  codes: Code0243[];
  onPick: (word: WordEntry) => void;
}

export function SuggestPanel({ lexicon, codes, onPick }: SuggestPanelProps) {
  const [length, setLength] = useState<2 | 3 | 4>(2);
  const [initial, setInitial] = useState("");
  const key = codes.join("");

  useEffect(() => {
    if (codes.length >= 4) setLength(4);
    else if (codes.length === 3) setLength(3);
    else if (codes.length === 2) setLength(2);
  }, [key, codes.length]);

  const usable = codes.length >= 2;
  const pattern = codes.slice(0, length);
  const words =
    lexicon && usable && pattern.length === length
      ? suggestWords(lexicon.wordsOfLength(length), pattern, { startsWith: initial, limit: 40 })
      : [];

  return (
    <aside className="suggest" aria-label="建議用字">
      <header>
        <h2>建議</h2>
        <p className="pattern">{pattern.length ? pattern.join(" ") : "—"}</p>
      </header>
      {!lexicon ? <p className="hint">詞庫載入緊…</p> : null}
      {lexicon && !usable ? (
        <p className="hint">再揀多一格連續空位，就可以搵兩字、三字或者四字詞。</p>
      ) : null}
      {usable ? (
        <>
          <div className="filters">
            <div className="seg" role="group" aria-label="字數">
              {([2, 3, 4] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  disabled={codes.length < size}
                  className={length === size ? "on" : ""}
                  onClick={() => setLength(size)}
                >
                  {size === 2 ? "兩字" : size === 3 ? "三字" : "四字"}
                </button>
              ))}
            </div>
            <label>
              開頭字
              <input
                value={initial}
                maxLength={1}
                placeholder="開"
                onChange={(event) => setInitial(Array.from(event.target.value).slice(-1).join(""))}
              />
            </label>
          </div>
          {lexicon && words.length === 0 ? <p className="hint">冇啱聲調嘅詞。</p> : null}
          <ul>
            {words.map((word) => (
              <li key={`${word.text}-${word.jyutping.join(" ")}`}>
                <button type="button" onClick={() => onPick(word)}>
                  <strong>{word.text}</strong>
                  <span>{word.jyutping.join(" ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}
