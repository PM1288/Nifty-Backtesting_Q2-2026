import { useI18n } from "../../i18n/LocaleProvider";
import styles from "./MarqueeText.module.css";

export function MarqueeText({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.viewport} aria-label={t("ui.disclaimerMarquee", "Disclaimer marquee")}>
      <div className={styles.track}>
        <span className={styles.text}>{text}</span>
        <span className={styles.text} aria-hidden="true">
          {text}
        </span>
      </div>
    </div>
  );
}
