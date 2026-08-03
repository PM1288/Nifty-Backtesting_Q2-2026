package watchlist

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"trading-stack/internal/store"
)

const digii4ManualTrackersStateName = "digii4_flow:manual_trackers"

type digii4ManualTrackersState struct {
	Symbols   []string  `json:"symbols"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

type digii4ManualTrackersResponse struct {
	Symbols   []string   `json:"symbols"`
	Count     int        `json:"count"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
}

type digii4ManualTrackerRequest struct {
	Symbol  string   `json:"symbol"`
	Symbols []string `json:"symbols"`
}

func (s *Service) registerDigii4ManualRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/digii4/manual-trackers", s.handleDigii4ManualTrackersUI)
	mux.HandleFunc("/api/digii4/manual-trackers/", s.handleDigii4ManualTrackerBySymbol)
	mux.HandleFunc("/api/digii4/manual-trackers", s.handleDigii4ManualTrackers)
	mux.HandleFunc("/backend/digii4/manual-trackers/", s.handleDigii4ManualTrackerBySymbol)
	mux.HandleFunc("/backend/digii4/manual-trackers", s.handleDigii4ManualTrackers)
}

func (s *Service) handleDigii4ManualTrackers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		state, err := s.loadDigii4ManualTrackersState(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, toDigii4ManualTrackersResponse(state))
	case http.MethodPost:
		var req digii4ManualTrackerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, fmt.Errorf("invalid JSON body"))
			return
		}
		incoming := make([]string, 0, len(req.Symbols)+1)
		if strings.TrimSpace(req.Symbol) != "" {
			incoming = append(incoming, req.Symbol)
		}
		incoming = append(incoming, req.Symbols...)
		incoming = normalizeDigii4ManualSymbols(incoming)
		if len(incoming) == 0 {
			writeError(w, http.StatusBadRequest, fmt.Errorf("symbol is required"))
			return
		}
		state, err := s.loadDigii4ManualTrackersState(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		state.Symbols = append(state.Symbols, incoming...)
		state.Symbols = normalizeDigii4ManualSymbols(state.Symbols)
		state.UpdatedAt = time.Now().UTC()
		if err := s.persistDigii4ManualTrackersState(r.Context(), state); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, toDigii4ManualTrackersResponse(state))
	default:
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
	}
}

func (s *Service) handleDigii4ManualTrackerBySymbol(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	symbol, err := extractManualTrackerSymbol(r.URL.Path)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	state, err := s.loadDigii4ManualTrackersState(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	removeCanon := canonicalDigii4ManualSymbol(symbol)
	next := make([]string, 0, len(state.Symbols))
	for _, sym := range state.Symbols {
		if canonicalDigii4ManualSymbol(sym) == removeCanon {
			continue
		}
		next = append(next, sym)
	}
	next = normalizeDigii4ManualSymbols(next)
	if len(next) != len(state.Symbols) {
		state.Symbols = next
		state.UpdatedAt = time.Now().UTC()
		if err := s.persistDigii4ManualTrackersState(r.Context(), state); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
	} else {
		state.Symbols = next
	}
	writeJSON(w, http.StatusOK, toDigii4ManualTrackersResponse(state))
}

func (s *Service) handleDigii4ManualTrackersUI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(renderDigii4ManualTrackersHTML(time.Now())))
}

func extractManualTrackerSymbol(path string) (string, error) {
	trimmed := strings.TrimSuffix(strings.TrimSpace(path), "/")
	parts := strings.Split(trimmed, "/")
	raw := strings.TrimSpace(parts[len(parts)-1])
	if raw == "" {
		return "", fmt.Errorf("symbol is required")
	}
	decoded, err := url.PathUnescape(raw)
	if err != nil {
		return "", fmt.Errorf("invalid symbol")
	}
	decoded = strings.TrimSpace(decoded)
	if decoded == "" {
		return "", fmt.Errorf("symbol is required")
	}
	return decoded, nil
}

