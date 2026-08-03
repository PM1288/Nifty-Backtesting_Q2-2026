package rsiwillr

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"trading-stack/internal/store"
)

type metaResponse struct {
	Enable               bool    `json:"enable"`
	Exchange             string  `json:"exchange"`
	EvalIntervalSeconds  int     `json:"eval_interval_seconds"`
	RunWindowStart       string  `json:"run_window_start"`
	RunWindowEnd         string  `json:"run_window_end"`
	LookbackMinutes      int     `json:"lookback_minutes"`
	RSIPeriod            int     `json:"rsi_period"`
	WillRPeriod          int     `json:"willr_period"`
	RSIThreshold         float64 `json:"rsi_threshold"`
	WillRThreshold       float64 `json:"willr_threshold"`
	MaxBarStalenessSec   int     `json:"max_bar_staleness_seconds"`
	AlertCooldownMinutes int     `json:"alert_cooldown_minutes"`
	LastEvalTS           string  `json:"last_eval_ts"`
	LastEvalErr          string  `json:"last_eval_err"`
}

type targetsResponse struct {
	Targets []store.RSIWillRTarget `json:"targets"`
}

type alertsResponse struct {
	Events []store.RSIWillRAlertEvent `json:"events"`
}

type targetCreateRequest struct {
	Symbol         string   `json:"symbol"`
	DisplayName    string   `json:"display_name"`
	Active         *bool    `json:"active"`
	Notes          string   `json:"notes"`
	EnableRSIWillR *bool    `json:"enable_rsi_willr"`
	RSIThreshold   *float64 `json:"rsi_threshold"`
	WillRThreshold *float64 `json:"willr_threshold"`
	EnablePrice    *bool    `json:"enable_price"`
	PriceThreshold *float64 `json:"price_threshold"`
	PriceDirection string   `json:"price_direction"`
}

type targetUpdateRequest struct {
	DisplayName    *string  `json:"display_name"`
	Active         *bool    `json:"active"`
	Notes          *string  `json:"notes"`
	EnableRSIWillR *bool    `json:"enable_rsi_willr"`
	RSIThreshold   *float64 `json:"rsi_threshold"`
	WillRThreshold *float64 `json:"willr_threshold"`
	EnablePrice    *bool    `json:"enable_price"`
	PriceThreshold *float64 `json:"price_threshold"`
	PriceDirection *string  `json:"price_direction"`
}

func (s *Service) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Service) handleMeta(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	lastTS := s.lastEvalTS
	lastErr := s.lastEvalErr
	s.mu.Unlock()
	resp := metaResponse{
		Enable:               s.cfg.Enable,
		Exchange:             s.cfg.Exchange,
		EvalIntervalSeconds:  s.cfg.EvalIntervalSeconds,
		RunWindowStart:       s.cfg.RunWindowStart,
		RunWindowEnd:         s.cfg.RunWindowEnd,
		LookbackMinutes:      s.cfg.LookbackMinutes,
		RSIPeriod:            s.cfg.RSIPeriod,
		WillRPeriod:          s.cfg.WillRPeriod,
		RSIThreshold:         s.cfg.RSIThreshold,
		WillRThreshold:       s.cfg.WillRThreshold,
		MaxBarStalenessSec:   s.cfg.MaxBarStalenessSeconds,
		AlertCooldownMinutes: s.cfg.AlertCooldownMinutes,
		LastEvalErr:          lastErr,
	}
	if !lastTS.IsZero() {
		resp.LastEvalTS = lastTS.Format(time.RFC3339)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Service) handleEvaluate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	s.evaluateAndRecord(r.Context())
	s.handleMeta(w, r)
}

