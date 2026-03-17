import { useRef, useCallback, useEffect } from "react";
import React from "react";
import { ThemeProvider } from "./hooks/useTheme";
import { usePDF } from "./hooks/usePDF";
import { useRecents } from "./hooks/useRecents";
import { Toolbar } from "./components/Toolbar";
import { PDFViewer } from "./components/PDFViewer";
import { StatusBar } from "./components/StatusBar";
import { SearchBar } from "./components/SearchBar";
import styles from "./App.module.css";

const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function PDFApp() {
  const canvasRef = useRef<HTMLCanvasElement>(
    null,
  ) as React.RefObject<HTMLCanvasElement>;
  const textLayerRef = useRef<HTMLDivElement>(
    null,
  ) as React.RefObject<HTMLDivElement>;
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    state,
    loadPDF,
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

  // ── Track page changes and persist to recents ──────────────────────────────
  useEffect(() => {
    if (state.isLoaded && state.fileName) {
      updateRecentPage(state.fileName, state.currentPage, state.totalPages);
    }
  }, [
    state.currentPage,
    state.isLoaded,
    state.fileName,
    state.totalPages,
    updateRecentPage,
  ]);

  // ── Core load helper (shared by open dialog + reopen recent) ───────────────
  const loadFromPath = useCallback(
    async (filePath: string, fileName: string) => {
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(filePath);
        const buffer = bytes.buffer as ArrayBuffer;
        await loadPDF(buffer, fileName);
        addRecent({ fileName, filePath, lastPage: 1, totalPages: 0 });
      } catch (err) {
        console.error("Failed to open file:", err);
      }
    },
    [loadPDF, addRecent],
  );

  // ── Open file via dialog ───────────────────────────────────────────────────
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
        await loadPDF(await file.arrayBuffer(), file.name);
        addRecent({
          fileName: file.name,
          filePath: "",
          lastPage: 1,
          totalPages: 0,
        });
      };
      input.click();
    }
  }, [loadPDF, loadFromPath, addRecent]);

  // ── Re-open a recent file ──────────────────────────────────────────────────
  const handleOpenRecent = useCallback(
    async (filePath: string, fileName: string) => {
      if (IS_TAURI && filePath) {
        await loadFromPath(filePath, fileName);
      } else {
        // Browser: no stored path — trigger open dialog
        handleOpenFile();
      }
    },
    [loadFromPath, handleOpenFile],
  );

  // ── Fit to width ───────────────────────────────────────────────────────────
  const handleFitToWidth = useCallback(() => {
    const w = containerRef.current?.clientWidth ?? window.innerWidth;
    fitToWidth(w);
  }, [fitToWidth]);

  // ── Global keyboard shortcuts ──────────────────────────────────────────────
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
      if (e.key === "w" && state.isLoaded) {
        e.preventDefault();
        handleFitToWidth();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSearch, handleOpenFile, handleFitToWidth, state.isLoaded]);

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
