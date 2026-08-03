import { clear, fitCanvasToParent } from "./_canvas_util.js";

export class AnomalyTunnel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hist = [];
    this.phase = 0;
    this._resize();
    window.addEventListener("resize", () => this._resize());
    requestAnimationFrame(() => this._anim());
  }

  _resize() { fitCanvasToParent(this.canvas); }

  update(snap) {
    const a = (snap.anomalies || []).slice(0, 18);
    this.hist.push({
      rows: a.map(x => ({ sym: x.symbol, score: x.anomaly_score }))
    });
    if (this.hist.length > 90) this.hist.shift();
    this.latest = a;
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

    const scanX = (Math.sin(this.phase * 1.2) * 0.5 + 0.5) * w;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(scanX - 2, 0, 4, h);
    ctx.restore();

    if (!this.hist || this.hist.length < 2) return;
    const rowsN = Math.min(18, (this.latest || []).length || 18);
    const colsN = this.hist.length;
    const cellW = w / colsN;
    const cellH = h / rowsN;

    for (let c = 0; c < colsN; c++) {
      const col = this.hist[c];
      for (let r = 0; r < rowsN; r++) {
        const score = col.rows[r] ? col.rows[r].score : 0;
        const intensity = Math.max(0, Math.min(1, score / 100.0));
        const a = 0.02 + intensity * 0.18;
        ctx.fillStyle = `rgba(255,0,51,${a})`;
        ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `${Math.floor(11 * (window.devicePixelRatio || 1))}px Inter, system-ui`;
    const list = (this.latest || []).slice(0, rowsN);
    for (let r = 0; r < list.length; r++) {
      ctx.fillText(list[r].symbol, Math.floor(10 * (window.devicePixelRatio||1)), Math.floor((r + 0.8) * cellH));
    }
    ctx.restore();
  }
}
