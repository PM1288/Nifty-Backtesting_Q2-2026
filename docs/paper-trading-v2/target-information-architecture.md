# Paper Trading Evidence Workbench V2 — implemented information architecture

## Persistent layers

1. Existing authenticated global application shell.
2. Paper Trading workspace header with the PAPER/HYPOTHETICAL safety boundary, population, open positions, active analytical tracks, incidents, canonical timestamp and policy version.
3. Existing Portfolio/What Good Looks Like view choice.
4. Sticky workbench navigation.
5. Sticky URL-backed Analysis Context Bar.
6. Selected-trade inspector or calculation-trace drawer.

## Workbench sections

| URL section | Purpose | Preserved surfaces |
|---|---|---|
| `overview` | Immediate orientation and accounting reconciliation lanes | maturity, booked/open/observed KPIs, data status |
| `trade-evidence` | Authoritative detailed ledger | all table fields, totals, filters, comments and row actions |
| `path-through-time` | Temporal event/path inspection | year, week, intraday heatmaps |
| `reward-pain` | MFE/MAE and conversion | 5D/30D atlas, conversion, attention |
| `factor-analysis` | Entry-factor/outcome relationships | all factor-pair and outcome controls |
| `capital-recycling` | Fixed-capital portfolio models | first-governed and swing-only ledgers/Gantts |
| `scenario-analysis` | Counterfactual target exits | low/medium/high scenarios |
| `methodology-audit` | Trust, definitions and related evidence | monitor, sources, limitations, versions, Data Quality and audit links |

## Accounting taxonomy

- `BOOKED`: governed realised execution economics.
- `OPEN ACTUAL`: current execution mark on remaining quantity.
- `OBSERVED`: path evidence such as targets, MFE and MAE.
- `HYPOTHETICAL`: D0 EOD, never-closed and stop paths.
- `SIMULATED`: fixed-capital and capital-recycling models.
- `DATA QUALITY`: freshness, maturity, eligibility, incidents and calculation coverage.

No bridge or export is permitted to add unlike classes into one claimed account total.

## Context/deep-link contract

The route supports `section`, `period`, `strategy`, `status`, `direction`, `horizon`, `accounting`, `capital`, `basis` and the existing `tradeId`, `action`, `symbol`, `source`, `tab` and methodology parameters. Default values are omitted so old bookmarks remain concise.
