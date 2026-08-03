import { useEffect, useMemo, useRef } from "react";
import styles from "./LiquidBackdrop.module.css";

type BackdropProfile = {
  color: [number, number, number];
  targetCount: number;
  jitter: number;
  blinkSpeed: number;
  driftSpeed: number;
  glow: number;
};

type Particle = {
  x: number;
  y: number;
  radius: number;
  phase: number;
  driftX: number;
  driftY: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colorLerp(
  from: [number, number, number],
  to: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(lerp(from[0], to[0], t)),
    Math.round(lerp(from[1], to[1], t)),
    Math.round(lerp(from[2], to[2], t))
  ];
}

function profileForRsi(inputRsi: number | null | undefined): BackdropProfile {
  const rsi = clamp(Number.isFinite(inputRsi) ? Number(inputRsi) : 50, 0, 100);
  const deepRed: [number, number, number] = [42, 0, 10];
  const hotRed: [number, number, number] = [140, 0, 28];
  const neutral: [number, number, number] = [255, 255, 255];
  const green: [number, number, number] = [0, 255, 102];
  const hotGreen: [number, number, number] = [0, 255, 132];

  let color: [number, number, number];
  if (rsi <= 30) {
    color = colorLerp(deepRed, hotRed, rsi / 30);
  } else if (rsi <= 40) {
    color = colorLerp(hotRed, neutral, (rsi - 30) / 10);
  } else if (rsi < 60) {
    color = neutral;
  } else if (rsi <= 70) {
    color = colorLerp(neutral, green, (rsi - 60) / 10);
  } else {
    color = colorLerp(green, hotGreen, (rsi - 70) / 30);
  }

  const lowPeak = Math.exp(-Math.pow((rsi - 20) / 8, 2));
  const highPeak = Math.exp(-Math.pow((rsi - 70) / 7, 2));
  const valley = Math.exp(-Math.pow((rsi - 50) / 8, 2));
  const weightedIntensity = clamp(0.92 * lowPeak + 1.25 * highPeak - 0.35 * valley, 0, 1.3);
  const intensity = clamp(weightedIntensity / 1.3, 0, 1);
  const overboughtBoost = clamp((rsi - 70) / 20, 0, 1);
  const oversoldBoost = clamp((30 - rsi) / 20, 0, 1);

  return {
    color,
    targetCount: Math.round(90 + intensity * 620 + overboughtBoost * 180 + oversoldBoost * 120),
    jitter: 0.45 + intensity * 4.2 + overboughtBoost * 2.6 + oversoldBoost * 1.1,
    blinkSpeed: 1.1 + intensity * 5.4 + overboughtBoost * 2.9 + oversoldBoost * 1.4,
    driftSpeed: 0.1 + intensity * 0.82 + overboughtBoost * 0.52 + oversoldBoost * 0.32,
    glow: 0.24 + intensity * 0.92 + overboughtBoost * 0.95
  };
}

function randomParticle(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    radius: 1.0 + Math.random() * 3.6,
    phase: Math.random() * Math.PI * 2,
    driftX: (Math.random() - 0.5) * 0.8,
    driftY: (Math.random() - 0.5) * 0.8
  };
}

export function LiquidBackdrop({
  rsi,
  changePct
}: {
  rsi: number | null | undefined;
  changePct?: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const profile = useMemo(() => profileForRsi(rsi), [rsi]);
  const profileRef = useRef(profile);
  const changePctRef = useRef(Number.isFinite(changePct) ? Number(changePct) : 0);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    changePctRef.current = Number.isFinite(changePct) ? Number(changePct) : 0;
  }, [changePct]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 1;
    let height = 1;
    let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    let particles: Particle[] = [];

    const resize = () => {
      const nextWidth = window.innerWidth;
      const nextHeight = window.innerHeight;
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = particles.map((p) => ({
        ...p,
        x: clamp(p.x, 0, width),
        y: clamp(p.y, 0, height)
      }));
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frame = (time: number) => {
      const current = profileRef.current;
      const targetCount = reducedMotion ? Math.min(140, current.targetCount) : current.targetCount;

      while (particles.length < targetCount) {
        particles.push(randomParticle(width, height));
      }
      if (particles.length > targetCount) {
        particles.length = Math.max(targetCount, particles.length - 12);
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      const pct = changePctRef.current;
      const tintMagnitude = clamp(Math.abs(pct) / 3, 0, 1);
      if (tintMagnitude > 0) {
        const tintAlpha = 0.02 + tintMagnitude * 0.06;
        if (pct > 0) {
          ctx.fillStyle = `rgba(0, 255, 102, ${tintAlpha.toFixed(3)})`;
        } else if (pct < 0) {
          ctx.fillStyle = `rgba(255, 0, 51, ${tintAlpha.toFixed(3)})`;
        } else {
          ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
        }
        ctx.fillRect(0, 0, width, height);
      }

      const [r, g, b] = current.color;
      const driftSpeed = reducedMotion ? current.driftSpeed * 0.35 : current.driftSpeed;
      const jitter = reducedMotion ? current.jitter * 0.28 : current.jitter;
      const blinkSpeed = reducedMotion ? current.blinkSpeed * 0.4 : current.blinkSpeed;

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const t = time * 0.001;
        const pulse = 0.5 + 0.5 * Math.sin(t * blinkSpeed + p.phase);
        const jitterX = Math.sin(t * (0.75 + jitter) + p.phase * 1.7) * jitter * 0.22;
        const jitterY = Math.cos(t * (0.66 + jitter) + p.phase * 1.9) * jitter * 0.22;

        p.x += p.driftX * driftSpeed + jitterX * 0.06;
        p.y += p.driftY * driftSpeed + jitterY * 0.06;

        if (p.x < -2) p.x = width + 2;
        else if (p.x > width + 2) p.x = -2;
        if (p.y < -2) p.y = height + 2;
        else if (p.y > height + 2) p.y = -2;

        const alpha = (0.13 + pulse * 0.9) * (0.4 + p.radius * 0.3) * (0.68 + current.glow * 0.42);
        const glow = (3 + current.glow * 22) * (0.5 + p.radius * 0.62);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.shadowBlur = glow;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${Math.min(1, 0.24 + current.glow * 0.76)})`;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha)})`;
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      raf = window.requestAnimationFrame(frame);
    };

    resize();
    raf = window.requestAnimationFrame(frame);
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className={styles.backdrop} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
