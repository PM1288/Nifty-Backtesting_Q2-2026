import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject
} from "react";
import { useLocation } from "react-router-dom";
import { formatTime } from "../lib/format";
import {
  trackIndicatorPageView,
  trackIndicatorSectionView,
  trackIndicatorScrollDepth,
  trackIndicatorPageEngagement,
  type IndicatorAnalyticsContext
} from "./indicatorEvents";
import { analytics } from "./index";
import type { AnalyticsParams } from "./types";

type IndicatorSectionId =
  | "explanation"
  | "threshold_guide"
  | "current_status"
  | "evidence_charts"
  | "strategy_results"
  | "assumptions"
  | "next_steps";

type IndicatorPageAnalyticsOptions = {
  indicatorSlug: string;
  asOfDate?: string;
  scenarioId?: string;
  capitalMode?: string;
};

export function useIndicatorAnalyticsContext({
  indicatorSlug,
  asOfDate,
  scenarioId,
  capitalMode
}: IndicatorPageAnalyticsOptions) {
  const location = useLocation();

  return useMemo<IndicatorAnalyticsContext>(
    () => ({
      indicator_slug: indicatorSlug,
      scenario_id: scenarioId,
      capital_mode: capitalMode,
      as_of_date: asOfDate,
      page_path: `${location.pathname}${location.search}`
    }),
    [asOfDate, capitalMode, indicatorSlug, location.pathname, location.search, scenarioId]
  );
}

export function useIndicatorPageView(context: IndicatorAnalyticsContext, enabled: boolean) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || firedRef.current) return;
    firedRef.current = true;
    analytics.setContext(context);
    trackIndicatorPageView(context);
  }, [context, enabled]);
}

export function useIndicatorSectionViews(
  refs: Record<IndicatorSectionId, RefObject<HTMLElement | null>>,
  context: IndicatorAnalyticsContext,
  enabled: boolean,
  onStrategySectionSeen?: () => void
) {
  const seenRef = useRef<Set<IndicatorSectionId>>(new Set());

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const sectionId = entry.target.getAttribute("data-indicator-section") as IndicatorSectionId | null;
          if (!sectionId || seenRef.current.has(sectionId)) continue;
          seenRef.current.add(sectionId);
          trackIndicatorSectionView({
            ...context,
            section_id: sectionId
          });
          if (sectionId === "strategy_results") {
            onStrategySectionSeen?.();
          }
        }
      },
      {
        rootMargin: "0px 0px -25% 0px",
        threshold: 0.35
      }
    );

    const elements = Object.values(refs)
      .map((ref) => ref.current)
      .filter((element): element is HTMLElement => Boolean(element));

    for (const element of elements) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [context, enabled, onStrategySectionSeen, refs]);
}

export function useIndicatorScrollDepth(context: IndicatorAnalyticsContext, enabled: boolean) {
  const firedDepths = useRef(new Set<number>());

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") return;

    const handleScroll = () => {
      const documentElement = document.documentElement;
      const maxScroll = documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll <= 0 ? 100 : (window.scrollY / maxScroll) * 100;
      for (const depth of [25, 50, 75, 100]) {
        if (progress >= depth && !firedDepths.current.has(depth)) {
          firedDepths.current.add(depth);
          trackIndicatorScrollDepth({
            ...context,
            depth_pct: depth
          });
        }
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [context, enabled]);
}

export function useIndicatorEngagement(
  context: IndicatorAnalyticsContext,
  enabled: boolean,
  reachedStrategySectionRef: MutableRefObject<boolean>
) {
  const sentRef = useRef(false);
  const engagedMsRef = useRef(0);
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof document === "undefined" || typeof window === "undefined") return;

    const stopTimer = () => {
      if (visibleSinceRef.current == null) return;
      engagedMsRef.current += Math.max(0, Date.now() - visibleSinceRef.current);
      visibleSinceRef.current = null;
    };

    const startTimer = () => {
      if (document.visibilityState !== "visible" || visibleSinceRef.current != null) return;
      visibleSinceRef.current = Date.now();
    };

    const flush = () => {
      if (sentRef.current) return;
      stopTimer();
      sentRef.current = true;
      trackIndicatorPageEngagement({
        ...context,
        engaged_seconds: Number((engagedMsRef.current / 1000).toFixed(1)),
        reached_strategy_section: reachedStrategySectionRef.current
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        startTimer();
        return;
      }
      stopTimer();
    };

    startTimer();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flush);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [context, enabled, reachedStrategySectionRef]);
}

export function useIndicatorAnalyticsDebug(enabled: boolean) {
  const [events, setEvents] = useState<Array<{ name: string; at: string; payload: Record<string, unknown> }>>([]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const originalTrack = analytics.track.bind(analytics);
    analytics.track = ((eventName: string, params: AnalyticsParams = {}) => {
      setEvents((current) =>
        [{ name: eventName, at: formatTime(new Date().toISOString()), payload: params }, ...current].slice(0, 12)
      );
      originalTrack(eventName, params);
    }) as typeof analytics.track;

    return () => {
      analytics.track = originalTrack;
    };
  }, [enabled]);

  return events;
}

export function isIndicatorAnalyticsDebugEnabled() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("analytics_debug") === "1" || window.localStorage.getItem("analytics_debug") === "1";
}

export function IndicatorAnalyticsDebugPanel({
  events
}: {
  events: Array<{ name: string; at: string; payload: Record<string, unknown> }>;
}) {
  if (!events.length) return null;

  return (
    <aside
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        width: 320,
        maxHeight: "50vh",
        overflow: "auto",
        zIndex: 40,
        border: "1px solid rgba(212,175,55,0.34)",
        borderRadius: 12,
        background: "rgba(3,5,7,0.94)",
        color: "#fff",
        padding: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,0.35)"
      }}
    >
      <strong style={{ display: "block", marginBottom: 8, fontSize: 12, letterSpacing: "0.08em", color: "#d4af37" }}>
        Indicator analytics debug
      </strong>
      <div style={{ display: "grid", gap: 8 }}>
        {events.map((event, index) => (
          <div key={`${event.name}-${event.at}-${index}`} style={{ fontSize: 11, lineHeight: 1.45 }}>
            <div>
              <strong>{event.name}</strong> <span style={{ color: "rgba(255,255,255,0.62)" }}>{event.at}</span>
            </div>
            <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.74)" }}>
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function useIndicatorSectionRefs() {
  const explanation = useRef<HTMLElement | null>(null);
  const thresholdGuide = useRef<HTMLElement | null>(null);
  const currentStatus = useRef<HTMLElement | null>(null);
  const evidenceCharts = useRef<HTMLElement | null>(null);
  const strategyResults = useRef<HTMLElement | null>(null);
  const assumptions = useRef<HTMLElement | null>(null);
  const nextSteps = useRef<HTMLElement | null>(null);

  return useMemo(
    () => ({
      explanation,
      threshold_guide: thresholdGuide,
      current_status: currentStatus,
      evidence_charts: evidenceCharts,
      strategy_results: strategyResults,
      assumptions,
      next_steps: nextSteps
    }),
    []
  );
}
