import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ─── Constants ───────────────────────────────────────────────────────────────

const ZOOM_MIN         = 0.25;
const ZOOM_MAX         = 4.0;
const ZOOM_STEP        = 0.25;
const ZOOM_DEBOUNCE_MS = 150;
const CACHE_RANGE      = 2;
const CACHE_MAX        = 20;
const SEARCH_DEBOUNCE  = 400;
const LS_PAGE_PREFIX   = "pdfr:page:";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PDFState {
  isLoaded:    boolean;
  isLoading:   boolean;
  error:       string | null;
  totalPages:  number;
  currentPage: number;
  zoom:        number;
  fileName:    string;
  loadId:      number;
}

export interface SearchState {
  isOpen:       boolean;
  query:        string;
  results:      number[];   // page numbers that contain the query
  currentIndex: number;     // index into results[]
  isSearching:  boolean;
}

const INITIAL_PDF_STATE: PDFState = {
  isLoaded:    false,
  isLoading:   false,
  error:       null,
  totalPages:  0,
  currentPage: 1,
  zoom:        1.0,
  fileName:    "",
  loadId:      0,
};

const INITIAL_SEARCH_STATE: SearchState = {
  isOpen:       false,
  query:        "",
  results:      [],
  currentIndex: -1,
  isSearching:  false,
};

// ─── Text highlight helpers ───────────────────────────────────────────────────

function applyHighlights(container: HTMLDivElement, query: string) {
  const lq = query.toLowerCase();
  container.querySelectorAll<HTMLSpanElement>("span").forEach((span) => {
    if (span.textContent?.toLowerCase().includes(lq)) {
      span.style.backgroundColor = "rgba(255, 210, 0, 0.45)";
      span.style.color            = "#000";
      span.style.borderRadius     = "2px";
      span.dataset.highlight      = "true";
    } else {
      span.style.removeProperty("background-color");
      span.style.removeProperty("color");
      span.style.removeProperty("border-radius");
      delete span.dataset.highlight;
    }
  });
}

