import { accentColor, clear, drawGrid, fitCanvasToParent } from "./_canvas_util.js";

export class PulseRibbon {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.history = [];
    this.lastRegime = null;
    this.pulse = 0;
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    fitCanvasToParent(this.canvas);
    this.draw();
  }

  update(snap) {
    const m = snap.market;
    if (!m) return;
    const t = new Date(m.ts).getTime();
    this.history.push({
      t,
      idx: m.index_change_pct,
      breadth: m.breadth_pct_advancers,
      vwap: m.breadth_pct_above_vwap,
      vol: m.volatility_pulse,
      heat: m.market_heat_score,
      regime: m.regime_label,
    });
    if (this.history.length > 260) this.history.shift();
    if (this.lastRegime && this.lastRegime !== m.regime_label) this.pulse = 1.0;
    this.lastRegime = m.regime_label;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width, h = this.canvas.height;
    clear(ctx, w, h);
    drawGrid(ctx, w, h);
    if (this.history.length < 2) return;

    const last = this.history[this.history.length - 1];
    const accent = accentColor(last.idx);
    this.pulse *= 0.92;

    const midY = h * 0.58;
    const amp = h * 0.22;

    ctx.save();
    ctx.shadowColor = accent.glow;
    ctx.shadowBlur = 16 + this.pulse * 10;
    ctx.strokeStyle = accent.stroke;
    ctx.lineWidth = 3;

    // Midline
    ctx.beginPath();
    for (let i = 0; i < this.history.length; i++) {
      const x = (w * i) / (this.history.length - 1);
      const y = midY - (this.history[i].idx / 0.015) * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Filled ribbon
    const thicknessBase = 10 + last.vol * 18;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = accent.stroke;
    ctx.beginPath();
    for (let i = 0; i < this.history.length; i++) {
      const x = (w * i) / (this.history.length - 1);
      const y = midY - (this.history[i].idx / 0.015) * amp;
      const thick = thicknessBase * (0.8 + this.history[i].vol * 0.6);
      ctx.lineTo(x, y - thick);
    }
    for (let i = this.history.length - 1; i >= 0; i--) {
      const x = (w * i) / (this.history.length - 1);
      const y = midY - (this.history[i].idx / 0.015) * amp;
      const thick = thicknessBase * (0.8 + this.history[i].vol * 0.6);
      ctx.lineTo(x, y + thick);
    }
    ctx.closePath();
    ctx.fill();

    // Breadth line
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < this.history.length; i++) {
      const x = (w * i) / (this.history.length - 1);
      const y = h * (0.18 + (1 - this.history[i].breadth) * 0.18);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `${Math.floor(12 * (window.devicePixelRatio || 1))}px Inter, system-ui`;
    ctx.fillText(`Regime: ${last.regime}`, Math.floor(12 * (window.devicePixelRatio || 1)), Math.floor(h * 0.90));
    ctx.restore();
  }
}
