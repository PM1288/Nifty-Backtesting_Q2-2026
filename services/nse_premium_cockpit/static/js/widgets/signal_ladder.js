const LANES = [
  { key: "breakout continuation", label: "Breakout" },
  { key: "quiet accumulation", label: "Quiet" },
  { key: "mean reversion", label: "Reversion" },
  { key: "squeeze watch", label: "Squeeze" },
  { key: "breakdown risk", label: "Breakdown" },
  { key: "event watch", label: "Events" },
];

function laneKey(bucket) {
  const b = (bucket || "").toLowerCase();
  for (const l of LANES) if (l.key === b) return l.key;
  return "event watch";
}

export class SignalLadder {
  mount(root) {
    this.root = root;
    this.root.innerHTML = `<div class="ladder" id="ladder"></div>`;
    this.el = this.root.querySelector("#ladder");
    this.lanes = new Map();
    for (const lane of LANES) {
      const d = document.createElement("div");
      d.className = "lane";
      d.innerHTML = `
        <div class="laneHeader">
          <div class="name">${lane.label}</div>
          <div class="count" data-count>0</div>
        </div>
        <div data-items></div>
      `;
      this.el.appendChild(d);
      this.lanes.set(lane.key, d);
    }
  }

  update(items) {
    const grouped = new Map();
    for (const lane of LANES) grouped.set(lane.key, []);
    for (const it of items) grouped.get(laneKey(it.bucket)).push(it);

    for (const lane of LANES) {
      const el = this.lanes.get(lane.key);
      const container = el.querySelector("[data-items]");
      const countEl = el.querySelector("[data-count]");
      const all = grouped.get(lane.key);
      countEl.textContent = String(all.length);
      const arr = all.slice(0, 6);

      container.innerHTML = "";
      for (const it of arr) {
        const up = it.change_pct >= 0;
        const arrow = up ? "▲" : "▼";
        const item = document.createElement("div");
        item.className = "laneItem";
        item.innerHTML = `
          <div class="row1">
            <a href="#/stock/${it.symbol}" style="color: var(--w-92); font-weight:500;">${it.symbol}</a>
            <span style="color:${up ? "var(--green-500)" : "var(--red-500)"};">${arrow} ${(it.change_pct*100).toFixed(2)}%</span>
          </div>
          <div class="smallMuted" style="margin-top:4px;">Score ${Number(it.score).toFixed(1)}</div>
          <div class="tags">
            ${(it.reason_tags||[]).slice(0,3).map(t => `<span class="tag">${t}</span>`).join("")}
          </div>
        `;
        container.appendChild(item);
      }
    }
  }
}
