# UXs3 implementation plan — 10 August 2026

## Scope and protected boundary

This plan translates both research reports in `/home/novius2/NIFTY50/UXs3/` into the existing NIFTY 50 Trader application.

The home page is a protected boundary for this change:

- do not edit `LandingPage.tsx` or `LandingPage.module.css`;
- do not replace, reorder, or remove its live widgets;
- do not change its data contracts;
- global shell work must leave the home route's geometry unchanged when the new controls are closed.

The work deliberately reuses the current React/Vite application, authenticated API, PostgreSQL-backed views, strategy-lab worker, paper-trading service, Nginx routing, and light design tokens. It does not create disconnected mock trading screens or introduce broker authority.

## Evidence reviewed

- `UXs3/deep-research-report(1).md` — complete, 1,483 lines.
- `UXs3/deep-research-report(2).md` — complete, 836 lines.
- Current application route map and lazy-loading boundaries.
- Current application shell, authentication gate, sidebar, ticker, data-age and feed-state controls.
- Current backtesting lab API, run state, worker result contract, consolidated trade data, ladder data, equity data, artefact download, and cancellation path.
- Current PostgreSQL-backed Paper Trading, NIFTY 500, Futures, and Control Plane workspaces.
- Current light-theme compatibility layer and responsive behaviour.
- Existing Playwright route matrix across mobile, tablet, desktop, and wide layouts.

## Product interpretation

The two reports consistently describe one product journey:

`Explore -> Research -> Backtest -> Compare -> Paper -> Live`

The practical implementation rule is that each stage must expose its current identity, evidence, freshness, and next safe action. A page must not imply capabilities that the backend does not have. Specifically:

- a diagnostic target is not an execution exit;
- a queued request is not an open trade;
- a stale configuration is not represented by a previously completed result;
- a delayed or failed feed is not labelled live;
- an unconstrained opportunity result is not labelled a portfolio return;
- score/status colour is always accompanied by text;
- immutable run inputs remain inspectable after completion.

## Existing strengths to retain

| Area | Existing evidence | Decision |
|---|---|---|
| Home | Dynamic live landing dashboard | Protect unchanged |
| Authentication | Local administrator plus Firebase session gate | Retain |
| Shell | Light theme, ticker, PAPER badge, data age, feed freshness | Retain and extend without changing closed-state home geometry |
| Navigation | Keyboard-focusable links and hover-expanded desktop rail | Retain |
| Strategy lab | Governed parameters, source batch, bounded date range, idempotent run creation, cancellation | Retain |
| Evaluation | Independent ladders, H30 path, actual execution P&L and consolidated CSV | Retain semantics |
| Data | PostgreSQL source batch and immutable run/result hashes | Surface more clearly |
| Paper trading | PostgreSQL-backed trade groups, positions, P&L and webhook state | Retain and improve presentation |
| Accessibility | Visible focus, reduced-motion support, mobile touch target rules | Retain and extend |

## Gaps found

1. The strategy lab mixes configuration, run history, result summary, chart, ladders, and trade evidence into one long page.
2. Editing a material input after selecting a completed run does not mark that displayed result stale.
3. Run identity is visible, but input provenance, validation, engine version, evaluation policy, source batch, result hash, and events are not presented as one inspectable evidence record.
4. Backtest results do not have a compact view switch for Overview, Ladders, Trades, and Inputs/Audit.
5. Research-to-paper stages exist as routes but are not represented as a coherent stage rail.
6. Global navigation has no keyboard command palette or route/symbol search.
7. Paper trading shows aggregate counts but lacks explicit PAPER identity, open-state/risk context, delivery health state, and clearer execution-versus-analytics wording.
8. NIFTY 500 and Futures pages expose raw values but do not consistently show source freshness and plain-language field labels.
9. Existing route regression tests check light scope and overflow but not the new workflow controls, accessibility roles, or protected-home visual geometry.

## Implementation batches

### Batch A — reusable workstation controls

Create light-only, accessible components for:

- a `Ctrl/Cmd + K` command palette with route and symbol actions;
- a compact stage rail for `Research`, `Backtest`, `Compare`, `Paper`, and `Live`;
- a provenance grid for immutable identity and data-quality fields;
- tabbed result navigation with keyboard-accessible native buttons;
- explicit data-state and operational-state badges using text plus colour.

The command palette launcher will appear only away from `/`; its closed state must not change the home layout.

### Batch B — strategy testing workspace

Upgrade `/backtesting/lab` to:

