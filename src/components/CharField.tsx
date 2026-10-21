import { useRef, useState } from "react";

interface CharFieldProps {
  value: string;
  label: string;
  bad: boolean;
  inputRef: (node: HTMLInputElement | null) => void;
  onCommit: (value: string) => void;
}

export function CharField({ value, label, bad, inputRef, onCommit }: CharFieldProps) {
  const composing = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      ref={inputRef}
      className={bad ? "char bad" : "char"}
      aria-label={label}
      value={draft ?? value}
      maxLength={12}
      onCompositionStart={(event) => {
        composing.current = true;
        setDraft(event.currentTarget.value);
      }}
      onCompositionUpdate={(event) => setDraft(event.currentTarget.value)}
      onCompositionEnd={(event) => {
        composing.current = false;
        setDraft(null);
        onCommit(event.currentTarget.value);
      }}
      onChange={(event) => {
        if (composing.current) {
          setDraft(event.target.value);
          return;
        }
        setDraft(null);
        onCommit(event.target.value);
      }}
    />
  );
}
