export class RealtimeClient {
  constructor(wsUrl, apiBase) {
    this.wsUrl = wsUrl;
    this.apiBase = apiBase || "";
    this.ws = null;
    this.handlers = new Map();
    this._connected = false;
    this._reconnectTimer = null;
    this._want = false;

    this.state = {
      snapshot: null,
      connected: false,
      lastMessageAt: null,
    };
  }

  on(type, cb) {
    const arr = this.handlers.get(type) || [];
    arr.push(cb);
    this.handlers.set(type, arr);
  }

  emit(type, payload) {
    const arr = this.handlers.get(type) || [];
    for (const cb of arr) cb(payload);
  }

  _normalizeSnapshot(raw) {
    if (!raw) return raw;
    const snap = { ...raw };
    snap.ts = snap.ts || snap.timestamp || snap.market?.ts || snap.market_state?.ts || null;
    snap.timestamp = snap.timestamp || snap.ts;
    snap.market = snap.market || snap.market_state || null;
    snap.market_state = snap.market_state || snap.market || null;
    snap.ticker = snap.ticker || snap.ticker_tape || [];
    snap.stocks = snap.stocks || [];
    snap.breadth = snap.breadth || (snap.market ? {
      pct_up: snap.market.breadth_pct_advancers ?? 0,
      pct_above_vwap: snap.market.breadth_pct_above_vwap ?? 0,
      pct_new_highs: snap.market.pct_new_highs ?? 0,
      pct_new_lows: snap.market.pct_new_lows ?? 0,
      up_volume_ratio: snap.market.up_volume_ratio ?? 0.5,
      down_volume_ratio: snap.market.down_volume_ratio ?? 0.5,
      volume_dispersion: snap.market.volume_dispersion ?? 0,
    } : null);
    if ((!snap.leaders || !snap.leaders.length) && snap.stocks.length) {
      snap.leaders = [...snap.stocks]
        .sort((a, b) => (b.anomaly_score || 0) - (a.anomaly_score || 0))
        .map((stock) => ({
          symbol: stock.symbol,
          security_name: stock.security_name,
          residual_strength: stock.residual_strength,
          volume_ratio: stock.volume_ratio,
          anomaly_score: stock.anomaly_score,
          change_pct: stock.change_pct,
          last: stock.price,
        }));
    }
    return snap;
  }

  isConnected() { return this._connected; }

  toggle() {
    if (this._connected || this._want) this.disconnect();
    else this.connect();
  }

  connect() {
    this._want = true;
    if (this.ws) return;
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      this._connected = true;
      this.state.connected = true;
      this.emit("connected", {});
    };

    this.ws.onmessage = (ev) => {
      this.state.lastMessageAt = Date.now();
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "snapshot") {
        const normalized = this._normalizeSnapshot(msg.payload);
        this.state.snapshot = normalized;
        this.emit("snapshot", normalized);
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.state.connected = false;
      this.ws = null;
      this.emit("disconnected", {});
      if (this._want) this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      try { this.ws.close(); } catch {}
    };
  }

  disconnect() {
    this._want = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
    this.ws = null;
    this._connected = false;
    this.state.connected = false;
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  async fetchSnapshot() {
    const r = await fetch(this.apiBase + "/api/snapshot");
    if (!r.ok) throw new Error("snapshot failed");
    const s = this._normalizeSnapshot(await r.json());
    this.state.snapshot = s;
    this.emit("snapshot", s);
    return s;
  }

  async fetchStock(symbol, minutes=240) {
    const r = await fetch(`${this.apiBase}/api/stock/${encodeURIComponent(symbol)}?minutes=${minutes}`);
    if (!r.ok) throw new Error("stock failed");
    return await r.json();
  }
}
