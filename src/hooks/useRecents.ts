import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecentFile {
  fileName:  string;
  filePath:  string;   // full OS path (Tauri) or "" (browser)
  lastPage:  number;
  totalPages: number;
  openedAt:  number;   // timestamp ms
}

const LS_KEY   = "pdfr:recents";
const MAX_RECENTS = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadFromStorage(): RecentFile[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentFile[];
  } catch {
    return [];
  }
}

function saveToStorage(recents: RecentFile[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(recents));
  } catch { /* quota exceeded — ignore */ }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecents() {
  const [recents, setRecents] = useState<RecentFile[]>(loadFromStorage);

  // Call this after successfully opening a PDF
  const addRecent = useCallback((entry: Omit<RecentFile, "openedAt">) => {
    setRecents((prev) => {
      // Remove any existing entry for the same file
      const filtered = prev.filter((r) => r.fileName !== entry.fileName);

      const updated: RecentFile[] = [
        { ...entry, openedAt: Date.now() },
        ...filtered,
      ].slice(0, MAX_RECENTS);

      saveToStorage(updated);
      return updated;
    });
  }, []);

  // Update the lastPage for a file that's already in recents
  const updateRecentPage = useCallback((fileName: string, lastPage: number, totalPages: number) => {
    setRecents((prev) => {
      const updated = prev.map((r) =>
        r.fileName === fileName ? { ...r, lastPage, totalPages } : r
      );
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const removeRecent = useCallback((fileName: string) => {
    setRecents((prev) => {
      const updated = prev.filter((r) => r.fileName !== fileName);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  return { recents, addRecent, updateRecentPage, removeRecent };
}
