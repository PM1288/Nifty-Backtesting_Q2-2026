export class LeadersTable {
  mount(root) {
    this.root = root;
    this.root.innerHTML = `<div id="list"></div>`;
    this.list = this.root.querySelector("#list");
  }

  update(items) {
    const list = this.list;
    const prev = new Map();
    for (const el of Array.from(list.children)) {
      prev.set(el.dataset.key, el.getBoundingClientRect());
    }

    list.innerHTML = "";
    for (const it of items) {
      const up = it.change_pct >= 0;
      const arrow = up ? "▲" : "▼";
      const row = document.createElement("div");
      row.dataset.key = it.symbol;
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "baseline";
      row.style.gap = "8px";
      row.style.padding = "10px 8px";
      row.style.borderBottom = "1px solid var(--w-08)";
      row.innerHTML = `
        <a href="#/stock/${it.symbol}" style="color: var(--w-92); font-weight:500;">${it.symbol}</a>
        <div style="display:flex; gap:10px; align-items:baseline;">
          <span style="color: var(--w-72);">${Number(it.last).toFixed(2)}</span>
          <span style="color:${up ? "var(--green-500)" : "var(--red-500)"};">${arrow} ${(it.change_pct*100).toFixed(2)}%</span>
        </div>
      `;
      list.appendChild(row);
    }

    // FLIP animate
    for (const el of Array.from(list.children)) {
      const key = el.dataset.key;
      const newBox = el.getBoundingClientRect();
      const oldBox = prev.get(key);
      if (!oldBox) continue;
      const dx = oldBox.left - newBox.left;
      const dy = oldBox.top - newBox.top;
      if (dx === 0 && dy === 0) continue;
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      el.style.transition = "transform 0s";
      requestAnimationFrame(() => {
        el.style.transform = "translate3d(0,0,0)";
        el.style.transition = "transform 240ms ease-out";
      });
    }
  }
}
