# Six-workspace UI consolidation

**Implemented:** 11 August 2026
**Runtime:** `/home/novius2/trading-stack`
**Versioned source:** `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`

## Inputs used

This change combines the 42-screen usability review with
`/home/novius2/NIFTY50/ui-2/AGENT_REEVALUATION_AND_DASHBOARD_GUIDE.md` and its
dashboard reference. The implementation preserves existing deep links while
removing them from equal prominence in the primary navigation.

The live OIIS engine remains an **all active F&O** evaluation because that is
the currently approved operational universe. NIFTY 50 membership is retained
as an explicit row attribute and the `NIFTY 50 ∩ F&O` count remains visible in
diagnostics. No symbol-specific selection override was introduced.

## Primary information architecture

| Workspace | Main question | Consolidated content |
| --- | --- | --- |
| Today | What needs attention now? | Index state, participation, movers, current decisions and alerts |
| Markets | What is the regime and where is leadership? | Overview, regime, leadership, risk, heatmaps and breadth |
| Stocks | Is this stock actionable and why? | Stock 360, indicators and events |
| OIIS Lab | Is there a credible, executable edge? | OIIS selection, builder, results, comparison and diagnostics |
| Trading | What paper positions and derivative risks are active? | Paper portfolio, options and futures |
| Data & Operations | Can the data and platform be trusted? | Quality, run monitor, reports and administration |

Legacy URLs continue to resolve. The primary sidebar contains exactly the six
workspaces above. Contextual tabs expose only the sections relevant to the
current workspace.

## Shell rules

- The market ticker appears only on Today, Markets and Trading.
- Strategy, research and operations pages receive a compact workspace context
  strip instead of another dashboard header.
- The global freshness label is `Market transport connected`; it no longer
  implies that every analytical module is current.
- Administration uses a separate `NIFTY 50 ADMIN` shell without trader sidebar
  navigation or the market ticker.
- The sidebar remains hover-expandable on desktop, collapses immediately after
  a route is selected, and reopens on the next deliberate hover. It remains a
  conventional overlay on small screens.

## OIIS integration from `ui-2`

OIIS now exposes five distinct views:

1. **Overview** — decision, blocker, near opportunities and the gate funnel.
2. **Opportunity leaderboard** — directional evidence ranking. It explicitly
   states that rank is not trade permission.
3. **Execution queue** — setup and hard-gate readiness. Only `ENTRY ENABLED`
   rows are paper-entry candidates.
4. **Diagnostics** — run time, all-F&O count, NIFTY-50 intersection, data
   permission and rejection-rule evidence.
5. **All F&O evidence** — the complete per-symbol evidence table.

Opportunity and execution ranks remain independent. Missing inputs are not
presented as zero; diagnostic copy records the invariants that a triggered
setup cannot simultaneously be `NO_VALID_SETUP` and that production logic may
not contain stock-specific exceptions.

The opportunity and all-F&O tables now sequence rows by the descending sum of
`OFactor + XFactor + Data Quality`. Direction is encoded textually and with
colour (`LONG` green, `SHORT` red). Row evidence bands use the requested strict
thresholds: green when both O and X are above 70, yellow above 50, orange above
40, and neutral gray otherwise. These colours describe evidence strength only;
they do not override execution gates.

Every symbol links to Stock 360. The stock view now joins the latest immutable
OIIS candidate with the stored market and SmartAPI evidence and displays:

- all persisted gates, actual values, rules and failure reasons;
- VWAP, volume ratios, 90-session volume percentile, ATR/MoveATR, range,
  liquidity, pivots, reward:risk and indicator evidence;
- a one-year daily candlestick chart with Bollinger bands, classic pivots,
  volume and RSI;
- archived option bid/ask, spread, depth imbalance, volume, OI, IV and Greeks
  from `public.smartapi_option_chain_snapshots`.

Unavailable inputs remain explicitly unavailable rather than being replaced by
zero or synthetic values.

## P0 presentation corrections

- Negative-return strategies are no longer presented as winners or leaders.
- Comparison pages report `No strategy passed` when no positive result clears
  the acceptance gate.
- Win rate is labelled `Closed-trade win rate`.
- Historical entry/exit sections use `through <as-of date>` instead of `Today`.
- The former `NIFTY 500` raw-history page is labelled `Market breadth history`
  and discloses that the source may exceed current NIFTY 500 membership.
- Missing RSI, Williams %R and change-heatmap cells are neutral gray rather
  than positive green.
- Static Home navigation prompts and duplicated supporting boards are hidden;
  the dynamic sector heatmap remains on Home and the first viewport prioritises
  current market information.

## Verification evidence

| Check | Result | Evidence |
| --- | --- | --- |
| API and web TypeScript production build | Pass | Docker multi-stage build, 2,452 Vite modules transformed |
| Six-workspace/OIIS browser regression | 30/30 pass | `output/playwright/oiis-ranking-stock-detail-2026-08-11-stable/results.json` |
| Broader responsive regression | 26/26 pass | `output/playwright/oiis-sidebar-broad-2026-08-11/results.json` |
| Nginx configuration | Pass | `nginx -t` in the running proxy |
| Ingress health | Pass | `GET http://127.0.0.1:19090/n50/health` |
| Runtime deployment | Pass | Compose project `trading-stack-novius2`, dashboard healthy |

Screenshots from the focused regression are stored beside its result file.

## Runtime connection-capacity correction

The production stack exceeded the former PostgreSQL limit of 50 connections
after the additional evidence collectors were enabled. This caused transient
500 responses and an option-chain worker restart loop. The verified existing
volume `trading-stack-novius2_pgdata` was retained unchanged. PostgreSQL now
uses `max_connections=80` and a 2 GiB container memory limit; the two dashboard
Prisma pools use four connections each. After the controlled recreation of only
the affected services, PostgreSQL reported 35 active connections, the dashboard
and option-chain watcher were healthy, and the stable browser regression
completed without console or network errors. No volume was removed, replaced or
reinitialised.

## Deliberate limitations

- Deep-link routes were retained for compatibility and specialist use. This
  release consolidates navigation and the main decision journeys; it does not
  delete historical routes or data.
- Several legacy specialist pages still retain their internal visual structure.
  They are no longer presented as equal primary destinations and should be
  simplified incrementally using the density rules in the approved review.
- The dependency audit emitted 13 existing findings (8 moderate, 3 high and 2
  critical). They require a separately controlled dependency upgrade rather
  than an untested automatic upgrade during the UI consolidation.
