import { OscilloscopeChart } from "../charts/oscilloscope.js";

export class StockView {
  constructor(client) {
    this.client = client;
  }

  async mount(root, route, params) {
    this.root = root;
    const symbol = (params && params.symbol) ? params.symbol.toUpperCase() : "NIFTY50";
    this.root.innerHTML = `
      <div class="grid12">
        <div class="card" style="grid-column: span 12;">
          <div class="cardTitle">
            <h2>Stock Detail</h2>
            <div class="smallMuted"><a href="#/cockpit" class="neonBtn">Back</a></div>
          </div>
          <div id="stockHeader"></div>
        </div>

        <div class="card" style="grid-column: span 8;">
          <div class="cardTitle"><h2>Oscilloscope</h2><div class="smallMuted">price + VWAP</div></div>
          <div class="canvasWrap" style="height:360px;"><canvas id="oscCanvas"></canvas></div>
          <div class="smallMuted" style="margin-top:8px;" id="integrityMsg"></div>
        </div>

        <div class="card" style="grid-column: span 4;">
          <div class="cardTitle"><h2>Setup Panel</h2><div class="smallMuted">educational</div></div>
          <div id="setupPanel"></div>
        </div>
      </div>
    `;

    const detail = await this.client.fetchStock(symbol, 240);
    this.render(detail);
  }

  render(detail) {
    const up = detail.change_pct >= 0;
    const accent = up ? "green" : "red";
    const arrow = up ? "▲" : "▼";
    const header = this.root.querySelector("#stockHeader");
    header.innerHTML = `
      <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap;">
        <div>
          <div style="font-size:20px; line-height:28px; font-weight:600; color: var(--w-92);">
            <span style="margin-right:8px;">${detail.symbol}</span>
            <span style="color: var(--w-54); font-weight:500; font-size:14px;">${detail.security_name}</span>
          </div>
          <div class="smallMuted">As of latest minute • gaps shown as gaps</div>
        </div>
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          <div class="card" style="padding:10px; border-radius:16px; background: rgba(255,255,255,0.02);">
            <div class="smallMuted">Last</div>
            <div style="font-weight:600; font-size:20px; line-height:28px; color:${up ? "var(--green-500)" : "var(--red-500)"};">${Number(detail.last).toFixed(2)}</div>
          </div>
          <div class="card" style="padding:10px; border-radius:16px; background: rgba(255,255,255,0.02);">
            <div class="smallMuted">Change</div>
            <div style="font-weight:600; color:${up ? "var(--green-500)" : "var(--red-500)"};">${arrow} ${(detail.change_pct*100).toFixed(2)}%</div>
          </div>
          <div class="card" style="padding:10px; border-radius:16px; background: rgba(255,255,255,0.02);">
            <div class="smallMuted">Day range</div>
            <div style="color: var(--w-92);">${Number(detail.day_low).toFixed(2)} – ${Number(detail.day_high).toFixed(2)}</div>
          </div>
        </div>
      </div>
    `;

    const osc = new OscilloscopeChart(this.root.querySelector("#oscCanvas"));
    osc.update(detail);

    const setup = this.root.querySelector("#setupPanel");
    setup.innerHTML = `
      <div class="card" style="padding:10px; border-radius:16px; background: rgba(255,255,255,0.02);">
        <div class="smallMuted">Interpretation</div>
        <div style="margin-top:8px; color: var(--w-72);">
          • Signal bucket: ${(detail.signal_bucket || "neutral").replaceAll("_", " ")}<br/>
          • VWAP control: ${up ? "above" : "below"} bias<br/>
          • Path quality: ${up ? "continuation or pullback" : "mean reversion or breakdown"}<br/>
          • Use as a review prompt, not advice.
        </div>
      </div>
      <div class="card" style="padding:10px; border-radius:16px; background: rgba(255,255,255,0.02); margin-top:12px;">
        <div class="smallMuted">Signal Scores</div>
        <table class="table" style="margin-top:8px;">
          <tbody>
            <tr><td><strong>Trend</strong></td><td>${Number(detail.trend_score || 0).toFixed(1)}</td></tr>
            <tr><td><strong>Conviction</strong></td><td>${Number(detail.conviction_score || 0).toFixed(1)}</td></tr>
            <tr><td><strong>Risk</strong></td><td>${Number(detail.risk_score || 0).toFixed(1)}</td></tr>
            <tr><td><strong>Event</strong></td><td>${Number(detail.event_score || 0).toFixed(1)}</td></tr>
            <tr><td><strong>Anomaly</strong></td><td>${Number(detail.anomaly_score || 0).toFixed(1)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="card" style="padding:10px; border-radius:16px; background: rgba(255,255,255,0.02); margin-top:12px;">
        <div class="smallMuted">Feature Stack</div>
        <div style="margin-top:8px; color: var(--w-72);">
          • Residual strength: ${Number(detail.residual_strength || 0).toFixed(2)}<br/>
          • Volume ratio: ${Number(detail.volume_ratio || 0).toFixed(2)}x<br/>
          • Delivery ratio: ${(Number(detail.delivery_ratio || 0) * 100).toFixed(1)}%
        </div>
      </div>
    `;

    this.root.querySelector("#integrityMsg").textContent =
      "If live data is delayed/missing, the line should gap rather than showing misleading zeros.";
  }
}
