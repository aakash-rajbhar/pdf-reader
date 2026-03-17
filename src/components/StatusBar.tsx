import styles from "./StatusBar.module.css";

interface StatusBarProps {
  isLoaded: boolean;
  currentPage: number;
  totalPages: number;
  zoom: number;
  fileName: string;
}

export function StatusBar({ isLoaded, currentPage, totalPages, zoom, fileName }: StatusBarProps) {
  if (!isLoaded) return null;

  const zoomPct = Math.round(zoom * 100);

  return (
    <div className={styles.bar}>
      <span className={styles.item}>
        Page {currentPage} of {totalPages}
      </span>
      <span className={styles.dot}>·</span>
      <span className={styles.item}>{zoomPct}%</span>
      {fileName && (
        <>
          <span className={styles.dot}>·</span>
          <span className={styles.item} style={{ color: "var(--text-muted)" }}>
            {fileName}
          </span>
        </>
      )}
      <span className={styles.hint}>
        Ctrl+Scroll to zoom · Drag to pan · ← → to navigate
      </span>
    </div>
  );
}
