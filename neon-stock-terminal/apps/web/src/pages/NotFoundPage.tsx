import { Link } from "react-router-dom";
import { useI18n } from "../i18n/LocaleProvider";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  const { tr } = useI18n();

  return (
    <div className={styles.wrap}>
      <div className={styles.code}>404</div>
      <div className={styles.msg}>{tr("Page not found.")}</div>
      <Link to="/" className={styles.back}>
        {tr("Go to overview")}
      </Link>
    </div>
  );
}
