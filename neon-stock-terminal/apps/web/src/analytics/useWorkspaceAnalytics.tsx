import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { analytics } from "./index";
import type { AnalyticsParams } from "./types";

type SectionRefs = Record<string, RefObject<HTMLElement | null>>;

function emit(eventName: string, params: AnalyticsParams) {
  analytics.track(eventName, params);
}

export function useWorkspaceSectionViews(
  refs: SectionRefs,
  baseContext: AnalyticsParams,
  eventName: string,
  enabled: boolean
) {
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const sectionId = entry.target.getAttribute("data-analytics-section")?.trim();
          if (!sectionId || seenRef.current.has(sectionId)) continue;
          seenRef.current.add(sectionId);
          emit(eventName, {
            ...baseContext,
            section_id: sectionId
          });
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
  }, [baseContext, enabled, eventName, refs]);
}

export function useWorkspaceEngagement(
  baseContext: AnalyticsParams,
  eventName: string,
  enabled: boolean,
  options?: {
    extraParams?: MutableRefObject<AnalyticsParams>;
  }
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
      emit(eventName, {
        ...baseContext,
        engaged_seconds: Number((engagedMsRef.current / 1000).toFixed(1)),
        ...(options?.extraParams?.current ?? {})
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
  }, [baseContext, enabled, eventName, options?.extraParams]);
}
