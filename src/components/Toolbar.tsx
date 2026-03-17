import { useRef, useState, KeyboardEvent } from "react";
import {
  FolderOpen,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  RotateCcw,
  Maximize2,
  Search,
} from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import styles from "./Toolbar.module.css";

interface ToolbarProps {
  isLoaded: boolean;
  fileName: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  zoomMin: number;
  zoomMax: number;
  onOpenFile: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onGoToPage: (page: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoomSet: (zoom: number) => void;
  onFitToWidth: () => void;
  onOpenSearch: () => void;
}

export function Toolbar({
  isLoaded,
  fileName,
  currentPage,
  totalPages,
  zoom,
  zoomMin,
  zoomMax,
  onOpenFile,
  onPrevPage,
  onNextPage,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onZoomSet,
  onFitToWidth,
  onOpenSearch,
}: ToolbarProps) {
  const { theme, toggleTheme } = useTheme();
  const [pageInput, setPageInput] = useState("");
  const [zoomInput, setZoomInput] = useState("");
  const [editingPage, setEditingPage] = useState(false);
  const [editingZoom, setEditingZoom] = useState(false);
  const pageRef = useRef<HTMLInputElement>(null);
  const zoomRef = useRef<HTMLInputElement>(null);

  // ── Page input ──────────────────────────────────────────────────────────────
  const handlePageClick = () => {
    setPageInput(String(currentPage));
    setEditingPage(true);
    setTimeout(() => pageRef.current?.select(), 0);
  };
  const commitPage = () => {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n)) onGoToPage(n);
    setEditingPage(false);
  };
  const handlePageKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") commitPage();
    if (e.key === "Escape") setEditingPage(false);
  };

  // ── Zoom input ──────────────────────────────────────────────────────────────
  const handleZoomClick = () => {
    setZoomInput(String(Math.round(zoom * 100)));
    setEditingZoom(true);
    setTimeout(() => zoomRef.current?.select(), 0);
  };
  const commitZoom = () => {
    const n = parseFloat(zoomInput);
    if (!isNaN(n)) onZoomSet(n / 100);
    setEditingZoom(false);
  };
  const handleZoomKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") commitZoom();
    if (e.key === "Escape") setEditingZoom(false);
  };

  const zoomPercent = Math.round(zoom * 100);
  const canPrev = isLoaded && currentPage > 1;
  const canNext = isLoaded && currentPage < totalPages;
  const canZoomOut = isLoaded && zoom > zoomMin;
  const canZoomIn = isLoaded && zoom < zoomMax;
  const displayName =
    fileName.length > 40 ? "…" + fileName.slice(-37) : fileName;

  return (
    <div className={styles.toolbar}>
      {/* ── Left: Open + Filename ── */}
      <div className={styles.section}>
        <button
          className={styles.openBtn}
          onClick={onOpenFile}
          title="Open PDF (Ctrl+O)"
        >
          <FolderOpen size={15} strokeWidth={2} />
          <span>Open</span>
        </button>
        {isLoaded && (
          <span className={styles.fileName} title={fileName}>
            {displayName}
          </span>
        )}
      </div>

      {/* ── Center: Navigation + Zoom + Search ── */}
      {isLoaded && (
        <div className={styles.center}>
          {/* Page navigation */}
          <div className={styles.group}>
            <button
              className={styles.iconBtn}
              onClick={onPrevPage}
              disabled={!canPrev}
              title="Previous page (←)"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>

            <div className={styles.pageIndicator}>
              {editingPage ? (
                <input
                  ref={pageRef}
                  className={styles.numInput}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onBlur={commitPage}
                  onKeyDown={handlePageKey}
                  style={{ width: "42px" }}
                />
              ) : (
                <button
                  className={styles.numBtn}
                  onClick={handlePageClick}
                  title="Click to jump to page"
                >
                  {currentPage}
                </button>
              )}
              <span className={styles.pageOf}>/ {totalPages}</span>
            </div>

            <button
              className={styles.iconBtn}
              onClick={onNextPage}
              disabled={!canNext}
              title="Next page (→)"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className={styles.divider} />

          {/* Zoom controls */}
          <div className={styles.group}>
            <button
              className={styles.iconBtn}
              onClick={onZoomOut}
              disabled={!canZoomOut}
              title="Zoom out (-)"
            >
              <ZoomOut size={15} strokeWidth={2} />
            </button>

            {editingZoom ? (
              <div className={styles.zoomInputWrap}>
                <input
                  ref={zoomRef}
                  className={styles.numInput}
                  value={zoomInput}
                  onChange={(e) => setZoomInput(e.target.value)}
                  onBlur={commitZoom}
                  onKeyDown={handleZoomKey}
                  style={{ width: "46px" }}
                />
                <span className={styles.pct}>%</span>
              </div>
            ) : (
              <button
                className={styles.numBtn}
                onClick={handleZoomClick}
                title="Click to set zoom"
              >
                {zoomPercent}%
              </button>
            )}

            <button
              className={styles.iconBtn}
              onClick={onZoomIn}
              disabled={!canZoomIn}
              title="Zoom in (+)"
            >
              <ZoomIn size={15} strokeWidth={2} />
            </button>

            <button
              className={styles.iconBtn}
              onClick={onZoomFit}
              title="Reset zoom (Ctrl+0)"
            >
              <RotateCcw size={13} strokeWidth={2} />
            </button>

            <button
              className={styles.iconBtn}
              onClick={onFitToWidth}
              title="Fit to width (W)"
            >
              <Maximize2 size={13} strokeWidth={2} />
            </button>
          </div>

          <div className={styles.divider} />

          {/* Search */}
          <button
            className={styles.iconBtn}
            onClick={onOpenSearch}
            title="Search in document (Ctrl+F)"
          >
            <Search size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* ── Right: Theme toggle ── */}
      <div className={styles.section} style={{ justifyContent: "flex-end" }}>
        <button
          className={styles.themeBtn}
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun size={15} strokeWidth={2} />
          ) : (
            <Moon size={15} strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}
