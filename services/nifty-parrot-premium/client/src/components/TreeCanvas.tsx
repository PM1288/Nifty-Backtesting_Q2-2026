import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardPayload, SectorStat, Stock } from "../types";
import { clamp, hashStringToSeed, lerp, mulberry32, smoothstep } from "../lib/math";
import {
  branchInnerHslFromSector,
  hslFromIndexChange,
  hslFromRsi,
  hslToCss,
  leafHslFromChange
} from "../lib/color";
import { fmtNum, fmtPct } from "../lib/format";

type Pt = { x: number; y: number };

type TwigNode = {
  sector: string;
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p3: Pt;
  thickness: number;
  phase: number;
};

type BranchNode = {
  sector: string;
  avgChangePct: number;
  symbolCount: number;
  angle: number;
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p3: Pt;
  thickness: number;
  phase: number;
  twigs: TwigNode[];
};

type LeafNode = {
  stock: Stock;
  sector: string;
  // base placement
  base: Pt;
  baseRot: number;
  sx: number;
  sy: number;
  // for animation
  phase: number;
  swayAmp: number;
  depth: number;
  // shape variation
  shapeIdx: number;
  // associations
  branchSector: string;
  // hit test
  radius: number;
};

type Particle = {
  x: number;
  y: number;
  z: number; // depth 0..1 (0 near)
  r: number;
  vx: number;
  vy: number;
  a: number;
  phase: number;
};

type HoverInfo = {
  leaf: LeafNode;
  x: number;
  y: number;
};

function bezierPoint(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + ttt * p3.y
  };
}
function bezierTangent(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const dx =
    3 * u * u * (c1.x - p0.x) +
    6 * u * t * (c2.x - c1.x) +
    3 * t * t * (p3.x - c2.x);
  const dy =
    3 * u * u * (c1.y - p0.y) +
    6 * u * t * (c2.y - c1.y) +
    3 * t * t * (p3.y - c2.y);
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}
function perp(v: Pt): Pt {
  return { x: -v.y, y: v.x };
}

function clampPctToLeafScale(dayChangePct: number) {
  const mag = clamp(Math.abs(dayChangePct) / 4.5, 0, 1);
  // bounded, but with a bit more range for "readability"
  return lerp(0.78, 1.38, smoothstep(mag));
}

function windFromVix(vix: number) {
  // plausible VIX range ~12-30
  return clamp((vix - 11) / 20, 0, 1);
}

function volatilityFromSeries(series: { value: number }[], idxNow: number) {
  const n = 22;
  const start = Math.max(1, idxNow - n);
  const end = Math.max(start + 1, idxNow);
  const rets: number[] = [];
  for (let i = start + 1; i <= end; i++) {
    const r = (series[i].value - series[i - 1].value) / Math.max(1e-9, series[i - 1].value);
    rets.push(r);
  }
  if (!rets.length) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(varr);
}

function rsiFromSeries(series: { value: number }[], idxNow: number, period = 14) {
  const end = Math.max(1, Math.min(idxNow, series.length - 1));
  const start = Math.max(1, end - period);
  let gains = 0;
  let losses = 0;
  let count = 0;
  for (let i = start + 1; i <= end; i++) {
    const diff = series[i].value - series[i - 1].value;
    if (diff > 0) gains += diff;
    else losses += -diff;
    count++;
  }
  if (count <= 0) return 50;
  const avgGain = gains / count;
  const avgLoss = losses / count;
  if (avgLoss <= 1e-9) return 70;
  const rs = avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);
  return rsi;
}

function createGrainPattern(ctx: CanvasRenderingContext2D, size = 128, alpha = 18) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = alpha;
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, "repeat");
}

function createBarkScratchPattern(ctx: CanvasRenderingContext2D) {
  const c = document.createElement("canvas");
  const w = 220;
  const h = 220;
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, w, h);

  // base subtle noise
  const img = g.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 180 + Math.floor(Math.random() * 60);
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 10;
  }
  g.putImageData(img, 0, 0);

  // long scratches (bark ridges)
  g.globalAlpha = 0.20;
  for (let i = 0; i < 28; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = 60 + Math.random() * 120;
    const ang = (-70 + Math.random() * 18) * (Math.PI / 180);
    g.strokeStyle = Math.random() > 0.5 ? "rgba(30,15,8,1)" : "rgba(255,255,255,1)";
    g.lineWidth = 0.6 + Math.random() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
  g.globalAlpha = 1;

  return ctx.createPattern(c, "repeat");
}

function createLeafSpecklePattern(ctx: CanvasRenderingContext2D) {
  const c = document.createElement("canvas");
  const s = 96;
  c.width = s;
  c.height = s;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, s, s);
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * s;
    const y = Math.random() * s;
    const r = Math.random() * 0.85;
    // warm speckle avoids high-contrast black confetti artifacts
    g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.10)" : "rgba(155,122,84,0.08)";
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return ctx.createPattern(c, "repeat");
}

function mixHsl(a: { h: number; s: number; l: number }, b: { h: number; s: number; l: number }, t: number) {
  // naive mix is fine for small ranges (red/yellow/green)
  return { h: lerp(a.h, b.h, t), s: lerp(a.s, b.s, t), l: lerp(a.l, b.l, t) };
}

const LEAF_SHAPES: Path2D[] = (() => {
  // All shapes normalized: stem at (0,0), tip at (0,-1). Width roughly ~[-0.55..0.55]
  const shapes: Path2D[] = [];

  // 1) classic oval
  {
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(0.50, -0.18, 0.50, -0.86, 0, -1);
    p.bezierCurveTo(-0.50, -0.86, -0.50, -0.18, 0, 0);
    p.closePath();
    shapes.push(p);
  }

  // 2) long feather-leaf
  {
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(0.32, -0.06, 0.42, -0.74, 0, -1);
    p.bezierCurveTo(-0.42, -0.74, -0.32, -0.06, 0, 0);
    p.closePath();
    shapes.push(p);
  }

  // 3) slightly lobed
  {
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(0.55, -0.20, 0.40, -0.52, 0.36, -0.62);
    p.bezierCurveTo(0.44, -0.78, 0.30, -0.96, 0, -1);
    p.bezierCurveTo(-0.30, -0.96, -0.44, -0.78, -0.36, -0.62);
    p.bezierCurveTo(-0.40, -0.52, -0.55, -0.20, 0, 0);
    p.closePath();
    shapes.push(p);
  }

  // 4) rounder (camellia-like)
  {
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(0.58, -0.30, 0.52, -0.86, 0, -1);
    p.bezierCurveTo(-0.52, -0.86, -0.58, -0.30, 0, 0);
    p.closePath();
    shapes.push(p);
  }

  // 5) pointed tip + narrow base
  {
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(0.42, -0.12, 0.42, -0.72, 0.06, -0.92);
    p.bezierCurveTo(0.02, -0.97, 0.00, -1.0, 0, -1);
    p.bezierCurveTo(0.00, -1.0, -0.02, -0.97, -0.06, -0.92);
    p.bezierCurveTo(-0.42, -0.72, -0.42, -0.12, 0, 0);
    p.closePath();
    shapes.push(p);
  }

  return shapes;
})();

