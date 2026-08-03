let raf = null;
let x = 0;
let items = [];

function fmtPct(p) {
  const s = (p * 100).toFixed(2);
  const up = p >= 0;
  return { text: (up ? "+" : "") + s + "%", up };
}

function buildItem(it) {
  const { text, up } = fmtPct(it.change_pct || 0);
  const arrow = up ? "▲" : "▼";
  const div = document.createElement("div");
  div.className = "tickerItem";
  div.innerHTML = `
    <span class="tickerSym">${it.symbol}</span>
    <span class="tickerLast">${Number(it.last).toFixed(2)}</span>
    <span class="tickerChg ${up ? "up" : "down"}">${arrow} ${text}</span>
  `;
  return div;
}

export function initTickerTape(tickerItems) {
  items = tickerItems || items;
  const track = document.getElementById("tickerTrack");
  if (!track) return;
  track.innerHTML = "";
  if (!items || items.length === 0) return;

  const chunk = document.createElement("div");
  chunk.style.display = "inline-flex";
  chunk.style.alignItems = "center";
  chunk.style.gap = "18px";
  for (const it of items) chunk.appendChild(buildItem(it));
  const chunk2 = chunk.cloneNode(true);

  track.appendChild(chunk);
  track.appendChild(chunk2);

  const speed = 40; // px/s
  if (raf) cancelAnimationFrame(raf);
  let last = performance.now();

  function step(now) {
    const dt = (now - last) / 1000;
    last = now;
    x -= speed * dt;
    const w = chunk.getBoundingClientRect().width;
    if (w > 0 && Math.abs(x) >= w) x = 0;
    track.style.transform = `translate3d(${x}px,0,0)`;
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
}
