# CantoLyrics

A small browser app for writing Cantonese lyrics (填詞) against a melody. Paste 簡譜 or upload a MIDI file, see a 0243 tone code on every note, type Cantonese characters in one flowing line, and get word suggestions that fit the codes. Any code can be edited by hand.

M1 is client-only. Vite builds a static site that can be hosted on Vercel. There is no backend and this repo does not deploy anything.

The interface is in Traditional Chinese, written in Cantonese.

## Run

```bash
npm install
npm test
npm run dev
```

`npm run build` typechecks and writes `dist/`. `npm run lexicon` rebuilds `public/lexicon.json` from the pinned rime-cantonese files (it downloads them into `data/raw/` if that folder is empty). The built lexicon is already committed, so a normal checkout does not need that step.

## Melody

簡譜, major scale, default `1=C` (C4):

- `1`–`7` are do–ti. `0` is a rest.
- `'` up an octave, `,` or a leading `.` down an octave (`3'`, `5,`, `.5`).
- A note is a quarter note. `-` adds a beat, `.` dots it (×1.5), `_` or `/` halves it.
- `|` is a barline. `1=F#` changes the tonic. `4/4` is ignored.

MIDI: format 0 or 1. If the file has several tracks, pick one. A chord keeps the highest note. A later overlapping note trims the one before it.

Rests have no code and no lyric slot. Each sung note is one syllable in the line.

## Editor

The lyric editor is one sentence, not a grid of cards. Syllables sit inline and wrap. A bar is a light `｜`. Each syllable shows the pitch, the 0243 code, the character you type, and the original syllable underneath. Click a syllable, shift-click, or drag across the line to select consecutive empty syllables for suggestions. 拖音 and extra readings show on the syllable you have selected.

The code is a menu of 0, 2, 4, and 3. Changing it stores a hand edit, marked 改 with a dashed underline. Editing the 簡譜 re-parses the melody and keeps those edits on the same sung-note index, along with the characters already typed. A fresh import clears the edits: 載入例句, uploading a MIDI file, or switching MIDI track. 還原聲調碼 clears them too, and choosing the mapped code again clears that one syllable. Mismatch flags and the suggestion list use the code on screen, hand edit or mapped.

Hand edits follow the sung-note index. Inserting a note at the front shifts which syllable they sit on, the same way typed characters do.

## 0243 rules

Implemented from 黃志華’s 類音階, not from a local window of absolute solfege. Four levels, low to high: **0 < 2 < 4 < 3**. A phrase is one filling: the code sequence whose total 音程差距 is smallest. Gap 0 is a 真值; anything else is the closest 近似值 (最佳逼近). One filling only. The app does not break nodes (節點斷開) and does not list the other legal fillings.

For each pair of notes, the gap is the distance in semitones from the melodic interval to the nearest 自然音距 of that code pair. Positive means the second note is sharper than the natural relative pitch. The cost of a phrase is the sum of the absolute gaps. Ties break by (1) how close the semitone steps are to the embedded heights 0→2→4→3 = 0, 3, 6, 9, (2) a preference for code 4, then 2, then 0 or 3, (3) the lower code in the order 0 < 2 < 4 < 3. A single note, or a repeated pitch, is code 4.

Natural intervals (semitones; both directions):

