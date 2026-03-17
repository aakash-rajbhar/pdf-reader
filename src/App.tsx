import { useRef, useCallback, useEffect } from "react";
import React from "react";
import { ThemeProvider } from "./hooks/useTheme";
import { usePDF } from "./hooks/usePDF";
import { useRecents } from "./hooks/useRecents";
import { useTabs } from "./hooks/useTabs";
import { Toolbar } from "./components/Toolbar";
import { TabBar } from "./components/TabBar";
import { PDFViewer } from "./components/PDFViewer";
import { StatusBar } from "./components/StatusBar";
import { SearchBar } from "./components/SearchBar";
import styles from "./App.module.css";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Convert base64 string to ArrayBuffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function PDFApp() {
  const canvasRef = useRef<HTMLCanvasElement>(
    null,
  ) as React.RefObject<HTMLCanvasElement>;
  const textLayerRef = useRef<HTMLDivElement>(
    null,
  ) as React.RefObject<HTMLDivElement>;
  const containerRef = useRef<HTMLDivElement>(null);
  // Prevents writing stale page/zoom back to a tab during a switch
  const switchingRef = useRef(false);

  const {
    state,
    loadPDF,
    resetPDF,
    goToPage,
    nextPage,
    prevPage,
    zoomIn,
    zoomOut,
    zoomFit,
    setZoom,
    fitToWidth,
    ZOOM_MIN,
    ZOOM_MAX,
    searchState,
    openSearch,
    closeSearch,
    searchPDF,
    goToNextMatch,
    goToPrevMatch,
  } = usePDF(canvasRef, textLayerRef);

  const { recents, addRecent, updateRecentPage, removeRecent } = useRecents();
  const { tabs, activeId, openTab, activateTab, closeTab, saveTabState } =
    useTabs();

  // ── Persist page/zoom into active tab whenever viewer state changes ────────
  useEffect(() => {
    if (!activeId || !state.isLoaded || switchingRef.current) return;
    saveTabState(activeId, state.currentPage, state.zoom, state.totalPages);
    if (state.fileName) {
      updateRecentPage(state.fileName, state.currentPage, state.totalPages);
    }
  }, [
    state.currentPage,
    state.zoom,
    state.totalPages,
    state.isLoaded,
    activeId,
    saveTabState,
    updateRecentPage,
    state.fileName,
  ]);

  // ── Core: load a buffer, create/switch tab, render PDF ────────────────────
  const loadBuffer = useCallback(
    async (buffer: ArrayBuffer, fileName: string, filePath: string) => {
      // openTab is ref-based — always reads latest tabs, never stale
      const { tab, isNew } = openTab(fileName, filePath, buffer);
      activateTab(tab.id);

      if (!isNew) {
        // Already open — restore its saved position
        switchingRef.current = true;
        await loadPDF(tab.buffer, tab.fileName);
        goToPage(tab.savedPage);
        setZoom(tab.savedZoom);
        switchingRef.current = false;
      } else {
        // Fresh tab — load PDF (usePDF restores last page from localStorage)
        await loadPDF(buffer.slice(0), fileName);
        addRecent({ fileName, filePath, lastPage: 1, totalPages: 0 });
      }
    },
    [openTab, activateTab, loadPDF, goToPage, setZoom, addRecent],
  );

  // ── Load from OS file path (Tauri) ────────────────────────────────────────
  const loadFromPath = useCallback(
    async (filePath: string, fileName: string) => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const base64 = await invoke<string>("read_pdf_file", {
          path: filePath,
        });
        const buffer = base64ToBuffer(base64);
        await loadBuffer(buffer, fileName, filePath);
      } catch (err) {
        console.error("Failed to open file:", err);
      }
    },
    [loadBuffer],
  );

  // ── Open via file dialog ──────────────────────────────────────────────────
  const handleOpenFile = useCallback(async () => {
    if (IS_TAURI) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          multiple: false,
          filters: [{ name: "PDF Documents", extensions: ["pdf"] }],
        });
        if (!selected || typeof selected !== "string") return;
        const fileName = selected.split(/[/\\]/).pop() ?? "document.pdf";
        await loadFromPath(selected, fileName);
      } catch (err) {
        console.error("Tauri file open error:", err);
      }
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/pdf,.pdf";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const buffer = await file.arrayBuffer();
        await loadBuffer(buffer, file.name, "");
      };
      input.click();
    }
  }, [loadFromPath, loadBuffer]);

  // ── Re-open from recents list ─────────────────────────────────────────────
  const handleOpenRecent = useCallback(
    async (filePath: string, fileName: string) => {
      if (IS_TAURI && filePath) {
        await loadFromPath(filePath, fileName);
      } else {
        handleOpenFile();
      }
    },
    [loadFromPath, handleOpenFile],
  );

  // ── Switch to existing tab ────────────────────────────────────────────────
  const handleActivateTab = useCallback(
    async (id: string) => {
      if (id === activeId) return;
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      switchingRef.current = true;
      activateTab(id);
      await loadPDF(tab.buffer.slice(0), tab.fileName);
      goToPage(tab.savedPage);
      setZoom(tab.savedZoom);
      switchingRef.current = false;
    },
    [activeId, tabs, activateTab, loadPDF, goToPage, setZoom],
  );

  // ── Close a tab ───────────────────────────────────────────────────────────
  const handleCloseTab = useCallback(
    async (id: string) => {
      const nextTab = closeTab(id, id === activeId); // ref-based, always current

      if (nextTab) {
        // Closed active tab — load the neighbour
        switchingRef.current = true;
        await loadPDF(nextTab.buffer.slice(0), nextTab.fileName);
        goToPage(nextTab.savedPage);
        setZoom(nextTab.savedZoom);
        switchingRef.current = false;
      } else if (!nextTab) {
        // All tabs gone — return to home screen
        await resetPDF();
      }
    },
    [activeId, closeTab, loadPDF, goToPage, setZoom, resetPDF],
  );

  // ── Double-click / file association open (Tauri) ──────────────────────────
  useEffect(() => {
    if (!IS_TAURI) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<string>("open-file", async (event) => {
        const filePath = event.payload;
        if (!filePath?.toLowerCase().endsWith(".pdf")) return;
        const fileName = filePath.split(/[/\\]/).pop() ?? "document.pdf";
        await loadFromPath(filePath, fileName);
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => {
      unlisten?.();
    };
  }, [loadFromPath]);

  // ── Fit to width ──────────────────────────────────────────────────────────
  const handleFitToWidth = useCallback(() => {
    const w = containerRef.current?.clientWidth ?? window.innerWidth;
    fitToWidth(w);
  }, [fitToWidth]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.target instanceof HTMLInputElement) return;
      if (ctrl && e.key === "f") {
        e.preventDefault();
        openSearch();
      }
      if (ctrl && e.key === "o") {
        e.preventDefault();
        handleOpenFile();
      }
      if (ctrl && e.key === "w") {
        e.preventDefault();
        if (activeId) handleCloseTab(activeId);
      }
      if (!ctrl && e.key === "w" && state.isLoaded) {
        e.preventDefault();
        handleFitToWidth();
      }
      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        if (tabs.length < 2 || !activeId) return;
        const idx = tabs.findIndex((t) => t.id === activeId);
        const next = e.shiftKey
          ? tabs[(idx - 1 + tabs.length) % tabs.length]
          : tabs[(idx + 1) % tabs.length];
        handleActivateTab(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    openSearch,
    handleOpenFile,
    handleFitToWidth,
    handleCloseTab,
    handleActivateTab,
    state.isLoaded,
    activeId,
    tabs,
  ]);

  return (
    <div className={styles.app}>
      <Toolbar
        isLoaded={state.isLoaded}
        fileName={state.fileName}
        currentPage={state.currentPage}
        totalPages={state.totalPages}
        zoom={state.zoom}
        zoomMin={ZOOM_MIN}
        zoomMax={ZOOM_MAX}
        onOpenFile={handleOpenFile}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        onGoToPage={goToPage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
        onZoomSet={setZoom}
        onFitToWidth={handleFitToWidth}
        onOpenSearch={openSearch}
      />

      <TabBar
        tabs={tabs}
        activeId={activeId}
        onActivate={handleActivateTab}
        onClose={handleCloseTab}
        onNewTab={handleOpenFile}
      />

      {searchState.isOpen && (
        <SearchBar
          query={searchState.query}
          results={searchState.results}
          currentIndex={searchState.currentIndex}
          isSearching={searchState.isSearching}
          onSearch={searchPDF}
          onNext={goToNextMatch}
          onPrev={goToPrevMatch}
          onClose={closeSearch}
        />
      )}

      <PDFViewer
        ref={containerRef}
        canvasRef={canvasRef}
        textLayerRef={textLayerRef}
        isLoaded={state.isLoaded}
        isLoading={state.isLoading}
        error={state.error}
        zoom={state.zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomSet={setZoom}
        onOpenFile={handleOpenFile}
        onNextPage={nextPage}
        onPrevPage={prevPage}
        recents={recents}
        onOpenRecent={handleOpenRecent}
        onRemoveRecent={removeRecent}
      />

      <StatusBar
        isLoaded={state.isLoaded}
        currentPage={state.currentPage}
        totalPages={state.totalPages}
        zoom={state.zoom}
        fileName={state.fileName}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <PDFApp />
    </ThemeProvider>
  );
}
