import { useEffect, useRef, type ReactNode } from "react";
import styles from "./TradingAnalyticsPage.module.css";
export function TradingAnalyticsDrawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      aria-labelledby="analytics-drawer-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header className={styles.toolbar}>
        <h2 id="analytics-drawer-title">{title}</h2>
        <button onClick={onClose} autoFocus>
          Close
        </button>
      </header>
      {children}
    </dialog>
  );
}
