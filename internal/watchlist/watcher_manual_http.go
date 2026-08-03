package watchlist

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"trading-stack/internal/store"
)

const manualOptionDefaultUnderlying = "NIFTY50"
const manualOptionDefaultIndexToken = "99926000"
const manualOptionDefaultTarget = 400.0
const manualOptionDefaultStrategy = "option_manual_paper"

type manualOptionCreateRequest struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Underlying   string  `json:"underlying"`
	IndexToken   string  `json:"index_token"`
	Strike       float64 `json:"strike"`
	Lots         int     `json:"lots"`
	LotSize      int     `json:"lot_size"`
	TargetRupees float64 `json:"target_rupees"`
}

type manualOptionListResponse struct {
	Trades []store.ManualOptionTradeState `json:"trades"`
}

func (s *Service) handleWatcherManualOptions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		trades, err := s.loadManualOptionStates(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, manualOptionListResponse{Trades: trades})
	case http.MethodPost:
		var req manualOptionCreateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON body"))
			return
		}
		now := time.Now().UTC()
		id := sanitizeManualOptionID(req.ID)
		if id == "" {
			id = fmt.Sprintf("mopt-%d", now.UnixNano())
		}
		underlying := strings.ToUpper(strings.TrimSpace(req.Underlying))
		if underlying == "" {
			underlying = manualOptionDefaultUnderlying
		}
		indexToken := strings.TrimSpace(req.IndexToken)
		if indexToken == "" {
			indexToken = manualOptionDefaultIndexToken
		}
		lots := req.Lots
		if lots <= 0 {
			lots = 1
		}
		lotSize := req.LotSize
		if lotSize <= 0 {
			lotSize = 65
		}
		target := req.TargetRupees
		if target <= 0 {
			target = manualOptionDefaultTarget
		}
		state := store.ManualOptionTradeState{
			ID:           id,
			Name:         strings.TrimSpace(req.Name),
			Status:       "pending",
			CreatedAt:    now,
			UpdatedAt:    now,
			RequestedAt:  now,
			Strategy:     manualOptionDefaultStrategy,
			Underlying:   underlying,
			IndexToken:   indexToken,
			Strike:       req.Strike,
			Lots:         lots,
			LotSize:      lotSize,
			TargetRupees: target,
		}
		if err := s.persistManualOptionState(r.Context(), now, state); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, state)
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handleWatcherManualOptionByID(w http.ResponseWriter, r *http.Request) {
	id, action, err := parseManualOptionPath(r.URL.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	trades, err := s.loadManualOptionStates(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	var state *store.ManualOptionTradeState
	for i := range trades {
		if strings.EqualFold(strings.TrimSpace(trades[i].ID), id) {
			state = &trades[i]
			break
		}
	}
	if state == nil {
		writeError(w, http.StatusNotFound, fmt.Errorf("manual trade not found"))
		return
	}

	now := time.Now().UTC()
	switch r.Method {
	case http.MethodPost:
		if action != "close" {
			writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("unsupported action"))
			return
		}
		if strings.EqualFold(strings.TrimSpace(state.Status), "closed") {
			writeJSON(w, http.StatusOK, state)
			return
		}
		state.CloseRequested = true
		state.UpdatedAt = now
		if err := s.persistManualOptionState(r.Context(), now, *state); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, state)
	case http.MethodDelete:
		if action != "" {
			writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("unsupported action"))
			return
		}
		state.CloseRequested = false
		state.Status = "closed"
		state.CloseReason = "cancelled"
		state.Error = ""
		state.UpdatedAt = now
		state.ClosedAt = &now
		if err := s.persistManualOptionState(r.Context(), now, *state); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, state)
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handleWatcherManualOptionsUI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	_, _ = w.Write([]byte(renderWatcherManualOptionsHTML(time.Now())))
}