function balancedAngles(n: number) {
  // Keep branches distributed around the trunk axis and avoid a broom fan.
  const base = (-90 * Math.PI) / 180;
  const step = (13 * Math.PI) / 180;
  const out: number[] = [];
  out.push(base);
  for (let k = 1; out.length < n; k++) {
    out.push(base - step * k);
    if (out.length >= n) break;
    out.push(base + step * k);
  }
  return out.slice(0, n).map((a) => clamp(a, (-142 * Math.PI) / 180, (-38 * Math.PI) / 180));
}

type BranchSegment = {
  a: Pt;
  b: Pt;
  radius: number;
};

function pointSegDistance(p: Pt, a: Pt, b: Pt) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const px = a.x + t * vx;
  const py = a.y + t * vy;
  return Math.hypot(p.x - px, p.y - py);
}

function sampleBezierSegments(
  p0: Pt,
  c1: Pt,
  c2: Pt,
  p3: Pt,
  rStart: number,
  rEnd: number,
  steps = 22
): BranchSegment[] {
  const segs: BranchSegment[] = [];
  let prev = bezierPoint(p0, c1, c2, p3, 0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const curr = bezierPoint(p0, c1, c2, p3, t);
    const rr = lerp(rStart, rEnd, t);
    segs.push({ a: prev, b: curr, radius: rr });
    prev = curr;
  }
  return segs;
}

function minBranchClearance(p: Pt, segments: BranchSegment[]) {
  let minClear = Number.POSITIVE_INFINITY;
  for (const s of segments) {
    const d = pointSegDistance(p, s.a, s.b) - s.radius;
    if (d < minClear) minClear = d;
  }
  return minClear;
}

function minLeafDistance(p: Pt, leaves: LeafNode[]) {
  if (!leaves.length) return Number.POSITIVE_INFINITY;
  let minD = Number.POSITIVE_INFINITY;
  for (const l of leaves) {
    const d = Math.hypot(p.x - l.base.x, p.y - l.base.y) - (l.radius + 0.0001);
    if (d < minD) minD = d;
  }
  return minD;
}

function intersectsLeafCrowd(p: Pt, radius: number, leaves: LeafNode[], overlapFactor: number) {
  for (const l of leaves) {
    const d = Math.hypot(p.x - l.base.x, p.y - l.base.y);
    if (d < (radius + l.radius) * overlapFactor) return true;
  }
  return false;
}

