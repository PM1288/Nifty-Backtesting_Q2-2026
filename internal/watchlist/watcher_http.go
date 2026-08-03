package watchlist

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

type watcherSummaryResponse struct {
	Summary any `json:"summary"`
}

type watcherRunsResponse struct {
	Runs any `json:"runs"`
}

func (s *Service) registerWatcherRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/watcher", s.handleWatcherUI)
	mux.HandleFunc("/watcher/manual-options", s.handleWatcherManualOptionsUI)
	mux.HandleFunc("/api/watcher/summary", s.handleWatcherSummary)
	mux.HandleFunc("/api/watcher/runs", s.handleWatcherRuns)
	mux.HandleFunc("/api/watcher/export.csv", s.handleWatcherExportCSV)
	mux.HandleFunc("/api/watcher/manual-options/", s.handleWatcherManualOptionByID)
	mux.HandleFunc("/api/watcher/manual-options", s.handleWatcherManualOptions)
	mux.HandleFunc("/backend/watcher/summary", s.handleWatcherSummary)
	mux.HandleFunc("/backend/watcher/runs", s.handleWatcherRuns)
	mux.HandleFunc("/backend/watcher/export.csv", s.handleWatcherExportCSV)
	mux.HandleFunc("/backend/watcher/manual-options/", s.handleWatcherManualOptionByID)
	mux.HandleFunc("/backend/watcher/manual-options", s.handleWatcherManualOptions)
}

func (s *Service) handleWatcherSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := s.store.FetchNiftyWatcherSummary(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, watcherSummaryResponse{Summary: summary})
}

func (s *Service) handleWatcherRuns(w http.ResponseWriter, r *http.Request) {
	limit := parseLimit(r, 200)
	runs, err := s.store.ListNiftyWatcherRuns(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, watcherRunsResponse{Runs: runs})
}

func (s *Service) handleWatcherExportCSV(w http.ResponseWriter, r *http.Request) {
	limit := parseLimit(r, 1000)
	runs, err := s.store.ListNiftyWatcherRuns(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=\"nifty_watcher_runs.csv\"")
	writer := csv.NewWriter(w)
	_ = writer.Write([]string{
		"id", "strategy", "trade_date", "entry_ts", "exit_ts", "eod_ts", "exit_reason",
		"underlying", "underlying_price", "level", "strike",
		"ce_token", "pe_token", "ce_symbol", "pe_symbol",
		"ce_price", "pe_price", "qty", "entry_combo", "exit_combo",
		"pnl", "max_pnl", "max_pnl_ts", "max_loss", "max_loss_ts", "eod_pnl",
		"rsi", "willr", "ce_norm", "pe_norm", "norm_diff",
		"target_rupees",
	})
	for _, r := range runs {
		_ = writer.Write([]string{
			intToStr(r.ID),
			r.Strategy,
			formatDate(r.TradeDate),
			formatTimePtr(&r.EntryTs),
			formatTimePtr(r.ExitTs),
			formatTimePtr(r.EODTs),
			strPtr(r.ExitReason),
			r.Underlying,
			floatPtrCSV(r.UnderlyingPrice),
			floatPtrCSV(r.Level),
			floatPtrCSV(r.Strike),
			strPtr(r.CEToken),
			strPtr(r.PEToken),
			strPtr(r.CESymbol),
			strPtr(r.PESymbol),
			floatPtrCSV(r.CEPrice),
			floatPtrCSV(r.PEPrice),
			intToStr(r.Qty),
			floatPtrCSV(r.EntryCombo),
			floatPtrCSV(r.ExitCombo),
			floatPtrCSV(r.PnL),
			floatPtrCSV(r.MaxPnL),
			formatTimePtr(r.MaxPnLTs),
			floatPtrCSV(r.MaxLoss),
			formatTimePtr(r.MaxLossTs),
			floatPtrCSV(r.EODPnL),
			floatPtrCSV(r.RSI),
			floatPtrCSV(r.WILLR),
			floatPtrCSV(r.CENorm),
			floatPtrCSV(r.PENorm),
			floatPtrCSV(r.NormDiff),
			floatPtrCSV(r.TargetRupees),
		})
	}
	writer.Flush()
}

func (s *Service) handleWatcherUI(w http.ResponseWriter, r *http.Request) {
	_, _ = w.Write([]byte(renderWatcherHTML(time.Now())))
}

func renderWatcherHTML(now time.Time) string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Watchlists Workspace</title>
<style>
  :root { --black:#000000; --white:#ffffff; --green:#00ff66; --red:#ff0033; --surface:rgba(255,255,255,0.035); --surfaceStrong:rgba(255,255,255,0.06); --line:rgba(255,255,255,0.12); --lineStrong:rgba(255,255,255,0.22); --text:rgba(255,255,255,0.92); --muted:rgba(255,255,255,0.62); --glowGreen:0 0 24px rgba(0,255,102,0.18); --fontSans:Inter,"Segoe UI",sans-serif; --fontMono:"IBM Plex Mono",Consolas,monospace; }
  * { box-sizing:border-box; }
  body { margin:0; padding:20px; font-family:var(--fontSans); background:radial-gradient(circle at top left, rgba(0,255,102,0.12), transparent 24%), radial-gradient(circle at 88% 0%, rgba(255,0,51,0.08), transparent 24%), linear-gradient(180deg, #050505 0%, var(--black) 100%); color:var(--text); font-variant-numeric:tabular-nums; }
  h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.04em; }
  .sub { color: var(--muted); margin-bottom: 16px; line-height: 1.6; }
  .actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:0 0 12px; }
  .actions a { min-height:38px; display:inline-flex; align-items:center; padding:0 13px; border-radius:999px; border:1px solid var(--line); background:var(--surface); color:var(--text); text-decoration:none; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; font-family:var(--fontMono); }
  .actions a:hover { border-color:rgba(0,255,102,0.42); background:var(--surfaceStrong); box-shadow:var(--glowGreen); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .card { background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025)); border-radius: 18px; padding: 12px; border: 1px solid var(--line); box-shadow: 0 28px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04); }
  .card h3 { margin: 0; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--fontMono); }
  .card p { margin: 6px 0 0; font-size: 18px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid var(--line); padding: 8px; text-align: left; }
  th { color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--fontMono); }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--lineStrong); background: var(--surface); font-size: 11px; }
  .neg { color: var(--red); }
  .pos { color: var(--green); }
  .muted { color: var(--muted); font-size: 12px; }
