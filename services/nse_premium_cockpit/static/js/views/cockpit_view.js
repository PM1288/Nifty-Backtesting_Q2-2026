import { PulseRibbon } from "../charts/pulse_ribbon.js";
import { BreadthRiver } from "../charts/breadth_river.js";
import { LeaderOrb } from "../charts/leader_orb.js";
import { RegimeRadar } from "../charts/regime_radar.js";
import { SignalLadder } from "../widgets/signal_ladder.js";

export class CockpitView {
  constructor(client) {
    this.client = client;
    this._onSnap = (s) => this.render(s);
  }

  mount(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="grid12">
        <div class="card" style="grid-column: span 12;">
          <div class="cardTitle">
            <h2>Market Cockpit</h2>
            <div class="smallMuted">pulse • breadth • rotation • regime</div>
          </div>
          <div class="canvasWrap" style="height:120px;">
            <canvas id="pulseCanvas"></canvas>
          </div>
        </div>

        <div class="card" style="grid-column: span 4;">
          <div class="cardTitle"><h2>Breadth River</h2><div class="smallMuted">adv/dec + VWAP</div></div>
          <div class="canvasWrap" style="height:260px;"><canvas id="breadthCanvas"></canvas></div>
        </div>

        <div class="card" style="grid-column: span 5;">
          <div class="cardTitle"><h2>Leader Rotation Orb</h2><div class="smallMuted">residual vs volume</div></div>
          <div class="canvasWrap" style="height:260px;"><canvas id="orbCanvas"></canvas></div>
        </div>

        <div class="card" style="grid-column: span 3;">
          <div class="cardTitle"><h2>Regime Radar</h2><div class="smallMuted">state vector</div></div>
          <div class="canvasWrap" style="height:260px;"><canvas id="radarCanvas"></canvas></div>
        </div>

        <div class="card" style="grid-column: span 12;">
          <div class="cardTitle"><h2>Signal Ladder</h2><div class="smallMuted">live buckets</div></div>
          <div id="ladder"></div>
        </div>
      </div>
    `;

    this.pulse = new PulseRibbon(this.root.querySelector("#pulseCanvas"));
    this.breadth = new BreadthRiver(this.root.querySelector("#breadthCanvas"));
    this.orb = new LeaderOrb(this.root.querySelector("#orbCanvas"));
    this.radar = new RegimeRadar(this.root.querySelector("#radarCanvas"));
    this.ladder = new SignalLadder();
    this.ladder.mount(this.root.querySelector("#ladder"));

    this.client.on("snapshot", this._onSnap);
    if (this.client.state.snapshot) this.render(this.client.state.snapshot);
  }

  render(snap) {
    this.pulse.update(snap);
    this.breadth.update(snap);
    this.orb.update(snap);
    this.radar.update(snap);
    this.ladder.update(snap.ladder || []);
  }
}
