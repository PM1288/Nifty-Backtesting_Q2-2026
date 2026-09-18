# OIIS verified evidence and capital replay — 18 September 2026

## Scope and models

Additive Paper Trading tab `/paper-trading?tab=verified`, **Verified replay · ₹4 lakh**.
Authenticated read-only GET `/v1/workspace/paper-trading/research` runs only on
explicit Run. Existing portfolio/simple/tracked/workbench, canonical inspector,
alerts, strategies and actual ledger remain unchanged. No orders, collectors,
threshold changes, invented recorded exits or historical-row rewrites.

- S0–S4/S0–S29 verification requires every expected retained minute and final
  closing bar. Missing coverage is CENSORED; corrupt bars/incompatible entry
  evidence are DATA_INVALID. Raw legacy results stay separate. Partial MFE/MAE
  measures retained observations only, not complete maximum opportunities.
- Normal NSE cash minute-start bars 09:15–15:29 IST become available at minute
  end. Entry-day coverage starts at the next whole minute. S0 includes entry day.
  Calendar supports 2026 normal sessions only, based on
  [NSE holiday circular](https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf).
  Special sessions/later years are unsupported, never guessed.
- Independent ₹100,000/₹200,000 allocations from ₹400,000 starting capital.
  Actual closing fills release proportional capital before simultaneous entries;
  target touches/marks never force release. Entry shares are whole; scaled partial
  exits can be fractional. No timeout, stop or invented exit.
- Both sides reserve full entry notional. Cash-short borrow/delivery is unverified.
  Session-last valid marks are not executable quotes. Unmarked positions retain
  entry value explicitly. Drawdown is sampled, not maximum intraday drawdown.
- Cohorts: all OIIS; month-specific qualified monthly-symbol retrospective
  intersection; qualification created AND last updated before entry. The last
  proves only stored-before-entry, not full point-in-time source availability.
  SELL symbol membership does not certify bearish monthly direction. Monthly
  exclusion reasons/conditions remain available.
- Independent intraday 0.3/0.4/0.5/1% and swing 1/2/3% target windows; swing
  excludes S0. HIT is a retained touch, not execution; MISS requires complete
  coverage. Missing earlier bars can hide earlier touches. Stored target
  disagreement, orders/fills and capital-lock reasons remain inspectable.
- Shadow alternatives assume a full target-price fill at first retained touch-
  bar end and omit recorded exits. Alternatives must never be summed; not a
  production exit rule, executable backtest or profitability claim.
- Optional fee/slippage stress 0/5/10/20 bps per fill and one-active-issuer
  challenger. Estimated friction is not actual broker charges. Corporate actions,
  borrowing, liquidity, discrete exits and tax reconciliation remain unverified.
  Exports retain current sector metadata, not historical sector attribution.

## Source limitations found

Read-only consolidation returned 863 daily rows, earliest minute session
1 September 2026. August minute coverage is absent. Those trades and incomplete
September windows cannot be certified as complete 5-/30-session outcomes.
Monthly records revised after entry fail the stored-before-entry check.
No missing history was fabricated or ledger rewritten.

Initial correlated target SQL exceeded 60 seconds. Materialised/preaggregated
hits reduced the diagnostic query to 14.586 seconds. Endpoint query/transaction
caps are 45/50 seconds; single-flight, 60-second completed-result cache;
different concurrent replay context returns 429. Pointer/view selection does
not trigger a research request; ordinary paper refresh remains independent.
Current marks, legacy horizons and order statuses are labelled raw/current,
never used to control an earlier as-of replay.

## Files and exports

API: `lib/paperVerifiedReplay.ts` and tests; `routes/paperVerifiedResearch.ts`
and tests; additive registration in `routes/workspace.ts`.
Web: `pages/PaperVerifiedResearch.tsx`, local CSS;
`lib/paperResearchExport.ts`, export tests; additive tab in
`pages/PaperTradingCommandCenter.tsx`.
Browser: `tools/playwright/paper-verified-replay.mjs`.

Full JSON, horizons/positions/equity/source CSV, twelve-sheet styled/frozen Excel-
compatible SpreadsheetML `.xml` workbook (not falsely labelled `.xlsx`), and
Markdown with cohort/capital summaries, parameters, limitations and exclusions.
Nested source evidence survives JSON/source CSV/workbook; formula-like CSV text
is escaped while numerical signs stay numeric. Runtime exports/screenshots are
ignored under `output/playwright/paper-verified-replay/`.

## Checks, rerun and release

Pre-release web typecheck/build and 195 tests PASS; API typecheck/build and 225
tests PASS; canonical gate PASS. Tests cover holidays, coverage, invalid OHLC,
cutoff leakage, recorded-fill release, partial/simultaneous fills, fees, shorts,
late/revised monthly evidence, independent targets and export signs/escaping.

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npm run typecheck && npm test && npm run build
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npm run typecheck && npm test && npm run build
cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
# Inject PLAYWRIGHT_ADMIN_PASSWORD from the protected environment, never literal.
node tools/playwright/paper-verified-replay.mjs
# Optional PLAYWRIGHT_MODULE/PLAYWRIGHT_EXECUTABLE_PATH support installed runners.
```

Deploy pushed master only using `bash scripts/deploy_n50_dashboard.sh`; only
combined dashboard web/API container changes. Keep prior image for scoped
rollback; no database migration/rollback. Deployment/browser results follow
after execution. Full outcome validation is BLOCKED by historical coverage and
fillability evidence. No claim that all older project requests are complete.
