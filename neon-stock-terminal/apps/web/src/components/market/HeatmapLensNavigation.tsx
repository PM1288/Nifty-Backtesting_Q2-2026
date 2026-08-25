import { NavLink } from "react-router-dom";
import styles from "./HeatmapLensNavigation.module.css";

const lenses = [
  ["Change", "/heatmap/change"],
  ["RSI", "/heatmap/rsi"],
  ["Williams %R", "/heatmap/will"]
] as const;

export function HeatmapLensNavigation({ coverage }: { coverage?: string }) {
  return (
    <nav className={styles.nav} aria-label="Heatmap metric lens">
      <div>
        <strong>Heatmaps</strong>
        <span>Stable instrument order · missing observations remain unavailable</span>
      </div>
      <div className={styles.lenses}>
        {lenses.map(([label, to]) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? styles.active : undefined}>{label}</NavLink>
        ))}
      </div>
      {coverage ? <span className={styles.coverage}>{coverage}</span> : null}
    </nav>
  );
}
