import { useEffect, useState } from "react";
import { trackWidgetExpanded } from "../../analytics/events";
import { useI18n } from "../../i18n/LocaleProvider";
import styles from "./FooterDisclaimer.module.css";

export function FooterDisclaimer() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  const openDisclaimer = () => {
    void trackWidgetExpanded({
      widget_id: "footer_disclaimer",
      page_path: typeof window !== "undefined" ? window.location.pathname : "/"
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <aside
        className={styles.banner}
        role="contentinfo"
        aria-label={t("disclaimer.modalEyebrow", "Education only")}
        data-clarity-region="disclaimer_banner"
      >
        <div className={styles.bannerCopy}>
          <span className={styles.warning}>{t("disclaimer.bannerTitle", "Educational only")}</span>
          <p className={styles.copy}>{t("disclaimer.bannerCopy", "Not financial advice. Verify with licensed professionals. Do not trade from internet instructions alone.")}</p>
        </div>

        <button type="button" className={styles.readMore} onClick={openDisclaimer}>
          {t("ui.readMore", "Read more")}
        </button>
      </aside>

      {open ? (
        <div className={styles.modalLayer} role="presentation">
          <button type="button" className={styles.backdrop} aria-label={t("ui.close", "Close")} onClick={() => setOpen(false)} />

          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="education-disclaimer-title">
            <div className={styles.modalHeader}>
              <div className={styles.modalCopy}>
                <span className={styles.warning}>{t("disclaimer.modalEyebrow", "Education only")}</span>
                <h2 id="education-disclaimer-title" className={styles.modalTitle}>
                  {t("disclaimer.modalTitle", "Use this site for learning and market understanding, not for standalone trade decisions.")}
                </h2>
              </div>

              <button type="button" className={styles.closeButton} aria-label={t("ui.close", "Close")} onClick={() => setOpen(false)}>
                {t("ui.close", "Close")}
              </button>
            </div>

            <div className={styles.modalBody}>
              <p className={styles.modalText}>{t("disclaimer.bodyOne", "This site is for education and market understanding.")}</p>
              <p className={styles.modalText}>{t("disclaimer.bodyTwo", "No guarantee of accuracy; data may be delayed, incomplete, or incorrect.")}</p>
              <p className={styles.modalText}>{t("disclaimer.bodyThree", "Never risk money you cannot afford to lose.")}</p>

              <div className={styles.modalLinks} aria-label={t("ui.disclaimerLinks", "Disclaimer links")}>
                <a href="#disclaimer-terms" className={styles.modalLink}>
                  {t("ui.terms", "Terms")}
                </a>
                <a href="#disclaimer-privacy" className={styles.modalLink}>
                  {t("ui.privacy", "Privacy")}
                </a>
                <a href="#disclaimer-data-sources" className={styles.modalLink}>
                  {t("ui.dataSources", "Data Sources")}
                </a>
              </div>

              <div className={styles.legalGrid}>
                <section id="disclaimer-terms" className={styles.legalCard}>
                  <h3 className={styles.legalTitle}>{t("ui.terms", "Terms")}</h3>
                  <p className={styles.legalText}>{t("disclaimer.termsBody", "This dashboard is informational. You are responsible for how you interpret and use the information shown here.")}</p>
                </section>

                <section id="disclaimer-privacy" className={styles.legalCard}>
                  <h3 className={styles.legalTitle}>{t("ui.privacy", "Privacy")}</h3>
                  <p className={styles.legalText}>{t("disclaimer.privacyBody", "Session state may affect live views, but that does not change the educational-only nature of the product.")}</p>
                </section>

                <section id="disclaimer-data-sources" className={styles.legalCard}>
                  <h3 className={styles.legalTitle}>{t("ui.dataSources", "Data Sources")}</h3>
                  <p className={styles.legalText}>{t("disclaimer.sourcesBody", "Market data and derived indicators can lag, revise, or fail. Cross-check important decisions independently.")}</p>
                </section>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
