# Scalper V2 Strike Structure chart — calculation and rendering guide

**Document date:** 21 September 2026  
**Applies to:** Trading Analytics → Scalper V2 → right-side `Strike structure` panel  
**Purpose:** Explain the implemented data path, calculations, axes, ranks, colours,
interaction and limitations of the chart. This document describes the current
implementation; it does not introduce or change a trading strategy.

## 1. What the chart answers

The Strike Structure chart combines three different observations for every
tracked option strike:

1. **Where current open interest is concentrated** — CE and PE OI bars.
2. **Whether open interest is being added or removed** — signed CE and PE ΔOI
   lines.
3. **How the option premium has moved from its session reference** — CE and PE
   premium-return markers.

Those inputs are also used to attach a mechanical contract-state label to each
side of each strike:

- `LB` — Long buildup
- `SB` — Short buildup
- `SC` — Short covering
- `LU` — Long unwinding
- `N` — Neutral
- `—` — Unavailable

The chart is descriptive. It does **not** identify which participant owns a
strike, prove support or resistance, or create an entry/exit recommendation.

## 2. Visual anatomy

The implemented chart has a categorical strike X-axis and three independent
Y-value scales.

| Layer | Series | Scale | Rendering |
|---|---|---|---|
| Current positioning | CE OI, PE OI | Primary Y-axis, starts at zero | Side-by-side bars |
| Position change | CE ΔOI, PE ΔOI | Secondary signed Y-axis | Lines with point symbols |
| Premium response | CE premium %, PE premium % | Hidden symmetric Y-axis | Diamond markers |

The colours in this panel follow the current Scalper V2 option-identity rule:

- **CE:** yellow (`#eab308`; darker yellow for labels/lines)
- **PE:** blue (`#2563eb`; darker blue for labels/lines)
- **NIFTY/underlying location:** teal dotted marker

CE/PE colour identifies the option side. It does not encode positive or
negative direction. The sign is retained in the ΔOI and premium numbers and in
the regime label.

### 2.1 X-axis

The X-axis contains the distinct strikes from the active ranking source,
sorted in ascending numeric order. It is a categorical strike axis, not a time
axis and not a continuous price axis.

The current underlying value is placed at the **nearest tracked strike** as a
dotted vertical guide. Its label retains the exact underlying value. Therefore,
if NIFTY is 23,477.80 and the nearest tracked strike is 23,500, the guide is
positioned at the 23,500 category but labelled with spot 23,477.8. It must not
be interpreted as saying that spot equals 23,500.

### 2.2 Primary OI axis

The primary Y-axis is current OI in source contracts/units:

```text
CE bar height = CE current OI at strike K
PE bar height = PE current OI at strike K
axis minimum  = 0
```

The bar values are not percentages and are not normalised independently by
side. CE and PE use the same OI axis, so their magnitudes are directly
comparable within the captured cohort.

### 2.3 Signed ΔOI axis

The secondary Y-axis shows signed change in OI:

```text
ΔOI = current OI − eligible baseline OI
```

when the UI has comparable current/baseline observations. If the history source
provides a native reported change, that reported change takes precedence for
the corresponding latest retained observation.

The scale always keeps zero visible but does not waste half the chart when all
values have the same sign. With the default 8% padding:

```text
mixed signs: [minimum − 8% of max absolute value,
              maximum + 8% of max absolute value]

all negative: [minimum × 1.08, abs(minimum) × 0.08]

all positive: [−maximum × 0.08, maximum × 1.08]

no values or only zeros: [−1, +1]
```

This is why an all-negative session receives only a small positive area rather
than a forced symmetric `−MAX … +MAX` domain.

### 2.4 Premium-return axis

The diamond markers show the option premium return from its opening reference:

```text
premium return % = 100 × (current premium / opening premium − 1)
```

The preferred opening premium is the first valid retained price for that exact
contract in the selected session. If retained intraday history is unavailable,
the latest snapshot fallback is:

```text
100 × (last_price / day_open − 1)
```

