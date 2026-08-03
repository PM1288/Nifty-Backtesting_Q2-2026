Yes — you can build the same style of interactive sector → stock treemap in Grafana, with tile size = index weight and tile color = performance (red↔green scale).

Your screenshots match what Nifty Indices calls “Sectoral Distribution” with drilldown into stocks (their UI even says “Double Click on sectors to see the stocks and Press Esc Key for Back”).
Their factsheet also publishes the sector weights (e.g., Financial Services 33.88%) which aligns with your image.

Below are the best Grafana-native ways to implement this.

1) Best options in Grafana
Option A (recommended to start): Grafana Treemap panel plugin

Grafana has a dedicated Treemap panel plugin that supports:

Label by, Size by, Color by, and Group by

Tooltips with “Additional labels”

Creating hierarchy via a Separator field option

This is the fastest way to get what you want.

Why it fits your requirement

Size tiles by index weight

Color tiles by return %

Group tiles by sector

Add drilldown via Grafana Data Links (click tile → go to sector dashboard or symbol dashboard)

Plugin reference: “Treemap plugin for Grafana” (maintained by Grafana Labs).

Option B (closest to NiftyIndices interaction): Business Charts (Apache ECharts) panel

If you want true drilldown behavior (click/zoom into sector and back like FoamTree), use the Business Charts plugin (Apache ECharts inside Grafana).

Why it fits

ECharts has a treemap chart type with drilldown/zoom

You can fully control:

diverging red↔green color scale

tooltips

breadcrumb path (Sector → Stock)

click actions (open drilldown dashboards via URL)

Business Charts plugin reference.

2) Data you must have (minimal, clean, “Grafana-friendly”)

To build a treemap like NiftyIndices, you need two categories of data:

A) Static / slowly changing metadata (index composition)

Table: index_constituents

index_name (e.g., NIFTY100)

symbol (INFY)

token (SmartAPI token)

weight (index weight; float)

macro_sector / sector / industry / basic_industry (for your dropdown taxonomy)

as_of_date

NiftyIndices provides “Downloads” including “Factsheet” and “Index Constituent” on the Nifty 100 page.
(Programmatic downloading may need headers/cookies; operationally you can also keep a checked-in CSV you refresh at rebalance.)

B) Live / frequently changing metrics (performance)

You want color = performance, so you need per-symbol returns such as:

Intraday %: (last - open) / open * 100

1D %: (last - prev_close) / prev_close * 100

1W %: (last - close_5d_ago) / close_5d_ago * 100

Best practice for Grafana performance
Instead of forcing Grafana to compute “latest price per symbol” from raw 1m bars every refresh, create a tiny “latest snapshot” table refreshed every minute.

Table: symbol_perf_snapshot (updated every 30–60 seconds)

ts (snapshot timestamp)

symbol

last_price

pct_intraday

pct_1d

pct_1w

volume_today

quality_flags (stale tick, gap, etc.)

Then the treemap query becomes a very fast join.

## Repo implementation notes
- Constituents source: `docs/source/ind_nifty100list.csv` (Company Name, Industry, Symbol, Series, ISIN).
- Index weights are not present in the CSV; `weight` is stored as NULL and dashboards use `COALESCE(weight, 1)` for uniform sizing until weights are supplied.

3) Postgres view/query for the Treemap panel (Option A)
Dashboard variables (recommended)

$taxonomy = Macro / Sector / Industry / BasicIndustry

$perf_mode = intraday / 1d / 1w

$sector = All or one sector

$color_max = 1,2,3,5 (controls red/green saturation)

A single Grafana query (fast)

Example query shape (you’ll adapt column names):

SELECT
  CASE
    WHEN '$taxonomy' = 'Macro' THEN c.macro_sector
    WHEN '$taxonomy' = 'Sector' THEN c.sector
    WHEN '$taxonomy' = 'Industry' THEN c.industry
    ELSE c.basic_industry
  END AS group_name,

  c.symbol AS label,

  c.weight AS size_value,

  CASE
    WHEN '$perf_mode' = 'intraday' THEN s.pct_intraday
    WHEN '$perf_mode' = '1d' THEN s.pct_1d
    ELSE s.pct_1w
  END AS color_value,

  s.last_price,
  s.volume_today,
  c.weight,
  s.ts AS snapshot_ts