func sanitizeManualOptionID(raw string) string {
	id := strings.TrimSpace(raw)
	if id == "" {
		return ""
	}
	id = strings.ToLower(id)
	replacer := strings.NewReplacer(" ", "-", "_", "-", "/", "-", "\\", "-", ":", "-", "|", "-", ".", "-", ",", "-")
	id = replacer.Replace(id)
	id = strings.Trim(id, "-")
	return id
}

func parseManualOptionPath(path string) (id string, action string, err error) {
	trimmed := strings.TrimSuffix(strings.TrimSpace(path), "/")
	if trimmed == "" {
		return "", "", fmt.Errorf("missing id")
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) < 1 {
		return "", "", fmt.Errorf("missing id")
	}
	last := strings.TrimSpace(parts[len(parts)-1])
	if strings.EqualFold(last, "close") {
		if len(parts) < 2 {
			return "", "", fmt.Errorf("missing id")
		}
		id = strings.TrimSpace(parts[len(parts)-2])
		if strings.EqualFold(id, "manual-options") {
			return "", "", fmt.Errorf("missing id")
		}
		action = "close"
	} else {
		id = last
		if strings.EqualFold(id, "manual-options") {
			return "", "", fmt.Errorf("missing id")
		}
		action = ""
	}
	id = sanitizeManualOptionID(id)
	if id == "" {
		return "", "", fmt.Errorf("missing id")
	}
	return id, action, nil
}

func (s *Service) loadManualOptionStates(ctx context.Context) ([]store.ManualOptionTradeState, error) {
	rows, err := s.store.ListLatestStrategyStatesByPrefix(ctx, store.ManualOptionStatePrefix, 500)
	if err != nil {
		return nil, err
	}
	out := make([]store.ManualOptionTradeState, 0, len(rows))
	for _, row := range rows {
		var state store.ManualOptionTradeState
		if len(row.Raw) > 0 {
			if err := json.Unmarshal(row.Raw, &state); err != nil {
				continue
			}
		}
		state.ID = strings.TrimSpace(state.ID)
		if state.ID == "" {
			state.ID = strings.TrimPrefix(strings.TrimSpace(row.Name), store.ManualOptionStatePrefix)
		}
		if state.ID == "" {
			continue
		}
		if state.CreatedAt.IsZero() {
			state.CreatedAt = row.Ts.UTC()
		}
		if state.UpdatedAt.IsZero() {
			state.UpdatedAt = row.Ts.UTC()
		}
		if state.RequestedAt.IsZero() {
			state.RequestedAt = state.CreatedAt
		}
		out = append(out, state)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].RequestedAt.After(out[j].RequestedAt)
	})
	s.enrichManualOptionStatesWithLivePositions(ctx, out)
	return out, nil
}

