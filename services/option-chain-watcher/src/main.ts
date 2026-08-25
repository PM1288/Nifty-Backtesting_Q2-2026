import http from 'node:http';
import { Buffer } from 'node:buffer';
import { Pool } from 'pg';
import { DateTime } from 'luxon';
import { loadConfig } from './config';
import { Logger } from './logger';
import { migrate } from './migrate';
import { NseOptionChainClient, pickExpiryRoles } from './nseClient';
import { OptionChainStore } from './store';
import { selectAtmPlusMinus } from './transform';
import { createPool } from './db';
import { marketSnapshotFingerprint, sessionSuppressionReason } from './sessionPolicy';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function inCleanupWindowIst(nowIst: DateTime, startHour: number, endHour: number): boolean {
  const h = nowIst.hour + nowIst.minute / 60;
  return h >= startHour && h < endHour;
}

function latestTuesdayStartIst(nowIst: DateTime): DateTime {
  const startOfToday = nowIst.startOf('day');
  const daysSinceTuesday = (nowIst.weekday - 2 + 7) % 7;
  return startOfToday.minus({ days: daysSinceTuesday });
}

function sendJson(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function sendHtml(res: http.ServerResponse, code: number, html: string): void {
  res.writeHead(code, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(html);
}

function badRequest(res: http.ServerResponse, message: string): void {
  sendJson(res, 400, { ok: false, error: message });
}

function renderIndexHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Options Workspace</title>
    <style>
      :root{
        --black:#000000;
        --white:#ffffff;
        --green:#00ff66;
        --red:#ff0033;
        --surface:rgba(255,255,255,0.035);
        --surfaceStrong:rgba(255,255,255,0.06);
        --surfaceMuted:rgba(255,255,255,0.025);
        --muted:rgba(255,255,255,0.62);
        --dim:rgba(255,255,255,0.42);
        --text:rgba(255,255,255,0.92);
        --line:rgba(255,255,255,0.12);
        --lineStrong:rgba(255,255,255,0.22);
        --good:var(--green);
        --bad:var(--red);
        --ce:var(--green);
        --pe:var(--red);
        --glowGreen:0 0 24px rgba(0,255,102,0.18);
        --glowRed:0 0 24px rgba(255,0,51,0.16);
        --glowWhite:0 0 24px rgba(255,255,255,0.08);
        --font-heading:Inter, "Segoe UI", sans-serif;
        --font-body:Inter, "Segoe UI", sans-serif;
        --font-mono:"IBM Plex Mono", Consolas, monospace;
      }
      *{box-sizing:border-box}
      body{
        margin:0;
        font-family:var(--font-body);
        background:
          radial-gradient(circle at top left, rgba(0,255,102,0.12), transparent 24%),
          radial-gradient(circle at 88% 0%, rgba(255,0,51,0.08), transparent 24%),
          linear-gradient(180deg, #050505 0%, var(--black) 100%);
        color:var(--text);
        position:relative;
        overflow-x:hidden;
        font-variant-numeric:tabular-nums;
      }
      body::before{
        content:"";
        position:fixed;
        inset:0;
        pointer-events:none;
        background:
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
        background-size:100% 3px, 3px 100%;
        mask-image:linear-gradient(180deg, rgba(0,0,0,0.34), transparent 90%);
        opacity:0.28;
      }
      header{
        padding:18px 18px 12px 18px;
        border-bottom:1px solid var(--line);
        position:sticky;
        top:0;
        backdrop-filter: blur(14px);
        background:rgba(0,0,0,0.86);
        z-index:10;
        box-shadow:0 12px 40px rgba(0,0,0,0.36);
      }
      .title{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
      .title h1{margin:0;font-family:var(--font-heading); font-size:1.3rem; letter-spacing:-0.04em}
      .title .pill{
        min-height:34px;
        display:inline-flex;
        align-items:center;
        padding:0 12px;
        border:1px solid var(--line);
        border-radius:999px;
        color:var(--muted);
        background:var(--surface);
        font-size:0.68rem;
        letter-spacing:0.08em;
        text-transform:uppercase;
        font-family:var(--font-mono);
      }
      .sub{
        margin-top:8px;
        font-size:0.78rem;
        color:var(--muted);
        display:flex;
        gap:14px;
        flex-wrap:wrap;
        font-family:var(--font-mono);
      }
      main{padding:16px 18px 24px 18px; max-width:1400px; margin:0 auto}
      .grid{display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); gap:10px}
      @media (max-width:1200px){.grid{grid-template-columns:repeat(3, minmax(0,1fr));}}
      @media (max-width:760px){.grid{grid-template-columns:repeat(2, minmax(0,1fr));}}
      .card{
        background:linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025));
        border:1px solid var(--line);
        border-radius:18px;
        padding:12px;
        box-shadow:
          0 28px 80px rgba(0,0,0,0.48),
          inset 0 1px 0 rgba(255,255,255,0.04);
      }
      .card .k{
        font-size:0.68rem;
        color:var(--muted);
        text-transform:uppercase;
        letter-spacing:0.08em;
        font-family:var(--font-mono);
      }
      .card .v{margin-top:8px; font-size:1.08rem; font-weight:700; font-family:var(--font-heading)}
      .toolbar{margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap}
      .toolbar .left{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
      button{
        min-height:38px;
        background:var(--surface);
        border:1px solid var(--line);
        color:var(--text);
        padding:0 13px;
        border-radius:999px;
        cursor:pointer;
        font-family:var(--font-body);
        font-size:0.72rem;
        letter-spacing:0.08em;
        text-transform:uppercase;
        font-weight:700;
        transition:transform 140ms ease, border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
      }
      button:hover{
        border-color:rgba(0,255,102,0.42);
        background:var(--surfaceStrong);
        box-shadow:var(--glowGreen);
        transform:translateY(-1px);
      }
      label{font-size:0.72rem; color:var(--muted); font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em}
      select,input{
        min-height:38px;
        background:var(--surface);
        border:1px solid var(--line);
        color:var(--text);
        border-radius:999px;
        padding:0 14px;
        font-family:var(--font-body);
      }
      .status{font-size:12px; color:var(--muted)}
      .status .dot{display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; background:var(--white)}
      .status.ok .dot{background:var(--good); box-shadow:var(--glowGreen)}
      .status.bad .dot{background:var(--bad); box-shadow:var(--glowRed)}
      .charts{margin-top:12px; display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:10px}
      @media (max-width:980px){.charts{grid-template-columns:1fr;}}
      .chartCard{
        background:linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025));
        border:1px solid var(--line);
        border-radius:18px;
        padding:12px;
        box-shadow:
          0 28px 80px rgba(0,0,0,0.48),
          inset 0 1px 0 rgba(255,255,255,0.04);
      }
      .chartCard h3{
        margin:0 0 10px 0;
        font-size:0.74rem;
        color:var(--muted);
        font-weight:600;
        font-family:var(--font-mono);
        letter-spacing:0.08em;
        text-transform:uppercase;
      }
      canvas{
        width:100%;
        height:220px;
        display:block;
        border-radius:16px;
        background:#040404;
        border:1px solid var(--line);
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);
      }
      .tableWrap{
        margin-top:12px;
        border:1px solid var(--line);
        border-radius:18px;
        overflow:auto;
        background:rgba(255,255,255,0.025);
      }
      table{border-collapse:separate; border-spacing:0; width:100%; min-width:1200px}
      thead th{
        position:sticky;
        top:0;
        background:rgba(0,0,0,0.96);
        z-index:5;
        font-size:0.68rem;
        color:var(--dim);
        text-align:right;
        padding:9px 10px;
        border-bottom:1px solid var(--line);
        white-space:nowrap;
        font-family:var(--font-mono);
        letter-spacing:0.08em;
        text-transform:uppercase;
      }
      tbody td{font-size:0.78rem; padding:8px 10px; border-bottom:1px solid var(--line); text-align:right; white-space:nowrap}
      tbody tr:hover{background:rgba(255,255,255,0.04)}
      tbody tr.atm{background:rgba(0,255,102,0.08); box-shadow:inset 0 0 0 1px rgba(0,255,102,0.14)}
      .strike{font-weight:700; text-align:center}
      .ce{color:var(--ce)}
      .pe{color:var(--pe)}
      .muted{color:var(--muted)}
      .small{font-size:0.68rem; font-family:var(--font-mono); letter-spacing:0.08em; text-transform:uppercase}
      .right{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
      .modeToggle{display:flex; gap:6px; align-items:center; padding:4px; border:1px solid var(--line); border-radius:999px; background:var(--surface)}
      .modeToggle button{min-height:30px; padding:0 12px; font-size:0.68rem}
      .modeToggle button[data-active="true"]{border-color:rgba(255,255,255,0.22); background:rgba(255,255,255,0.1); box-shadow:var(--glowWhite)}
      .guide{
        margin-top:12px;
        padding:12px;
        border:1px solid var(--line);
        border-radius:18px;
        background:linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02));
        display:grid;
        gap:8px;
      }
      .guide strong{font-family:var(--font-heading); font-size:0.94rem}
      .guideCopy{font-size:0.76rem; color:var(--muted); line-height:1.6}
      body[data-mode="beginner"] .tableWrap{display:none}
      body[data-mode="beginner"] .note{display:none}
      .note{margin-top:10px; font-size:0.72rem; color:var(--muted); line-height:1.6; font-family:var(--font-mono)}
      .note code{color:var(--green)}
    </style>
  </head>
  <body>
    <header>
      <div class="title">
        <h1 id="hTitle">Options Workspace</h1>
        <span class="pill" id="hExpiry">expiry: -</span>
        <span class="pill" id="hUpdated">updated: -</span>
        <span class="pill" id="hFetch">fetch: -</span>
        <span class="pill" id="hPrev">prev: -</span>
      </div>
      <div class="sub" id="hSub">
        <div>Underlying: <span id="hUnderlying" class="muted">-</span></div>
        <div>ATM: <span id="hAtm" class="muted">-</span></div>
        <div>Straddle (ATM): <span id="hStraddle" class="muted">-</span></div>
        <div>PCR (OI): <span id="hPcr" class="muted">-</span></div>
      </div>
    </header>
    <main>
      <section class="grid">
        <div class="card"><div class="k">CE OI (sum)</div><div class="v" id="kCeOi">-</div></div>
        <div class="card"><div class="k">PE OI (sum)</div><div class="v" id="kPeOi">-</div></div>
        <div class="card"><div class="k">CE ΔOI (sum)</div><div class="v" id="kCeChgOi">-</div></div>
        <div class="card"><div class="k">PE ΔOI (sum)</div><div class="v" id="kPeChgOi">-</div></div>
        <div class="card"><div class="k">ATM CE IV</div><div class="v" id="kAtmCeIv">-</div></div>
        <div class="card"><div class="k">ATM PE IV</div><div class="v" id="kAtmPeIv">-</div></div>
      </section>

      <section class="toolbar">
        <div class="left">
          <button id="btnRefresh">Refresh</button>
          <label><input type="checkbox" id="chkAuto" checked /> Auto</label>
          <label><input type="checkbox" id="chkOverlay10m" checked /> Overlay ~10m</label>
          <label>Every
            <select id="selEvery">
              <option value="5000">5s</option>
              <option value="10000" selected>10s</option>
              <option value="20000">20s</option>
              <option value="30000">30s</option>
              <option value="60000">60s</option>
            </select>
          </label>
          <label>Series
            <select id="selSeriesMins">
              <option value="60">60m</option>
              <option value="120" selected>120m</option>
              <option value="240">240m</option>
              <option value="480">480m</option>
            </select>
          </label>
        </div>
        <div class="right">
          <div class="modeToggle" aria-label="Options workspace mode">
            <button id="btnModeBeginner" data-active="true">Beginner</button>
            <button id="btnModePro" data-active="false">Pro</button>
          </div>
          <div id="uiStatus" class="status"><span class="dot"></span><span id="uiStatusText">Loading...</span></div>
          <div class="status small"><span class="muted">Last UI refresh:</span> <span id="uiLastUi">-</span></div>
        </div>
      </section>

      <section class="guide">
        <strong>How to read this options page</strong>
        <div class="guideCopy">Beginner mode keeps the summary cards and the three main charts in focus so you can read ATM balance, open-interest pressure, and implied volatility slope first.</div>
        <div class="guideCopy">Switch to Pro when you need the full option chain with Greeks, strike-by-strike detail, and the complete table.</div>
      </section>

      <section class="charts">
        <div class="chartCard">
          <h3>Open Interest by Strike (latest)</h3>
          <canvas id="cOi"></canvas>
        </div>
        <div class="chartCard">
          <h3>Implied Volatility by Strike (latest)</h3>
          <canvas id="cIv"></canvas>
        </div>
        <div class="chartCard" style="grid-column:1/-1">
          <h3>ATM Time Series (Underlying + Straddle) (selected window)</h3>
          <canvas id="cTime" style="height:260px"></canvas>
        </div>
      </section>

      <section class="tableWrap">
        <table>
          <thead>
            <tr>
              <th class="ce">CE LTP</th>
              <th class="ce">CE IV</th>
              <th class="ce">CE OI</th>
              <th class="ce">CE ΔOI</th>
              <th class="ce">CE Δ</th>
              <th class="ce">CE Γ</th>
              <th class="ce">CE Θ/day</th>
              <th class="ce">CE Vega/%</th>
              <th class="strike">Strike</th>
              <th class="pe">PE LTP</th>
              <th class="pe">PE IV</th>
              <th class="pe">PE OI</th>
              <th class="pe">PE ΔOI</th>
              <th class="pe">PE Δ</th>
              <th class="pe">PE Γ</th>
              <th class="pe">PE Θ/day</th>
              <th class="pe">PE Vega/%</th>
            </tr>
          </thead>
          <tbody id="tBody">
            <tr><td colspan="17" class="muted" style="text-align:center;padding:18px">Loading...</td></tr>
          </tbody>
        </table>
      </section>

      <div class="note">
        Notes: Greeks shown are Black-Scholes approximations using IV from NSE (if IV and time-to-expiry are available). Theta is per day. Vega is per 1% IV change.
      </div>
    </main>

    <script>
      const modeStorageKey = "trading-stack.options.mode";
      function applyMode(nextMode) {
        const mode = nextMode === "pro" ? "pro" : "beginner";
        document.body.dataset.mode = mode;
        localStorage.setItem(modeStorageKey, mode);
        const beginner = document.getElementById("btnModeBeginner");
        const pro = document.getElementById("btnModePro");
        if (beginner) beginner.dataset.active = mode === "beginner" ? "true" : "false";
        if (pro) pro.dataset.active = mode === "pro" ? "true" : "false";
      }
      document.getElementById("btnModeBeginner")?.addEventListener("click", () => applyMode("beginner"));
      document.getElementById("btnModePro")?.addEventListener("click", () => applyMode("pro"));
      applyMode(localStorage.getItem(modeStorageKey) || "beginner");
      const el = (id) => document.getElementById(id);
      const fmt2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
      const fmt4 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 });
      const fmt0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

      function n(v, d=2) {
        if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
        const num = Number(v);
        if (!Number.isFinite(num)) return '-';
        if (d === 0) return fmt0.format(num);
        if (d === 4) return fmt4.format(num);
        return fmt2.format(num);
      }

      function sum(arr) {
        return arr.reduce((a,b)=>a+(Number.isFinite(b)?b:0), 0);
      }

      function groupByStrike(legs) {
        const m = new Map();
        for (const leg of legs) {
          const k = Number(leg.strike);
          if (!m.has(k)) m.set(k, { strike: k, CE: null, PE: null });
          m.get(k)[leg.optionType] = leg;
        }
        return Array.from(m.values()).sort((a,b)=>a.strike-b.strike);
      }

      function resizeCanvas(c) {
        const dpr = window.devicePixelRatio || 1;
        const r = c.getBoundingClientRect();
        const w = Math.max(10, Math.floor(r.width * dpr));
        const h = Math.max(10, Math.floor(r.height * dpr));
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        return { w, h, dpr };
      }

      function drawLines(canvas, xVals, series, opts) {
        const ctx = canvas.getContext('2d');
        const { w, h } = resizeCanvas(canvas);
        ctx.clearRect(0,0,w,h);

        const padL = 54, padR = 18, padT = 14, padB = 28;
        const iw = w - padL - padR;
        const ih = h - padT - padB;

        const allY = [];
        for (const s of series) {
          for (const v of s.y) if (v !== null && Number.isFinite(v)) allY.push(Number(v));
        }
        const maxY = Math.max(1, ...allY);

        const xMin = 0;
        const xMax = Math.max(1, xVals.length - 1);
        const xToPx = (i) => padL + (i - xMin) * (iw / (xMax - xMin));
        const yToPx = (y) => padT + (ih - (y * ih / maxY));

        // grid
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let g = 0; g <= 4; g++) {
          const y = padT + (ih * g / 4);
          ctx.moveTo(padL, y);
          ctx.lineTo(padL + iw, y);
        }
        ctx.stroke();

        // y labels
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let g = 0; g <= 4; g++) {
          const v = maxY * (1 - g / 4);
          const y = padT + (ih * g / 4);
          ctx.fillText(opts.formatY ? opts.formatY(v) : String(Math.round(v)), padL - 8, y);
        }

        // x labels: first, mid, last
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const idxs = [0, Math.floor((xVals.length-1)/2), xVals.length-1].filter((v,i,a)=>a.indexOf(v)===i);
        for (const i of idxs) {
          ctx.fillText(String(xVals[i]), xToPx(i), padT + ih + 8);
        }

        // lines
        for (const s of series) {
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width || 2;
          ctx.setLineDash(s.dash || []);
          ctx.beginPath();
          let started = false;
          for (let i = 0; i < s.y.length; i++) {
            const v = s.y[i];
            if (v === null || !Number.isFinite(v)) { started = false; continue; }
            const px = xToPx(i);
            const py = yToPx(Number(v));
            if (!started) { ctx.moveTo(px, py); started = true; } else { ctx.lineTo(px, py); }
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // legend
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let lx = padL;
        const ly = 6;
        for (const s of series) {
          ctx.fillStyle = s.color;
          ctx.fillRect(lx, ly+4, 10, 10);
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillText(s.label, lx + 14, ly);
          lx += 90;
        }
      }

      function setStatus(kind, text) {
        const st = el('uiStatus');
        st.classList.remove('ok','bad');
        if (kind === 'ok') st.classList.add('ok');
        if (kind === 'bad') st.classList.add('bad');
        el('uiStatusText').textContent = text;
      }

      let lastSnapshotId = null;

      async function fetchJson(path) {
        const r = await fetch(path, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }

      function renderLatest(payload) {
        const { snapshot, legs } = payload;
        el('hTitle').textContent = snapshot.symbol + ' Option Chain (ATM±' + snapshot.strikesAround + ')';
        el('hExpiry').textContent = 'expiry: ' + snapshot.expiryDate;
        el('hUpdated').textContent = 'updated: ' + snapshot.capturedAt.replace('T',' ').replace('Z','Z');
        el('hFetch').textContent = 'fetch: ' + (snapshot.fetchMs === null ? '-' : snapshot.fetchMs + 'ms');

        const cmpOk = payload.compare && payload.compare.ok;
        if (cmpOk) {
          el('hPrev').textContent = 'prev: ' + Number(payload.compare.actualAgoMinutes).toFixed(1) + 'm';
        } else if (payload.compare && payload.compare.ok === false) {
          el('hPrev').textContent = 'prev: n/a';
        } else {
          el('hPrev').textContent = 'prev: off';
        }

        el('hUnderlying').textContent = n(snapshot.underlyingValue, 2);
        el('hAtm').textContent = n(snapshot.atmStrike, 0);

        const grouped = groupByStrike(legs);
        const ceOi = grouped.map(r => (r.CE && r.CE.oi != null) ? Number(r.CE.oi) : 0);
        const peOi = grouped.map(r => (r.PE && r.PE.oi != null) ? Number(r.PE.oi) : 0);
        const ceChgOi = grouped.map(r => (r.CE && r.CE.chgOi != null) ? Number(r.CE.chgOi) : 0);
        const peChgOi = grouped.map(r => (r.PE && r.PE.chgOi != null) ? Number(r.PE.chgOi) : 0);

        const sCeOi = sum(ceOi);
        const sPeOi = sum(peOi);
        el('kCeOi').textContent = n(sCeOi, 0);
        el('kPeOi').textContent = n(sPeOi, 0);
        el('kCeChgOi').textContent = n(sum(ceChgOi), 0);
        el('kPeChgOi').textContent = n(sum(peChgOi), 0);
        const pcr = sCeOi > 0 ? (sPeOi / sCeOi) : null;
        el('hPcr').textContent = pcr === null ? '-' : n(pcr, 4);

        const atm = snapshot.atmStrike;
        const atmRow = grouped.find(r => Number(r.strike) === Number(atm));
        const atmCe = atmRow && atmRow.CE ? atmRow.CE : null;
        const atmPe = atmRow && atmRow.PE ? atmRow.PE : null;
        const straddle = (atmCe && atmCe.lastPrice != null ? Number(atmCe.lastPrice) : 0) + (atmPe && atmPe.lastPrice != null ? Number(atmPe.lastPrice) : 0);
        el('hStraddle').textContent = straddle > 0 ? n(straddle, 2) : '-';
        el('kAtmCeIv').textContent = atmCe && atmCe.iv != null ? n(atmCe.iv, 2) : '-';
        el('kAtmPeIv').textContent = atmPe && atmPe.iv != null ? n(atmPe.iv, 2) : '-';

        // table
        const tb = el('tBody');
        tb.innerHTML = '';
        for (const r of grouped) {
          const tr = document.createElement('tr');
          if (atm !== null && Number(r.strike) === Number(atm)) tr.classList.add('atm');
          const ce = r.CE || {};
          const pe = r.PE || {};

          const cells = [
            { v: ce.lastPrice, cls:'ce' },
            { v: ce.iv, cls:'ce' },
            { v: ce.oi, cls:'ce', d:0 },
            { v: ce.chgOi, cls:'ce', d:0 },
            { v: ce.delta, cls:'ce', d:4 },
            { v: ce.gamma, cls:'ce', d:4 },
            { v: ce.theta, cls:'ce', d:4 },
            { v: ce.vega, cls:'ce', d:4 },
            { v: r.strike, cls:'strike', d:0, isStrike:true },
            { v: pe.lastPrice, cls:'pe' },
            { v: pe.iv, cls:'pe' },
            { v: pe.oi, cls:'pe', d:0 },
            { v: pe.chgOi, cls:'pe', d:0 },
            { v: pe.delta, cls:'pe', d:4 },
            { v: pe.gamma, cls:'pe', d:4 },
            { v: pe.theta, cls:'pe', d:4 },
            { v: pe.vega, cls:'pe', d:4 },
          ];
          for (const c of cells) {
            const td = document.createElement('td');
            td.className = c.cls || '';
            if (c.isStrike) td.classList.add('strike');
            td.textContent = n(c.v, c.d ?? 2);
            tr.appendChild(td);
          }
          tb.appendChild(tr);
        }

        // charts
        const prevByKey = (() => {
          if (!cmpOk) return null;
          const m = new Map();
          for (const leg of payload.compare.legs || []) {
            const k = String(leg.strike) + ':' + String(leg.optionType);
            m.set(k, leg);
          }
          return m;
        })();

        const strikes = grouped.map(r => r.strike);
        const ceOiY = grouped.map(r => r.CE && r.CE.oi != null ? Number(r.CE.oi) : null);
        const peOiY = grouped.map(r => r.PE && r.PE.oi != null ? Number(r.PE.oi) : null);

        const oiSeries = [
          { label: 'CE OI', color: 'rgba(0,255,102,0.95)', y: ceOiY },
          { label: 'PE OI', color: 'rgba(255,0,51,0.95)', y: peOiY },
        ];

        if (prevByKey) {
          const prevCeOiY = strikes.map(k => {
            const leg = prevByKey.get(String(k) + ':CE');
            return leg && leg.oi != null ? Number(leg.oi) : null;
          });
          const prevPeOiY = strikes.map(k => {
            const leg = prevByKey.get(String(k) + ':PE');
            return leg && leg.oi != null ? Number(leg.oi) : null;
          });
          oiSeries.push({ label: 'CE OI (prev)', color: 'rgba(0,255,102,0.45)', y: prevCeOiY, dash: [6,4] });
          oiSeries.push({ label: 'PE OI (prev)', color: 'rgba(255,0,51,0.45)', y: prevPeOiY, dash: [6,4] });
        }

        drawLines(el('cOi'), strikes, oiSeries, { formatY: (v) => (v >= 1e6 ? (v/1e6).toFixed(1)+'M' : (v>=1e3 ? (v/1e3).toFixed(0)+'k' : String(Math.round(v)))) });

        const ceIvY = grouped.map(r => r.CE && r.CE.iv != null ? Number(r.CE.iv) : null);
        const peIvY = grouped.map(r => r.PE && r.PE.iv != null ? Number(r.PE.iv) : null);
        const ivSeries = [
          { label: 'CE IV', color: 'rgba(0,255,102,0.95)', y: ceIvY },
          { label: 'PE IV', color: 'rgba(255,0,51,0.95)', y: peIvY },
        ];

        if (prevByKey) {
          const prevCeIvY = strikes.map(k => {
            const leg = prevByKey.get(String(k) + ':CE');
            return leg && leg.iv != null ? Number(leg.iv) : null;
          });
          const prevPeIvY = strikes.map(k => {
            const leg = prevByKey.get(String(k) + ':PE');
            return leg && leg.iv != null ? Number(leg.iv) : null;
          });
          ivSeries.push({ label: 'CE IV (prev)', color: 'rgba(0,255,102,0.45)', y: prevCeIvY, dash: [6,4] });
          ivSeries.push({ label: 'PE IV (prev)', color: 'rgba(255,0,51,0.45)', y: prevPeIvY, dash: [6,4] });
        }

        drawLines(el('cIv'), strikes, ivSeries, { formatY: (v) => v.toFixed(1) });

        lastSnapshotId = snapshot.id;
      }

      function renderSeries(payload) {
        const pts = payload.points || [];
        const x = pts.map((_, i) => i);
        const underlying = pts.map(p => p.underlyingValue != null ? Number(p.underlyingValue) : null);
        const straddle = pts.map(p => {
          const ce = p.ceLtp != null ? Number(p.ceLtp) : 0;
          const pe = p.peLtp != null ? Number(p.peLtp) : 0;
          const v = ce + pe;
          return v > 0 ? v : null;
        });
        drawLines(el('cTime'), x, [
          { label: 'Underlying', color: 'rgba(255,255,255,0.95)', y: underlying },
          { label: 'Straddle', color: 'rgba(0,255,102,0.95)', y: straddle },
        ], { formatY: (v) => v.toFixed(0) });
      }

      async function refresh() {
        el('uiLastUi').textContent = new Date().toISOString().replace('T',' ').replace('Z','Z');
        try {
          const overlayOn = el('chkOverlay10m').checked;
          const latestUrl = overlayOn ? ('./api/latest?compareMinutes=10') : './api/latest';
          const latest = await fetchJson(latestUrl);
          if (!latest || !latest.ok) throw new Error('Bad response');
          renderLatest(latest);
          setStatus('ok', 'OK (snapshot #' + latest.snapshot.id + ')');

          const mins = Number(el('selSeriesMins').value || 120);
          const series = await fetchJson('./api/series?minutes=' + encodeURIComponent(mins));
          if (series && series.ok) renderSeries(series);
        } catch (e) {
          setStatus('bad', 'Error: ' + (e && e.message ? e.message : String(e)));
        }
      }

      let timer = null;
      function schedule() {
        if (timer) clearInterval(timer);
        if (!el('chkAuto').checked) return;
        const every = Number(el('selEvery').value || 10000);
        timer = setInterval(refresh, every);
      }

      el('btnRefresh').addEventListener('click', () => refresh());
      el('chkAuto').addEventListener('change', () => schedule());
      el('chkOverlay10m').addEventListener('change', () => refresh());
      el('selEvery').addEventListener('change', () => schedule());
      el('selSeriesMins').addEventListener('change', () => refresh());
      window.addEventListener('resize', () => refresh());

      refresh().then(() => schedule());
    </script>
  </body>
</html>`;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const logger = new Logger('option-chain-watcher');

  logger.info('Starting', {
    pollEveryMs: cfg.pollEveryMs,
    symbol: cfg.symbol,
    strikesAround: cfg.strikesAround,
    keepRaw: cfg.keepRaw,
    riskFreeRate: cfg.riskFreeRate,
    dividendYield: cfg.dividendYield,
      cleanupEnabled: cfg.cleanupEnabled,
      cleanupMinDays: cfg.cleanupMinDays,
      cleanupWindowIst: `${cfg.cleanupWindowStartHourIst}-${cfg.cleanupWindowEndHourIst}`,
      runMigrationsOnStart: cfg.runMigrationsOnStart,
      screenshotEnabled: cfg.screenshotEnabled,
  });

  const pool = createPool();

  // Fail-fast on DB issues so docker restart policy can help.
  await pool.query('select 1 as ok');
  if (cfg.runMigrationsOnStart) {
    await migrate(pool);
    logger.warn('DB migrations applied/verified during service startup', { transitional: true });
  } else {
    logger.info('Startup migrations disabled; expecting explicit deployment-time migration flow');
  }

  const store = new OptionChainStore(pool);
  const nse = new NseOptionChainClient(new Logger('nse-client'), {
    userAgent: cfg.userAgent,
    referer: cfg.referer,
  });

  // Minimal in-process health/telemetry.
  const state: {
    startedAt: string;
    lastPollAt: string | null;
    lastPollOkAt: string | null;
    lastStoredAt: string | null;
    lastSuppressedAt: string | null;
    suppressionReason: string | null;
    sessionState: 'OPEN' | 'SUPPRESSED' | 'UNKNOWN';
    outOfSessionPollsSuppressed: number;
    unchangedSnapshotsSuppressed: number;
    lastError: { time: string; message: string } | null;
  } = {
    startedAt: new Date().toISOString(),
    lastPollAt: null,
    lastPollOkAt: null,
    lastStoredAt: null,
    lastSuppressedAt: null,
    suppressionReason: null,
    sessionState: 'UNKNOWN',
    outOfSessionPollsSuppressed: 0,
    unchangedSnapshotsSuppressed: 0,
    lastError: null,
  };

  // Optional screenshot cache (off by default).
  let screenshotCache: { atMs: number; png: Buffer } | null = null;

  async function getScreenshotPng(): Promise<Buffer> {
    if (!cfg.screenshotEnabled) {
      throw new Error('Screenshot endpoint disabled (set NSE_OC_SCREENSHOT_ENABLED=true)');
    }

    const now = Date.now();
    if (screenshotCache && now - screenshotCache.atMs < cfg.screenshotTtlMs) {
      return screenshotCache.png;
    }

    const { firefox } = await import('playwright');
    const browser = await firefox.launch({ headless: true });
    try {
      const context = await browser.newContext({ userAgent: cfg.userAgent });
      const page = await context.newPage();
      await page.goto(cfg.screenshotUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(1500);
      const png = await page.screenshot({ fullPage: true });
      screenshotCache = { atMs: now, png };
      return png;
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...state }));
      return;
    }

    if (url.pathname === '/readyz') {
      // Ready if DB is reachable.
      try {
        await pool.query('select 1 as ok');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ready: true, ...state }));
      } catch (e) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ready: false, ...state }));
      }
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      sendHtml(res, 200, renderIndexHtml());
      return;
    }

    if (url.pathname === '/api/latest') {
      const symbol = cfg.symbol;
      const compareMinutesRaw = url.searchParams.get('compareMinutes');
      let compareMinutes: number | null = null;
      if (compareMinutesRaw !== null) {
        compareMinutes = Number(compareMinutesRaw);
        if (!Number.isFinite(compareMinutes) || compareMinutes <= 0 || compareMinutes > 24 * 60) {
          badRequest(res, 'Invalid compareMinutes (1..1440)');
          return;
        }
      }

      const latest = await store.getLatestSnapshotWithLegs(symbol);
      if (!latest) {
        sendJson(res, 200, { ok: false, error: 'No snapshots yet', watcherState: state });
        return;
      }

      let compare:
        | {
          ok: true;
          requestedMinutes: number;
          windowMinutes: number;
          actualAgoMinutes: number;
          snapshot: typeof latest.snapshot;
          legs: typeof latest.legs;
        }
        | { ok: false; requestedMinutes: number; windowMinutes: number; error: string }
        | undefined;

      if (compareMinutes != null) {
        const windowMinutes = 5;
        const latestMs = Date.parse(latest.snapshot.capturedAt);
        const targetTime = new Date(latestMs - compareMinutes * 60_000);

        const prev = await store.getSnapshotWithLegsNearTime(symbol, targetTime, windowMinutes);
        if (!prev) {
          compare = {
            ok: false,
            requestedMinutes: compareMinutes,
            windowMinutes,
            error: 'No snapshot found near target time',
          };
        } else {
          const prevMs = Date.parse(prev.snapshot.capturedAt);
          compare = {
            ok: true,
            requestedMinutes: compareMinutes,
            windowMinutes,
            actualAgoMinutes: (latestMs - prevMs) / 60_000,
            snapshot: prev.snapshot,
            legs: prev.legs,
          };
        }
      }

      sendJson(res, 200, {
        ok: true,
        snapshot: latest.snapshot,
        legs: latest.legs,
        compare,
        watcherState: state,
        capabilities: { screenshotEnabled: cfg.screenshotEnabled },
      });
      return;
    }

    if (url.pathname === '/api/series') {
      const minutesRaw = url.searchParams.get('minutes');
      const minutes = minutesRaw ? Number(minutesRaw) : 120;
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 7 * 24 * 60) {
        badRequest(res, 'Invalid minutes (1..10080)');
        return;
      }
      const limit = Math.min(2000, Math.max(10, Math.floor(minutes / 2) + 10)); // poll is ~2m; keep a reasonable cap
      const points = await store.getAtmSeries(cfg.symbol, Math.floor(minutes), limit);
      sendJson(res, 200, { ok: true, minutes: Math.floor(minutes), points });
      return;
    }

    if (url.pathname === '/api/analytics') {
      const minutesRaw = url.searchParams.get('minutes');
      const compareMinutesRaw = url.searchParams.get('compareMinutes');
      const strikesAroundRaw = url.searchParams.get('strikesAround');
      const expiry = url.searchParams.get('expiry');

      const minutes = minutesRaw ? Number(minutesRaw) : 240;
      const compareMinutes = compareMinutesRaw ? Number(compareMinutesRaw) : 10;
      const strikesAround = strikesAroundRaw ? Number(strikesAroundRaw) : 3;

      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 7 * 24 * 60) {
        badRequest(res, 'Invalid minutes (1..10080)');
        return;
      }
      if (!Number.isFinite(compareMinutes) || compareMinutes <= 0 || compareMinutes > 24 * 60) {
        badRequest(res, 'Invalid compareMinutes (1..1440)');
        return;
      }
      if (!Number.isFinite(strikesAround) || strikesAround < 1 || strikesAround > 10) {
        badRequest(res, 'Invalid strikesAround (1..10)');
        return;
      }

      const startedAt = Date.now();
      const analytics = await store.getOptionAnalytics(cfg.symbol, {
        expiryDate: expiry,
        minutes: Math.floor(minutes),
        strikesAround: Math.floor(strikesAround),
      });

      if (!analytics) {
        sendJson(res, 200, { ok: false, error: 'No option analytics snapshot available', watcherState: state });
        return;
      }

      const windowMinutes = 5;
      const latestMs = Date.parse(analytics.snapshot.capturedAt);
      const compareMinuteBuckets = Array.from(new Set([compareMinutes, 20, 30, 40, 50, 60]))
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right);
      const compareCandidates = await Promise.all(
        compareMinuteBuckets.map(async (requestedMinutes) => {
          const targetTime = new Date(latestMs - requestedMinutes * 60_000);
          const prev = await store.getSnapshotWithLegsNearTime(cfg.symbol, targetTime, windowMinutes, analytics.snapshot.expiryDate);
          if (!prev) return null;
          return {
            ok: true as const,
            requestedMinutes,
            windowMinutes,
            actualAgoMinutes: (latestMs - Date.parse(prev.snapshot.capturedAt)) / 60_000,
            snapshot: prev.snapshot,
            legs: prev.legs,
          };
        }),
      );
      const seenCompareSnapshots = new Set<string>();
      const compareSeries = compareCandidates
        .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
        .filter((candidate) => {
          const key = candidate.snapshot.capturedAt;
          if (seenCompareSnapshots.has(key)) return false;
          seenCompareSnapshots.add(key);
          return true;
        });
      const prev = compareSeries.find((candidate) => candidate.requestedMinutes === compareMinutes) ?? null;
      const compare = !prev
        ? {
            ok: false as const,
            requestedMinutes: compareMinutes,
            windowMinutes,
            error: 'No snapshot found near target time',
          }
        : {
            ok: true as const,
            requestedMinutes: compareMinutes,
            windowMinutes,
            actualAgoMinutes: (latestMs - Date.parse(prev.snapshot.capturedAt)) / 60_000,
            snapshot: prev.snapshot,
            legs: prev.legs,
          };

      logger.info('Option analytics served', {
        tradeDate: analytics.tradeDate,
        selectedExpiry: analytics.expiryContext.selectedExpiry,
        currentSpot: analytics.expiryContext.currentSpot,
        currentAtmStrike: analytics.expiryContext.currentAtmStrike,
        strikeWindow: analytics.strikeWindow.strikes.join(','),
        strikeWindowSize: analytics.strikeWindow.strikes.length,
        missingCeSeriesCount: analytics.diagnostics.missingCeSeriesCount,
        missingPeSeriesCount: analytics.diagnostics.missingPeSeriesCount,
        normalizationFallbackCount: analytics.diagnostics.normalizationFallbackCount,
        crossoverCount: analytics.diagnostics.crossoverCount,
        freshnessMinutes: analytics.diagnostics.freshnessMinutes,
        cacheMode: analytics.diagnostics.cacheMode,
        queryMode: analytics.diagnostics.queryMode,
        durationMs: Date.now() - startedAt,
      });

      sendJson(res, 200, {
        ok: true,
        analytics,
        compare,
        compareSeries,
        watcherState: state,
        capabilities: { screenshotEnabled: cfg.screenshotEnabled },
      });
      return;
    }

    if (url.pathname === '/api/screenshot') {
      try {
        const png = await getScreenshotPng();
        res.writeHead(200, {
          'content-type': 'image/png',
          'cache-control': 'no-store',
        });
        res.end(png);
      } catch (e) {
        sendJson(res, 503, { ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  server.listen(cfg.healthPort, () => {
    logger.info('Health server listening', { port: cfg.healthPort });
  });

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.warn('Stopping', { signal });
    server.close(() => undefined);
    await nse.dispose().catch(e => logger.warn('Failed to dispose NSE client', {}, e));
    await pool.end().catch(e => logger.warn('Failed to close DB pool', {}, e));
  };

  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));

  async function maybeCleanup(): Promise<void> {
    if (!cfg.cleanupEnabled) return;

    const nowIst = DateTime.now().setZone('Asia/Kolkata');
    if (!inCleanupWindowIst(nowIst, cfg.cleanupWindowStartHourIst, cfg.cleanupWindowEndHourIst)) return;

    const last = await store.getLastCleanupAt();
    const lastDt = last ? DateTime.fromJSDate(last).setZone('Asia/Kolkata') : null;
    const cutoffIst = latestTuesdayStartIst(nowIst);
    const due = !lastDt || lastDt < cutoffIst;
    if (!due) return;

    logger.warn('Cleanup due; pruning option chain history before latest Tuesday', {
      lastCleanupAt: lastDt ? lastDt.toISO() : null,
      nowIst: nowIst.toISO(),
      cutoffIst: cutoffIst.toISO(),
    });
    const deletedSnapshots = await store.cleanupBefore(cutoffIst.toUTC().toJSDate());
    logger.warn('Cleanup completed', { deletedSnapshots });
  }

  let nextTick = Date.now();
  while (!stopping) {
    nextTick = Math.max(nextTick + cfg.pollEveryMs, Date.now());

    if (cfg.pollJitterMsMax > 0) {
      const jitter = Math.floor(Math.random() * cfg.pollJitterMsMax);
      nextTick += jitter;
    }

    try {
      const tickAt = new Date();
      const exchangeSession = await store.getExchangeSession(tickAt);
      const suppressionReason = sessionSuppressionReason(exchangeSession, tickAt);
      if (suppressionReason) {
        const previousReason = state.suppressionReason;
        state.sessionState = 'SUPPRESSED';
        state.suppressionReason = suppressionReason;
        state.lastSuppressedAt = tickAt.toISOString();
        state.outOfSessionPollsSuppressed += 1;
        state.lastError = null;
        if (previousReason !== suppressionReason || state.outOfSessionPollsSuppressed % 30 === 1) {
          logger.info('NSE option-chain poll suppressed outside exchange session', {
            symbol: cfg.symbol,
            reason: suppressionReason,
            tradeDate: exchangeSession?.tradeDate ?? null,
            marketOpenAt: exchangeSession?.marketOpenAt?.toISOString() ?? null,
            marketCloseAt: exchangeSession?.marketCloseAt?.toISOString() ?? null,
            suppressedCount: state.outOfSessionPollsSuppressed,
          });
        }
        await maybeCleanup();
        const delay = Math.max(0, nextTick - Date.now());
        await sleep(delay);
        continue;
      }

      if (state.sessionState !== 'OPEN') {
        logger.info('NSE option-chain polling enabled for exchange session', {
          symbol: cfg.symbol,
          tradeDate: exchangeSession?.tradeDate ?? null,
          marketOpenAt: exchangeSession?.marketOpenAt?.toISOString() ?? null,
          marketCloseAt: exchangeSession?.marketCloseAt?.toISOString() ?? null,
        });
      }
      state.sessionState = 'OPEN';
      state.suppressionReason = null;
      state.lastPollAt = tickAt.toISOString();
      logger.info('Polling NSE option chain', { symbol: cfg.symbol });

      const expiryRoles = pickExpiryRoles(await nse.fetchExpiryDates(cfg.symbol));
      const expiryTargets = [...new Map([
        ['W0', expiryRoles.W0],
        ['M0', expiryRoles.M0],
      ].map(([role, expiry]) => [expiry, { role, expiry }])).values()];

      for (const target of expiryTargets) {
        const { json, fetchMs, status, expiryRaw } = await nse.fetchOptionChainV3(cfg.symbol, 'Indices', target.expiry);
        const snapshot = selectAtmPlusMinus(json, {
          symbol: cfg.symbol,
          expiryRaw,
          strikesAround: cfg.strikesAround,
          keepRaw: cfg.keepRaw,
          riskFreeRate: cfg.riskFreeRate,
          dividendYield: cfg.dividendYield,
        });

        const previous = await store.getLatestSnapshotWithLegs(cfg.symbol, snapshot.expiryDate);
        const unchanged = previous != null
          && marketSnapshotFingerprint({ ...previous.snapshot, legs: previous.legs }) === marketSnapshotFingerprint(snapshot);
        if (unchanged) {
          state.lastSuppressedAt = new Date().toISOString();
          state.unchangedSnapshotsSuppressed += 1;
          if (state.unchangedSnapshotsSuppressed % 30 === 1) {
            logger.info('Unchanged option-chain persistence suppressed', {
              symbol: cfg.symbol,
              expiryRole: target.role,
              expiry: snapshot.expiryDate,
              suppressedCount: state.unchangedSnapshotsSuppressed,
            });
          }
        } else {
          await store.insertSnapshot(snapshot, fetchMs);
          state.lastStoredAt = new Date().toISOString();
          logger.info('Snapshot stored', {
            status,
            fetchMs,
            expiryRole: target.role,
            alsoNearestWeekly: expiryRoles.alsoNearestWeekly,
            expiry: snapshot.expiryDate,
            underlying: snapshot.underlyingValue,
            atm: snapshot.atmStrike,
            legs: snapshot.legs.length,
          });
        }
      }

      state.lastPollOkAt = new Date().toISOString();
      state.lastError = null;

      await maybeCleanup();
    } catch (e) {
      state.lastError = { time: new Date().toISOString(), message: e instanceof Error ? e.message : String(e) };
      logger.error('Poll failed', { symbol: cfg.symbol }, e);
    }

    const delay = Math.max(0, nextTick - Date.now());
    await sleep(delay);
  }
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
