import { useEffect } from "react";
import { fmtPct, fmtPrice } from "../../lib/format";
import { useI18n } from "../../i18n/LocaleProvider";
import type { Quote } from "../../lib/types";
import { StockPill } from "./StockPill";
import styles from "./DashboardInfoPopup.module.css";

const sampleGainer: Quote = {
  symbol: "RELIANCE",
  name: "Reliance Industries",
  last: 1404.8,
  change: 15.42,
  changePct: 1.11,
  sector: "Oil Gas & Consumable Fuels",
  rsi: 73,
  willr: -18
};

const sampleLoser: Quote = {
  symbol: "ICICIBANK",
  name: "ICICI Bank",
  last: 1313.4,
  change: -44.18,
  changePct: -3.26,
  sector: "Financial Services",
  rsi: 26,
  willr: -84
};

const stripSamples = [
  { label: "NIFTY 50", value: 24450.45, changePct: -1.27, tone: "down" },
  { label: "BANK NIFTY", value: 57783.25, changePct: -2.15, tone: "down" },
  { label: "INDIA VIX", value: 19.88, changePct: 11.31, tone: "up" }
] as const;

export function DashboardInfoPopup({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, tr } = useI18n();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={styles.closeButton} aria-label={t("ui.closeDashboardHelp", "Close dashboard help")} onClick={onClose}>
          X
        </button>

        <header className={styles.header}>
          <span className={styles.eyebrow}>{tr("Quick visual guide")}</span>
          <h2 id="dashboard-help-title" className={styles.title}>
            {tr("Read the dashboard like the screen")}
          </h2>
          <p className={styles.subtitle}>{tr("Less text. Same row colors, badges, strip cues, and heatmap logic you see on the live board.")}</p>
        </header>

        <div className={styles.grid}>
          <article className={`${styles.card} ${styles.fullWidth}`}>
            <div className={styles.cardHeader}>
              <h3>{tr("Index tone first")}</h3>
              <span className={styles.microNote}>{tr("Header snapshot")}</span>
            </div>
            <div className={styles.stripPreview}>
              {stripSamples.map((item) => (
                <div key={item.label} className={styles.stripCard} data-tone={item.tone}>
                  <span className={styles.stripLabel}>{item.label}</span>
                  <span className={styles.stripValue}>{fmtPrice(item.value)}</span>
                  <span className={styles.stripMove}>{item.changePct > 0 ? "▲" : "▼"} {fmtPct(item.changePct)}</span>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>{tr("Heatmap = sectors")}</h3>
              <span className={styles.microNote}>{tr("Green up, red down")}</span>
            </div>

            <div className={styles.heatmapPreview}>
              <div className={styles.sectorTile} data-tone="up">
                <div className={styles.sectorTileHead}>
                  <span>{tr("Oil & Gas")}</span>
                  <strong>+0.73%</strong>
                </div>
                <div className={styles.previewPills}>
                  <StockPill stock={sampleGainer} rankBadge="▲★1" compact onSelect={() => undefined} />
                  <StockPill
                    stock={{ ...sampleGainer, symbol: "ONGC", name: "ONGC", last: 278.95, change: 2.61, changePct: 0.94, rsi: 66, willr: -32 }}
                    compact
                    onSelect={() => undefined}
                  />
                </div>
              </div>

              <div className={styles.sectorTile} data-tone="down">
                <div className={styles.sectorTileHead}>
                  <span>{tr("Financials")}</span>
                  <strong>-1.93%</strong>
                </div>
                <div className={styles.previewPills}>
                  <StockPill stock={sampleLoser} rankBadge="▼★2" compact onSelect={() => undefined} />
                  <StockPill
                    stock={{ ...sampleLoser, symbol: "SBIN", name: "State Bank", last: 1143, change: -26.51, changePct: -2.27, rsi: 29, willr: -76 }}
                    compact
                    onSelect={() => undefined}
                  />
                </div>
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>{tr("Actual stock row anatomy")}</h3>
              <span className={styles.microNote}>{tr("Left to right")}</span>
            </div>

            <div className={styles.anatomyFrame}>
              <div className={styles.anatomyRow} data-tone="up">
                <span className={styles.logoOrb}>RE</span>
                <span className={styles.nameBlock}>
                  <span className={styles.symbol}>RELIANCE</span>
                  <span className={styles.company}>Reliance Industries</span>
                </span>
                <span className={`${styles.rankBadge} ${styles.gainerBadge}`}>▲★1</span>
                <span className={styles.priceBlock}>{fmtPrice(sampleGainer.last)}</span>
                <span className={styles.directionBlock}>▲</span>
                <span className={styles.moveBlock}>{fmtPct(sampleGainer.changePct)}</span>
              </div>

              <div className={styles.readOrder}>
                <span>{tr("Logo")}</span>
                <span>{tr("Name")}</span>
                <span>{tr("Badge")}</span>
                <span>{tr("Price")}</span>
                <span>{tr("Direction")}</span>
                <span>{tr("% Move")}</span>
              </div>
            </div>

            <div className={styles.legendInline}>
              <span><span className={`${styles.dot} ${styles.greenDot}`} /> {tr("Green badge = top 5 gainer")}</span>
              <span><span className={`${styles.dot} ${styles.redDot}`} /> {tr("Black badge = top 5 loser")}</span>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>{tr("Indicator strips")}</h3>
              <span className={styles.microNote}>{tr("Top RSI, bottom Williams %R")}</span>
            </div>

            <div className={styles.indicatorDemo}>
              <div className={styles.indicatorLabels}>
                <span>RSI 10</span>
                <span>RSI 90</span>
              </div>
              <div className={styles.indicatorTrack}>
                <span className={`${styles.trackMarker} ${styles.topMarker}`} style={{ left: "76%" }} />
                <span className={`${styles.trackMarker} ${styles.bottomMarker}`} style={{ left: "18%" }} />
              </div>
              <div className={styles.indicatorLabels}>
                <span>%R -100</span>
                <span>%R 0</span>
              </div>
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeader}>
              <h3>{tr("Backdrop mood")}</h3>
              <span className={styles.microNote}>{tr("NIFTY 50 RSI drives this")}</span>
            </div>

            <div className={styles.moodRow}>
              <div className={styles.moodTile} data-mood="red">
                <span>{tr("Low RSI")}</span>
              </div>
              <div className={styles.moodTile} data-mood="neutral">
                <span>{tr("Neutral RSI")}</span>
              </div>
              <div className={styles.moodTile} data-mood="green">
                <span>{tr("High RSI")}</span>
              </div>
            </div>

            <p className={styles.moodCaption}>{tr("Higher momentum pressure means RSI is moving harder, not just sitting at a level.")}</p>
          </article>

          <article className={`${styles.card} ${styles.fullWidth}`}>
            <div className={styles.cardHeader}>
              <h3>{tr("One fast scan")}</h3>
              <span className={styles.microNote}>{tr("Use this sequence")}</span>
            </div>
            <div className={styles.scanFlow}>
              <span>{tr("Index tone")}</span>
              <span>{tr("Sector heatmap")}</span>
              <span>{tr("Stock row")}</span>
              <span>{tr("Badge")}</span>
              <span>{tr("Arrow")}</span>
              <span>{tr("% move")}</span>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
