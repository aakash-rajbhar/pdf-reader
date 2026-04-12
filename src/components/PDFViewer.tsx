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

// ─── Types ────────────────────────────────────────────────────────────────────

interface PDFViewerProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  textLayerRef: RefObject<HTMLDivElement>;
  isLoaded: boolean;
  isLoading: boolean;
  initializing: boolean;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export const PDFViewer = forwardRef<HTMLDivElement, PDFViewerProps>(
  function PDFViewer(
    {
      canvasRef,
      textLayerRef,
      isLoaded,
      isLoading,
      initializing,
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

    // ── Ctrl+Scroll to zoom ───────────────────────────────────────────────────

    const handleWheel = useCallback(
      (e: WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        onZoomSet(Math.max(0.25, Math.min(4.0, zoom + delta)));
      },
      [zoom, onZoomSet],
    );

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      el.addEventListener("wheel", handleWheel, { passive: false });
      return () => el.removeEventListener("wheel", handleWheel);
    }, [handleWheel]);

    // ── Drag to pan ───────────────────────────────────────────────────────────

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const el = containerRef.current;
        if (!el) return;
        if (textLayerRef.current?.contains(e.target as Node)) return;
        isDragging.current = true;
        dragStart.current = {
          x: e.clientX,
          y: e.clientY,
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
        };
        el.style.cursor = "grabbing";
      },
      [textLayerRef],
    );

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (!isDragging.current) return;
      const el = containerRef.current;
      if (!el) return;
      el.scrollLeft =
        dragStart.current.scrollLeft - (e.clientX - dragStart.current.x);
      el.scrollTop =
        dragStart.current.scrollTop - (e.clientY - dragStart.current.y);
    }, []);

    const handleMouseUp = useCallback(() => {
      isDragging.current = false;
      const el = containerRef.current;
      if (el) el.style.cursor = "";
    }, []);

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        const ctrl = e.ctrlKey || e.metaKey;
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
            if (ctrl) {
              e.preventDefault();
              onZoomIn();
            }
            break;
          case "-":
            if (ctrl) {
              e.preventDefault();
              onZoomOut();
            }
            break;
          case "0":
            if (ctrl) {
              e.preventDefault();
              onZoomSet(1.0);
            }
            break;
          case "o":
            if (ctrl) {
              e.preventDefault();
              onOpenFile();
            }
            break;
        }
      };
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }, [onNextPage, onPrevPage, onZoomIn, onZoomOut, onZoomSet, onOpenFile]);

    // ── Copy: sort text nodes by visual position ──────────────────────────────

    const handleCopy = useCallback(
      (e: React.ClipboardEvent) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0)
          return;

        const range = selection.getRangeAt(0);
        const container = textLayerRef.current;
        if (!container) return;

        const walker = document.createTreeWalker(
          range.commonAncestorContainer,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
              if (!container.contains(node)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            },
          },
        );

        const nodes: { text: string; rect: DOMRect }[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const span = node.parentElement;
          if (!span) continue;
          const rect = span.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          nodes.push({ text: node.textContent ?? "", rect });
        }

        if (nodes.length === 0) return;

        nodes.sort((a, b) => {
          const yDiff = a.rect.top - b.rect.top;
          if (Math.abs(yDiff) > 5) return yDiff;
          return a.rect.left - b.rect.left;
        });

        let result = "";
        for (let i = 0; i < nodes.length; i++) {
          if (i === 0) {
            result += nodes[i].text;
            continue;
          }
          const prev = nodes[i - 1].rect;
          const curr = nodes[i].rect;
          const newLine = curr.top - prev.bottom > 2;
          const hasGap = curr.left - prev.right > 3;
          if (newLine) {
            result += "\n" + nodes[i].text;
          } else if (
            hasGap &&
            !result.endsWith(" ") &&
            !nodes[i].text.startsWith(" ")
          ) {
            result += " " + nodes[i].text;
          } else {
            result += nodes[i].text;
          }
        }

        if (!result.trim()) return;
        e.clipboardData.setData("text/plain", result);
        e.preventDefault();
      },
      [textLayerRef],
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
      <div
        ref={(node) => {
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
        {/* ── Initializing / Empty ── */}
        {!isLoaded &&
          !isLoading &&
          !error &&
          (initializing ? (
            <InitializingState />
          ) : (
            <EmptyState
              onOpenFile={onOpenFile}
              recents={recents}
              onOpenRecent={onOpenRecent}
              onRemoveRecent={onRemoveRecent}
            />
          ))}

        {/* ── Loading ── */}
        {isLoading && <LoadingState />}

        {/* ── Error ── */}
        {!isLoaded && !!error && (
          <ErrorState message={error} onRetry={onOpenFile} />
        )}

        {/* ── PDF Canvas + Text Layer ── */}
        {(isLoaded || isLoading) && (
          <div className={styles.canvasWrap}>
            <div className={styles.pageShadow}>
              <div
                style={{
                  position: "relative",
                  lineHeight: 0,
                  overflow: "visible",
                }}
              >
                <canvas
                  ref={canvasRef}
                  className={styles.canvas}
                  style={{
                    opacity: isLoading || !isLoaded ? 0 : 1,
                    transition: "opacity 150ms ease",
                  }}
                />
                <div
                  ref={textLayerRef}
                  className={styles.textLayer}
                  onCopy={handleCopy}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);

// ─── Sub-components ───────────────────────────────────────────────────────────

function InitializingState() {
  return (
    <div className={styles.loadingState}>
      <div className={styles.spinner} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className={styles.loadingState}>
      <div className={styles.spinner} />
      <p className={styles.loadingText}>Loading document…</p>
    </div>
  );
}

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

function EmptyState({
  onOpenFile,
  recents,
  onOpenRecent,
  onRemoveRecent,
}: {
  onOpenFile: () => void;
  recents: RecentFile[];
  onOpenRecent: (filePath: string, fileName: string) => void;
  onRemoveRecent: (fileName: string) => void;
}) {
  const formatDate = (ts: number) => {
    const diff = Math.floor((Date.now() - ts) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return `${diff} days ago`;
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
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

      {recents.length > 0 && (
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
                      {r.totalPages > 0 &&
                        `Page ${r.lastPage} of ${r.totalPages} · `}
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
