import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 350;

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

// Local state for instant typing feedback; the URL (via onChange) only
// updates after a pause — the debounce this pattern requires didn't
// justify a dependency, so it's a plain useEffect + setTimeout. Enter
// bypasses the wait entirely; the clear button resets both immediately.
export function SearchInput({ value, onChange }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Keep the draft in sync if the URL changes from elsewhere (e.g. "Limpiar filtros").
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) return;
    const timeout = setTimeout(() => onChangeRef.current(draft), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
    // Only re-debounce when the draft itself changes — onChangeRef is a
    // ref specifically so it doesn't need to be a dependency here.
  }, [draft]);

  function commitNow() {
    onChangeRef.current(draft);
  }

  return (
    <div className="relative">
      <label htmlFor="catalog-search" className="sr-only">
        Buscar por modelo o marca
      </label>
      <input
        id="catalog-search"
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitNow();
        }}
        placeholder="Buscar por modelo o marca…"
        className="w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text placeholder:text-text-muted focus-visible:border-primary"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChangeRef.current("");
          }}
          aria-label="Limpiar búsqueda"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary"
        >
          ×
        </button>
      )}
    </div>
  );
}
