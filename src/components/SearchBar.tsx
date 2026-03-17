import { useRef, useEffect, KeyboardEvent } from "react";
import { X, ChevronUp, ChevronDown, Loader } from "lucide-react";
import styles from "./SearchBar.module.css";

interface SearchBarProps {
  query: string;
  results: number[];
  currentIndex: number;
  isSearching: boolean;
  onSearch: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function SearchBar({
  query,
  results,
  currentIndex,
  isSearching,
  onSearch,
  onNext,
  onPrev,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.shiftKey ? onPrev() : onNext();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  const hasQuery = query.trim().length > 0;
  const noMatches = hasQuery && !isSearching && results.length === 0;

  const matchLabel = isSearching
    ? null
    : results.length > 0
      ? `${currentIndex + 1} / ${results.length} page${results.length !== 1 ? "s" : ""}`
      : hasQuery
        ? "No matches"
        : null;

  return (
    <div className={styles.bar}>
      <div
        className={`${styles.inputWrap} ${noMatches ? styles.noMatchWrap : ""}`}
      >
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Find in document…"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={handleKey}
          spellCheck={false}
          autoComplete="off"
        />
        {isSearching && (
          <Loader size={12} strokeWidth={2} className={styles.spin} />
        )}
        {matchLabel && (
          <span
            className={`${styles.count} ${noMatches ? styles.noMatchText : ""}`}
          >
            {matchLabel}
          </span>
        )}
      </div>

      <div className={styles.controls}>
        <button
          className={styles.btn}
          onClick={onPrev}
          disabled={results.length < 2}
          title="Previous (Shift+Enter)"
        >
          <ChevronUp size={14} strokeWidth={2.5} />
        </button>
        <button
          className={styles.btn}
          onClick={onNext}
          disabled={results.length < 2}
          title="Next (Enter)"
        >
          <ChevronDown size={14} strokeWidth={2.5} />
        </button>
        <div className={styles.divider} />
        <button className={styles.btn} onClick={onClose} title="Close (Esc)">
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