function clearHighlights(container: HTMLDivElement) {
  container.querySelectorAll<HTMLSpanElement>("span").forEach((span) => {
    span.style.removeProperty("background-color");
    span.style.removeProperty("color");
    span.style.removeProperty("border-radius");
  });
}
function scrollToFirstHighlight(container: HTMLDivElement) {
  const first = container.querySelector<HTMLSpanElement>(
    "span[data-highlight='true]"
  );
  if (first) {
    first.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePDF(
  canvasRef:    React.RefObject<HTMLCanvasElement>,
  textLayerRef: React.RefObject<HTMLDivElement>
) {
  const [state,        setState]        = useState<PDFState>(INITIAL_PDF_STATE);
  const [searchState,  setSearchState]  = useState<SearchState>(INITIAL_SEARCH_STATE);

  const docRef          = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef   = useRef<pdfjsLib.RenderTask | null>(null);
  const renderTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageCache       = useRef<Map<string, ImageBitmap>>(new Map());
  const textCache       = useRef<Map<number, string>>(new Map());  // page text for search
  const docGenRef       = useRef<number>(0);
  const searchAbortRef  = useRef<boolean>(false);
  const searchQueryRef  = useRef<string>("");

  // ── Helpers ────────────────────────────────────────────────────────────────

  const clearRenderTimer = () => {
    if (renderTimerRef.current) { clearTimeout(renderTimerRef.current); renderTimerRef.current = null; }
  };

  const cancelActiveRender = () => {
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
  };

  const evictCache = () => {
    if (pageCache.current.size > CACHE_MAX) {
      const oldest = pageCache.current.keys().next().value;
      if (oldest) { pageCache.current.get(oldest)?.close(); pageCache.current.delete(oldest); }
    }
  };

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadPDF = useCallback(async (buffer: ArrayBuffer, fileName: string) => {
    cancelActiveRender();
    clearRenderTimer();
    searchAbortRef.current = true;

    if (docRef.current) {
      await docRef.current.destroy();
      docRef.current = null;
      pageCache.current.forEach((bmp) => bmp.close());
      pageCache.current.clear();
      textCache.current.clear();
    }

    docGenRef.current += 1;

    setState((s) => ({ ...s, isLoading: true, error: null, fileName }));
    setSearchState(INITIAL_SEARCH_STATE);
    searchQueryRef.current = "";

    try {
      const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
      docRef.current = doc;

      // Restore last-read page from localStorage
      const saved    = localStorage.getItem(`${LS_PAGE_PREFIX}${fileName}`);
      const startPage = saved
        ? Math.min(Math.max(1, parseInt(saved) || 1), doc.numPages)
        : 1;

      setState((s) => ({
        isLoaded:    true,
        isLoading:   false,
        error:       null,
        totalPages:  doc.numPages,
        currentPage: startPage,
        zoom:        1.0,
        fileName,
        loadId:      s.loadId + 1,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load PDF",
      }));
    }
  }, []);

  // ── Persist last-read page ─────────────────────────────────────────────────

  useEffect(() => {
    if (state.isLoaded && state.fileName) {
      localStorage.setItem(`${LS_PAGE_PREFIX}${state.fileName}`, String(state.currentPage));
    }
  }, [state.currentPage, state.isLoaded, state.fileName]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderPage = useCallback(async (pageNum: number, zoom: number) => {
    const doc    = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    const generation = docGenRef.current;
    cancelActiveRender();

    const cacheKey = `${pageNum}-${zoom.toFixed(2)}`;
    const cached   = pageCache.current.get(cacheKey);

    if (cached && docGenRef.current === generation) {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = cached.width;
      canvas.height = cached.height;
      canvas.style.width  = `${cached.width  / dpr}px`;
      canvas.style.height = `${cached.height / dpr}px`;
      ctx.drawImage(cached, 0, 0);
      renderTextLayer(doc, pageNum, zoom, generation);
      return;
    }

    try {
      const page = await doc.getPage(pageNum);
      const dpr      = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: zoom * dpr });

      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width  = `${viewport.width  / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;

      try {
        const bitmap = await createImageBitmap(canvas);
        if (docGenRef.current === generation) {
          evictCache();
          pageCache.current.set(cacheKey, bitmap);
        } else {
          bitmap.close();
          return;
        }
      } catch { /* non-critical */ }

      renderTextLayer(doc, pageNum, zoom, generation);
      prefetchAdjacentPages(doc, pageNum, zoom, doc.numPages, generation);

    } catch (err: unknown) {
      const isCancelled =
        err instanceof Error &&
        (err.message.includes("cancelled") || err.message.includes("canceled"));
      if (!isCancelled) console.error("PDF render error:", err);
    }
  }, [canvasRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Text layer ─────────────────────────────────────────────────────────────

  async function renderTextLayer(
    doc:        pdfjsLib.PDFDocumentProxy,
    pageNum:    number,
    zoom:       number,
    generation: number
  ) {
    const container = textLayerRef.current;
    if (!container || docGenRef.current !== generation) return;

    try {
      const page        = await doc.getPage(pageNum);
      const viewport    = page.getViewport({ scale: zoom });
      const textContent = await page.getTextContent();

      if (docGenRef.current !== generation) return;

      container.innerHTML    = "";
      container.style.width  = `${viewport.width}px`;
      container.style.height = `${viewport.height}px`;

      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container,
        viewport,
      });
      await textLayer.render();

      await new Promise<void>((r) => setTimeout(r, 0));

      // Re-apply search highlights if search is active
      if (searchQueryRef.current && docGenRef.current === generation) {
        applyHighlights(container, searchQueryRef.current);
        scrollToFirstHighlight(container);
      }
    } catch { /* non-critical */ }
  }

  // ── Background prefetch ────────────────────────────────────────────────────

  async function prefetchAdjacentPages(
    doc:        pdfjsLib.PDFDocumentProxy,
    current:    number,
    zoom:       number,
    total:      number,
    generation: number
  ) {
    const offscreen = document.createElement("canvas");

    for (let delta = 1; delta <= CACHE_RANGE; delta++) {
      for (const dir of [1, -1]) {
        const pageNum = current + dir * delta;
        if (pageNum < 1 || pageNum > total) continue;
        if (docGenRef.current !== generation) return;

        const cacheKey = `${pageNum}-${zoom.toFixed(2)}`;
        if (pageCache.current.has(cacheKey)) continue;

        try {
          const page     = await doc.getPage(pageNum);
          const dpr      = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: zoom * dpr });

          offscreen.width  = viewport.width;
          offscreen.height = viewport.height;

          const ctx = offscreen.getContext("2d");
          if (!ctx) continue;

          await page.render({ canvasContext: ctx, viewport }).promise;

          if (docGenRef.current !== generation) return;

          const bitmap = await createImageBitmap(offscreen);
          if (docGenRef.current === generation) {
            evictCache();
            pageCache.current.set(cacheKey, bitmap);
          } else {
            bitmap.close();
          }
        } catch { /* silent */ }
      }
    }
  }

  // ── Trigger renders ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.isLoaded) return;

    const isZoomChange = renderTimerRef.current !== null;
    clearRenderTimer();

    renderTimerRef.current = setTimeout(() => {
      renderTimerRef.current = null;
      renderPage(state.currentPage, state.zoom);
    }, isZoomChange ? ZOOM_DEBOUNCE_MS : 0);

    return clearRenderTimer;
  }, [state.currentPage, state.zoom, state.isLoaded, state.loadId, renderPage]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goToPage = useCallback((page: number) => {
    setState((s) => ({
      ...s,
      currentPage: Math.max(1, Math.min(page, s.totalPages)),
    }));
  }, []);

  const nextPage = useCallback(
    () => setState((s) => ({ ...s, currentPage: Math.min(s.currentPage + 1, s.totalPages) })),
    []
  );

  const prevPage = useCallback(
    () => setState((s) => ({ ...s, currentPage: Math.max(s.currentPage - 1, 1) })),
    []
  );

  const firstPage = useCallback(
    () => setState((s) => ({ ...s, currentPage: 1 })),
    []
  );

  const lastPage = useCallback(
    () => setState((s) => ({ ...s, currentPage: s.totalPages })),
    []
  );

  // ── Zoom ───────────────────────────────────────────────────────────────────

  const setZoom = useCallback((zoom: number) => {
    setState((s) => ({
      ...s,
      zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom)),
    }));
  }, []);

  const zoomIn  = useCallback(() => setZoom(state.zoom + ZOOM_STEP), [state.zoom, setZoom]);
  const zoomOut = useCallback(() => setZoom(state.zoom - ZOOM_STEP), [state.zoom, setZoom]);
  const zoomFit = useCallback(() => setZoom(1.0), [setZoom]);

  // Fit page to container width
  const fitToWidth = useCallback(async (containerWidth: number) => {
    const doc = docRef.current;
    if (!doc || !state.isLoaded) return;
    try {
      const page     = await doc.getPage(state.currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const padding  = 64; // matches canvasWrap padding (32px each side)
      setZoom((containerWidth - padding) / viewport.width);
    } catch { /* skip */ }
  }, [state.currentPage, state.isLoaded, setZoom]);

  // ── Search ─────────────────────────────────────────────────────────────────

  const openSearch = useCallback(() => {
    setSearchState((s) => ({ ...s, isOpen: true }));
  }, []);

  const closeSearch = useCallback(() => {
    searchAbortRef.current = true;
    searchQueryRef.current = "";
    setSearchState(INITIAL_SEARCH_STATE);
    if (textLayerRef.current) clearHighlights(textLayerRef.current);
  }, [textLayerRef]);

  // Internal: run the actual search across all pages
  const runSearch = useCallback(async (query: string) => {
    const doc = docRef.current;
    if (!doc) return;

    searchAbortRef.current = false;
    const generation = docGenRef.current;

    setSearchState((s) => ({ ...s, isSearching: true, results: [], currentIndex: -1 }));

    // Build text cache lazily and search simultaneously
    const results: number[] = [];

    for (let p = 1; p <= doc.numPages; p++) {
      if (searchAbortRef.current || docGenRef.current !== generation) return;

      try {
        let pageText = textCache.current.get(p);
        if (!pageText) {
          const page        = await doc.getPage(p);
          const textContent = await page.getTextContent();
          pageText = textContent.items
            .map((item: unknown) =>
              typeof item === "object" && item !== null && "str" in item
                ? (item as { str: string }).str
                : ""
            )
            .join(" ");
          textCache.current.set(p, pageText);
        }

        if (pageText.toLowerCase().includes(query.toLowerCase())) {
          results.push(p);
        }
      } catch { /* skip page */ }
    }

    if (searchAbortRef.current || docGenRef.current !== generation) return;

    const firstMatch = results.length > 0 ? 0 : -1;
    setSearchState((s) => ({ ...s, results, currentIndex: firstMatch, isSearching: false }));

    if (results.length > 0) goToPage(results[0]);
  }, [goToPage]);

  // Debounced public search entry point
  const searchPDF = useCallback((query: string) => {
    searchQueryRef.current = query;
    setSearchState((s) => ({ ...s, query }));

    // Abort any in-progress search
    searchAbortRef.current = true;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!query.trim()) {
      setSearchState((s) => ({ ...s, query, results: [], currentIndex: -1, isSearching: false }));
      if (textLayerRef.current) clearHighlights(textLayerRef.current);
      return;
    }

    searchTimerRef.current = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE);
  }, [runSearch, textLayerRef]);

  const goToNextMatch = useCallback(() => {
    setSearchState((s) => {
      if (s.results.length === 0) return s;
      return { ...s, currentIndex: (s.currentIndex + 1) % s.results.length };
    });
  }, []);

  const goToPrevMatch = useCallback(() => {
    setSearchState((s) => {
      if (s.results.length === 0) return s;
      return { ...s, currentIndex: (s.currentIndex - 1 + s.results.length) % s.results.length };
    });
  }, []);

  // Navigate page when search match index changes
  useEffect(() => {
    if (searchState.results.length === 0 || searchState.currentIndex < 0) return;
    const targetPage = searchState.results[searchState.currentIndex];
    
    if (targetPage === state.currentPage) {
      // Already on this page — just scroll to the highlight directly
      const container = textLayerRef.current;
      if (container) scrollToFirstHighlight(container);
    } else {
      goToPage(targetPage);
      // scrollToFirstHighlight will be called by renderTextLayer after re-render
    }
  }, [searchState.currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    // PDF state
    state,
    loadPDF,
    // Navigation
    goToPage, nextPage, prevPage, firstPage, lastPage,
    // Zoom
    zoomIn, zoomOut, zoomFit, setZoom, fitToWidth,
    ZOOM_MIN, ZOOM_MAX,
    // Search
    searchState,
    openSearch, closeSearch, searchPDF,
    goToNextMatch, goToPrevMatch,
  };
}
