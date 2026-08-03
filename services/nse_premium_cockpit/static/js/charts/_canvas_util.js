export function fitCanvasToParent(canvas) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const r = parent.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, Math.floor(r.width * dpr));
  canvas.height = Math.max(200, Math.floor(r.height * dpr));
  canvas.style.width = r.width + "px";
  canvas.style.height = r.height + "px";
}

export function clear(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fillRect(0, 0, w, h);
}

export function drawGrid(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const y = (h * i) / 5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const x = (w * i) / 6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.restore();
}

export function accentColor(changePct) {
  return (changePct || 0) >= 0
    ? { stroke: "#00FF66", glow: "rgba(0,255,102,0.35)" }
    : { stroke: "#FF0033", glow: "rgba(255,0,51,0.35)" };
}