</style>
</head>
<body>
  <h1>Watchlists Workspace</h1>
  <div class="sub">Live watchlist board for recent runs, strategy outcomes, and quick operational review. Last updated: ` + now.Format("2006-01-02 15:04:05") + `</div>
  <div class="actions">
    <a href="/paper">Practice account</a>
    <a href="/watcher/manual-options">Manual options</a>
    <a href="/gateway/">System workspace</a>
    <span id="meta" class="muted"></span>
  </div>
  <div class="grid" id="summary"></div>
  <div style="margin: 0 0 12px;" class="muted">
    <a href="/backend/watcher/export.csv" style="color:inherit;">Download CSV</a>
  </div>
  <div class="card">
    <h3>Recent Runs</h3>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Strategy</th>
          <th>Strike</th>
          <th>Entry</th>
          <th>Exit</th>
          <th>PnL</th>
          <th>Max PnL</th>
          <th>Max Loss</th>
          <th>EOD PnL</th>
          <th>RSI</th>
          <th>WILLR</th>
          <th>NormDiff</th>
        </tr>
      </thead>
      <tbody id="runs"></tbody>
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

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}
function fmt(v) {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') return v.toFixed(2);
  return v;
}
function fmtIST(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return istFormatter.format(d) + ' IST';
}
function setMeta(text) {
  const base = 'Auto refresh ' + Math.round(REFRESH_MS / 1000) + 's';
  const stamp = 'Last: ' + istFormatter.format(new Date()) + ' IST';
  const el = document.getElementById('meta');
  if (el) {
    el.textContent = text ? (base + ' | ' + text + ' | ' + stamp) : (base + ' | ' + stamp);
  }
}
function addMetric(title, value, cls) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h3>' + title + '</h3><p class=\"' + (cls || '') + '\">' + value + '</p>';
  document.getElementById('summary').appendChild(card);
}
async function loadSummary() {
  const data = await fetchJSON('/backend/watcher/summary');
  if (!data || !data.summary) return;
  const s = data.summary;
  addMetric('Total PnL', fmt(s.totalPnl), s.totalPnl >= 0 ? 'pos' : 'neg');
  addMetric('Total EOD PnL', fmt(s.totalEodPnl), s.totalEodPnl >= 0 ? 'pos' : 'neg');
  addMetric('Runs', s.totalRuns ?? '-');
  if (s.byStrategy) {
    Object.keys(s.byStrategy).forEach(k => {
      addMetric('Strategy ' + k, fmt(s.byStrategy[k]), s.byStrategy[k] >= 0 ? 'pos' : 'neg');
    });
  }
}
async function loadRuns() {
  const data = await fetchJSON('/backend/watcher/runs?limit=200');
  if (!data || !data.runs) return;
  const body = document.getElementById('runs');
  body.innerHTML = '';
  data.runs.forEach(r => {
    const tr = document.createElement('tr');
    const entry = r.entryTs ? fmtIST(r.entryTs) : '-';
    tr.innerHTML =
      '<td>' + entry + '</td>' +
      '<td><span class=\"tag\">' + (r.strategy || '-') + '</span></td>' +
      '<td>' + fmt(r.strike) + '</td>' +
      '<td>' + fmt(r.entryCombo) + '</td>' +
      '<td>' + fmt(r.exitCombo) + '</td>' +
      '<td class=\"' + ((r.pnl || 0) >= 0 ? 'pos' : 'neg') + '\">' + fmt(r.pnl) + '</td>' +
      '<td class=\"' + ((r.maxPnl || 0) >= 0 ? 'pos' : 'neg') + '\">' + fmt(r.maxPnl) + '</td>' +
      '<td class=\"' + ((r.maxLoss || 0) >= 0 ? 'pos' : 'neg') + '\">' + fmt(r.maxLoss) + '</td>' +
      '<td class=\"' + ((r.eodPnl || 0) >= 0 ? 'pos' : 'neg') + '\">' + fmt(r.eodPnl) + '</td>' +
      '<td>' + fmt(r.rsi) + '</td>' +
      '<td>' + fmt(r.willr) + '</td>' +
      '<td>' + fmt(r.normDiff) + '</td>';
    body.appendChild(tr);
  });
}
async function refreshAll() {
  document.getElementById('summary').innerHTML = '';
  await loadSummary();
  await loadRuns();
  setMeta('');
}
refreshAll().catch(() => setMeta('refresh failed'));
setInterval(() => refreshAll().catch(() => setMeta('refresh failed')), REFRESH_MS);
</script>
</body>
</html>`
}

func parseLimit(r *http.Request, def int) int {
	limit := def
	if q := r.URL.Query().Get("limit"); q != "" {
		if v, err := strconv.Atoi(q); err == nil && v > 0 {
			limit = v
		}
	}
	return limit
}

func formatDate(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format("2006-01-02")
}

func formatTimePtr(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func floatPtrCSV(v *float64) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%.2f", *v)
}

func strPtr(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func intToStr(v int64) string {
	return strconv.FormatInt(v, 10)
}
