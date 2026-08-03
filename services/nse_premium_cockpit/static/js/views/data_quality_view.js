export class DataQualityView {
  constructor(client) {
    this.client = client;
  }

  mount(root) {
    const snap = this.client.state.snapshot;
    const ts = snap?.timestamp || snap?.ts || "n/a";
    const connected = this.client.isConnected();
    const stockCount = snap?.stocks?.length || 0;
    const anomalyCount = snap?.anomalies?.length || 0;
    const breadth = snap?.breadth;
    root.innerHTML = `
      <div class="grid12">
        <div class="card" style="grid-column: span 12;">
          <div class="cardTitle"><h2>Data Quality & Lineage</h2><div class="smallMuted">trust layer</div></div>
          <div class="smallMuted">
            Connected: <strong style="color:${connected ? "var(--green-500)" : "var(--red-500)"};">${connected ? "yes" : "no"}</strong> •
            Last snapshot: <strong>${ts}</strong> •
            Universe: <strong>${stockCount}</strong> •
            Anomalies: <strong>${anomalyCount}</strong>
          </div>
          <div class="smallMuted" style="margin-top:10px; color: var(--w-72);">
            Breadth checks:
            <div style="margin-top:8px;">
              • pct up: <strong>${(((breadth?.pct_up) || 0) * 100).toFixed(1)}%</strong><br/>
              • pct above VWAP: <strong>${(((breadth?.pct_above_vwap) || 0) * 100).toFixed(1)}%</strong><br/>
              • new highs / lows: <strong>${(((breadth?.pct_new_highs) || 0) * 100).toFixed(1)}%</strong> / <strong>${(((breadth?.pct_new_lows) || 0) * 100).toFixed(1)}%</strong>
            </div>
          </div>
          <div class="smallMuted" style="margin-top:10px; color: var(--w-72);">
            Production checks to wire here:
            <div style="margin-top:8px;">
              • EOD report freshness + missing day detection<br/>
              • intraday missing-minute windows per symbol<br/>
              • lineage: download → parse → load → cleanup<br/>
              • alerts when upstream sources are stale
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
