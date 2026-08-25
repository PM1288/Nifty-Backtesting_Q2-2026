import { useEffect, useRef } from "react";
import { marketWaveTone } from "./marketGradientWaves";
import styles from "./MarketTargetCursor.module.css";

const TARGET_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "[role='button']:not([aria-disabled='true'])",
  "[role='tab']:not([aria-disabled='true'])",
  "[data-cursor-target]",
].join(",");

type CursorBox = { x: number; y: number; width: number; height: number; opacity: number };

function cursorDisabled(finePointer: MediaQueryList) {
  return !finePointer.matches || document.hidden;
}

function cursorMotionReduced(reducedMotion: MediaQueryList) {
  const root = document.documentElement.dataset;
  return reducedMotion.matches || root.calmMode === "true" || root.pauseMotion === "true";
}

function cursorTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const target = node.closest<HTMLElement>(TARGET_SELECTOR);
  if (!target || target.dataset.targetCursor === "off") return null;
  const rect = target.getBoundingClientRect();
  return rect.width >= 8 && rect.height >= 8 ? target : null;
}

export function MarketTargetCursor({ changePct }: { changePct: number | null | undefined }) {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const tone = marketWaveTone(changePct);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine) and (hover: hover)");
    let target: HTMLElement | null = null;
    let frameId = 0;
    let seenPointer = false;
    let pointerX = -50;
    let pointerY = -50;
    const current: CursorBox = { x: -50, y: -50, width: 30, height: 30, opacity: 0 };
    const destination: CursorBox = { ...current };

    const syncNativeCursor = () => {
      document.documentElement.classList.toggle("n50-target-cursor-enabled", finePointer.matches);
    };

    const releaseTarget = () => {
      target?.classList.remove("n50-target-cursor-active");
      target = null;
      cursor.dataset.snapped = "false";
    };

    const selectTarget = (next: HTMLElement | null) => {
      if (target === next) return;
      releaseTarget();
      target = next;
      target?.classList.add("n50-target-cursor-active");
      cursor.dataset.snapped = target ? "true" : "false";
    };

    const updateDestination = () => {
      if (target?.isConnected) {
        const rect = target.getBoundingClientRect();
        const padding = 7;
        destination.x = rect.left - padding;
        destination.y = rect.top - padding;
        destination.width = rect.width + padding * 2;
        destination.height = rect.height + padding * 2;
      } else {
        if (target) releaseTarget();
        destination.x = pointerX - 15;
        destination.y = pointerY - 15;
        destination.width = 30;
        destination.height = 30;
      }
      destination.opacity = seenPointer ? 1 : 0;
    };

    const draw = () => {
      frameId = 0;
      if (cursorDisabled(finePointer)) {
        releaseTarget();
        cursor.style.opacity = "0";
        return;
      }
      updateDestination();
      // Target acquisition should feel decisive: settle around the control in a
      // handful of frames, while free movement remains slightly softer.
      const easing = target ? 0.46 : 0.34;
      if (cursorMotionReduced(reducedMotion)) {
        Object.assign(current, destination);
      } else {
        current.x += (destination.x - current.x) * easing;
        current.y += (destination.y - current.y) * easing;
        current.width += (destination.width - current.width) * easing;
        current.height += (destination.height - current.height) * easing;
        current.opacity += (destination.opacity - current.opacity) * 0.3;
      }
      cursor.style.transform = `translate3d(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px, 0)`;
      cursor.style.width = `${Math.max(20, current.width).toFixed(2)}px`;
      cursor.style.height = `${Math.max(20, current.height).toFixed(2)}px`;
      cursor.style.opacity = current.opacity.toFixed(3);
      const unsettled = Math.max(
        Math.abs(destination.x - current.x),
        Math.abs(destination.y - current.y),
        Math.abs(destination.width - current.width),
        Math.abs(destination.height - current.height),
        Math.abs(destination.opacity - current.opacity) * 20,
      ) > 0.12;
      if (unsettled) frameId = window.requestAnimationFrame(draw);
    };

    const requestDraw = () => {
      if (!frameId) frameId = window.requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch" || cursorDisabled(finePointer)) return;
      seenPointer = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      selectTarget(cursorTarget(event.target));
      requestDraw();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      cursor.dataset.pressed = "true";
      window.setTimeout(() => { cursor.dataset.pressed = "false"; }, 150);
    };
    const onPointerLeave = () => {
      seenPointer = false;
      releaseTarget();
      destination.opacity = 0;
      requestDraw();
    };
    const onMotionPreferenceChange = () => {
      syncNativeCursor();
      if (cursorDisabled(finePointer)) onPointerLeave();
      else requestDraw();
    };
    const observer = new MutationObserver(onMotionPreferenceChange);

    syncNativeCursor();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("scroll", requestDraw, { passive: true, capture: true });
    window.addEventListener("resize", requestDraw, { passive: true });
    document.documentElement.addEventListener("mouseleave", onPointerLeave);
    document.addEventListener("visibilitychange", onMotionPreferenceChange);
    reducedMotion.addEventListener("change", onMotionPreferenceChange);
    finePointer.addEventListener("change", onMotionPreferenceChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-calm-mode", "data-pause-motion"] });
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      releaseTarget();
      document.documentElement.classList.remove("n50-target-cursor-enabled");
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", requestDraw, true);
      window.removeEventListener("resize", requestDraw);
      document.documentElement.removeEventListener("mouseleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onMotionPreferenceChange);
      reducedMotion.removeEventListener("change", onMotionPreferenceChange);
      finePointer.removeEventListener("change", onMotionPreferenceChange);
    };
  }, []);

  return (
    <div ref={cursorRef} className={styles.cursor} data-market-target-cursor="true" data-market-tone={tone} data-snapped="false" data-pressed="false" aria-hidden="true">
      <i className={styles.corner} /><i className={styles.corner} /><i className={styles.corner} /><i className={styles.corner} />
      <i className={styles.dot} />
    </div>
  );
}
