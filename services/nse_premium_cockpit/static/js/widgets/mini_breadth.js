export class MiniBreadth {
  mount(root) {
    this.root = root;
    this.root.innerHTML = `<canvas></canvas>`;
    this.canvas = this.root.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.history = [];
    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    const r = this.root.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(300, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(120, Math.floor(r.height * dpr));
    this.draw();
  }

  update(snap) {
    const m = snap.market;
    if (!m) return;
    this.history.push({ b: m.breadth_pct_advancers, ch: m.index_change_pct });
    if (this.history.length > 120) this.history.shift();
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(0,0,w,h);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let i=1;i<4;i++){
      const y = (h*i)/4;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
    }

    if (this.history.length < 2) return;
    const up = (this.history[this.history.length-1].ch || 0) >= 0;
    ctx.strokeStyle = up ? "#00FF66" : "#FF0033";
    ctx.shadowColor = up ? "rgba(0,255,102,0.35)" : "rgba(255,0,51,0.35)";
    ctx.shadowBlur = 12;

    ctx.beginPath();
    for (let i=0;i<this.history.length;i++){
      const x = (w * i) / (this.history.length-1);
      const y = h * (1 - this.history[i].b);
      if (i===0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}
