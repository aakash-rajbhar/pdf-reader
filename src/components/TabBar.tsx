import { useRef, useEffect } from "react";
import { X, Plus } from "lucide-react";
import type { Tab } from "../hooks/useTabs";
import styles from "./TabBar.module.css";

interface TabBarProps {
  tabs:         Tab[];
  activeId:     string | null;
  onActivate:   (id: string) => void;
  onClose:      (id: string) => void;
  onNewTab:     () => void;
}

export function TabBar({ tabs, activeId, onActivate, onClose, onNewTab }: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (!activeId || !scrollRef.current) return;
    const el = scrollRef.current.querySelector<HTMLButtonElement>(
      `[data-id="${activeId}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeId]);

  if (tabs.length === 0) return null;

  return (
    <div className={styles.bar}>
      <div className={styles.tabList} ref={scrollRef}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          // Trim long filenames — remove .pdf extension for cleanliness
          const label = tab.fileName.replace(/\.pdf$/i, "");
          const display = label.length > 28 ? label.slice(0, 26) + "…" : label;

          return (
            <div
              key={tab.id}
              className={`${styles.tab} ${isActive ? styles.active : ""}`}
            >
              <button
                className={styles.tabLabel}
                data-id={tab.id}
                onClick={() => onActivate(tab.id)}
                title={tab.fileName}
              >
                <span className={styles.tabDot} />
                <span className={styles.tabName}>{display}</span>
              </button>
              <button
                className={styles.tabClose}
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                title="Close tab"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>

      {/* New tab button */}
      <button className={styles.newTab} onClick={onNewTab} title="Open new PDF">
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
