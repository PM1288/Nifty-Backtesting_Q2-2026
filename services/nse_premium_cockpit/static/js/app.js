import { createRouter } from "./router.js";
import { RealtimeClient } from "./realtime_client.js";
import { FleetView } from "./views/fleet_view.js";
import { CockpitView } from "./views/cockpit_view.js";
import { StockView } from "./views/stock_view.js";
import { AnomalyView } from "./views/anomaly_view.js";
import { StrategyView } from "./views/strategy_view.js";
import { DataQualityView } from "./views/data_quality_view.js";
import { initTickerTape } from "./ticker_tape.js";
import { initDisclaimerMarquee } from "./disclaimer.js";
import { setBackdropAccent } from "./ui_backdrop.js";

const routeView = document.getElementById("routeView");
const btnConnect = document.getElementById("btnConnect");

const cockpitSubpath = window.location.pathname.startsWith("/cockpit/");
const defaultApiBase = cockpitSubpath ? "/live" : "";
const defaultWsPath = cockpitSubpath ? "/live/ws/live" : "/ws/live";
const defaultWsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${defaultWsPath}`;
const wsUrl = window.__WS_URL__ || defaultWsUrl;
const apiBase = window.__API_BASE__ || defaultApiBase;

const client = new RealtimeClient(wsUrl, apiBase);

initDisclaimerMarquee();
initTickerTape([]);

btnConnect.addEventListener("click", () => {
  client.toggle();
});

client.on("connected", () => {
  btnConnect.textContent = "LIVE";
});

client.on("disconnected", () => {
  btnConnect.textContent = "OFF";
});

const views = {
  "/": new FleetView(client),
  "/cockpit": new CockpitView(client),
  "/stock": new StockView(client),
  "/anomaly": new AnomalyView(client),
  "/strategy": new StrategyView(client),
  "/data": new DataQualityView(client),
};

function mount(route, params) {
  routeView.innerHTML = "";
  const key = route.startsWith("/stock/") ? "/stock" : route;
  const view = views[key] || views["/"];
  view.mount(routeView, route, params);
}

client.on("snapshot", (snap) => {
  initTickerTape(snap.ticker || []);
  const accent = (snap.market && snap.market.index_change_pct >= 0) ? "green" : "red";
  setBackdropAccent(accent);
});

const router = createRouter({
  onRoute: (route, params) => mount(route, params),
});
router.start();

// auto-connect for premium feel
client.connect();
