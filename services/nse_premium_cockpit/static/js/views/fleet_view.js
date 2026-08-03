import { GlitchKpi } from "../widgets/glitch_kpi.js";
import { MiniBreadth } from "../widgets/mini_breadth.js";
import { LeadersTable } from "../widgets/leaders_table.js";

export class FleetView {
  constructor(client) {
    this.client = client;
    this._onSnap = (s) => this.render(s);
  }

  mount(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="grid12">
        <div class="card" style="grid-column: span 8;">
          <div class="cardTitle">
            <h2>Fleet Overview</h2>
            <div class="smallMuted">Nifty + N100 live map</div>
          </div>
          <div id="niftyKpi"></div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
            <div class="card" style="padding:10px; border-radius:16px;">
              <div class="smallMuted">Breadth (live)</div>
              <div id="miniBreadth" style="height:140px; margin-top:8px;" class="canvasWrap"></div>
            </div>
            <div class="card" style="padding:10px; border-radius:16px;">
              <div class="smallMuted">Quick actions</div>
              <div style="display:flex; gap:10px; margin-top:10px;">
                <a class="neonBtn" href="#/cockpit">Open Cockpit</a>
                <a class="neonBtn" href="#/anomaly">Anomaly Lab</a>
              </div>
              <div style="margin-top:10px; color: var(--w-54); font-size:12px;">
                Click a symbol pill to open Stock Detail.
              </div>
            </div>
          </div>

          <div style="margin-top: 12px;">
            <div class="smallMuted" style="margin-bottom:8px;">N100 sample cluster</div>
            <div id="sectorPills" class="pillRow"></div>
          </div>
        </div>

        <div class="card" style="grid-column: span 4;">
          <div class="cardTitle">
            <h2>Top Movers</h2>
            <div class="smallMuted">smooth reorder</div>
          </div>
          <div id="leadersTable"></div>
        </div>
      </div>
    `;

    this.kpi = new GlitchKpi(this.client);
    this.kpi.mount(this.root.querySelector("#niftyKpi"));

    this.miniBreadth = new MiniBreadth();
    this.miniBreadth.mount(this.root.querySelector("#miniBreadth"));

    this.leadersTable = new LeadersTable();
    this.leadersTable.mount(this.root.querySelector("#leadersTable"));

    this.client.on("snapshot", this._onSnap);
    if (this.client.state.snapshot) this.render(this.client.state.snapshot);
  }

  render(snap) {
    this.kpi.update(snap);
    this.miniBreadth.update(snap);

    const leaders = (snap.leaders || []).slice(0, 12).map((x) => ({
      symbol: x.symbol,
      last: x.last,
      change_pct: x.change_pct,
    }));
    this.leadersTable.update(leaders);

    const pills = this.root.querySelector("#sectorPills");
    pills.innerHTML = "";
    const cluster = (snap.stocks && snap.stocks.length)
      ? snap.stocks.slice(0, 18).map((stock) => ({
          symbol: stock.symbol,
          change_pct: stock.change_pct,
        }))
      : (snap.ticker || []).slice(1, 19);
    for (const it of cluster) {
      const up = (it.change_pct || 0) >= 0;
      const arrow = up ? "▲" : "▼";
      const div = document.createElement("a");
      div.href = `#/stock/${it.symbol}`;
      div.className = "pill";
      div.innerHTML = `
        <span class="sym">${it.symbol}</span>
        <span class="pct ${up ? "up" : "down"}">${arrow} ${(it.change_pct * 100).toFixed(2)}%</span>
      `;
      pills.appendChild(div);
    }
  }
}