func (s *Service) enrichManualOptionStatesWithLivePositions(ctx context.Context, states []store.ManualOptionTradeState) {
	if len(states) == 0 {
		return
	}
	tokensByExchange := map[string][]string{}
	for i := range states {
		st := &states[i]
		if strings.ToLower(strings.TrimSpace(st.Status)) != "open" {
			continue
		}
		if strings.TrimSpace(st.CEToken) != "" && strings.TrimSpace(st.CEExchange) != "" {
			tokensByExchange[strings.ToUpper(strings.TrimSpace(st.CEExchange))] = append(tokensByExchange[strings.ToUpper(strings.TrimSpace(st.CEExchange))], strings.TrimSpace(st.CEToken))
		}
		if strings.TrimSpace(st.PEToken) != "" && strings.TrimSpace(st.PEExchange) != "" {
			tokensByExchange[strings.ToUpper(strings.TrimSpace(st.PEExchange))] = append(tokensByExchange[strings.ToUpper(strings.TrimSpace(st.PEExchange))], strings.TrimSpace(st.PEToken))
		}
	}
	quotes, _ := s.fetchInstrumentStateQuotes(ctx, tokensByExchange)

	positions, err := s.store.ListPaperPositionsFlat(ctx)
	if err != nil {
		positions = nil
	}
	posByToken := make(map[string]store.PaperPosition, len(positions))
	for _, p := range positions {
		if p.Qty == 0 {
			continue
		}
		key := strings.ToUpper(strings.TrimSpace(p.Exchange)) + "|" + strings.TrimSpace(p.SymbolToken)
		if key == "|" {
			continue
		}
		posByToken[key] = p
	}
	for i := range states {
		st := &states[i]
		status := strings.ToLower(strings.TrimSpace(st.Status))
		if status != "open" {
			continue
		}
		ceKey := strings.ToUpper(strings.TrimSpace(st.CEExchange)) + "|" + strings.TrimSpace(st.CEToken)
		peKey := strings.ToUpper(strings.TrimSpace(st.PEExchange)) + "|" + strings.TrimSpace(st.PEToken)
		ceQuote, hasCEQuote := quotes[ceKey]
		peQuote, hasPEQuote := quotes[peKey]
		if hasCEQuote && hasPEQuote && ceQuote.Price > 0 && peQuote.Price > 0 {
			st.CurrentCE = ceQuote.Price
			st.CurrentPE = peQuote.Price
			st.CurrentCombo = ceQuote.Price + peQuote.Price
			st.PnL = (st.CurrentCE-st.EntryCE+st.CurrentPE-st.EntryPE)*float64(st.Qty)
			if st.PnL > st.MaxPnL {
				st.MaxPnL = st.PnL
			}
			if st.PnL < st.MaxLoss {
				st.MaxLoss = st.PnL
			}
			if ceQuote.SeenAt.After(st.UpdatedAt) {
				st.UpdatedAt = ceQuote.SeenAt
			}
			if peQuote.SeenAt.After(st.UpdatedAt) {
				st.UpdatedAt = peQuote.SeenAt
			}
			continue
		}

		cePos, hasCEPos := posByToken[ceKey]
		pePos, hasPEPos := posByToken[peKey]
		if hasCEPos && hasPEPos {
			ceCurrent := inferPaperPositionCurrentPrice(cePos)
			peCurrent := inferPaperPositionCurrentPrice(pePos)
			st.CurrentCE = ceCurrent
			st.CurrentPE = peCurrent
			st.CurrentCombo = ceCurrent + peCurrent
			livePnL := cePos.RealizedPNL + cePos.UnrealizedPNL + pePos.RealizedPNL + pePos.UnrealizedPNL
			st.PnL = livePnL
			if livePnL > st.MaxPnL {
				st.MaxPnL = livePnL
			}
			if livePnL < st.MaxLoss {
				st.MaxLoss = livePnL
			}
			if cePos.UpdatedAt.After(st.UpdatedAt) {
				st.UpdatedAt = cePos.UpdatedAt
			}
			if pePos.UpdatedAt.After(st.UpdatedAt) {
				st.UpdatedAt = pePos.UpdatedAt
			}
		}
	}
}

func inferPaperPositionCurrentPrice(pos store.PaperPosition) float64 {
	if pos.Qty <= 0 {
		return pos.AvgPrice
	}
	delta := pos.UnrealizedPNL / float64(pos.Qty)
	side := strings.ToUpper(strings.TrimSpace(pos.Side))
	if side == "SELL" {
		return pos.AvgPrice - delta
	}
	return pos.AvgPrice + delta
}

type manualLiveQuote struct {
	Price  float64
	SeenAt time.Time
}