FROM index_constituents c
JOIN symbol_perf_snapshot s
  ON s.symbol = c.symbol
WHERE c.index_name = 'NIFTY100'
  AND (
    '$sector' = 'All'
    OR (
      CASE
        WHEN '$taxonomy' = 'Macro' THEN c.macro_sector
        WHEN '$taxonomy' = 'Sector' THEN c.sector
        WHEN '$taxonomy' = 'Industry' THEN c.industry
        ELSE c.basic_industry
      END
    ) = '$sector'
  );


Why this query is “treemap-ready”

group_name → sector grouping

label → stock tile label

size_value → rectangle size = index weight

color_value → rectangle color = performance

4) Treemap panel configuration (Option A)

In the Treemap panel, set dimensions like the plugin describes:

Dimensions

Label by → label

Group by → group_name (creates sector grouping)

Size by → size_value (index weight)

Color by → color_value (return %)

Additional labels (tooltip) → last_price, weight, volume_today, snapshot_ts

Color (the key part you asked)

Set a diverging color scheme: Red for negative, Green for positive

Set Min/Max extents so colors are stable and not “random”

Example: min = -$color_max, max = $color_max

Result: you visually see “how green” or “how red” each sector/stock is.

Interactivity / drilldown

Use Data Links on the label field:

Click a stock tile → open your Symbol Drilldown dashboard

Click a sector label (if supported in your setup) → open same dashboard with var-sector=Financial Services

The Treemap plugin supports tooltip labels and data-link style workflows in Grafana.

5) Getting the “double click to drilldown” feel (Option B, ECharts)

If you want the NiftyIndices-style drill experience (zoom into a sector), the ECharts-based panel is more flexible. Business Charts integrates Apache ECharts for dynamic interactive visualizations.

How you’d structure the data for ECharts treemap
You feed a 2-level hierarchy:

Level 1 node: sector (value = sum of weights)

Level 2 nodes: stocks (value = weight, color metric = return)

Color scale
Use a continuous diverging scale with center at 0:

negative → red

0 → neutral

positive → green

Interaction

click sector → zoom into node

click breadcrumb / background → go up

This is the closest match to what you showed.

6) Docker Compose: install plugins in Grafana container

Since you are self-hosting via Docker Compose, you can install plugins at startup.

Example (add to grafana service):

environment:
  - GF_PLUGINS_PREINSTALL_SYNC=marcusolsson-treemap-panel,volkovlabs-echarts-panel


marcusolsson-treemap-panel = Treemap panel plugin

volkovlabs-echarts-panel = Business Charts / Apache ECharts panel

7) UX recommendations so it’s actually usable for trading
A) Default view (All sectors)

Treemap shows entire NIFTY100

Size = weight

Color = 1D % (default)

Tooltip shows intraday % + volume anomaly + last update timestamp

B) Drilldown view (Single sector)

Clicking a sector takes you to a dashboard filtered to that sector

Same treemap panel, but now every tile is a stock

Add a second panel: “Top gainers/losers table” for that sector

C) Timeframe toggle

Use $perf_mode variable:

intraday / 1D / 1W
The exact same treemap becomes:

“intraday heatmap” or “swing heatmap” instantly

8) Important note about “random colors”

“Random colors” usually happen when:

you color by a non-numeric category (Grafana assigns categorical colors), OR

you don’t fix min/max so the scale shifts every refresh.

Your solution is:

Color by numeric return field (color_value)

Use diverging palette

Use fixed min/max (or controlled via $color_max)

If you want, I can provide two concrete deliverables next (copy/paste ready):

The exact Postgres schema + materialized view refresh logic for symbol_perf_snapshot and index_constituents, and

A ready-to-paste Grafana panel JSON for the Treemap plugin (so you can import it directly).
