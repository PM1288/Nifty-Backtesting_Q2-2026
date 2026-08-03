import { accentColor, clear, drawGrid, fitCanvasToParent } from "./_canvas_util.js";

export class OscilloscopeChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() { fitCanvasToParent(this.canvas); this.draw(); }

  update(detail) {
    this.detail = detail;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width, h = this.canvas.height;
    clear(ctx, w, h);
    drawGrid(ctx, w, h);
    if (!this.detail || !this.detail.bars || this.detail.bars.length < 2) return;

    const bars = this.detail.bars;
    const last = bars[bars.length-1];
    const first = bars[0];
    const ch = (last.close - first.open) / (first.open || 1);
    const accent = accentColor(ch);

    const closes = bars.map(b => b.close);
    const vwaps = bars.map(b => b.vwap);
    const minP = Math.min(...closes, ...vwaps);
    const maxP = Math.max(...closes, ...vwaps);
    const pad = (maxP - minP) * 0.08 + 1e-6;

    function yFor(p) {
      const v = (p - (minP - pad)) / ((maxP + pad) - (minP - pad));
      return h * (0.90 - v * 0.80);
    }

    ctx.save();
    ctx.strokeStyle = accent.stroke;
    ctx.shadowColor = accent.glow;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i=0;i<bars.length;i++){
      const x = (w * i) / (bars.length - 1);
      const y = yFor(bars[i].close);
      if (i===0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i=0;i<bars.length;i++){
      const x = (w * i) / (bars.length - 1);
      const y = yFor(bars[i].vwap);
      if (i===0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `${Math.floor(12 * (window.devicePixelRatio || 1))}px Inter, system-ui`;
    ctx.fillText("Price", Math.floor(12 * (window.devicePixelRatio||1)), Math.floor(h*0.12));
    ctx.fillText("VWAP", Math.floor(12 * (window.devicePixelRatio||1)), Math.floor(h*0.20));
    ctx.restore();
  }
}