func (s *Service) fetchInstrumentStateQuotes(ctx context.Context, tokensByExchange map[string][]string) (map[string]manualLiveQuote, error) {
	out := map[string]manualLiveQuote{}
	if len(tokensByExchange) == 0 {
		return out, nil
	}
	query := fmt.Sprintf(`SELECT symbol_token, COALESCE(last_price, 0), COALESCE(last_seen_ts, now())
FROM %s
WHERE exchange = $1 AND symbol_token = ANY($2)`, pgx.Identifier{s.store.Schema, "instrument_state"}.Sanitize())
	for exchange, tokens := range tokensByExchange {
		if len(tokens) == 0 {
			continue
		}
		rows, err := s.store.Pool.Query(ctx, query, exchange, tokens)
		if err != nil {
			return out, err
		}
		for rows.Next() {
			var token string
			var price float64
			var seen time.Time
			if err := rows.Scan(&token, &price, &seen); err != nil {
				rows.Close()
				return out, err
			}
			key := strings.ToUpper(strings.TrimSpace(exchange)) + "|" + strings.TrimSpace(token)
			out[key] = manualLiveQuote{Price: price, SeenAt: seen.UTC()}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return out, err
		}
		rows.Close()
	}
	return out, nil
}

func (s *Service) persistManualOptionState(ctx context.Context, ts time.Time, state store.ManualOptionTradeState) error {
	if strings.TrimSpace(state.ID) == "" {
		return fmt.Errorf("id is required")
	}
	state.ID = sanitizeManualOptionID(state.ID)
	if state.ID == "" {
		return fmt.Errorf("id is required")
	}
	if state.CreatedAt.IsZero() {
		state.CreatedAt = ts.UTC()
	}
	state.UpdatedAt = ts.UTC()
	if state.RequestedAt.IsZero() {
		state.RequestedAt = state.CreatedAt
	}
	if strings.TrimSpace(state.Underlying) == "" {
		state.Underlying = manualOptionDefaultUnderlying
	}
	if strings.TrimSpace(state.IndexToken) == "" {
		state.IndexToken = manualOptionDefaultIndexToken
	}
	if strings.TrimSpace(state.Strategy) == "" {
		state.Strategy = manualOptionDefaultStrategy
	}
	if state.TargetRupees <= 0 {
		state.TargetRupees = manualOptionDefaultTarget
	}
	if state.Lots <= 0 {
		state.Lots = 1
	}
	if state.LotSize <= 0 {
		state.LotSize = 65
	}
	value := strings.ToLower(strings.TrimSpace(state.Status))
	if value == "" {
		value = "pending"
	}
	raw, _ := json.Marshal(state)
	return s.store.UpsertStrategyStates(ctx, []store.StrategyState{{
		Ts:    ts.UTC(),
		Name:  store.ManualOptionStateName(state.ID),
		Value: value,
		Raw:   raw,
	}})
}

func renderWatcherManualOptionsHTML(now time.Time) string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Manual Options Workspace</title>
<style>
  :root { --black:#000000; --white:#ffffff; --green:#00ff66; --red:#ff0033; --surface:rgba(255,255,255,0.035); --surfaceStrong:rgba(255,255,255,0.06); --line:rgba(255,255,255,0.12); --lineStrong:rgba(255,255,255,0.22); --text:rgba(255,255,255,0.92); --muted:rgba(255,255,255,0.62); --fontSans:Inter,"Segoe UI",sans-serif; --fontMono:"IBM Plex Mono",Consolas,monospace; --glowGreen:0 0 24px rgba(0,255,102,0.18); }
  * { box-sizing:border-box; }
  body { font-family: var(--fontSans); background: radial-gradient(circle at top left, rgba(0,255,102,0.12), transparent 24%), radial-gradient(circle at 88% 0%, rgba(255,0,51,0.08), transparent 24%), linear-gradient(180deg, #050505 0%, var(--black) 100%); color: var(--text); margin: 0; padding: 20px; font-variant-numeric: tabular-nums; }
  h1 { margin: 0 0 6px; font-size: 28px; letter-spacing:-0.04em; }
  .sub { color: var(--muted); margin-bottom: 16px; line-height:1.6; }
  .toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; align-items:center; }
  .toolbar a, .toolbar button { min-height:38px; display:inline-flex; align-items:center; background: var(--surface); color: var(--text); border: 1px solid var(--line); padding: 0 12px; border-radius: 999px; text-decoration: none; cursor: pointer; text-transform:uppercase; letter-spacing:0.08em; font-size:12px; font-family:var(--fontMono); }
  .toolbar a:hover, .toolbar button:hover { border-color: rgba(0,255,102,0.42); background: var(--surfaceStrong); box-shadow: var(--glowGreen); }
  .card { background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025)); border: 1px solid var(--line); border-radius: 18px; padding: 14px; margin-bottom: 14px; box-shadow: 0 28px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04); }
  .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; align-items: end; }
  label { font-size: 12px; color: var(--muted); display: block; margin-bottom: 3px; text-transform:uppercase; letter-spacing:0.08em; font-family:var(--fontMono); }
  input { width: 100%; box-sizing: border-box; background: var(--surface); border: 1px solid var(--line); color: var(--text); border-radius: 999px; padding: 10px 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid var(--line); padding: 8px 6px; text-align: left; }
  th { color: var(--muted); font-weight: 600; text-transform:uppercase; letter-spacing:0.08em; font-family:var(--fontMono); }
  .pos { color: var(--green); }
  .neg { color: var(--red); }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--lineStrong); background: var(--surface); font-size: 11px; }
  .muted { color: var(--muted); }