function buildLayout(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: DashboardPayload,
  sectorsByName: Map<string, SectorStat>
) {
  const grainPattern = createGrainPattern(ctx, 128, 20);
  const barkPattern = createBarkScratchPattern(ctx);
  const leafSpeckle = createLeafSpecklePattern(ctx);

  const shoreY = h * 0.76;
  const waterTopBand = { min: h * 0.64, max: h * 0.76 };
  const trunkBase: Pt = { x: w * 0.50, y: shoreY };
  const trunkTop: Pt = { x: w * 0.50 - w * 0.02, y: h * 0.24 };

  // Order sectors by size (bigger sectors get more central branches)
  const sectors = [...data.n100.sectors].slice().sort((a, b) => b.symbolCount - a.symbolCount);
  const angles = balancedAngles(sectors.length);

  const branches: BranchNode[] = [];
  for (let i = 0; i < sectors.length; i++) {
    const s = sectors[i];
    const angle = angles[i];
    const rng = mulberry32(hashStringToSeed(s.sector));

    // spread branch roots along trunk to avoid all sectors exploding from one hub.
    const horiz = Math.min(1, Math.abs(angle - (-Math.PI / 2)) / ((55 * Math.PI) / 180));
    const yStart = lerp(h * 0.62, h * 0.28, 1 - smoothstep(horiz));
    const xStart = lerp(trunkBase.x, trunkTop.x, (shoreY - yStart) / (shoreY - trunkTop.y));
    const p0: Pt = { x: xStart, y: yStart };

    const mag = clamp(Math.abs(s.avgChangePct) / 3.2, 0, 1);
    const baseLen = w * (0.22 + 0.11 * clamp(s.symbolCount / 18, 0, 1));
    const len = baseLen * (0.95 + mag * 0.16);

    const dir: Pt = { x: Math.cos(angle), y: Math.sin(angle) };
    const nrm = perp(dir);
    const curve = (rng() - 0.5) * w * 0.08;

    const p3: Pt = { x: p0.x + dir.x * len + nrm.x * curve * 0.55, y: p0.y + dir.y * len + nrm.y * curve * 0.55 };
    const c1: Pt = { x: p0.x + dir.x * len * 0.30 + nrm.x * curve, y: p0.y + dir.y * len * 0.30 + nrm.y * curve };
    const c2: Pt = { x: p0.x + dir.x * len * 0.72 + nrm.x * curve * 0.65, y: p0.y + dir.y * len * 0.72 + nrm.y * curve * 0.65 };

    const thickness = lerp(11, 20, clamp(s.symbolCount / 18, 0, 1));
    const phase = rng() * Math.PI * 2;

    // generate twigs
    const twigCount = clamp(Math.round(s.symbolCount / 2.6), 6, 12);
    const twigs: TwigNode[] = [];
    for (let t = 0; t < twigCount; t++) {
      const tt = clamp(0.54 + (t / Math.max(1, twigCount - 1)) * 0.42 + (rng() - 0.5) * 0.05, 0.45, 0.98);
      const p = bezierPoint(p0, c1, c2, p3, tt);
      const tan = bezierTangent(p0, c1, c2, p3, tt);

      // twig direction biased upward and outward
      const baseAng = Math.atan2(tan.y, tan.x);
      const twigAng = baseAng + (rng() - 0.5) * 0.9 + (rng() * 0.35);
      const twigDir: Pt = { x: Math.cos(twigAng), y: Math.sin(twigAng) };
      const twigNrm = perp(twigDir);
      const twigLen = w * (0.065 + 0.036 * rng());

      const tp0: Pt = { x: p.x, y: p.y };
      const tp3: Pt = { x: p.x + twigDir.x * twigLen, y: p.y + twigDir.y * twigLen };
      const tcurve = (rng() - 0.5) * w * 0.02;
      const tc1: Pt = { x: tp0.x + twigDir.x * twigLen * 0.35 + twigNrm.x * tcurve, y: tp0.y + twigDir.y * twigLen * 0.35 + twigNrm.y * tcurve };
      const tc2: Pt = { x: tp0.x + twigDir.x * twigLen * 0.75 + twigNrm.x * tcurve * 0.6, y: tp0.y + twigDir.y * twigLen * 0.75 + twigNrm.y * tcurve * 0.6 };

      twigs.push({
        sector: s.sector,
        p0: tp0,
        c1: tc1,
        c2: tc2,
        p3: tp3,
        thickness: thickness * 0.32,
        phase: rng() * Math.PI * 2
      });
    }

    branches.push({
      sector: s.sector,
      avgChangePct: s.avgChangePct,
      symbolCount: s.symbolCount,
      angle,
      p0,
      c1,
      c2,
      p3,
      thickness,
      phase,
      twigs
    });
  }

  // Build collision geometry for hard no-intersection leaf placement.
  const branchSegments: BranchSegment[] = [];

  for (let i = 0; i < 20; i++) {
    const t0 = i / 20;
    const t1 = (i + 1) / 20;
    branchSegments.push({
      a: { x: lerp(trunkBase.x, trunkTop.x, t0), y: lerp(trunkBase.y, trunkTop.y, t0) },
      b: { x: lerp(trunkBase.x, trunkTop.x, t1), y: lerp(trunkBase.y, trunkTop.y, t1) },
      radius: lerp(14, 9, (t0 + t1) * 0.5)
    });
  }

  for (const br of branches) {
    branchSegments.push(
      ...sampleBezierSegments(br.p0, br.c1, br.c2, br.p3, br.thickness * 0.56, br.thickness * 0.28, 24)
    );
    for (const tw of br.twigs) {
      branchSegments.push(
        ...sampleBezierSegments(tw.p0, tw.c1, tw.c2, tw.p3, tw.thickness * 0.70, tw.thickness * 0.38, 12)
      );
    }
  }

  // Leaves: place in a dense canopy region with sector-biased wedges + collision constraints.
  const leaves: LeafNode[] = [];
  const canopy = {
    cx: w * 0.50,
    cy: h * 0.41,
    rx: w * 0.33,
    ry: h * 0.23
  };

  const stocksBySector = new Map<string, Stock[]>();
  for (const st of data.n100.stocks) {
    const arr = stocksBySector.get(st.sector) ?? [];
    arr.push(st);
    stocksBySector.set(st.sector, arr);
  }
  const branchBySector = new Map(branches.map((b) => [b.sector, b] as const));

  const insideCanopy = (p: Pt) => {
    const nx = (p.x - canopy.cx) / canopy.rx;
    const ny = (p.y - canopy.cy) / canopy.ry;
    return (nx * nx + ny * ny) <= 1;
  };

  for (const br of branches) {
    const arr = (stocksBySector.get(br.sector) ?? []).slice().sort((a, b) => a.symbol.localeCompare(b.symbol));
    const rng = mulberry32(hashStringToSeed(`${br.sector}:canopy`));

    for (const st of arr) {
      const leafScale = clampPctToLeafScale(st.dayChangePct) * lerp(0.98, 1.16, rng());
      const sx = 18 * leafScale * lerp(0.95, 1.08, rng());
      const sy = 30 * leafScale * lerp(0.92, 1.12, rng());
      const radius = 14.8 * leafScale;
      const shapeIdx = Math.floor(rng() * LEAF_SHAPES.length);

      let chosen: Pt | null = null;
      let best: { p: Pt; score: number } | null = null;
      const maxAttempts = 420;

      for (let a = 0; a < maxAttempts; a++) {
        const relax = a / maxAttempts;
        const sectorSpread = lerp(0.46, 1.30, relax);
        const sectorTheta = br.angle + (rng() - 0.5) * 2 * sectorSpread;
        const globalTheta = -Math.PI + rng() * Math.PI * 2;
        const thetaMix = lerp(0.24, 0.38, relax);
        const theta = lerp(sectorTheta, globalTheta, thetaMix);
        const radial = 0.04 + Math.pow(rng(), 1.32) * 0.96;
        const jitterX = (rng() - 0.5) * lerp(4, 14, relax);
        const jitterY = (rng() - 0.5) * lerp(3, 11, relax);
        const p: Pt = {
          x: canopy.cx + Math.cos(theta) * canopy.rx * radial + jitterX,
          y: canopy.cy + Math.sin(theta) * canopy.ry * radial + jitterY
        };

        if (!insideCanopy(p)) continue;
        if (p.y > h * 0.66 || p.y < h * 0.12) continue;

        const pad = lerp(9, 3, relax); // includes sway safety margin
        const clear = minBranchClearance(p, branchSegments);
        if (clear <= radius + pad) continue;

        const overlap = lerp(0.78, 0.62, relax);
        if (intersectsLeafCrowd(p, radius, leaves, overlap)) {
          const leafGap = minLeafDistance(p, leaves);
          const score = leafGap + clear * 0.34;
          if (!best || score > best.score) best = { p, score };
          continue;
        }

        chosen = p;
        break;
      }

      if (!chosen && best) {
        chosen = best.p;
      }

      if (!chosen) {
        // Fallback: global canopy search with strict branch exclusion and softer leaf overlap.
        for (let a = 0; a < 320 && !chosen; a++) {
          const theta = (-Math.PI + rng() * Math.PI * 2) * 0.45 + br.angle * 0.55;
          const radial = 0.04 + Math.pow(rng(), 1.20) * 0.96;
          const p: Pt = {
            x: canopy.cx + Math.cos(theta) * canopy.rx * radial,
            y: canopy.cy + Math.sin(theta) * canopy.ry * radial
          };
          if (!insideCanopy(p)) continue;
          if (p.y > h * 0.66 || p.y < h * 0.12) continue;
          if (minBranchClearance(p, branchSegments) <= radius + 4) continue;
          if (intersectsLeafCrowd(p, radius, leaves, 0.58)) continue;
          chosen = p;
        }
      }

      if (!chosen) continue;

      const toCenter = Math.atan2(chosen.y - canopy.cy, chosen.x - canopy.cx);
      const baseRot = toCenter + Math.PI / 2 + (rng() - 0.5) * 0.55;
      const depth = clamp((canopy.cy + canopy.ry - chosen.y) / (canopy.ry * 2), 0, 1);
      const swayAmp = lerp(0.05, 0.18, rng()) * lerp(1.12, 0.84, clamp(leafScale - 0.8, 0, 1));

      leaves.push({
        stock: st,
        sector: st.sector,
        base: chosen,
        baseRot,
        sx,
        sy,
        phase: rng() * Math.PI * 2,
        swayAmp,
        depth,
        shapeIdx,
        branchSector: br.sector,
        radius
      });
    }
  }

  if (leaves.length < data.n100.stocks.length) {
    const placed = new Set(leaves.map((l) => l.stock.symbol));
    const missing = data.n100.stocks.filter((s) => !placed.has(s.symbol));
    const fallbackRng = mulberry32(hashStringToSeed("canopy:fallback"));

    for (const st of missing) {
      const br = branchBySector.get(st.sector);
      if (!br) continue;

      const leafScale = clampPctToLeafScale(st.dayChangePct) * lerp(0.98, 1.10, fallbackRng());
      const sx = 18 * leafScale * lerp(0.95, 1.08, fallbackRng());
      const sy = 30 * leafScale * lerp(0.92, 1.12, fallbackRng());
      const radius = 14.8 * leafScale;
      const shapeIdx = Math.floor(fallbackRng() * LEAF_SHAPES.length);

      let chosen: Pt | null = null;
      for (let a = 0; a < 680 && !chosen; a++) {
        const theta = (-Math.PI + fallbackRng() * Math.PI * 2) * 0.45 + br.angle * 0.55;
        const radial = 0.04 + Math.pow(fallbackRng(), 1.20) * 0.96;
        const p: Pt = {
          x: canopy.cx + Math.cos(theta) * canopy.rx * radial,
          y: canopy.cy + Math.sin(theta) * canopy.ry * radial
        };
        if (!insideCanopy(p)) continue;
        if (p.y > h * 0.66 || p.y < h * 0.12) continue;
        if (minBranchClearance(p, branchSegments) <= radius + 3) continue;
        if (intersectsLeafCrowd(p, radius, leaves, 0.56)) continue;
        chosen = p;
      }
      if (!chosen) continue;

      const toCenter = Math.atan2(chosen.y - canopy.cy, chosen.x - canopy.cx);
      const baseRot = toCenter + Math.PI / 2 + (fallbackRng() - 0.5) * 0.55;
      const depth = clamp((canopy.cy + canopy.ry - chosen.y) / (canopy.ry * 2), 0, 1);
      const swayAmp = lerp(0.05, 0.16, fallbackRng()) * lerp(1.10, 0.86, clamp(leafScale - 0.8, 0, 1));

      leaves.push({
        stock: st,
        sector: st.sector,
        base: chosen,
        baseRot,
        sx,
        sy,
        phase: fallbackRng() * Math.PI * 2,
        swayAmp,
        depth,
        shapeIdx,
        branchSector: br.sector,
        radius
      });
    }
  }

  // painter's sort: draw back-to-front by y, then by depth
  leaves.sort((a, b) => (a.base.y - b.base.y) || (a.depth - b.depth));

  // Heatmap pre-render (N100 RSI). We'll render in a subtle "atmosphere" band and fade to the right.
  const heatmapCanvas = document.createElement("canvas");
  heatmapCanvas.width = Math.max(1, Math.floor(w));
  heatmapCanvas.height = Math.max(1, Math.floor(h));
  const hc = heatmapCanvas.getContext("2d")!;
  renderRsiAtmosphere(hc, w, h, data);

  // Pollen particles
  const particles: Particle[] = [];
  const pCount = 120;
  for (let i = 0; i < pCount; i++) {
    const pr = Math.random();
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h * 0.70,
      z: pr,
      r: lerp(0.6, 2.2, 1 - pr),
      vx: lerp(6, 26, 1 - pr),
      vy: lerp(-2, 8, 1 - pr),
      a: lerp(0.08, 0.22, 1 - pr),
      phase: Math.random() * Math.PI * 2
    });
  }

  return {
    shoreY,
    waterTopBand,
    trunkBase,
    trunkTop,
    branches,
    leaves,
    heatmapCanvas,
    grainPattern,
    barkPattern,
    leafSpeckle,
    particles
  };
}

