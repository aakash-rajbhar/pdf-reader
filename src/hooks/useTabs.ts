import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Tab {
  id:         string;
  fileName:   string;
  filePath:   string;
  buffer:     ArrayBuffer;
  savedPage:  number;
  savedZoom:  number;
  totalPages: number;
}

let _nextId = 1;
const makeId = () => `tab-${_nextId++}`;

// ─── Hook ─────────────────────────────────────────────────────────────────────
// Uses a ref as the source of truth to avoid stale closure bugs.
// useState is only used to trigger re-renders.

export function useTabs() {
  const tabsRef               = useRef<Tab[]>([]);
  const activeIdRef           = useRef<string | null>(null);
  const [, forceRender]       = useState(0);
  const rerender              = useCallback(() => forceRender((n) => n + 1), []);

  const tabs     = tabsRef.current;
  const activeId = activeIdRef.current;

  // ── Open or re-focus ──────────────────────────────────────────────────────
  // Returns { tab, isNew }. Always synchronous — no setState race conditions.
  const openTab = useCallback((
    fileName: string,
    filePath: string,
    buffer:   ArrayBuffer,
  ): { tab: Tab; isNew: boolean } => {
    const existing = tabsRef.current.find((t) => t.fileName === fileName);
    if (existing) {
      return { tab: existing, isNew: false };
    }
    const tab: Tab = {
      id: makeId(),
      fileName,
      filePath,
      buffer,
      savedPage:  1,
      savedZoom:  1.0,
      totalPages: 0,
    };
    tabsRef.current = [...tabsRef.current, tab];
    rerender();
    return { tab, isNew: true };
  }, [rerender]);

  const activateTab = useCallback((id: string) => {
    if (activeIdRef.current === id) return;
    activeIdRef.current = id;
    rerender();
  }, [rerender]);

  // ── Close — returns next tab to show, or null if none remain ──────────────
  const closeTab = useCallback((id: string, wasActive: boolean): Tab | null => {
    const idx     = tabsRef.current.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const updated = tabsRef.current.filter((t) => t.id !== id);
    tabsRef.current = updated;

    if (updated.length === 0) {
      activeIdRef.current = null;
      rerender();
      return null;
    }

    // If we closed the active tab, pick the neighbour
    if (wasActive) {
      const nextTab = updated[Math.min(idx, updated.length - 1)];
      activeIdRef.current = nextTab.id;
      rerender();
      return nextTab;
    }

    rerender();
    return null; 
  }, [rerender]);

  // ── Persist page/zoom into a tab ──────────────────────────────────────────
  const saveTabState = useCallback((
    id:         string,
    savedPage:  number,
    savedZoom:  number,
    totalPages: number,
  ) => {
    tabsRef.current = tabsRef.current.map((t) =>
      t.id === id ? { ...t, savedPage, savedZoom, totalPages } : t
    );
    // No rerender needed — this is a background state save
  }, []);

  return { tabs, activeId, openTab, activateTab, closeTab, saveTabState };
}