</style>
</head>
<body>
  <h1>Manual Options Workspace</h1>
  <div class="sub">Live monitored manual option straddles with target auto-exit. Use this as an advanced practice board. Updated: ` + now.Format("2006-01-02 15:04:05") + `</div>
  <div class="toolbar">
    <a href="/watcher">Live watch</a>
    <a href="/paper/options">Practice options</a>
    <button id="refresh-btn">Refresh</button>
    <span id="meta" class="muted"></span>
  </div>
  <div class="card">
    <div class="form-grid">
      <div><label>ID</label><input id="id" placeholder="optional id"/></div>
      <div><label>Name</label><input id="name" placeholder="optional name"/></div>
      <div><label>Underlying</label><input id="underlying" value="NIFTY50"/></div>
      <div><label>Index Token</label><input id="index-token" value="99926000"/></div>
      <div><label>Strike (optional)</label><input id="strike" type="number" step="0.05"/></div>
      <div><label>Lots</label><input id="lots" type="number" min="1" value="1"/></div>
      <div><label>Lot Size</label><input id="lot-size" type="number" min="1" value="65"/></div>
      <div><label>Target ₹</label><input id="target" type="number" min="1" value="400"/></div>
      <div><button id="create-btn">Create Manual Trade</button></div>
    </div>
  </div>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Status</th><th>Underlying</th><th>Strike</th><th>Entry Time</th><th>Exit Time</th>
          <th>Entry CE</th><th>Entry PE</th><th>Current CE</th><th>Current PE</th>
          <th>Entry Combo</th><th>Current Combo</th>
          <th>PnL</th><th>Max PnL</th><th>Max Loss</th><th>RSI</th><th>WILLR</th><th>NormDiff</th><th>Updated</th><th>Action</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
<script>
const REFRESH_MS = 5000;
const istFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

