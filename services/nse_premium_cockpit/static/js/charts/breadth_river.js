import { accentColor, clear, drawGrid, fitCanvasToParent } from "./_canvas_util.js";

export class BreadthRiver {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.history = [];
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
    this.history.push({
      adv: m.breadth_pct_advancers,
      abv: m.breadth_pct_above_vwap,
      ch: m.index_change_pct,
    });
    if (this.history.length > 180) this.history.shift();
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
    const accent = accentColor(last.ch);

    const adv = this.history.map(x => x.adv);
    const dec = this.history.map(x => 1 - x.adv);
    const abv = this.history.map(x => x.abv);
    const blw = this.history.map(x => 1 - x.abv);
    const zeros = adv.map(() => 0);

    function drawArea(series, baseSeries, fill, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let i = 0; i < series.length; i++) {
        const x = (w * i) / (series.length - 1);
        const y = h * (0.92 - (baseSeries[i] + series[i]) * 0.72);
        ctx.lineTo(x, y);
      }
      for (let i = series.length - 1; i >= 0; i--) {
        const x = (w * i) / (series.length - 1);
        const y = h * (0.92 - baseSeries[i] * 0.72);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawArea(abv, zeros, "rgba(255,255,255,0.12)", 1.0);
    drawArea(blw, abv, "rgba(255,255,255,0.04)", 1.0);
    drawArea(adv, zeros, accent.stroke, 0.18);
    drawArea(dec, adv, accent.stroke, 0.06);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.56);
    ctx.lineTo(w, h * 0.56);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `${Math.floor(12 * (window.devicePixelRatio || 1))}px Inter, system-ui`;
    ctx.fillText(`Adv ${Math.round(last.adv*100)}% • Above VWAP ${Math.round(last.abv*100)}%`, Math.floor(12 * (window.devicePixelRatio||1)), Math.floor(h*0.12));
    ctx.restore();
  }
}
