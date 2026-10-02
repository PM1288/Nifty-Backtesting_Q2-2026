import { Link } from "react-router-dom";
import { useAuthGate } from "../auth/AuthGateProvider";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useI18n } from "../i18n/LocaleProvider";
import { routeCommandItems } from "../interaction/routeCatalog";
import { AnalyticsHeader } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

export function AnalyticsSystemMapPage() {
  const { authReady, user } = useAuthGate();
  const { tr } = useI18n();
  usePageLoadProfile({ pageName: "analytics_system_map", enabled: authReady, queries: [] });
  if (!authReady) return <div role="status">{tr("Loading…")}</div>;
  const seen = new Set<string>();
  const destinations = routeCommandItems(user?.role === "admin").filter((item) => {
    if (!item.to || item.to.includes("?") || item.to.startsWith("#") || item.to === "/analytics/system/map" || seen.has(item.to)) return false;
    seen.add(item.to);
    return true;
  });
  return <div className={styles.page}>
    <AnalyticsHeader title={tr("Workspace directory")} />
    <nav aria-label={tr("All pages")} className={styles.directory}>
      {destinations.map((item) => <Link key={item.id} to={item.to!}>{tr(item.label)}</Link>)}
    </nav>
  </div>;
}