func toDigii4ManualTrackersResponse(state digii4ManualTrackersState) digii4ManualTrackersResponse {
	resp := digii4ManualTrackersResponse{
		Symbols: append([]string{}, state.Symbols...),
		Count:   len(state.Symbols),
	}
	if !state.UpdatedAt.IsZero() {
		ts := state.UpdatedAt.UTC()
		resp.UpdatedAt = &ts
	}
	return resp
}

func (s *Service) loadDigii4ManualTrackersState(ctx context.Context) (digii4ManualTrackersState, error) {
	state := digii4ManualTrackersState{Symbols: []string{}}
	st, err := s.store.GetLatestStrategyState(ctx, digii4ManualTrackersStateName)
	if err != nil {
		return state, err
	}
	if st == nil {
		return state, nil
	}
	if !st.Ts.IsZero() {
		state.UpdatedAt = st.Ts.UTC()
	}
	if len(st.Raw) > 0 {
		if err := json.Unmarshal(st.Raw, &state); err != nil {
			var symbols []string
			if errList := json.Unmarshal(st.Raw, &symbols); errList == nil {
				state.Symbols = symbols
			}
		}
	}
	if len(state.Symbols) == 0 && strings.TrimSpace(st.Value) != "" {
		state.Symbols = strings.Split(st.Value, ",")
	}
	state.Symbols = normalizeDigii4ManualSymbols(state.Symbols)
	return state, nil
}

func (s *Service) persistDigii4ManualTrackersState(ctx context.Context, state digii4ManualTrackersState) error {
	state.Symbols = normalizeDigii4ManualSymbols(state.Symbols)
	if state.UpdatedAt.IsZero() {
		state.UpdatedAt = time.Now().UTC()
	}
	raw, _ := json.Marshal(state)
	return s.store.UpsertStrategyStates(ctx, []store.StrategyState{{
		Ts:    state.UpdatedAt.UTC(),
		Name:  digii4ManualTrackersStateName,
		Value: strings.Join(state.Symbols, ","),
		Raw:   raw,
	}})
}

func normalizeDigii4ManualSymbols(symbols []string) []string {
	if len(symbols) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(symbols))
	out := make([]string, 0, len(symbols))
	for _, symbol := range symbols {
		canon := canonicalDigii4ManualSymbol(symbol)
		if canon == "" {
			continue
		}
		if _, ok := seen[canon]; ok {
			continue
		}
		seen[canon] = struct{}{}
		out = append(out, canon)
	}
	sort.Strings(out)
	return out
}

func canonicalDigii4ManualSymbol(symbol string) string {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	clean = strings.TrimSuffix(clean, "-EQ")
	return strings.TrimSpace(clean)
}

