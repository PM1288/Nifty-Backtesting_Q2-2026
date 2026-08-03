# Analysis Playbook

This warehouse is intended for **daily end-of-day learning, anomaly detection, market regime classification, and stock-level direction studies**.

## What should be analyzed first

### 1. Market regime and participation
Use:
- `fact_market_activity_kv`
- `fact_market_activity_index`
- `fact_eod_prices`
- `fact_daily_volatility`

Questions:
- Is the market in risk-on, risk-off, or rotational mode?
- Are moves broad or narrow?
- Is volatility expanding faster than returns?

Conclusions you can draw:
- **Broad bullish participation**: rising index + rising median stock return + improving delivery breadth.
- **Narrow rally / fragile trend**: index up but weak breadth and weak delivery participation.
- **Stress regime**: falling index, rising volatility, more surveillance flags, expanding high-low ranges.

### 2. Stock direction models
Use:
- `vw_stock_features_daily`
- `fact_daily_volatility`
- `fact_52_week_high_low`
- `fact_surveillance_indicators`

Labels:
- next-day close-to-close return
- next 3-day return
- next 5-day return
- direction sign
- breakout continuation vs failure

Conclusions:
- Which features predict continuation?
- Which features predict mean reversion?
- Which features only work in certain volatility regimes?

### 3. Delivery and conviction
Use:
- `fact_eod_prices`
- `fact_bhavcopy_udiff`

Questions:
- Did price move with strong deliverable participation?
- Was the move high turnover but weak delivery, suggesting low conviction or speculative churn?

Conclusions:
- **Accumulation**: positive return with elevated delivery ratio and volume expansion.
- **Distribution**: flat or down close with elevated volume and weak close location.
- **Low-quality move**: price spike with low delivery support.

### 4. Breakouts and breakdowns
Use:
- `fact_52_week_high_low`
- `fact_eod_prices`
- `fact_daily_volatility`

Questions:
- Is a stock near adjusted 52-week high/low?
- Does breakout success depend on volatility contraction followed by expansion?

Conclusions:
- Breakout quality is better when:
  - close is near high
  - turnover expands
  - delivery expands
  - stock is not under surveillance stress

### 5. Deal-flow impact
Use:
- `fact_bulk_deals`
- `fact_block_deals`
- `fact_eod_prices`

Questions:
- What happens 1, 3, 5, 10 days after a bulk/block deal?
- Does follow-through depend on side concentration, client type, or prior trend?

Conclusions:
- Institutional-style blocks in liquid names often create **follow-through zones**.
- Isolated bulk activity in weak/liquidity-poor names can be **event-only noise** unless confirmed by delivery and trend.

### 6. Short-selling pressure and squeeze setups
Use:
- `fact_short_selling`
- `fact_eod_prices`
- `fact_daily_volatility`

Questions:
- Does short-selling cluster near breakdowns?
- Which names show high short-selling and then strong reversal?

Conclusions:
- **Squeeze candidate**: elevated short-selling, gap-down failure, close in upper quartile of range, volume expansion.
- **Trend confirmation**: rising short activity with persistent weak close and expanding volatility.

### 7. Surveillance / caution anomaly studies
Use:
- `fact_surveillance_indicators`
- `fact_eod_prices`
- `fact_daily_volatility`

Questions:
- Do flagged names show abnormal return paths, turnover, or mean reversion?
- Which surveillance combinations precede instability?

Conclusions:
- Surveillance flags are often better used as **risk filters** than alpha features.
- Names with multiple non-default indicators deserve separate model buckets.

### 8. Corporate action and announcement drift
Use:
- `fact_corporate_actions`
- `fact_text_events`
- `fact_eod_prices`

Questions:
- How do stocks behave before and after ex-date?
- Do announcement clusters lead to trend persistence or exhaustion?

Conclusions:
- Ex-date behavior differs by purpose:
  - dividend / interest = often neutral or gap-adjusted
  - rights / split / bonus = stronger liquidity and retail participation effects
- Board meeting / announcement bursts can precede volatility expansion.

### 9. Margin and risk-pressure studies
Use:
- `fact_margin_trading_scrip`
- `fact_var_margin`
- `fact_eod_prices`
- `fact_daily_volatility`

Questions:
- Which names have increasing financed exposure?
- Do rising applicable margin rates coincide with liquidity deterioration or sharp moves?

Conclusions:
- **Crowding risk**: high financed amount + rising margins + weak close structure.
- **Forced unwind sensitivity**: elevated volatility and high financed exposure.

### 10. Cross-sectional ranking and clustering
Use all core daily factors.

Recommended outputs:
- top continuation candidates
- top reversal candidates
- stress watchlist
- squeeze watchlist
- breakout watchlist
- event-driven watchlist

## Derived features that should be built

### Price / range
- daily return
- gap return
- intraday return
- close location value
- high-low range percent
- rolling volatility percentile
- distance to 20-day / 50-day highs
- distance to adjusted 52-week high / low

### Participation
- volume surprise vs 20-day median
- turnover surprise vs 20-day median
- delivery quantity surprise
- delivery percent surprise
- trade count surprise

### Regime
- market index return
- market breadth percent positive
- median stock return
- realized market volatility
- surveillance density

### Event
- bulk/block deal flag
- short-selling flag
- ex-date / record-date proximity
- announcement count per symbol over rolling windows
- board meeting flag

### Risk / crowding
- financed amount percentile
- margin-rate shock
- surveillance non-default flag count

## Anomaly detection ideas

### Simple, practical detectors
- rolling z-score on:
  - return
  - range
  - volume
  - turnover
  - delivery %
  - financed amount
- percentile shock detectors
- 2D / 3D rule-based anomalies:
  - high return + high volume + low delivery
  - low return + extreme range + rising var margin
  - strong gap + heavy short-selling + close above VWAP-like proxy

### ML / statistical detectors
- Isolation Forest on daily factor vectors
- Local Outlier Factor by sector bucket
- change-point detection on volatility or participation
- HDBSCAN clustering of daily stock states
- Hidden Markov Model for market regime

## What conclusions are reasonable to draw

Reasonable:
- regime changed
- breadth improved or deteriorated
- a move has stronger/weaker conviction
- a breakout has confirmation or failure characteristics
- a stock is under unusual risk / crowding / surveillance stress

Not reasonable from this dataset alone:
- precise intraday execution quality
- promoter behavior
- full ownership-flow decomposition
- causal attribution without event controls

## Suggested build order

1. Ingest and validate.
2. Build `vw_stock_features_daily`.
3. Add rolling feature materialization table.
4. Build daily dashboard / notebooks.
5. Train baseline classifiers:
   - next-day up/down
   - 5-day continuation
   - breakout success
   - anomaly flag
6. Evaluate by market regime.