The premium axis is hidden to avoid adding a third set of tick labels to the
compact panel. It is symmetric around zero and uses the largest absolute CE/PE
premium return, with a minimum magnitude of 1 percentage point:

```text
premium axis = [−max(1, max absolute return),
                 max(1, max absolute return)]
```

The OI, ΔOI and premium series share only the strike X-axis. Their Y positions
come from separate units and scales; a visual line/bar crossing is not a
numerical equality.

## 3. Source data and precedence

The chart is assembled from two retained-data paths.

### 3.1 Latest strike snapshot

The page receives `legs` and, where available, `metricLegs` from the Scalper
context. The active ranking source is:

```text
rankSource = metricLegs when metricLegs is non-empty
             otherwise legs
```

The distinct strikes in `rankSource` define the chart's columns. This source
also supplies snapshot price and `day_open` fallback values.

`metricLegs` is described in the interface as the observed retained cohort. If
it is absent, the chart uses the nearest paired observed window. The latter is
not claimed to be a complete expiry chain.

### 3.2 Retained option-price history

The page requests:

```text
GET /v1/trading-analytics/option-price-history
    ?symbol=<underlying>
    &expiry=<YYYY-MM-DD>
    &historyDays=3
    &interval=<5 or 15>
```

Only observations belonging to the selected trading day are used in the
positioning model. The endpoint first reads archived option-chain snapshots. If
none exist for the request, it falls back to retained SmartAPI FULL quote
snapshots, selecting the nearest ten paired strikes and bucketing observations
to 5- or 15-minute intervals. No broker request is issued by chart hover.

For every exact `side:strike`, observations are sorted by time. The last cell
becomes the chart's preferred latest historical value.

### 3.3 Field-level precedence

For each strike and side, the chart input is selected in this order:

| Field | First choice | Fallback |
|---|---|---|
| Current OI | Latest retained positioning-history OI | Normalised profile current OI |
| ΔOI | Latest retained positioning-history ΔOI | Normalised profile ΔOI |
| Premium return | Return from first retained session price | `last_price` return from `day_open` |

This means a row can still render from the latest snapshot if detailed retained
history is unavailable. Missing values remain `null`; they are not converted to
zero.

## 4. How ΔOI baselines are selected

There are two possible retained-history cases.

### 4.1 Provider-reported change

When an archived observation contains `reportedChangeOi`, the model uses it
directly and labels the internal baseline kind:

```text
PROVIDER_REPORTED_CHANGE
```

The provider's documented meaning must be consulted before comparing it with a
different baseline definition.

### 4.2 Session-first fallback

When no reported change exists but retained OI history exists:

```text
session opening OI = first non-null retained OI for exact side:strike
ΔOI at time t       = OI(t) − session opening OI
baseline kind       = SESSION_FIRST_OBSERVATION
```

The SmartAPI retained-quote fallback uses this path.

### 4.3 Snapshot-profile fallback

If the latest history cell does not supply ΔOI, the profile normaliser builds a
single comparable cohort. Its baseline priority is:

1. `PREVIOUS_SESSION_FINAL`
2. `FIRST_SESSION_OBSERVATION`
3. `PREVIOUS_ARCHIVED_SNAPSHOT`
4. another explicitly named available baseline

Rows using a different baseline kind remain unavailable rather than being mixed
into the same comparison. A row is comparable only when its current OI and its
eligible baseline/change are present.

The compact Strike Structure panel does not display baseline provenance in its
floating tooltip because compact side-chart tooltips are intentionally
disabled. Baseline details remain available in the inspector/Data Health and
the JSON/CSV evidence exports.

## 5. Regime calculation

Regime is calculated independently for each exact CE or PE contract using the
sign of premium return and the sign of ΔOI.

| Premium return | ΔOI | Label | Mechanical meaning |
|---:|---:|---|---|
| positive | positive | Long buildup (`LB`) | Premium and OI both increased |
| negative | positive | Short buildup (`SB`) | Premium fell while OI increased |
| positive | negative | Short covering (`SC`) | Premium rose while OI decreased |
| negative | negative | Long unwinding (`LU`) | Premium and OI both decreased |
| zero | any, or any | zero | Neutral (`N`) |
| missing | any, or any | missing | Unavailable (`—`) |