- retain the governed Define / Scope / Verify controls;
- display the workflow stage rail;
- compute a canonical draft fingerprint from all material inputs;
- show `CURRENT`, `STALE`, or `NO RESULT` next to the selected result;
- keep results behind `Overview`, `Ladders`, `Trades`, and `Inputs & audit` tabs;
- put actual execution economics only in Overview;
- keep every diagnostic ladder level independent;
- expose run inputs, engine/evaluation versions, source batch, validation state, hashes, and event history;
- retain the consolidated CSV download;
- preserve responsive/mobile access without horizontal document overflow.

### Batch C — operational workspaces

Upgrade dynamic workspace pages without inventing data:

- Paper Trading: explicit PAPER badge; execution summary; active/closed state mix; P&L; webhook health; recent trade groups; source time.
- NIFTY 500: participation summary; breadth balance; regime; session/source time; accessible table labels.
- Futures: source time; participant/instrument coverage; long/short positioning table with readable labels.
- Control Plane: retain administrator-only access and surface database check time.

### Batch D — verification

- Type-check and production-build the web application.
- Run API tests affected by presentation contracts.
- Extend Playwright to verify:
  - the home route retains its protected landmark/widget signature;
  - the command palette opens and closes by keyboard;
  - the strategy lab exposes the stage rail and result tabs;
  - routes remain light-themed at mobile/tablet/desktop/wide widths;
  - no document-level horizontal overflow;
  - no unhandled console errors.
- Deploy the dashboard through the existing `trading-stack-novius2` Compose project.
- Verify authenticated routed pages through Nginx.

## Requirement disposition

| UXs3 requirement | This delivery | Reason / evidence boundary |
|---|---|---|
| Continuous research-to-production journey | Implemented as stage rail and linked routes | Existing routes and services support these stages |
| Visible PAPER/LIVE state | Strengthened | Existing system is paper-only and must not imply live authority |
| Backtest assumptions and provenance | Implemented | Existing run contract already persists the required fields |
| Linked/segmented result inspection | Implemented | Uses existing equity, ladder, trade, and run-event APIs |
| Configuration/result staleness | Implemented client-side from persisted run inputs | No schema change needed |
| Keyboard command palette | Implemented | Route/symbol navigation only; no financial command execution |
| Dense, accessible tables | Strengthened | Existing data tables retained; labels and scrolling improved |
| Data freshness and quality states | Strengthened | Existing `asOf`, feed state, validation state, and timestamps used |
| Stock Health with factor provenance | Existing OIIS/stock detail retained | No new opaque composite score introduced |
| Paper portfolio monitoring | Strengthened | Existing paper-trading PostgreSQL view used |
| Live order ticket / DOM / one-click trading | Not implemented | No live broker authority; fake controls would be unsafe |
| Jupyter notebook execution | Not implemented | No governed Jupyter runtime exists in the accepted stack |
| LEAN/Backtrader adapters | Not implemented in UI batch | Existing strategy-lab engine remains authoritative |
| Multi-monitor detachable panels | Deferred | Requires desktop/window runtime and persisted layout service |
| WebSocket market terminal | Existing live header/ticker retained | Broader terminal transport is a separate backend milestone |
| Mobile full terminal | Not attempted | Reports recommend mobile monitoring, not compressed terminal density |

## Acceptance criteria

1. `LandingPage.tsx` and `LandingPage.module.css` have no diff.
2. Home landmark/widget counts and page width match the recorded baseline.
3. The strategy lab still queues the same API request and does not change strategy semantics.
4. Editing any material input marks the selected result stale until a matching run is selected or created.
5. Completed results expose Overview, Ladders, Trades, and Inputs & audit without forcing a full-page scroll through every dataset.
6. Run provenance shows strategy version, source batch, date coverage, universe, capital mode, engine/evaluation version, validation state, and result hash when present.
7. Diagnostic ladders remain independent and are never summed as portfolio profit.
8. All new controls are keyboard reachable with visible focus.
9. The command palette closes with Escape, preserves focus semantics, and does not submit orders.
10. All tested routes use light surfaces and have no document-level horizontal overflow at 430, 1024, 1440, and 1920 pixels.
11. The production build passes and the deployed dashboard becomes healthy.
12. `AGENT_HANDOFF.md` records files, commands, tests, deployment, limitations, and rollback guidance.

## Explicit non-goals

- no home-page redesign;
- no change to OIIS or other strategy formulas;
- no change to authoritative exit logic;
- no database deletion or destructive migration;
- no live-order capability;
- no mock data presented as live;
- no new service or infrastructure solely to match a research diagram.
