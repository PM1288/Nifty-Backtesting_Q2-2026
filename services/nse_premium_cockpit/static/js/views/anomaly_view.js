import { AnomalyTunnel } from "../charts/anomaly_tunnel.js";

export class AnomalyView {
  constructor(client) {
    this.client = client;
    this._onSnap = (s) => this.render(s);
  }

  mount(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="grid12">
        <div class="card" style="grid-column: span 12;">
          <div class="cardTitle"><h2>Anomaly Lab</h2><div class="smallMuted">scanner • tunnel • watchlist</div></div>
          <div class="canvasWrap" style="height:240px;"><canvas id="tunnelCanvas"></canvas></div>
        </div>
        <div class="card" style="grid-column: span 6;">
          <div class="cardTitle"><h2>Top Anomalies</h2><div class="smallMuted">rule triggers</div></div>
          <table class="table" id="anomTable"></table>
        </div>
        <div class="card" style="grid-column: span 6;">
          <div class="cardTitle"><h2>Interpretation</h2><div class="smallMuted">how to use</div></div>
          <div class="smallMuted">
            Use anomalies as a review queue:
            <div style="margin-top:8px; color: var(--w-72);">
              • Is it residual vs index?<br/>
              • Is volume/range expansion unusual for this stock?<br/>
              • Is the market regime churn (down-weight breakouts)?<br/>
              • If flagged, check event overlays.
            </div>
          </div>
        </div>
      </div>
    `;

    this.tunnel = new AnomalyTunnel(this.root.querySelector("#tunnelCanvas"));
    this.client.on("snapshot", this._onSnap);
    if (this.client.state.snapshot) this.render(this.client.state.snapshot);
  }

  render(snap) {
    this.tunnel.update(snap);
    const tbl = this.root.querySelector("#anomTable");
    const rows = (snap.anomalies || []).slice(0, 12);
    tbl.innerHTML = `
      <thead><tr><th>Symbol</th><th>Score</th><th>Reasons</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td><a href="#/stock/${r.symbol}"><strong>${r.symbol}</strong></a></td>
            <td>${Number(r.anomaly_score).toFixed(1)}</td>
            <td>${(r.reasons || []).join(", ")}</td>
          </tr>
        `).join("")}
      </tbody>
    `;
  }
}
