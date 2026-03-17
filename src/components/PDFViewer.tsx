import {
  useRef,
  useEffect,
  useCallback,
  RefObject,
  forwardRef,
  type MutableRefObject,
} from "react";
import { type RecentFile } from "../hooks/useRecents";
import styles from "./PDFViewer.module.css";

interface PDFViewerProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  textLayerRef: RefObject<HTMLDivElement>;
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomSet: (zoom: number) => void;
  onOpenFile: () => void;
  onNextPage: () => void;
  onPrevPage: () => void;
  recents: RecentFile[];
  onOpenRecent: (filePath: string, fileName: string) => void;
  onRemoveRecent: (fileName: string) => void;
}

export const PDFViewer = forwardRef<HTMLDivElement, PDFViewerProps>(
  function PDFViewer(
    {
      canvasRef,
      textLayerRef,
      isLoaded,
      isLoading,
      error,
      zoom,
      onZoomIn,
      onZoomOut,
      onZoomSet,
      onOpenFile,
      onNextPage,
      onPrevPage,
      recents,
      onOpenRecent,
      onRemoveRecent,
    }: PDFViewerProps,
    ref:
      | ((node: HTMLDivElement | null) => void)
      | MutableRefObject<HTMLDivElement | null>
      | null,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

    // ── Wheel: zoom with Ctrl, scroll otherwise ──
    const handleWheel = useCallback(
      (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          onZoomSet(Math.max(0.25, Math.min(4.0, zoom + delta)));
        }
      },
      [zoom, onZoomSet],
    );

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      el.addEventListener("wheel", handleWheel, { passive: false });
      return () => el.removeEventListener("wheel", handleWheel);
    }, [handleWheel]);

    // ── Drag to pan ──
    const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const el = containerRef.current;
      if (!el) return;
      isDragging.current = true;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      };
      el.style.cursor = "grabbing";
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      const el = containerRef.current;
      if (!el) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      el.scrollLeft = dragStart.current.scrollLeft - dx;
      el.scrollTop = dragStart.current.scrollTop - dy;
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      const el = containerRef.current;
      if (el) el.style.cursor = "";
    };

    // ── Keyboard shortcuts ──
    useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        switch (e.key) {
          case "ArrowRight":
          case "ArrowDown":
          case " ":
            e.preventDefault();
            onNextPage();
            break;
          case "ArrowLeft":
          case "ArrowUp":
            e.preventDefault();
            onPrevPage();
            break;
          case "+":
          case "=":
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              onZoomIn();
            }
            break;
          case "-":
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              onZoomOut();
            }
            break;
          case "0":
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              onZoomSet(1.0);
            }
            break;
          case "o":
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              onOpenFile();
            }
            break;
        }
      };
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }, [onNextPage, onPrevPage, onZoomIn, onZoomOut, onZoomSet, onOpenFile]);

    return (
      <div
        ref={(node) => {
          // Attach both the forwarded ref and internal ref
          (containerRef as MutableRefObject<HTMLDivElement | null>).current =
            node;
          if (typeof ref === "function") ref(node);
          else if (ref)
            (ref as MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={styles.container}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* ── Empty state ── */}
        {!isLoaded && !isLoading && !error && (
          <EmptyState
            onOpenFile={onOpenFile}
            recents={recents}
            onOpenRecent={onOpenRecent}
            onRemoveRecent={onRemoveRecent}
          />
        )}

        {/* ── Loading spinner ── */}
        {isLoading && <LoadingState />}

        {/* ── Error ── */}
        {error && <ErrorState message={error} onRetry={onOpenFile} />}

        {/* ── Canvas ── */}
        {(isLoaded || isLoading) && (
          <div className={styles.canvasWrap}>
            <div className={styles.pageShadow}>
              <div style={{ position: "relative", lineHeight: 0 }}>
                <canvas
                  ref={canvasRef}
                  className={styles.canvas}
                  style={{
                    opacity: isLoading ? 0.3 : 1,
                    transition: "opacity 200ms ease",
                  }}
                />
                <div ref={textLayerRef} className={styles.textLayer} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

// ─── Empty State ───────────────────────────────────────────
// ─── Empty State ───────────────────────────────────────────
function EmptyState({
  onOpenFile,
  recents,
  onOpenRecent,
  onRemoveRecent,
}: {
  onOpenFile: () => void;
  recents: import("../hooks/useRecents").RecentFile[];
  onOpenRecent: (filePath: string, fileName: string) => void;
  onRemoveRecent: (fileName: string) => void;
}) {
  const hasRecents = recents.length > 0;

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyHero}>
        <div className={styles.emptyIcon}>
          <svg width="40" height="48" viewBox="0 0 56 64" fill="none">
            <rect
              x="1"
              y="1"
              width="54"
              height="62"
              rx="5"
              fill="none"
              stroke="var(--border)"
              strokeWidth="1.5"
            />
            <rect
              x="1"
              y="1"
              width="54"
              height="62"
              rx="5"
              fill="var(--bg-button)"
              fillOpacity="0.4"
            />
            <path
              d="M36 1v14a2 2 0 002 2h14"
              stroke="var(--border)"
              strokeWidth="1.5"
            />
            <rect
              x="12"
              y="26"
              width="32"
              height="2"
              rx="1"
              fill="var(--border)"
            />
            <rect
              x="12"
              y="34"
              width="24"
              height="2"
              rx="1"
              fill="var(--border)"
            />
            <rect
              x="12"
              y="42"
              width="20"
              height="2"
              rx="1"
              fill="var(--border)"
            />
          </svg>
        </div>
        <h2 className={styles.emptyTitle}>PDF Reader</h2>
        <p className={styles.emptySubtitle}>Fast, minimal, distraction-free</p>
        <button className={styles.emptyBtn} onClick={onOpenFile}>
          Open PDF
        </button>
        <p className={styles.emptyHint}>Ctrl+O</p>
      </div>

      {hasRecents && (
        <div className={styles.recentsWrap}>
          <p className={styles.recentsLabel}>Recent</p>
          <div className={styles.recentsList}>
            {recents.map((r) => (
              <div key={r.fileName} className={styles.recentRow}>
                <button
                  className={styles.recentMain}
                  onClick={() => onOpenRecent(r.filePath, r.fileName)}
                  title={r.filePath || r.fileName}
                >
                  <div className={styles.recentFileIcon}>
                    <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                      <rect
                        x="0.5"
                        y="0.5"
                        width="13"
                        height="15"
                        rx="2"
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth="1"
                      />
                      <path
                        d="M9 0.5v3.5a1 1 0 001 1h3.5"
                        stroke="var(--border)"
                        strokeWidth="1"
                      />
                      <rect
                        x="2"
                        y="7"
                        width="7"
                        height="1"
                        rx="0.5"
                        fill="var(--text-muted)"
                      />
                      <rect
                        x="2"
                        y="9.5"
                        width="5"
                        height="1"
                        rx="0.5"
                        fill="var(--text-muted)"
                      />
                      <rect
                        x="2"
                        y="12"
                        width="4"
                        height="1"
                        rx="0.5"
                        fill="var(--text-muted)"
                      />
                    </svg>
                  </div>
                  <div className={styles.recentInfo}>
                    <span className={styles.recentName}>{r.fileName}</span>
                    <span className={styles.recentMeta}>
                      {r.totalPages > 0
                        ? `Page ${r.lastPage} of ${r.totalPages}`
                        : ""}
                      {r.totalPages > 0 ? " · " : ""}
                      {formatDate(r.openedAt)}
                    </span>
                  </div>
                </button>
                <button
                  className={styles.recentRemove}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveRecent(r.fileName);
                  }}
                  title="Remove from recents"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Loading State ─────────────────────────────────────────
function LoadingState() {
  return (
    <div className={styles.loadingState}>
      <div className={styles.spinner} />
      <p className={styles.loadingText}>Loading document…</p>
    </div>
  );
}

// ─── Error State ───────────────────────────────────────────
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className={styles.errorState}>
      <div className={styles.errorIcon}>⚠</div>
      <h3 className={styles.errorTitle}>Failed to load PDF</h3>
      <p className={styles.errorMessage}>{message}</p>
      <button className={styles.emptyBtn} onClick={onRetry}>
        Try another file
      </button>
    </div>
  );
}