func renderDigii4ManualTrackersHTML(now time.Time) string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Manual Trackers</title>
  <style>
    :root { --black:#000000; --white:#ffffff; --green:#00ff66; --red:#ff0033; --surface:rgba(255,255,255,0.035); --surfaceStrong:rgba(255,255,255,0.06); --line:rgba(255,255,255,0.12); --lineStrong:rgba(255,255,255,0.22); --text:rgba(255,255,255,0.92); --muted:rgba(255,255,255,0.62); --fontSans:Inter,"Segoe UI",sans-serif; --fontMono:"IBM Plex Mono",Consolas,monospace; --glowGreen:0 0 24px rgba(0,255,102,0.18); }
    * { box-sizing: border-box; }
    body { font-family: var(--fontSans); margin: 24px; background: radial-gradient(circle at top left, rgba(0,255,102,0.12), transparent 24%), radial-gradient(circle at 88% 0%, rgba(255,0,51,0.08), transparent 24%), linear-gradient(180deg, #050505 0%, var(--black) 100%); color: var(--text); font-variant-numeric: tabular-nums; }
    h1 { margin: 0 0 8px; font-size: 24px; letter-spacing:-0.04em; }
    .sub { color: var(--muted); margin-bottom: 16px; line-height:1.6; }
    .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .toolbar a, .toolbar button { min-height:38px; display:inline-flex; align-items:center; background: var(--surface); border: 1px solid var(--line); color: var(--text); padding: 0 12px; border-radius: 999px; text-decoration: none; font-size: 12px; text-transform:uppercase; letter-spacing:0.08em; font-family:var(--fontMono); cursor: pointer; }
    .toolbar a:hover, .toolbar button:hover { border-color: rgba(0,255,102,0.42); background: var(--surfaceStrong); box-shadow: var(--glowGreen); }
    .toolbar input { background: var(--surface); border: 1px solid var(--line); color: var(--text); padding: 10px 12px; border-radius: 999px; width: 180px; }
    .card { background: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025)); border: 1px solid var(--line); border-radius: 18px; padding: 16px; margin-bottom: 16px; box-shadow: 0 28px 80px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.04); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; }
    th { color: var(--muted); font-weight: 600; text-transform:uppercase; letter-spacing:0.08em; font-family:var(--fontMono); }
    .muted { color: var(--muted); font-size: 12px; }
    .danger { background: rgba(255,0,51,0.12); border-color: rgba(255,0,51,0.3); }
  </style>
</head>
<body>
  <h1>Manual Trackers</h1>
  <div class="sub">Advanced tracker list for runtime symbol fallbacks and manual review. Updated: ` + now.UTC().Format(time.RFC3339) + `</div>
  <div class="toolbar">
    <a href="/paper">Practice account</a>
    <a href="/paper/equity">Equity</a>
    <a href="/paper/options">Options</a>
  </div>
  <div class="card">
    <div class="toolbar">
      <input id="symbol" placeholder="Symbol (e.g. TCS or TCS-EQ)" />
      <button id="add-btn">Add Symbol</button>
      <button id="refresh-btn">Refresh</button>
      <span id="meta" class="muted"></span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
  <script>
    async function fetchJSON(url, options) {
      const res = await fetch(url, options || { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || ("HTTP " + res.status));
      }
      return res.json();
    }

    function setMeta(text) {
      document.getElementById("meta").textContent = text || "";
    }

    async function loadSymbols() {
      const data = await fetchJSON("/backend/digii4/manual-trackers", { cache: "no-store" });
      const rows = document.getElementById("rows");
      rows.innerHTML = "";
      (data.symbols || []).forEach(sym => {
        const tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + sym + "</td>" +
          "<td><button class='danger' data-symbol='" + sym + "'>Delete</button></td>";
        rows.appendChild(tr);
      });
      const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleString() : "-";
      setMeta("Count: " + (data.count || 0) + " | Last update: " + updated);
    }

    async function addSymbol() {
      const input = document.getElementById("symbol");
      const value = String(input.value || "").trim();
      if (!value) return;
      await fetchJSON("/backend/digii4/manual-trackers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: value })
      });
      input.value = "";
      await loadSymbols();
    }

    async function deleteSymbol(sym) {
      await fetchJSON("/backend/digii4/manual-trackers/" + encodeURIComponent(sym), {
        method: "DELETE"
      });
      await loadSymbols();
    }

    document.getElementById("add-btn").addEventListener("click", () => addSymbol().catch(err => setMeta(err.message)));
    document.getElementById("refresh-btn").addEventListener("click", () => loadSymbols().catch(err => setMeta(err.message)));
    document.getElementById("rows").addEventListener("click", (ev) => {
      const target = ev.target;
      if (!target || !target.dataset || !target.dataset.symbol) return;
      deleteSymbol(target.dataset.symbol).catch(err => setMeta(err.message));
    });
    document.getElementById("symbol").addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addSymbol().catch(err => setMeta(err.message));
      }
    });
    loadSymbols().catch(err => setMeta(err.message));
  </script>
</body>
</html>`
}
