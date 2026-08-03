import { Link } from "react-router-dom";
import { DataTable, InterpretationCard, LoadingSkeletonCard, PageIntroAccordion, SectionDivider, StatusBadge } from "../components/ui/DashboardPrimitives";
import { usePageLoadProfile } from "../analytics/usePageLoadProfile";
import { useAuthGate } from "../auth/AuthGateProvider";
import { useI18n } from "../i18n/LocaleProvider";
import { AnalyticsHeader, SYSTEM_SECTION_TABS } from "./AnalyticsChrome";
import styles from "./AnalyticsPage.module.css";

type LifecycleStage = {
  stage: string;
  what: string;
  infer: string;
  nextLabel: string;
  nextTo: string;
  trustTone: "green" | "red" | "white";
};

const LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    stage: "Collect",
    what: "We gather live prices, official files, market breadth inputs, and supporting metrics that describe the tape around Nifty 50 names.",
    infer: "If collection is late, the app may still look responsive while context becomes stale. Freshness matters before interpretation.",
    nextLabel: "Trust Board",
    nextTo: "/analytics/system/quality",
    trustTone: "red"
  },
  {
    stage: "Transform",
    what: "We convert raw market prints into regimes, watchlists, backtesting snapshots, option analytics, and stock-level explanations.",
    infer: "This is where a fast tape becomes a usable read. If the transform layer is noisy, you should reduce conviction rather than add it.",
    nextLabel: "Market Story",
    nextTo: "/analytics/regime",
    trustTone: "white"
  },
  {
    stage: "Publish",
    what: "The product serves published snapshots and read models so the app can stay quick and consistent instead of rebuilding everything on every page load.",
    infer: "Published views are deliberate. They trade a little latency for much better reliability and comparability.",
    nextLabel: "Strategy Leaderboard",
    nextTo: "/backtesting/strategies",
    trustTone: "white"
  },
  {
    stage: "Serve",
    what: "Pages such as Market Hub, stock reports, options, and heatmaps turn the published data into route-specific views and decisions.",
    infer: "This is the layer you should navigate by question: market first, then stock, then strategy, then options if needed.",
    nextLabel: "Market Hub",
    nextTo: "/analytics",
    trustTone: "green"
  },
  {
    stage: "Trust",
    what: "Trust means knowing whether the current answer is fresh enough, broad enough, and stable enough to act on.",
    infer: "When trust is weak, your next move should be validation or patience, not more complexity.",
    nextLabel: "Feedback",
    nextTo: "/feedback",
    trustTone: "green"
  }
];

const QUESTION_ROWS = [
  {
    question: "What is the market doing right now?",
    routeLabel: "Market Hub",
    routeTo: "/analytics",
    why: "Start here for the headline tape, breadth, and immediate direction."
  },
  {
    question: "Is this move broad enough to trust?",
    routeLabel: "Market Story",
    routeTo: "/analytics/regime",
    why: "Use breadth and regime context before trusting a few strong names."
  },
  {
    question: "What supports or weakens the tape around me?",
    routeLabel: "Supporting Metrics",
    routeTo: "/analytics/supporting-metrics",
    why: "Check macro, global, FX, and commodity context without leaving the product."
  },
  {
    question: "Is this stock behaving like leadership or noise?",
    routeLabel: "Stock Report",
    routeTo: "/analytics/stock/RELIANCE",
    why: "Use the structured stock report to read current state, quality, and related strategy fit."
  },
  {
    question: "Which strategy family looks strongest under the current lens?",
    routeLabel: "Strategy Leaderboard",
    routeTo: "/backtesting/strategies",
    why: "Compare return, drawdown, regime fit, and stock suitability in one ranked view."
  },
  {
    question: "Should I trust the system before I trust the signal?",
    routeLabel: "Trust Board",
    routeTo: "/analytics/system/quality",
    why: "Check freshness, route health, and pipeline quality before escalating conviction."
  }
];

const RELATIONSHIP_ROWS = [
  {
    layer: "Market",
    focus: "Broad tape, breadth, regime, rotation",
    routeLabel: "Market Hub / Market Story",
    routeTo: "/analytics",
    nextSignal: "Only move to stock or strategy pages if the broad read is clear."
  },
  {
    layer: "Stock",
    focus: "Current state, quality, residual strength, history",
    routeLabel: "Stock Report",
    routeTo: "/analytics/stock/RELIANCE",
    nextSignal: "Open strategy evidence only if the stock still looks constructive in context."
  },
  {
    layer: "Strategy",
    focus: "Backtested evidence, drawdown, regime fit, stock suitability",
    routeLabel: "Strategy Leaderboard",
    routeTo: "/backtesting/strategies",
    nextSignal: "Use this to decide whether history supports the setup, not to override current market context."
  },
  {
    layer: "Options",
    focus: "Derivative pressure, ATM context, equilibrium, combo behavior",
    routeLabel: "Option Chain",
    routeTo: "/options/structure",
    nextSignal: "Use this after the market and stock read, not before."
  },
  {
    layer: "Trust",
    focus: "Freshness, quality checks, route health, lineage",
    routeLabel: "Trust Board",
    routeTo: "/analytics/system/quality",
    nextSignal: "Return here whenever the answer feels too clean for the tape."
  }
];

