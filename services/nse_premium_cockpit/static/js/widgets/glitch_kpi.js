export class GlitchKpi {
  constructor(client) { this.client = client; }

  mount(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="card" style="padding:14px; border-radius:16px; background: rgba(255,255,255,0.02);">
        <div class="smallMuted">Nifty 50</div>
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:6px;">
          <div>
            <div id="kpiLast" class="glitch" data-accent="green" data-text="—">—</div>
            <div id="kpiAsOf" class="smallMuted" style="margin-top:6px;">As of —</div>
          </div>
          <div style="display:flex; gap:16px;">
            <div>
              <div class="smallMuted">Change</div>
              <div id="kpiChg" style="font-weight:600;">—</div>
            </div>
            <div>
              <div class="smallMuted">Breadth</div>
              <div id="kpiBreadth" style="font-weight:600;">—</div>
            </div>
            <div>
              <div class="smallMuted">Heat</div>
              <div id="kpiHeat" style="font-weight:600;">—</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  update(snap) {
    const m = snap.market;
    if (!m) return;
    const up = m.index_change_pct >= 0;
    const accent = up ? "green" : "red";
    const arrow = up ? "▲" : "▼";
    const pct = (m.index_change_pct * 100).toFixed(2);

    const elLast = this.root.querySelector("#kpiLast");
    const lastText = Number(m.index_last).toFixed(2);
    elLast.textContent = lastText;
    elLast.setAttribute("data-text", lastText);
    elLast.setAttribute("data-accent", accent);

    const elChg = this.root.querySelector("#kpiChg");
    elChg.textContent = `${arrow} ${pct}%`;
    elChg.style.color = up ? "var(--green-500)" : "var(--red-500)";

    this.root.querySelector("#kpiBreadth").textContent = `${(m.breadth_pct_advancers*100).toFixed(1)}%`;
    this.root.querySelector("#kpiHeat").textContent = `${Number(m.market_heat_score).toFixed(1)}`;
    this.root.querySelector("#kpiAsOf").textContent = `As of ${new Date(m.ts).toLocaleTimeString()}`;
  }
}
