import { accentColor, clear, drawGrid, fitCanvasToParent } from "./_canvas_util.js";

export class LeaderOrb {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.points = [];
    this.t = 0;
    this._resize();
    window.addEventListener("resize", () => this._resize());
    requestAnimationFrame(() => this._anim());
  }

  _resize() { fitCanvasToParent(this.canvas); }

  update(snap) {
    const m = snap.market;
    const leaders = snap.leaders || [];
    this.points = leaders.map((p, i) => ({ ...p, i, phase: (p.residual_strength + 2) * 0.7 + i * 0.17 }));
    this.accent = accentColor(m ? m.index_change_pct : 0);
  }

  _anim() {
    this.t += 0.016;
    this.draw();
    requestAnimationFrame(() => this._anim());
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width, h = this.canvas.height;
    clear(ctx, w, h);
    drawGrid(ctx, w, h);
    if (!this.points || this.points.length === 0) return;

    const cx = w * 0.50, cy = h * 0.55;
    const rx = w * 0.40, ry = h * 0.35;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - rx, cy); ctx.lineTo(cx + rx, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - ry); ctx.lineTo(cx, cy + ry); ctx.stroke();
    ctx.restore();

    for (const p of this.points) {
      const xNorm = (p.residual_strength + 1.5) / 3.0;
      const yNorm = (p.volume_ratio - 0.1) / 2.9;
      const drift = Math.sin(this.t + p.phase) * 0.015;

      const x = cx + (xNorm - 0.5 + drift) * (rx * 2);
      const y = cy - (yNorm - 0.5 - drift) * (ry * 2);

      const size = 3 + Math.min(8, Math.abs(p.change_pct) * 120);
      const isUp = p.change_pct >= 0;

      const halo = Math.min(24, p.anomaly_score / 3.0);
      ctx.save();
      ctx.strokeStyle = isUp ? "rgba(0,255,102,0.20)" : "rgba(255,0,51,0.20)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, size + halo, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = isUp ? "#00FF66" : "#FF0033";
      ctx.shadowColor = isUp ? "rgba(0,255,102,0.35)" : "rgba(255,0,51,0.35)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = `${Math.floor(12 * (window.devicePixelRatio || 1))}px Inter, system-ui`;
    ctx.fillText("x: residual strength vs Nifty   y: volume ratio", Math.floor(12 * (window.devicePixelRatio||1)), Math.floor(h*0.10));
    ctx.restore();
  }
}
