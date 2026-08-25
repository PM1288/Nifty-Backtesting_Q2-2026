import { useEffect, useMemo, useRef } from "react";
import { MARKET_RSI_PARTICLE_COUNT, marketRsiParticleProfile } from "./marketRsiParticles";
import styles from "./MarketRsiParticles.module.css";

type Particle = { x: number; y: number; vx: number; vy: number; radius: number; alpha: number };

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function animationPaused(reducedMotion: MediaQueryList): boolean {
  const root = document.documentElement.dataset;
  return reducedMotion.matches || root.calmMode === "true" || root.pauseMotion === "true" || document.hidden;
}

export function MarketRsiParticles({ rsi }: { rsi: number | null | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const profile = useMemo(() => marketRsiParticleProfile(rsi), [rsi]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const random = seededRandom(50_400);
    const particles: Particle[] = Array.from({ length: MARKET_RSI_PARTICLE_COUNT }, () => ({
      x: random(),
      y: random(),
      vx: (random() - 0.5) * 9,
      vy: -(3 + random() * 8),
      radius: 0.65 + random() * 1.75,
      alpha: 0.16 + random() * 0.34,
    }));
    let width = 1;
    let height = 1;
    let ratio = 1;
    let frameId = 0;
    let lastFrame = performance.now();

    const resize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      ratio = Math.min(1.75, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (now: number) => {
      frameId = 0;
      const paused = animationPaused(reducedMotion);
      const elapsedSeconds = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
      lastFrame = now;
      context.clearRect(0, 0, width, height);
      context.fillStyle = profile.colour;

      for (const particle of particles) {
        if (!paused) {
          particle.x += (particle.vx * profile.speed * elapsedSeconds) / width;
          particle.y += (particle.vy * profile.speed * elapsedSeconds) / height;
          if (particle.x < -0.01) particle.x = 1.01;
          if (particle.x > 1.01) particle.x = -0.01;
          if (particle.y < -0.01) particle.y = 1.01;
        }
        context.globalAlpha = particle.alpha;
        context.beginPath();
        context.arc(particle.x * width, particle.y * height, particle.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      if (!paused) frameId = window.requestAnimationFrame(draw);
    };

    const requestDraw = () => {
      if (frameId || animationPaused(reducedMotion)) {
        if (!frameId) draw(performance.now());
        return;
      }
      lastFrame = performance.now();
      frameId = window.requestAnimationFrame(draw);
    };
    const onStateChange = () => requestDraw();
    const onResize = () => { resize(); requestDraw(); };
    const observer = new MutationObserver(onStateChange);

    resize();
    requestDraw();
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onStateChange);
    reducedMotion.addEventListener("change", onStateChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-calm-mode", "data-pause-motion"] });
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onStateChange);
      reducedMotion.removeEventListener("change", onStateChange);
    };
  }, [profile.colour, profile.speed]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      data-market-rsi-particles="true"
      data-particle-count={MARKET_RSI_PARTICLE_COUNT}
      data-particle-speed={profile.speed.toFixed(3)}
      data-particle-colour={profile.colour}
      data-particle-tone={profile.tone}
      data-nifty-rsi={profile.rsi == null ? "unavailable" : profile.rsi.toFixed(2)}
      aria-hidden="true"
    />
  );
}