async function fetchJSON(url, options) {
  const res = await fetch(url, options || { cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || ("HTTP " + res.status));
  }
  return res.json();
}
function fmt(v) {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") return v.toFixed(2);
  return v;
}
function fmtTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return istFormatter.format(d) + " IST";
}
function setMeta(text) {
  const base = "Auto refresh " + Math.round(REFRESH_MS / 1000) + "s";
  const stamp = "Last: " + istFormatter.format(new Date()) + " IST";
  document.getElementById("meta").textContent = text ? (base + " | " + text + " | " + stamp) : (base + " | " + stamp);
}
async function loadTrades() {
  const data = await fetchJSON("/backend/watcher/manual-options");
  const rows = document.getElementById("rows");
  rows.innerHTML = "";
  (data.trades || []).forEach(t => {
    const tr = document.createElement("tr");
    const pnl = Number(t.pnl || 0);
    const maxPnl = Number(t.max_pnl || 0);
    const maxLoss = Number(t.max_loss || 0);
    const updatedAt = fmtTime(t.updated_at || t.opened_at || t.requested_at);
    tr.innerHTML =
      "<td>" + (t.id || "-") + "</td>" +
      "<td><span class='tag'>" + (t.status || "-") + "</span></td>" +
      "<td>" + (t.underlying || "-") + "</td>" +
      "<td>" + fmt(t.strike) + "</td>" +
      "<td>" + fmtTime(t.opened_at || t.requested_at) + "</td>" +
      "<td>" + fmtTime(t.closed_at) + "</td>" +
      "<td>" + fmt(t.entry_ce) + "</td>" +
      "<td>" + fmt(t.entry_pe) + "</td>" +
      "<td>" + fmt(t.current_ce) + "</td>" +
      "<td>" + fmt(t.current_pe) + "</td>" +
      "<td>" + fmt(t.entry_combo) + "</td>" +
      "<td>" + fmt(t.current_combo) + "</td>" +
      "<td class='" + (pnl >= 0 ? "pos" : "neg") + "'>" + fmt(t.pnl) + "</td>" +
      "<td class='" + (maxPnl >= 0 ? "pos" : "neg") + "'>" + fmt(t.max_pnl) + "</td>" +
      "<td class='" + (maxLoss >= 0 ? "pos" : "neg") + "'>" + fmt(t.max_loss) + "</td>" +
      "<td>" + fmt(t.rsi) + "</td>" +
      "<td>" + fmt(t.willr) + "</td>" +
      "<td>" + fmt(t.norm_diff) + "</td>" +
      "<td>" + updatedAt + "</td>" +
      "<td>" +
        "<button data-act='close' data-id='" + t.id + "'>Close</button> " +
        "<button data-act='delete' data-id='" + t.id + "'>Cancel</button>" +
      "</td>";
    rows.appendChild(tr);
  });
  setMeta("Total manual trades: " + ((data.trades || []).length));
}
async function createTrade() {
  const payload = {
    id: document.getElementById("id").value,
    name: document.getElementById("name").value,
    underlying: document.getElementById("underlying").value,
    index_token: document.getElementById("index-token").value,
    strike: Number(document.getElementById("strike").value || 0),
    lots: Number(document.getElementById("lots").value || 1),
    lot_size: Number(document.getElementById("lot-size").value || 65),
    target_rupees: Number(document.getElementById("target").value || 400)
  };
  await fetchJSON("/backend/watcher/manual-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  await loadTrades();
}
async function closeTrade(id) {
  await fetchJSON("/backend/watcher/manual-options/" + encodeURIComponent(id) + "/close", { method: "POST" });
  await loadTrades();
}
async function deleteTrade(id) {
  await fetchJSON("/backend/watcher/manual-options/" + encodeURIComponent(id), { method: "DELETE" });
  await loadTrades();
}
document.getElementById("refresh-btn").addEventListener("click", () => loadTrades().catch(e => setMeta(e.message)));
document.getElementById("create-btn").addEventListener("click", () => createTrade().catch(e => setMeta(e.message)));
document.getElementById("rows").addEventListener("click", (ev) => {
  const t = ev.target;
  if (!t || !t.dataset || !t.dataset.id) return;
  const id = t.dataset.id;
  const act = t.dataset.act;
  if (act === "close") closeTrade(id).catch(e => setMeta(e.message));
  if (act === "delete") deleteTrade(id).catch(e => setMeta(e.message));
});
loadTrades().catch(e => setMeta(e.message));
setInterval(() => loadTrades().catch(e => setMeta(e.message)), REFRESH_MS);
</script>
</body>
</html>`
}