func (s *Service) handleTargets(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		includeInactive := strings.EqualFold(r.URL.Query().Get("all"), "true") || r.URL.Query().Get("all") == "1"
		rows, err := s.store.ListRSIWillRTargets(r.Context(), includeInactive)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, targetsResponse{Targets: rows})
	case http.MethodPost:
		var req targetCreateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON body"))
			return
		}
		req.Symbol = strings.TrimSpace(req.Symbol)
		if req.Symbol == "" {
			writeError(w, http.StatusBadRequest, fmt.Errorf("symbol is required"))
			return
		}
		active := true
		if req.Active != nil {
			active = *req.Active
		}
		enableRSIWillR := true
		if req.EnableRSIWillR != nil {
			enableRSIWillR = *req.EnableRSIWillR
		}
		enablePrice := false
		if req.EnablePrice != nil {
			enablePrice = *req.EnablePrice
		}
		priceDir := strings.TrimSpace(req.PriceDirection)
		if priceDir == "" {
			priceDir = "below"
		}
		if enablePrice {
			if req.PriceThreshold == nil || *req.PriceThreshold <= 0 {
				writeError(w, http.StatusBadRequest, fmt.Errorf("price_threshold must be > 0 when enable_price is true"))
				return
			}
			switch strings.ToLower(priceDir) {
			case "below", "above":
			default:
				writeError(w, http.StatusBadRequest, fmt.Errorf("price_direction must be 'below' or 'above'"))
				return
			}
		}
		lookup, err := s.store.ResolveEquityToken(r.Context(), s.cfg.Exchange, req.Symbol)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		target := store.RSIWillRTarget{
			Exchange:       lookup.Exchange,
			Symbol:         strings.ToUpper(req.Symbol),
			SymbolToken:    lookup.SymbolToken,
			TradingSymbol:  lookup.TradingSymbol,
			DisplayName:    strings.TrimSpace(req.DisplayName),
			Active:         active,
			Notes:          strings.TrimSpace(req.Notes),
			EnableRSIWillR: enableRSIWillR,
			RSIThreshold:   req.RSIThreshold,
			WillRThreshold: req.WillRThreshold,
			EnablePrice:    enablePrice,
			PriceThreshold: req.PriceThreshold,
			PriceDirection: priceDir,
		}
		if target.DisplayName == "" {
			target.DisplayName = strings.TrimSpace(lookup.Name)
		}
		id, err := s.store.UpsertRSIWillRTarget(r.Context(), target)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		target.ID = id
		writeJSON(w, http.StatusOK, target)
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handleTargetID(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/targets/")
	idStr = strings.TrimSpace(idStr)
	if idStr == "" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("missing id"))
		return
	}
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid id"))
		return
	}

	switch r.Method {
	case http.MethodPut:
		var req targetUpdateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON body"))
			return
		}
		current, err := s.store.GetRSIWillRTarget(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if req.DisplayName != nil {
			current.DisplayName = strings.TrimSpace(*req.DisplayName)
		}
		if req.Notes != nil {
			current.Notes = strings.TrimSpace(*req.Notes)
		}
		if req.Active != nil {
			current.Active = *req.Active
		}
		if req.EnableRSIWillR != nil {
			current.EnableRSIWillR = *req.EnableRSIWillR
		}
		if req.RSIThreshold != nil {
			current.RSIThreshold = req.RSIThreshold
		}
		if req.WillRThreshold != nil {
			current.WillRThreshold = req.WillRThreshold
		}
		if req.EnablePrice != nil {
			current.EnablePrice = *req.EnablePrice
		}
		if req.PriceThreshold != nil {
			current.PriceThreshold = req.PriceThreshold
		}
		if req.PriceDirection != nil {
			current.PriceDirection = strings.TrimSpace(*req.PriceDirection)
		}
		if strings.TrimSpace(current.PriceDirection) == "" {
			current.PriceDirection = "below"
		}
		if current.EnablePrice {
			if current.PriceThreshold == nil || *current.PriceThreshold <= 0 {
				writeError(w, http.StatusBadRequest, fmt.Errorf("price_threshold must be > 0 when enable_price is true"))
				return
			}
			switch strings.ToLower(current.PriceDirection) {
			case "below", "above":
			default:
				writeError(w, http.StatusBadRequest, fmt.Errorf("price_direction must be 'below' or 'above'"))
				return
			}
		}
		if err := s.store.UpdateRSIWillRTarget(r.Context(), store.RSIWillRTarget{
			ID:             id,
			DisplayName:    current.DisplayName,
			Active:         current.Active,
			Notes:          current.Notes,
			EnableRSIWillR: current.EnableRSIWillR,
			RSIThreshold:   current.RSIThreshold,
			WillRThreshold: current.WillRThreshold,
			EnablePrice:    current.EnablePrice,
			PriceThreshold: current.PriceThreshold,
			PriceDirection: current.PriceDirection,
		}); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": id})
	case http.MethodDelete:
		if err := s.store.DeleteRSIWillRTarget(r.Context(), id); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": id})
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handleAlerts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	limit := parseLimit(r, 50)
	events, err := s.store.ListRSIWillRAlertEvents(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, alertsResponse{Events: events})
}