| Pair | Natural | Why |
| --- | --- | --- |
| same code | 0 | 「人人」on mi–fa is gap +1. 黃志華, [〈「節點斷開效應」續篇〉](https://p-articles.com/critics/2896.html), 虛詞, 2022-04-14. |
| 0↔2, 4↔3 | 2 or 4 | 級進. [〈「○四」、「二三」能否交換使用？〉](https://www.patreon.com/u66411509/posts/si-er-san-neng-108634507), Patreon, 2024-07-23. |
| 2↔4 | 1 or 3 | A minor 3rd is 真值: do–mi–sol filled 024, and la–do–mi filled 243. [〈西洋和弦與類音階之配合之再探〉](http://www.chinaunix.net/uid-20375883-id-5827796.html), 2019-12-15. A minor 2nd is also 真值: 「不要眼淚掉」（三四四二二）on re'–do'–do'–ti–ti, same 2022 article. A major 2nd is not: if it were, do–re–mi could be filled 024 with gap 0, and 黃 says do–re–mi has no 真值. |
| 0↔4, 2↔3 | 5 | Perfect fourth. Patreon article above. 「希望」（三二）on a descending minor 3rd is two semitones short of this fourth; he marks that compression 負2. |
| 0↔3 | 7 | Perfect fifth is 真值. Chord article above. |

Worked phrase from 《世界真細小》, 黃霑詞, cited in `src/tone-0243.test.ts`. With `1=C`:

- mi fa so mi' do' (E4 F4 G4 E5 C5) → **00334**, which is 人人常歡笑. 夜裡群星照 is 24034 and needs a node break; that filling has a larger gap, so the app does not emit it.
- re' do' do' ti ti (D5 C5 C5 B4 B4) → **34422**, which is 不要眼淚掉 / 反照世事妙, gap 0.

`src/tone-system.ts` is the seam for a later 六聲 or 九聲 system. Neither is implemented.

### Tone to code

Jyutping tones 1–6. Entering tones 7/8/9, if a reading still uses them, follow 陰平 / 陰去 / 陽去.

| Tone | Codes | Primary |
| --- | --- | --- |
| 1, 7 陰平 | 3 | 3 |
| 2 陰上 (35) | 3, 4 | 3 |
| 3, 8 陰去 | 4 | 4 |
| 4 陽平 | 0 | 0 |
| 5 陽上 (23) | 4, 2 | 4 |
| 6, 9 陽去 | 2 | 2 |

A level tone fits one code. A rising tone fits two, because the rise crosses two levels: 陰上 is usually sung as 三, and may also sit on 四; 陽上 is usually 四 (裏 in 24034), and may also sit on 二. This is looser than treating 陰上 as 三 only. Suggestions that match on primary codes are listed before ones that only match through the extra rising-tone code. Polyphonic characters show every reading; click one to lock it. An empty choice stays green if any reading fits. A locked reading that does not fit is red (唔啱聲調). A character missing from the lexicon is amber (字典未收), not red.

## Suggestions and the lexicon

Select one or more consecutive empty slots. Two or more open a list of Cantonese words of 2, 3, or 4 characters whose tones can fill those codes, most frequent first. Filter by length and by the first character. Click a word to fill the slots. One empty slot only shows a hint.

The lexicon is built offline from [rime-cantonese](https://github.com/rime/rime-cantonese) at commit `259f0e48bba840c3a2e0d117539e96937f3d89bc` (dictionary version 2026.08.10):

- `jyut6ping3.words.dict.yaml` — words
- `jyut6ping3.chars.dict.yaml` — character readings
- `essay-cantonese.txt` — word frequency

**Licence: CC BY 4.0.** Copyright 粵語計算語言學基礎建設組 CanCLID. See `NOTICE`. The committed `public/lexicon.json` is a filtered, modified extract: 2–4 character words with one Jyutping syllable per character, plus character readings. Frequency is the essay count. 我哋 is not in the essay list; 我地 is, and the builder copies that count across a short variant list (哋/地, 為/爲, and the others named in `NOTICE`) without changing the displayed spelling. About 59k of 96k words have a non-zero count.

Not used:

- words.hk. The dictionary is under the Non-Commercial Open Data License / CC BY-NC.
- `jyut6ping3.maps` (ODbL).
- 0243.hk. Nothing in this project calls or scrapes it.

## Saving

Songs are stored in `localStorage` under `cantolyrics.songs.v1`. Export writes a `.txt` file: one line per bar, characters separated by spaces, □ for an empty slot, ～ appended for a melisma.

## Known limitations

- One scaffold per phrase. No 節點斷開, no alternate fillings, no 同向 slider. 外張 only shows up as a gap cost (0 and 3 can stretch, but they still pay for the semitones). Hand-editing a code is the way to force another filling.
- Hand edits are stored per sung-note index. They survive 簡譜 edits and are dropped on a new melody import.
- No 六聲 or 九聲.
- 變調 is honoured only when the lexicon lists it as its own reading.
- Rising tones may fit an extra code. That is more permissive than “陰上 = 三 only”.
- MIDI chords keep the top note. Bars are assumed to be 4 beats. No time-signature meta.
- 簡譜 subset: no triplets, grace notes, or ties beyond `-`.
- English syllabification is a vowel-group split, not a dictionary. Japanese kanji are one character each, not split into morae. Punctuation is dropped.
- The lexicon is not exhaustive. Simplified characters are not covered. An unknown character is amber, not a tone error.
- Alignment “拖音” moves the following source syllables along; it is not a full undo of a melisma.
- Browser storage only. No account, no server.
