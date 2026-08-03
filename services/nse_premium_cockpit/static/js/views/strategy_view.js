export class StrategyView {
  constructor(client) {
    this.client = client;
  }

  mount(root) {
    const snap = this.client.state.snapshot;
    const label = snap?.market?.regime_label || "unknown";
    const ladder = snap?.ladder || [];
    const buckets = new Map();
    for (const item of ladder) {
      const key = (item.bucket || "neutral").toLowerCase();
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const bucketHtml = [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([bucket, count]) => `<tr><td><strong>${bucket}</strong></td><td>${count}</td></tr>`)
      .join("") || `<tr><td><strong>neutral</strong></td><td>0</td></tr>`;
    root.innerHTML = `
      <div class="grid12">
        <div class="card" style="grid-column: span 12;">
          <div class="cardTitle"><h2>Strategy Lab</h2><div class="smallMuted">history-conditioned learning</div></div>
          <div class="smallMuted">
            This screen improves materially with history. It defines the learning targets:
            <div style="margin-top:10px; color: var(--w-72);">
              • bucket hit rates by regime<br/>
              • event studies (bulk/block/short-selling) → forward drift<br/>
              • anomaly calibration across regimes<br/>
              • horizon strips: 15m, 30m, close, next day
            </div>
          </div>
        </div>

        <div class="card" style="grid-column: span 6;">
          <div class="cardTitle"><h2>Current Regime</h2><div class="smallMuted">from live state</div></div>
          <div style="font-size:20px; line-height:28px; font-weight:600; color: var(--w-92);">${label}</div>
          <div class="smallMuted" style="margin-top:6px;">
            Condition recommendations on this regime. With 6+ months, compute a regime transition matrix and bucket scorecards.
          </div>
          <table class="table" style="margin-top:12px;">
            <thead><tr><th>Live bucket mix</th><th>Count</th></tr></thead>
            <tbody>${bucketHtml}</tbody>
          </table>
        </div>

        <div class="card" style="grid-column: span 6;">
          <div class="cardTitle"><h2>What improves with history</h2><div class="smallMuted">minimum windows</div></div>
          <table class="table">
            <thead><tr><th>Analysis</th><th>Minimum</th><th>Better</th></tr></thead>
            <tbody>
              <tr><td><strong>minute-of-day baselines</strong></td><td>20 days</td><td>60+</td></tr>
              <tr><td><strong>breakout follow-through</strong></td><td>60 days</td><td>6 months+</td></tr>
              <tr><td><strong>event studies</strong></td><td>30 events</td><td>1 year+</td></tr>
              <tr><td><strong>ML anomaly</strong></td><td>120 days</td><td>1 year+</td></tr>
              <tr><td><strong>regime-conditioned scorecards</strong></td><td>6 months</td><td>1 year+</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}