export function AnalyticsSystemMapPage() {
  const { authReady } = useAuthGate();
  const { t, tr } = useI18n();

  usePageLoadProfile({
    pageName: "analytics_system_map",
    enabled: authReady,
    queries: []
  });

  if (!authReady) {
    return <LoadingSkeletonCard title={tr("System Map")} lines={6} />;
  }

  return (
    <div className={styles.page}>
      <AnalyticsHeader
        title={tr("System Map")}
        subtitle={tr("Use this page when you want to understand how the product moves from live collection to a trustworthy user-facing read without having to decode internal implementation details.")}
        sectionTabs={[...SYSTEM_SECTION_TABS]}
        learningPrompt={tr("Start here if you are unsure where to go next. It explains what each stage means, what you should infer, and which route to open next.")}
      />

      <SectionDivider
        eyebrow={tr("System")}
        title={tr("From market tape to user decision")}
        subtitle={tr("The product is designed to move in one direction: collect first, then explain, then publish, then serve, then ask whether the answer deserves trust.")}
      />

      <section className={styles.guidanceGrid}>
        {LIFECYCLE_STAGES.map((item, index) => (
          <article key={item.stage} className={styles.guideCard}>
            <span className={styles.guideStep}>{index + 1}</span>
            <h2 className={styles.guideTitle}>{tr(item.stage)}</h2>
            <p className={styles.guideText}>{tr(item.what)}</p>
            <div className={styles.miniPanel}>
              <div className={styles.miniTitle}>{tr("What you should infer")}</div>
              <p className={styles.guideText}>{tr(item.infer)}</p>
            </div>
            <div className={styles.signalItem}>
              <div>
                <div className={styles.strong}>{tr("Best next route")}</div>
                <div className={styles.muted}>{tr("Open the route that answers the next real user question from this stage.")}</div>
              </div>
              <StatusBadge label={tr(item.stage)} tone={item.trustTone} />
            </div>
            <Link to={item.nextTo} className={styles.nextCard}>
              <span className={styles.promptLabel}>{tr("Go next")}</span>
              <strong>{tr(item.nextLabel)}</strong>
              <span className={styles.muted}>{tr("Open this route from the current stage.")}</span>
            </Link>
          </article>
        ))}
      </section>

      <PageIntroAccordion
        title={tr("How to navigate the product")}
        body={tr("Read the product in order. Start with market context, move to stock or strategy evidence only after the tape is clear, then use the trust board when timing or freshness feels questionable.")}
        items={[
          tr("Market before stock."),
          tr("Stock before strategy."),
          tr("Strategy before options."),
          tr("Trust whenever the answer feels too neat.")
        ]}
      />

      <section className={styles.grid2}>
        <DataTable
          title={tr("Where should I go next?")}
          subtitle={tr("This is the shortest path from a user question to the correct route in the current product.")}
          rows={QUESTION_ROWS}
          columns={[
            { key: "question", header: tr("Question"), cell: (row) => row.question },
            {
              key: "route",
              header: tr("Open"),
              cell: (row) => (
                <Link to={row.routeTo} className={styles.inlineLink}>
                  {tr(row.routeLabel)}
                </Link>
              )
            },
            { key: "why", header: tr("Why"), cell: (row) => row.why }
          ]}
        />

        <InterpretationCard
          title={tr("What this map is for")}
          items={[
            tr("It is a navigation aid, not a system-status substitute."),
            tr("It explains what each stage means in user language instead of infrastructure language."),
            tr("It helps you decide where to go next without pretending to expose precise internal relationships.")
          ]}
        />
      </section>

      <DataTable
        title={tr("Relationship map")}
        subtitle={tr("This is a deterministic interaction map, not a fake precision network graph. Read it left to right: market to stock to strategy to options, with trust cutting across all of them.")}
        rows={RELATIONSHIP_ROWS}
        columns={[
          { key: "layer", header: tr("Layer"), cell: (row) => row.layer },
          { key: "focus", header: tr("What it covers"), cell: (row) => row.focus },
          {
            key: "route",
            header: tr("Primary route"),
            cell: (row) => (
              <Link to={row.routeTo} className={styles.inlineLink}>
                {tr(row.routeLabel)}
              </Link>
            )
          },
          { key: "nextSignal", header: tr("How to use it"), cell: (row) => row.nextSignal }
        ]}
      />

      <section className={styles.nextSteps}>
        <Link to="/analytics" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Start reading")}</span>
          <strong>{tr("Open Market Hub")}</strong>
          <span className={styles.muted}>{tr("Use this when you want the current market headline before drilling into any other workspace.")}</span>
        </Link>
        <Link to="/backtesting/strategies" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Historical evidence")}</span>
          <strong>{tr("Open the Strategy Leaderboard")}</strong>
          <span className={styles.muted}>{tr("Use this after market and stock context when you want to know which strategy family has the strongest published evidence.")}</span>
        </Link>
        <Link to="/analytics/system/quality" className={styles.nextCard}>
          <span className={styles.promptLabel}>{tr("Trust check")}</span>
          <strong>{tr("Open the Trust Board")}</strong>
          <span className={styles.muted}>{tr("Use this whenever freshness, quality, or route health feels uncertain.")}</span>
        </Link>
      </section>
    </div>
  );
}