The exact implementation is:

```text
if premiumReturnPct or changeOi is missing → Unavailable
else if either value equals zero           → Neutral
else if premium > 0 and ΔOI > 0           → Long buildup
else if premium < 0 and ΔOI > 0           → Short buildup
else if premium > 0 and ΔOI < 0           → Short covering
else                                       → Long unwinding
```

This classification describes the **option contract**, not NIFTY direction.
For example, CE short buildup may be investigated as resistance evidence and PE
short buildup may be investigated as support evidence, but the chart itself
does not make either conclusion.

## 6. CE1–CE5 and PE1–PE5 labels

The chart calculates a local top-five rank separately for CE and PE:

1. Take the OI value at every displayed strike for one side.
2. Exclude only missing OI values.
3. Sort descending by current OI.
4. Label the first five array positions `CE1`…`CE5` or `PE1`…`PE5`.

The label above an OI bar combines its rank, when present, and its regime:

```text
CE1 SB
PE2 LU
SC
```

Important distinctions:

- This is a **chart-local top-five rank across the strikes provided to this
  panel**.
- It is based on current OI only—not ΔOI, premium, distance from spot or strike.
- It is different from the canonical `rankCurrentOi()` leader list used by
  other Scalper V2 areas, which currently returns the top three per side,
  removes ambiguous duplicate strikes, excludes non-positive OI and applies
  deterministic tie ordering.
- The chart-local top-five implementation does not add a special tie badge.

Therefore, a chart label should be read as “rank within this displayed chart
cohort,” not automatically as a full-expiry exchange rank.

## 7. Missing-data behavior

The chart deliberately keeps absence different from an observed zero.

| Condition | Rendering |
|---|---|
| OI missing | No OI bar and no bar-top rank/regime label |
| ΔOI missing | Gap/null in the corresponding ΔOI line |
| Premium reference or price missing | No premium diamond |
| Premium or ΔOI missing | Regime is unavailable |
| Observed ΔOI = 0 | Numeric zero; regime is neutral |
| No tracked strikes | Panel shows `Strike structure unavailable` |

ECharts receives `null` for unavailable points. The UI must not infer a zero OI,
zero ΔOI or neutral position from a missing value.

## 8. Interaction and refresh lifecycle

The compact side chart uses the same strike-hover state as the adjacent OI,
ΔOI and Option Structure Matrix views.

```text
hover category index
→ resolve exact strike from sorted strikeRows
→ publish hoveredStrike
→ highlight the same category in linked strike views
```

If no strike is physically hovered, the nearest strike to the inspected
underlying price becomes the active category. Hover does not change the selected
CE or selected PE contract; selection remains an explicit click action in the
chain/contract controls.

The compact chart suppresses its large floating tooltip so it does not cover the
narrow plot. Exact values remain available in the Option Structure Matrix,
inspector, expanded analytical views and exports.

Live queries revalidate in place:

- chart/context data: every 15 seconds;
- option positioning history: every 30 seconds;
- replay/as-of mode: automatic live refetch is disabled.

The chart option is memoised from its actual inputs. Pointer movement changes
only the active category/highlight; it does not re-fetch history or rebuild the
calculation model.

## 9. Worked example

Assume strike 23,500 has:

```text
CE opening premium       = 120
CE latest premium        = 108
CE baseline OI           = 800,000
CE current OI            = 920,000

PE opening premium       = 95
PE latest premium        = 104.50
PE baseline OI           = 700,000
PE current OI            = 650,000
```

CE calculations:

```text
premium return = 100 × (108 / 120 − 1) = −10.00%
ΔOI            = 920,000 − 800,000      = +120,000
regime          = premium negative + ΔOI positive
                = Short buildup (SB)
```

PE calculations:

```text
premium return = 100 × (104.50 / 95 − 1) = +10.00%
ΔOI            = 650,000 − 700,000       = −50,000
regime          = premium positive + ΔOI negative
                = Short covering (SC)
```

The chart draws two OI bars at strike 23,500, plots `+120K` and `−50K` on the
signed ΔOI axis, and places premium diamonds at `−10%` and `+10%` on the hidden
premium axis. If the CE OI is the largest CE OI in the displayed cohort, its
bar-top label is `CE1 SB`.

## 10. What the chart must not be used to claim

The following conclusions are not supported by this chart alone:

- “FII/Pro/Client owns this strike.” Participant reports are aggregate and do
  not supply participant-by-strike ownership.
- “This is definitely support/resistance.” The display supplies structural
  evidence, not proof of defence or rejection.
- “Positive CE OI is bullish” or “positive PE OI is bearish.” OI magnitude has
  no direction without price, change, context and subsequent behavior.
- “Every expiry strike is included.” The captured cohort/window may be partial.
- “The latest chain existed at a historical candle time.” Historical price and
  latest chain evidence must remain separately labelled when no eligible
  historical snapshot exists.
- “A large visual height on one series equals a large value on another.” OI,
  ΔOI and premium return use different axes.

## 11. Code map

| File | Responsibility |
|---|---|
| `apps/web/src/pages/TradingAnalyticsScalperV2.tsx` | Selects source cohort, builds per-strike inputs, controls refresh and linked strike hover, renders the panel |
| `apps/web/src/lib/scalperV2Positioning.ts` | Regime formula, retained-history model, chart option, axes, rank labels and series |
| `apps/web/src/lib/scalperV2OiProfile.ts` | Comparable OI/ΔOI normalisation and baseline policy |
| `apps/web/src/lib/scalperV2Analytics.ts` | Adaptive signed ΔOI domain and compact side-chart tooltip policy |
| `apps/web/src/lib/scalperV2.ts` | OI formatting and canonical top-three leader ranking used elsewhere in V2 |
| `apps/api/src/routes/tradingAnalytics.ts` | Option-positioning-history endpoint, archive read and retained SmartAPI fallback |
| `apps/web/tests/scalperV2Positioning.test.ts` | Regime, missing-component, baseline and chart-series tests |
| `apps/api/src/routes/tradingAnalytics.test.ts` | Native history and retained SmartAPI fallback API tests |

All paths in the table are relative to `neon-stock-terminal/`.

## 12. Focused verification

From the canonical repository:

```bash
cd /home/novius2/trading-stack/neon-stock-terminal/apps/web
npx tsx --test --test-name-pattern="Scalper V2|strike structure|positioning" \
  tests/scalperV2Positioning.test.ts tests/scalperV2Analytics.test.ts
npm run typecheck

cd /home/novius2/trading-stack/neon-stock-terminal/apps/api
npx tsx --test --test-name-pattern="option price history|option positioning history" \
  src/routes/tradingAnalytics.test.ts
npm run typecheck

cd /home/novius2/trading-stack
bash scripts/verify/canonical-repository-gate.sh
```

Browser validation should additionally confirm:

1. CE bars are yellow and PE bars are blue.
2. All strikes are ordered ascending on X.
3. ΔOI retains its sign and zero remains visible.
4. Missing points create gaps rather than zeros.
5. The exact NIFTY label is placed at the explicitly named nearest strike.
6. Hover highlights the same strike in all linked strike views.
7. Hover never changes the selected CE/PE contracts.
8. No network request or full chart hydration occurs solely because the pointer
   moved.

## 13. Implementation caveats to retain in future changes

- Do not merge OI, ΔOI and premium into one numerical axis.
- Do not replace missing ΔOI with zero.
- Do not mix baseline definitions silently.
- Do not treat the chart-local top-five label as the canonical top-three leader
  contract or as a full-expiry rank.
- Do not change CE/PE selection on hover.
- Do not convert the mechanical regime into an automated recommendation without
  a separately specified, versioned and tested strategy rule.
- Do not add broker/API calls to the pointer path.