function renderRsiAtmosphere(hc: CanvasRenderingContext2D, w: number, h: number, data: DashboardPayload) {
  hc.clearRect(0, 0, w, h);
  const top = h * 0.06;
  const bottom = h * 0.72;
  const left = w * 0.06;
  const right = w * 0.94;

  const rows = data.rsiHeatmap.values.length;
  const cols = data.rsiHeatmap.minutes.length;

  // Downsample to keep it soft + cheap
  const rowStep = Math.max(1, Math.floor(rows / 90));
  const colStep = Math.max(1, Math.floor(cols / 180));
  const drawRows = Math.floor(rows / rowStep);
  const drawCols = Math.floor(cols / colStep);

  const cellW = (right - left) / drawCols;
  const cellH = (bottom - top) / drawRows;

  // horizontal fade (left visible, right fades out)
  for (let r = 0; r < drawRows; r++) {
    const rr = r * rowStep;
    for (let c = 0; c < drawCols; c++) {
      const cc = c * colStep;
      const v = data.rsiHeatmap.values[rr][cc];
      const hsl = hslFromRsi(v);
      const x = left + c * cellW;
      const fade = 1 - Math.pow(c / Math.max(1, drawCols - 1), 1.4);
      hc.globalAlpha = 0.11 * fade;
      hc.fillStyle = hslToCss(hsl, 1);
      hc.fillRect(x, top + r * cellH, cellW + 0.5, cellH + 0.5);
    }
  }
  hc.globalAlpha = 1;

  // vignette to keep edges clean
  const vg = hc.createRadialGradient(w * 0.5, h * 0.34, 0, w * 0.5, h * 0.34, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(255,255,255,0)");
  vg.addColorStop(1, "rgba(255,255,255,0.86)");
  hc.fillStyle = vg;
  hc.fillRect(0, 0, w, h);
}

function leafTransform(leaf: LeafNode, tAnim: number, wind: number) {
  const sway = Math.sin(tAnim * (0.85 + leaf.swayAmp * 1.6) + leaf.phase) * (0.6 + 0.4 * leaf.swayAmp);
  const rot = leaf.baseRot + sway * wind * 0.62;
  const x = leaf.base.x + sway * wind * 3.4;
  const y = leaf.base.y + Math.cos(tAnim * 0.9 + leaf.phase) * wind * 1.2;
  return { x, y, rot };
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: DashboardPayload,
  timeT: number,
  windMul: number,
  selectedSector: string | null,
  tAnim: number,
  layout: NonNullable<ReturnType<typeof buildLayout>>,
  hover: HoverInfo | null,
  pointer: { x: number; y: number } | null
) {
  // Background base (white paper + subtle cool gradient)
  ctx.clearRect(0, 0, w, h);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#ffffff");
  bg.addColorStop(1, "#f4f6fb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // RSI atmosphere
  if (layout.heatmapCanvas) {
    ctx.save();
    // At open, it is more visible; it fades a bit through the day.
    const alpha = lerp(0.65, 0.38, clamp(timeT, 0, 1));
    ctx.globalAlpha = alpha;
    ctx.filter = "blur(11px)";
    ctx.drawImage(layout.heatmapCanvas, 0, 0, w, h);
    ctx.filter = "none";
    ctx.restore();
  }

  // Subtle grain
  if (layout.grainPattern) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = layout.grainPattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Determine current time index on NIFTY50 series
  const idxNow = Math.floor(clamp(timeT, 0, 1) * (data.nifty50.series.length - 1));
  const ptNow = data.nifty50.series[idxNow] ?? data.nifty50.series[data.nifty50.series.length - 1];

  // Wind and volatility
  const wind = windFromVix(data.vix.value) * windMul;
  const vol = volatilityFromSeries(data.nifty50.series, idxNow);
  const rsiNow = clamp(rsiFromSeries(data.nifty50.series, idxNow), 30, 70);

  // Sun (NIFTY50)
  drawSun(ctx, w, h, data, timeT);

  // Particles (wind)
  drawParticles(ctx, w, h, layout.particles, wind, tAnim);

  // Water (RSI) and ground
  drawWater(ctx, w, h, rsiNow, wind, vol, tAnim, layout.shoreY, layout.waterTopBand);
  drawGround(ctx, w, h, layout.shoreY);

  // Fallen leaves (top gainers/losers)
  drawFallenLeaves(ctx, w, h, data.n100.stocks, tAnim, wind, layout.shoreY, layout.leafSpeckle);

  // Tree: trunk + branches + leaves
  drawTree(ctx, w, h, data, layout, tAnim, wind, selectedSector, hover?.leaf ?? null);

  // Timeline axis + current readout
  drawTimeline(ctx, w, h, data, timeT, ptNow);

  // Cursor aura (optional)
  if (pointer) {
    ctx.save();
    const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 120);
    g.addColorStop(0, "rgba(15,23,42,0.04)");
    g.addColorStop(1, "rgba(15,23,42,0)");
    ctx.fillStyle = g;
    ctx.fillRect(pointer.x - 120, pointer.y - 120, 240, 240);
    ctx.restore();
  }
}

function drawSun(ctx: CanvasRenderingContext2D, w: number, h: number, data: DashboardPayload, timeT: number) {
  const left = w * 0.08;
  const right = w * 0.92;
  const top = h * 0.035;
  const arcH = h * 0.15;

  const series = data.nifty50.series;
  const currentT = clamp(timeT, 0, 1);
  const cutoff = Math.floor(currentT * (series.length - 1));
  const start = Math.max(0, cutoff - 46);

  // trail
  for (let i = start; i <= cutoff; i++) {
    const p = series[i];
    const t = clamp(p.t, 0, 1);
    const x = lerp(left, right, t);
    const y = top + Math.sin(Math.PI * (1 - t)) * arcH;

    const age = (cutoff - i) / Math.max(1, cutoff - start);
    const fade = Math.pow(1 - age, 1.8);

    const mag = clamp(Math.abs(p.changePct) / 2.8, 0, 1);
    const r = lerp(10, 34, mag);
    const hsl = hslFromIndexChange(p.changePct);

    ctx.save();
    ctx.globalAlpha = 0.18 * fade;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    rg.addColorStop(0, hslToCss(hsl, 0.55));
    rg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // current sun
  const now = series[cutoff] ?? series[series.length - 1];
  const x = lerp(left, right, clamp(now.t, 0, 1));
  const y = top + Math.sin(Math.PI * (1 - clamp(now.t, 0, 1))) * arcH;

  const mag = clamp(Math.abs(now.changePct) / 2.8, 0, 1);
  const r = lerp(18, 52, mag);
  const hsl = hslFromIndexChange(now.changePct);

  ctx.save();
  // halo
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.8);
  halo.addColorStop(0, hslToCss(hsl, 0.45));
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.8, 0, Math.PI * 2);
  ctx.fill();

  // core
  const core = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
  core.addColorStop(0, "rgba(255,255,255,0.95)");
  core.addColorStop(0.28, hslToCss({ ...hsl, l: clamp(hsl.l + 10, 40, 78) }, 0.92));
  core.addColorStop(1, hslToCss({ ...hsl, l: clamp(hsl.l - 8, 25, 65) }, 0.95));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // subtle ring
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = hslToCss({ ...hsl, s: clamp(hsl.s + 10, 30, 95), l: clamp(hsl.l + 10, 30, 85) }, 1);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // time labels
  ctx.save();
  ctx.fillStyle = "rgba(15,23,42,0.55)";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(data.session.open, w * 0.06, h * 0.06);
  const t = ctx.measureText(data.session.close);
  ctx.fillText(data.session.close, w * 0.94 - t.width, h * 0.06);
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number, parts: Particle[], wind: number, tAnim: number) {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (const p of parts) {
    // update
    const sp = lerp(0.15, 1.0, wind);
    p.x += (p.vx * sp + Math.cos(p.phase + tAnim * 0.35) * 6) * 0.016;
    p.y += (p.vy * sp + Math.sin(p.phase + tAnim * 0.30) * 2) * 0.016;

    if (p.x > w + 40) p.x = -40;
    if (p.x < -40) p.x = w + 40;
    if (p.y > h * 0.72) p.y = -40;
    if (p.y < -60) p.y = h * 0.70;

    const a = p.a * lerp(0.25, 1, wind);
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(255, 230, 160, 1)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

function drawWater(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rsi: number,
  wind: number,
  vol: number,
  tAnim: number,
  shoreY: number,
  band: { min: number; max: number }
) {
  const t = clamp((rsi - 30) / 40, 0, 1);
  const waterY = lerp(band.max, band.min, t);

  // Underwater gradient
  ctx.save();
  const g = ctx.createLinearGradient(0, waterY - 40, 0, shoreY + 140);
  g.addColorStop(0, "rgba(40, 120, 190, 0.22)");
  g.addColorStop(0.55, "rgba(25, 85, 150, 0.18)");
  g.addColorStop(1, "rgba(10, 45, 90, 0.12)");
  ctx.fillStyle = g;
  ctx.fillRect(0, waterY, w, h - waterY);
  ctx.restore();

  // Wave line
  const amp = lerp(2.5, 12.5, clamp(vol * 120, 0, 1)) * lerp(0.65, 1.25, wind);
  const freq = lerp(0.010, 0.020, wind);
  const speed = lerp(0.8, 1.8, wind);

  ctx.save();
  ctx.beginPath();
  const y0 = waterY;
  for (let x = 0; x <= w; x += 8) {
    const y =
      y0 +
      Math.sin(x * freq + tAnim * speed) * amp +
      Math.sin(x * freq * 0.5 + tAnim * speed * 0.6) * (amp * 0.45);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();

  const wg = ctx.createLinearGradient(0, waterY - 20, 0, h);
  wg.addColorStop(0, "rgba(255,255,255,0.20)");
  wg.addColorStop(1, "rgba(255,255,255,0.00)");
  ctx.fillStyle = wg;
  ctx.fill();

  // highlight crest
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // RSI reference marks (30/70)
  const y70 = band.min;
  const y30 = band.max;
  ctx.save();
  ctx.setLineDash([5, 6]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(15,23,42,0.12)";
  ctx.beginPath();
  ctx.moveTo(w * 0.06, y70);
  ctx.lineTo(w * 0.94, y70);
  ctx.moveTo(w * 0.06, y30);
  ctx.lineTo(w * 0.94, y30);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(15,23,42,0.45)";
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.fillText("RSI 70", w * 0.94 - 46, y70 - 10);
  ctx.fillText("RSI 30", w * 0.94 - 46, y30 + 10);
  ctx.restore();

  // subtle mist near shoreline
  ctx.save();
  const mg = ctx.createLinearGradient(0, shoreY - 80, 0, shoreY + 20);
  mg.addColorStop(0, "rgba(255,255,255,0)");
  mg.addColorStop(1, "rgba(255,255,255,0.45)");
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = mg;
  ctx.fillRect(0, shoreY - 80, w, 110);
  ctx.restore();
}

function drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, shoreY: number) {
  ctx.save();
  const g = ctx.createLinearGradient(0, shoreY - 10, 0, h);
  g.addColorStop(0, "rgba(210, 180, 140, 0.10)");
  g.addColorStop(0.30, "rgba(190, 160, 120, 0.12)");
  g.addColorStop(1, "rgba(160, 130, 100, 0.12)");
  ctx.fillStyle = g;
  ctx.fillRect(0, shoreY, w, h - shoreY);

  // shoreline line
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "rgba(15,23,42,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, shoreY);
  ctx.lineTo(w * 0.94, shoreY);
  ctx.stroke();

  ctx.restore();
}

function drawFallenLeaves(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stocks: Stock[],
  tAnim: number,
  wind: number,
  shoreY: number,
  leafSpeckle: CanvasPattern | null
) {
  const sorted = stocks.slice().sort((a, b) => b.dayChangePct - a.dayChangePct);
  const gainers = sorted.slice(0, 6);
  const losers = sorted.slice(-6).reverse();

  // left losers
  for (let i = 0; i < losers.length; i++) {
    const s = losers[i];
    const x = w * 0.12 + i * 26;
    const y = shoreY + 26 + Math.sin(tAnim * 0.6 + i) * wind * 1.4;
    drawLeafGlyph(ctx, x, y, (-0.9 + i * 0.12), 18, 28, s.dayChangePct, 0.65, true, leafSpeckle);
  }
  // right gainers
  for (let i = 0; i < gainers.length; i++) {
    const s = gainers[i];
    const x = w * 0.88 - i * 26;
    const y = shoreY + 26 + Math.cos(tAnim * 0.6 + i) * wind * 1.4;
    drawLeafGlyph(ctx, x, y, (0.9 - i * 0.12), 18, 28, s.dayChangePct, 0.65, true, leafSpeckle);
  }

  // labels
  ctx.save();
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(15,23,42,0.55)";
  ctx.fillText("Top losers", w * 0.06, shoreY + 18);
  const t = ctx.measureText("Top gainers");
  ctx.fillText("Top gainers", w * 0.94 - t.width, shoreY + 18);
  ctx.restore();
}

function drawTree(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: DashboardPayload,
  L: NonNullable<ReturnType<typeof buildLayout>>,
  tAnim: number,
  wind: number,
  selectedSector: string | null,
  hoverLeaf: LeafNode | null
) {
  // "breathing" drift for life
  const breathe = Math.sin(tAnim * 0.18) * 2.2;
  const trunkBase = { x: L.trunkBase.x, y: L.trunkBase.y + breathe };
  const trunkTop = { x: L.trunkTop.x + Math.sin(tAnim * 0.22) * wind * 2.0, y: L.trunkTop.y + breathe };

  // trunk curve
  const mid: Pt = {
    x: lerp(trunkBase.x, trunkTop.x, 0.5) + Math.sin(tAnim * 0.20) * wind * 3.2,
    y: lerp(trunkBase.y, trunkTop.y, 0.5) + breathe
  };
  const trunkPath = new Path2D();
  trunkPath.moveTo(trunkBase.x, trunkBase.y);
  trunkPath.quadraticCurveTo(mid.x, mid.y, trunkTop.x, trunkTop.y);

  // trunk shading (cylindrical illusion)
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // shadow
  ctx.strokeStyle = "rgba(15,23,42,0.18)";
  ctx.lineWidth = 30;
  ctx.save();
  ctx.translate(3, 7);
  ctx.stroke(trunkPath);
  ctx.restore();

  // base
  const barkGrad = ctx.createLinearGradient(trunkTop.x - 12, trunkTop.y, trunkTop.x + 14, trunkBase.y);
  barkGrad.addColorStop(0, "rgba(70, 40, 24, 0.95)");
  barkGrad.addColorStop(0.45, "rgba(126, 78, 46, 0.98)");
  barkGrad.addColorStop(1, "rgba(62, 36, 22, 0.98)");
  ctx.strokeStyle = barkGrad;
  ctx.lineWidth = 26;
  ctx.stroke(trunkPath);

  // highlight (light from upper-left)
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 10;
  ctx.save();
  ctx.translate(-2, -2);
  ctx.stroke(trunkPath);
  ctx.restore();

  // bark scratches overlay
  if (L.barkPattern) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = L.barkPattern as any;
    ctx.lineWidth = 26;
    ctx.stroke(trunkPath);
    ctx.restore();
  }

  // cracks: short strokes along trunk
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = "rgba(25,14,8,1)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const tt = (i + 0.5) / 26;
    const p = bezierPoint(trunkBase, mid, trunkTop, trunkTop, tt);
    ctx.beginPath();
    ctx.moveTo(p.x - 8, p.y + Math.sin(i) * 2);
    ctx.lineTo(p.x + 7, p.y + Math.cos(i * 1.2) * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();

  // branches + twigs
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const br of L.branches) {
    const sel = selectedSector ? br.sector === selectedSector : true;
    const fade = selectedSector && !sel ? 0.22 : 1;

    // sway
    const sway = Math.sin(tAnim * 0.42 + br.phase) * wind * 0.04;
    const p0 = { x: br.p0.x, y: br.p0.y + breathe };
    const p3: Pt = { x: br.p3.x + Math.cos(sway) * 8, y: br.p3.y + Math.sin(sway) * 8 + breathe };
    const c1 = { x: br.c1.x, y: br.c1.y + breathe };
    const c2 = { x: br.c2.x, y: br.c2.y + breathe };

    const path = new Path2D();
    path.moveTo(p0.x, p0.y);
    path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);

    // base bark
    ctx.globalAlpha = 0.92 * fade;
    ctx.strokeStyle = "rgba(92, 56, 36, 0.95)";
    ctx.lineWidth = br.thickness;
    ctx.stroke(path);

    // cylindrical shading by offset highlight
    ctx.globalAlpha = 0.18 * fade;
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.lineWidth = br.thickness * 0.30;
    ctx.save();
    ctx.translate(-2, -2);
    ctx.stroke(path);
    ctx.restore();

    // sap glow = sector performance (subtle, inside)
    const inner = branchInnerHslFromSector(br.avgChangePct);
    ctx.globalAlpha = 0.42 * fade;
    ctx.strokeStyle = hslToCss(inner, 1);
    ctx.lineWidth = br.thickness * 0.42;
    ctx.stroke(path);

    // bark scratches overlay
    if (L.barkPattern) {
      ctx.save();
      ctx.globalAlpha = 0.06 * fade;
      ctx.strokeStyle = L.barkPattern as any;
      ctx.lineWidth = br.thickness;
      ctx.stroke(path);
      ctx.restore();
    }

    // twigs
    for (const tw of br.twigs) {
      const tsway = Math.sin(tAnim * 0.50 + tw.phase) * wind * 0.05;
      const tp3: Pt = { x: tw.p3.x + Math.cos(tsway) * 3.5, y: tw.p3.y + Math.sin(tsway) * 3.5 + breathe };
      const tpath = new Path2D();
      tpath.moveTo(tw.p0.x, tw.p0.y + breathe);
      tpath.bezierCurveTo(tw.c1.x, tw.c1.y + breathe, tw.c2.x, tw.c2.y + breathe, tp3.x, tp3.y);

      ctx.globalAlpha = 0.70 * fade;
      ctx.strokeStyle = "rgba(90, 55, 34, 0.85)";
      ctx.lineWidth = tw.thickness;
      ctx.stroke(tpath);

      ctx.globalAlpha = 0.14 * fade;
      ctx.strokeStyle = "rgba(255,255,255,1)";
      ctx.lineWidth = tw.thickness * 0.25;
      ctx.save();
      ctx.translate(-1.2, -1.2);
      ctx.stroke(tpath);
      ctx.restore();
    }

    // ambient occlusion at branch root
    ctx.save();
    ctx.globalAlpha = 0.22 * fade;
    ctx.fillStyle = "rgba(15,23,42,1)";
    ctx.beginPath();
    ctx.ellipse(p0.x, p0.y, br.thickness * 0.55, br.thickness * 0.35, br.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // leaves
  for (const leaf of L.leaves) {
    const sel = selectedSector ? leaf.sector === selectedSector : true;
    const fade = selectedSector && !sel ? 0.16 : 1;

    const dyn = leafTransform(leaf, tAnim, wind);
    const isHover = hoverLeaf?.stock.symbol === leaf.stock.symbol;
    const alpha = fade * (isHover ? 1 : 0.92);

    // far leaves slightly lighter + blur
    const blur = lerp(0.0, 1.2, leaf.depth);
    drawLeafGlyph(
      ctx,
      dyn.x,
      dyn.y,
      dyn.rot,
      leaf.sx,
      leaf.sy,
      leaf.stock.dayChangePct,
      alpha,
      false,
      L.leafSpeckle,
      leaf.shapeIdx,
      blur,
      isHover ? data.rsiHeatmap.values[data.rsiHeatmap.symbols.indexOf(leaf.stock.symbol)] : null
    );
  }
}

function drawLeafGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rot: number,
  sx: number,
  sy: number,
  dayChangePct: number,
  alpha: number,
  fallen: boolean,
  leafSpeckle: CanvasPattern | null,
  shapeIdx = 0,
  blurPx = 0,
  intradayRow: number[] | null = null
) {
  const shape = LEAF_SHAPES[shapeIdx % LEAF_SHAPES.length];

  const base = leafHslFromChange(dayChangePct);
  const light = { ...base, l: clamp(base.l + 12, 20, 85), s: clamp(base.s - 8, 10, 90) };
  const dark = { ...base, l: clamp(base.l - 14, 8, 70), s: clamp(base.s + 4, 10, 95) };

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(sx, sy);

  if (blurPx > 0.01) ctx.filter = `blur(${blurPx}px)`;

  // shadow
  ctx.save();
  ctx.globalAlpha = fallen ? alpha * 0.24 : alpha * 0.36;
  ctx.shadowColor = "rgba(15,23,42,0.22)";
  ctx.shadowBlur = fallen ? 10 : 14;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = "rgba(22,22,22,0.08)";
  ctx.fill(shape);
  ctx.restore();

  // gradient fill (3D-ish)
  const g = ctx.createLinearGradient(-0.45, -0.95, 0.55, 0.10);
  g.addColorStop(0, hslToCss(light, 1));
  g.addColorStop(0.55, hslToCss(base, 1));
  g.addColorStop(1, hslToCss(dark, 1));

  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fill(shape);

  // intraday texture on hover (RSI row)
  if (intradayRow && intradayRow.length > 6) {
    ctx.save();
    ctx.globalAlpha = 0.52;
    // create a stepped gradient along leaf length
    const gg = ctx.createLinearGradient(0, 0, 0, -1);
    const n = Math.min(48, intradayRow.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor((i / (n - 1)) * (intradayRow.length - 1));
      const v = intradayRow[idx];
      const c = hslFromRsi(v);
      // make it subtle, so we keep "leaf realism"
      const cc = { ...c, s: clamp(c.s * 0.50, 16, 58), l: clamp(c.l + 6, 28, 78) };
      gg.addColorStop(i / (n - 1), hslToCss(cc, 1));
    }
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = gg;
    ctx.fill(shape);
    ctx.restore();
  }

  // veins (midrib + minors)
  ctx.save();
  ctx.globalAlpha = alpha * 0.38;
  ctx.lineCap = "round";

  const midG = ctx.createLinearGradient(0, 0, 0, -1);
  midG.addColorStop(0, "rgba(82,58,38,0.12)");
  midG.addColorStop(0.3, "rgba(255,255,255,0.18)");
  midG.addColorStop(1, "rgba(82,58,38,0.10)");
  ctx.strokeStyle = midG;
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  ctx.moveTo(0, 0.02);
  ctx.lineTo(0, -0.98);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.16;
  ctx.strokeStyle = "rgba(84,66,44,0.18)";
  ctx.lineWidth = 0.028;
  for (let t = 0.18; t <= 0.85; t += 0.13) {
    const y = -t;
    const span = lerp(0.08, 0.36, smoothstep(t));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(span, y + 0.06);
    ctx.moveTo(0, y);
    ctx.lineTo(-span, y + 0.06);
    ctx.stroke();
  }
  ctx.restore();

  // subtle speckle texture
  if (leafSpeckle) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.16;
    ctx.clip(shape);
    ctx.fillStyle = leafSpeckle;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  // edge + highlight
  ctx.save();
  ctx.globalAlpha = alpha * 0.12;
  ctx.strokeStyle = "rgba(92,72,52,0.16)";
  ctx.lineWidth = 0.03;
  ctx.stroke(shape);

  ctx.globalAlpha = alpha * 0.20;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 0.02;
  ctx.save();
  ctx.translate(-0.02, -0.02);
  ctx.stroke(shape);
  ctx.restore();

  ctx.restore();

  ctx.restore();
}

function drawTimeline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: DashboardPayload,
  timeT: number,
  now: { t: number; value: number; changePct: number; time: string }
) {
  const y = h * 0.93;
  const left = w * 0.08;
  const right = w * 0.92;
  const x = lerp(left, right, clamp(timeT, 0, 1));

  ctx.save();
  // axis
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = "rgba(15,23,42,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  // ticks
  ctx.globalAlpha = 0.18;
  for (let i = 0; i <= 6; i++) {
    const xx = lerp(left, right, i / 6);
    ctx.beginPath();
    ctx.moveTo(xx, y - 6);
    ctx.lineTo(xx, y + 6);
    ctx.stroke();
  }

  // marker
  ctx.globalAlpha = 1;
  const hsl = hslFromIndexChange(now.changePct);
  ctx.fillStyle = hslToCss(hsl, 0.95);
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.20;
  ctx.fillStyle = hslToCss(hsl, 1);
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();

  // readout box
  ctx.globalAlpha = 1;
  const label = `${now.time} • ${fmtNum(now.value)} • ${fmtPct(now.changePct)}`;
  ctx.font = "12px Inter, system-ui, sans-serif";
  const m = ctx.measureText(label);
  const padX = 10;
  const padY = 7;
  const bw = m.width + padX * 2;
  const bh = 26;
  const bx = clamp(x - bw / 2, 10, w - bw - 10);
  const by = y - 44;

  ctx.save();
  ctx.shadowColor = "rgba(15,23,42,0.10)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(15,23,42,0.10)";
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, bw, bh, 10);
  ctx.stroke();

  ctx.fillStyle = "rgba(15,23,42,0.78)";
  ctx.textBaseline = "middle";
  ctx.fillText(label, bx + padX, by + bh / 2);

  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function TreeCanvas({
  data,
  timeT,
  windMul,
  selectedSector,
  onHoverLeaf
}: {
  data: DashboardPayload;
  timeT: number;
  windMul: number;
  selectedSector: string | null;
  onHoverLeaf: (leaf: any | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<ReturnType<typeof buildLayout> | null>(null);
  const animRef = useRef({ t: 0, last: 0 });

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  const sectorsByName = useMemo(() => {
    const m = new Map<string, SectorStat>();
    for (const s of data.n100.sectors) m.set(s.sector, s);
    return m;
  }, [data]);

  // Resize + layout build
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      layoutRef.current = buildLayout(ctx, rect.width, rect.height, data, sectorsByName);
    });

    ro.observe(wrap);
    return () => ro.disconnect();
  }, [data, sectorsByName]);

  // Animation loop
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      const L = layoutRef.current;
      if (!canvas || !wrap || !L) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext("2d")!;
      const rect = wrap.getBoundingClientRect();
      const dt = Math.min(0.05, (now - animRef.current.last) / 1000);
      animRef.current.last = now;
      animRef.current.t += dt;

      // Reset transform each draw (dpr)
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawScene(ctx, rect.width, rect.height, data, timeT, windMul, selectedSector, animRef.current.t, L, hover, pointer);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data, timeT, windMul, selectedSector, hover, pointer]);

  // Pointer hover detection
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const onMove = (ev: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      setPointer({ x, y });

      const L = layoutRef.current;
      if (!L) return;

      // search front-to-back (reverse painter's sort)
      let found: LeafNode | null = null;
      for (let i = L.leaves.length - 1; i >= 0; i--) {
        const leaf = L.leaves[i];
        const dx = x - leaf.base.x;
        const dy = y - leaf.base.y;
        if (dx * dx + dy * dy <= (leaf.radius * leaf.radius) * 1.25) {
          found = leaf;
          break;
        }
      }

      if (found) {
        const hi: HoverInfo = { leaf: found, x, y };
        setHover(hi);
        onHoverLeaf(found.stock);
      } else {
        setHover(null);
        onHoverLeaf(null);
      }
    };

    const onLeave = () => {
      setPointer(null);
      setHover(null);
      onHoverLeaf(null);
    };

    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointermove", onMove as any);
      canvas.removeEventListener("pointerleave", onLeave as any);
    };
  }, [onHoverLeaf]);

  return (
    <div ref={wrapRef} className="relative h-[680px] w-full overflow-hidden rounded-2xl bg-white">
      <canvas ref={canvasRef} className="block" />
      {hover ? (
        <div
          className="pointer-events-none absolute z-20 w-[260px] -translate-x-1/2 -translate-y-[118%] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-soft backdrop-blur"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-slate-900">{hover.leaf.stock.symbol}</div>
              <div className="truncate text-xs text-slate-500">{hover.leaf.stock.sector}</div>
            </div>
            <div
              className={[
                "shrink-0 text-[13px] font-semibold tabular-nums",
                hover.leaf.stock.dayChangePct > 0.05
                  ? "text-emerald-600"
                  : hover.leaf.stock.dayChangePct < -0.05
                    ? "text-rose-600"
                    : "text-amber-700"
              ].join(" ")}
            >
              {fmtPct(hover.leaf.stock.dayChangePct)}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-50 px-2 py-1">
              <div className="text-[11px] text-slate-500">Last</div>
              <div className="mt-0.5 font-semibold tabular-nums text-slate-900">{fmtNum(hover.leaf.stock.lastPrice)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-1">
              <div className="text-[11px] text-slate-500">RSI</div>
              <div className="mt-0.5 font-semibold tabular-nums text-slate-900">{hover.leaf.stock.rsi.toFixed(1)}</div>
            </div>
          </div>

          {hover.leaf.stock.dailySeries?.length ? (
            <div className="mt-3">
              <div className="text-[11px] font-medium text-slate-600">Last 7 days</div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {hover.leaf.stock.dailySeries.slice(-7).map((d) => (
                  <div key={d.date} className="rounded-lg border border-slate-100 bg-white px-1.5 py-1 text-center">
                    <div className="text-[10px] text-slate-500">{d.day}</div>
                    <div
                      className={[
                        "mt-0.5 text-[11px] font-semibold tabular-nums",
                        d.changePct > 0.05
                          ? "text-emerald-600"
                          : d.changePct < -0.05
                            ? "text-rose-600"
                            : "text-amber-700"
                      ].join(" ")}
                    >
                      {fmtPct(d.changePct)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Hover texture shows intraday RSI (subtle overlay).
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