func (s *Service) handleUI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderHTML(time.Now())))
}

func renderHTML(now time.Time) string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Signal Monitor</title>
<style>
  :root {
    --black:#000000;
    --white:#ffffff;
    --green:#00ff66;
    --red:#ff0033;
    --surface:rgba(255,255,255,0.035);
    --surfaceStrong:rgba(255,255,255,0.06);
    --border:rgba(255,255,255,0.12);
    --borderStrong:rgba(255,255,255,0.22);
    --muted:rgba(255,255,255,0.62);
    --text:rgba(255,255,255,0.92);
    --good:var(--green);
    --bad:var(--red);
    --glowGreen:0 0 24px rgba(0,255,102,0.18);
    --fontSans:Inter,"Segoe UI",sans-serif;
    --fontMono:"IBM Plex Mono",Consolas,monospace;
  }
  * { box-sizing: border-box; }
  body { font-family: var(--fontSans); background: radial-gradient(circle at top left, rgba(0,255,102,0.12), transparent 24%), radial-gradient(circle at 88% 0%, rgba(255,0,51,0.08), transparent 24%), linear-gradient(180deg, #050505 0%, var(--black) 100%); color: var(--text); margin: 0; padding: 20px; font-variant-numeric: tabular-nums; }
  h1 { margin: 0 0 6px; font-size: 26px; letter-spacing:-0.04em; }
  .sub { color: var(--muted); margin-bottom: 14px; line-height:1.6; }
  .row { display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 980px) { .row { grid-template-columns: 420px 1fr; } }
  .card { background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025)); border-radius: 18px; padding: 12px; border: 1px solid var(--border); box-shadow: 0 28px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04); }
  .card h3 { margin: 0 0 10px; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing:0.08em; font-family: var(--fontMono); }
  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing:0.08em; font-family: var(--fontMono); }
  input[type="text"] { width: 100%; padding: 10px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  input[type="number"], select { width: 100%; padding: 10px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  textarea { width: 100%; min-height: 56px; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  .btn { display: inline-flex; align-items:center; min-height:38px; border: 1px solid var(--border); background: var(--surface); color: var(--text); padding: 0 12px; border-radius: 999px; cursor: pointer; text-transform: uppercase; letter-spacing:0.08em; font-size:12px; font-family: var(--fontMono); }
  .btn.primary { border-color: rgba(0,255,102,0.36); background: rgba(0,255,102,0.12); }
  .btn.primary:hover { border-color: rgba(0,255,102,0.42); background: var(--surfaceStrong); box-shadow: var(--glowGreen); }
  .btn.danger { background: rgba(255,0,51,0.12); border-color: rgba(255,0,51,0.3); color: var(--text); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .pill { display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; border: 1px solid var(--borderStrong); color: var(--muted); background: var(--surface); }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid var(--border); padding: 7px 6px; text-align: left; vertical-align: top; }
  th { color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing:0.08em; font-family: var(--fontMono); }
  .pos { color: var(--good); }
  .neg { color: var(--bad); }
  .muted { color: var(--muted); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .mono { font-family: var(--fontMono); }
</style>
</head>
<body>
  <h1>Signal Monitor</h1>
  <div class="sub">Live signal board for RSI and Williams %R alerts. Use it as an advanced monitoring workspace, not as the default beginner entry point. Last page render: ` + now.Format("2006-01-02 15:04:05") + `</div>

  <div class="row">
    <div class="card">
      <h3>Config</h3>
      <div id="meta" class="muted">Loading...</div>
      <div style="margin-top:10px;">
        <button class="btn" id="btnEval">Run Evaluate Now</button>
      </div>
    </div>

    <div class="card">
      <h3>Add Symbol</h3>
      <div class="grid">
        <div>
          <label>Symbol (e.g. RELIANCE / BAJFINANCE)</label>
          <input id="symbol" type="text" placeholder="RELIANCE" />
        </div>
        <div>
          <label>Display Name (optional)</label>
          <input id="display" type="text" placeholder="Reliance" />
        </div>
      </div>
      <div style="margin-top:10px;">
        <label>Notes (optional)</label>
        <textarea id="notes" placeholder="why monitoring this"></textarea>
      </div>
      <div style="margin-top:10px;" class="grid">
        <div style="background:#0b1015; border:1px solid var(--border); border-radius:8px; padding:10px;">
          <h3>RSI/WILLR Condition</h3>
          <label><input id="condInd" type="checkbox" checked /> Enable (RSI &lt; threshold AND WILLR &lt; threshold)</label>
          <div class="grid" style="margin-top:8px;">
            <div>
              <label>RSI Threshold (blank = global)</label>
              <input id="rsiTh" type="number" step="0.1" placeholder="30" />
            </div>
            <div>
              <label>WILLR Threshold (blank = global)</label>
              <input id="willrTh" type="number" step="0.1" placeholder="-80" />
            </div>
          </div>
        </div>
        <div style="background:#0b1015; border:1px solid var(--border); border-radius:8px; padding:10px;">
          <h3>Price Condition</h3>
          <label><input id="condPrice" type="checkbox" /> Enable (price above/below threshold)</label>
          <div class="grid" style="margin-top:8px;">
            <div>
              <label>Direction</label>
              <select id="priceDir">
                <option value="below">below</option>
                <option value="above">above</option>
              </select>
            </div>
            <div>
              <label>Price Threshold</label>
              <input id="priceTh" type="number" step="0.05" placeholder="1400" />
            </div>
          </div>
        </div>
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
        <button class="btn primary" id="btnAdd">Add / Update</button>
        <span class="pill">Symbols must exist in instruments table</span>
      </div>
      <div id="addStatus" class="muted" style="margin-top:8px;"></div>
    </div>
  </div>

  <div class="card" style="margin-top: 12px;">
    <h3>Targets</h3>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Active</th>
          <th>Last Bar</th>
          <th>Close</th>
          <th>RSI</th>
          <th>WILLR</th>
          <th>Rules</th>
          <th>Met</th>
          <th>Pending</th>
          <th>Last Alert</th>
          <th>Notes</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="targets"></tbody>
    </table>
  </div>

  <div class="card" style="margin-top: 12px;">
    <h3>Recent Alerts</h3>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Symbol</th>
          <th>Close</th>
          <th>RSI</th>
          <th>WILLR</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody id="alerts"></tbody>
    </table>
  </div>

<script>
async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  const txt = await res.text();
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
  if (!res.ok) {
    const msg = (data && data.error) ? data.error : ('HTTP ' + res.status);
    throw new Error(msg);
  }
  return data;
}

function fmtNum(v, digits) {
  if (v === null || v === undefined) return '-';
  if (typeof v !== 'number') return v;
  return v.toFixed(digits ?? 2);
}

function fmtTS(v) {
  if (!v) return '-';
  try { return new Date(v).toLocaleString(); } catch (e) { return v; }
}

function ruleText(t) {
  const parts = [];
  if (t.enable_rsi_willr) {
    const rsiTh = (t.rsi_threshold === null || t.rsi_threshold === undefined) ? 'global' : fmtNum(t.rsi_threshold, 1);
    const wTh = (t.willr_threshold === null || t.willr_threshold === undefined) ? 'global' : fmtNum(t.willr_threshold, 1);
    parts.push('RSI<' + rsiTh + ' & W%R<' + wTh);
  }
  if (t.enable_price) {
    const dir = (t.price_direction || 'below');
    const pTh = (t.price_threshold === null || t.price_threshold === undefined) ? '?' : fmtNum(t.price_threshold, 2);
    parts.push('PRICE ' + dir + ' ' + pTh);
  }
  return parts.length ? parts.join(' OR ') : '-';
}

async function loadMeta() {
  const m = await fetchJSON('api/meta');
  let html = '';
  html += '<div class="grid3">';
  html += '<div><div class="muted">RSI</div><div class="mono">' + m.rsi_period + ' <span class="muted">&lt;</span> ' + m.rsi_threshold + '</div></div>';
  html += '<div><div class="muted">WILLR</div><div class="mono">' + m.willr_period + ' <span class="muted">&lt;</span> ' + m.willr_threshold + '</div></div>';
  html += '<div><div class="muted">Interval</div><div class="mono">' + m.eval_interval_seconds + 's</div></div>';
  html += '</div>';
  html += '<div style="margin-top:10px" class="grid3">';
  html += '<div><div class="muted">Exchange</div><div class="mono">' + (m.exchange || '-') + '</div></div>';
  html += '<div><div class="muted">Run Window</div><div class="mono">' + (m.run_window_start || '-') + ' - ' + (m.run_window_end || '-') + '</div></div>';
  html += '<div><div class="muted">Lookback</div><div class="mono">' + m.lookback_minutes + 'm</div></div>';
  html += '</div>';
  html += '<div style="margin-top:10px" class="grid3">';
  html += '<div><div class="muted">Cooldown</div><div class="mono">' + m.alert_cooldown_minutes + 'm</div></div>';
  html += '<div><div class="muted">Bar Stale</div><div class="mono">' + m.max_bar_staleness_seconds + 's</div></div>';
  html += '<div><div class="muted">Enabled</div><div class="mono">' + (m.enable ? 'true' : 'false') + '</div></div>';
  html += '</div>';
  html += '<div style="margin-top:10px" class="muted">Last evaluate: ' + (m.last_eval_ts ? fmtTS(m.last_eval_ts) : '-') + (m.last_eval_err ? (' <span class="neg">(' + m.last_eval_err + ')</span>') : '') + '</div>';
  document.getElementById('meta').innerHTML = html;
}

async function loadTargets() {
  const data = await fetchJSON('api/targets?all=1');
  const body = document.getElementById('targets');
  body.innerHTML = '';
  (data.targets || []).forEach(t => {
    const tr = document.createElement('tr');
    const metCls = t.last_condition_met ? 'pos' : 'muted';
    const pendCls = t.pending_alert ? 'neg' : 'muted';
    tr.innerHTML =
      '<td><div class="mono">' + (t.symbol || '-') + '</div><div class="muted">' + (t.tradingsymbol || '') + '</div></td>' +
      '<td>' + (t.active ? '<span class="pill pos">on</span>' : '<span class="pill muted">off</span>') + '</td>' +
      '<td>' + fmtTS(t.last_bar_ts) + '</td>' +
      '<td>' + fmtNum(t.last_close, 2) + '</td>' +
      '<td>' + fmtNum(t.last_rsi, 1) + '</td>' +
      '<td>' + fmtNum(t.last_willr, 1) + '</td>' +
      '<td>' + ruleText(t) + '</td>' +
      '<td class="' + metCls + '">' + (t.last_condition_met ? 'yes' : 'no') + '</td>' +
      '<td class="' + pendCls + '">' + (t.pending_alert ? 'yes' : 'no') + '</td>' +
      '<td>' + fmtTS(t.last_alert_ts) + '</td>' +
      '<td>' + (t.notes || '') + '</td>' +
      '<td>' +
        '<button class="btn" data-act="toggle" data-id="' + t.id + '">' + (t.active ? 'Disable' : 'Enable') + '</button> ' +
        '<button class="btn danger" data-act="del" data-id="' + t.id + '">Delete</button>' +
      '</td>';
    body.appendChild(tr);
  });
}

async function loadAlerts() {
  const data = await fetchJSON('api/alerts?limit=50');
  const body = document.getElementById('alerts');
  body.innerHTML = '';
  (data.events || []).forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + fmtTS(e.alert_ts) + '</td>' +
      '<td class="mono">' + (e.symbol || '-') + '</td>' +
      '<td>' + fmtNum(e.close, 2) + '</td>' +
      '<td>' + fmtNum(e.rsi, 1) + '</td>' +
      '<td>' + fmtNum(e.willr, 1) + '</td>' +
      '<td>' + (e.message || '') + '</td>';
    body.appendChild(tr);
  });
}

async function addTarget() {
  const symbol = document.getElementById('symbol').value.trim();
  const display = document.getElementById('display').value.trim();
  const notes = document.getElementById('notes').value.trim();
  const enableInd = document.getElementById('condInd').checked;
  const rsiThRaw = document.getElementById('rsiTh').value.trim();
  const willrThRaw = document.getElementById('willrTh').value.trim();
  const enablePrice = document.getElementById('condPrice').checked;
  const priceDir = document.getElementById('priceDir').value;
  const priceThRaw = document.getElementById('priceTh').value.trim();
  document.getElementById('addStatus').innerText = '';
  if (!symbol) {
    document.getElementById('addStatus').innerText = 'Symbol is required';
    return;
  }
  const payload = {
    symbol: symbol,
    display_name: display,
    notes: notes,
    active: true,
    enable_rsi_willr: enableInd,
    rsi_threshold: rsiThRaw ? Number(rsiThRaw) : null,
    willr_threshold: willrThRaw ? Number(willrThRaw) : null,
    enable_price: enablePrice,
    price_direction: priceDir,
    price_threshold: priceThRaw ? Number(priceThRaw) : null
  };
  try {
    await fetchJSON('api/targets', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    document.getElementById('addStatus').innerText = 'Saved';
    await loadTargets();
  } catch (e) {
    document.getElementById('addStatus').innerHTML = '<span class="neg">' + e.message + '</span>';
  }
}

async function toggleTarget(id) {
  const data = await fetchJSON('api/targets?all=1');
  const t = (data.targets || []).find(x => x.id === Number(id));
  if (!t) return;
  await fetchJSON('api/targets/' + id, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({active: !t.active})
  });
  await loadTargets();
}

async function deleteTarget(id) {
  await fetchJSON('api/targets/' + id, {method:'DELETE'});
  await loadTargets();
}

async function evalNow() {
  document.getElementById('btnEval').disabled = true;
  try {
    await fetchJSON('api/evaluate', {method:'POST'});
    await loadMeta();
    await loadTargets();
    await loadAlerts();
  } finally {
    document.getElementById('btnEval').disabled = false;
  }
}

document.getElementById('btnAdd').addEventListener('click', addTarget);
document.getElementById('btnEval').addEventListener('click', evalNow);

document.getElementById('targets').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  const act = btn.getAttribute('data-act');
  if (!id || !act) return;
  if (act === 'toggle') {
    await toggleTarget(id);
    return;
  }
  if (act === 'del') {
    if (!confirm('Delete target #' + id + '?')) return;
    await deleteTarget(id);
    return;
  }
});

async function refreshAll() {
  await loadMeta();
  await loadTargets();
  await loadAlerts();
}

refreshAll();
setInterval(refreshAll, 15000);
</script>
</body>
</html>`
}

func parseLimit(r *http.Request, def int) int {
	limit := def
	if q := strings.TrimSpace(r.URL.Query().Get("limit")); q != "" {
		if v, err := strconv.Atoi(q); err == nil && v > 0 {
			limit = v
		}
	}
	return limit
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
