import { accentColor, clear, fitCanvasToParent } from "./_canvas_util.js";

export class RegimeRadar {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.last = null;
    this.phase = 0;
    this._resize();
    window.addEventListener("resize", () => this._resize());
    requestAnimationFrame(() => this._anim());
  }

  _resize() { fitCanvasToParent(this.canvas); }

  update(snap) {
    this.last = snap.market || null;
    this.accent = accentColor(this.last ? this.last.index_change_pct : 0);
  }

  _anim() {
    this.phase += 0.016;
    this.draw();
    requestAnimationFrame(() => this._anim());
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width, h = this.canvas.height;
    clear(ctx, w, h);
    const m = this.last;
    if (!m) return;

    const accent = this.accent || accentColor(0);
    const cx = w * 0.5, cy = h * 0.55;
    const r = Math.min(w, h) * 0.33;

    const axes = [
      { k: "breadth", v: m.breadth_pct_advancers },
      { k: "vwap", v: m.breadth_pct_above_vwap },
      { k: "dispersion", v: 1 - m.leadership_concentration },
      { k: "stability", v: 1 - m.volatility_pulse },
      { k: "heat", v: m.market_heat_score / 100.0 },
    ];

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (r * i) / 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const pts = [];
    for (let i = 0; i < axes.length; i++) {
      const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
      const wobble = 1 + Math.sin(this.phase + i) * 0.01;
      const rr = r * axes[i].v * wobble;
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = accent.glow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = accent.stroke;
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = accent.stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `${Math.floor(12 * (window.devicePixelRatio || 1))}px Inter, system-ui`;
    ctx.fillText(m.regime_label, Math.floor(12 * (window.devicePixelRatio||1)), Math.floor(h*0.10));
    ctx.restore();
  }
}
