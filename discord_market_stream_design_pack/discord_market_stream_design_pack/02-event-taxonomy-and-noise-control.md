# 02 Event Taxonomy and Noise Control

## Why this exists

The failure mode for a streaming market service is not missing data.
It is **sending too much of it**.

This service should behave like an analyst who only speaks when something materially changes.

## Event families

## 1. Market regime events

### 1.1 Broad participation trend confirmation
Trigger family:
- index return exceeds threshold
- breadth up % is strong
- weighted participation % is strong
- top-10 concentration is not dominating
- sign agreement and VWAP breadth confirm

Send when:
- severity >= medium
- novelty >= medium
- either:
  - first confirmation of the day
  - or regime materially strengthens

Cooldown:
- 15 minutes unless severity steps up by one full band

Good Discord title:
- `Broad participation confirms the move`
- `Trend strength is broad, not narrow`

### 1.2 Narrow leadership warning
Trigger family:
- index positive or flat
- breadth weak or deteriorating
- top-10 concentration high
- weighted participation weak

Send when:
- divergence persists for at least 2 consecutive refreshes
- not already sent recently

Cooldown:
- 20 minutes

### 1.3 Failed open / gap fill
Trigger family:
- large opening gap
- breadth confirmation fails
- ORH/ORL structure breaks
- gap fill probability rises
- reversal state appears

Cooldown:
- 15 minutes

### 1.4 Late-day reversal
Trigger family:
- trend weakens or reverses in final hour
- breadth flips
- close-location deteriorates / improves sharply
- VWAP control changes

Cooldown:
- 10 minutes after first trigger

## 2. Volatility events

### 2.1 Market volatility shock
Trigger family:
- realized intraday volatility jumps above baseline percentile
- minute range / true range expands sharply
- breadth and options structure turn unstable
- move vs session open exceeds shock threshold

Send when:
- severity high only
- never send low-grade vol chatter every minute

Cooldown:
- 10 minutes, unless severity escalates from medium to high

### 2.2 Compression -> expansion release
Trigger family:
- narrow intraday range regime
- rapid breakout with participation
- volume surprise above threshold

Cooldown:
- 15 minutes

## 3. Stock-level events

### 3.1 True leader
Trigger family:
- residual return vs index positive and rising
- VWAP hold quality strong
- relative-strength persistence high
- volume ratio supportive
- continuation score above threshold
- not merely a beta passenger

Cooldown:
- 20 minutes per symbol

### 3.2 False leader / chase warning
Trigger family:
- strong absolute move
- weak residual alpha
- poor VWAP hold
- weak persistence
- spike-like microstructure

Cooldown:
- 20 minutes per symbol

### 3.3 Breakdown / weakness
Trigger family:
- residual weakness
- below VWAP
- range expansion down
- volume surprise
- sector not helping

Cooldown:
- 20 minutes per symbol

### 3.4 Reversal candidate
Trigger family:
- overshoot then regain / fail key structure
- reversal score crosses continuation score
- breadth / sector context improves or deteriorates

Cooldown:
- 15 minutes per symbol

## 4. Sector events

### 4.1 Sector leadership rotation
Trigger family:
- sector breadth changes materially
- average RSI / residual strength shifts
- top constituents confirm
- market state supports sector differentiation

Cooldown:
- 20 minutes per sector

### 4.2 Defensive / cyclical rotation warning
Trigger family:
- cyclicals weaken while defensives strengthen, or the reverse
- broad market state changes

Cooldown:
- 30 minutes

## 5. Options events

### 5.1 Call wall / put wall migration
Trigger family:
- dominant strike shifts
- change in OI clusters around new strike
- spot approaches or rejects wall
- move is not just stale far OTM noise

Cooldown:
- 10 minutes per underlying+expiry

### 5.2 Max pain pin risk
Trigger family:
- spot drifts toward max pain late in session
- realized movement decays
- options structure suggests pinning

Cooldown:
- 30 minutes

### 5.3 Options confirm spot breakout
Trigger family:
- wall movement supports spot
- PCR not contradicting
- IV structure is compatible
- spot breaks away from pin risk

Cooldown:
- 15 minutes

### 5.4 Options contradict spot
Trigger family:
- spot move lacks options confirmation
- resistance/support walls remain stubborn
- PCR or IV structure pushes against narrative

Cooldown:
- 15 minutes

## 6. FII / participant events

### 6.1 Regime shift in positioning
Trigger family:
- latest official participant/FII data shows meaningful change
- percentile changes materially
- divergence between FII and clients widens or reverses

Cadence:
- post-close / official-report driven only

Cooldown:
- once per new report unless revised

### 6.2 Contrarian extreme
Trigger family:
- FII long % at extreme percentile
- clients at opposite extreme
- historical overlay suggests tension

Cadence:
- post-close only

## 7. Event / corporate context events

### 7.1 Catalyst watch
Trigger family:
- result date, board meeting, corporate action, or unusual announcement approaching
- stock already active in technical ranking

Cooldown:
- once at trigger stage, once on same-day reminder

### 7.2 Block / bulk context
Trigger family:
- meaningful block / bulk activity
- near breakout or breakdown context
- not merely large value with no signal consequence

Cooldown:
- daily

## 8. Ops / trust events

### 8.1 Source stale
### 8.2 Coverage drop
### 8.3 Missing bars
### 8.4 Parser failure
### 8.5 Discord dispatch degraded

These should always bypass normal market cooldowns.

---

## Severity model

Recommended severity fields:
- `impact_score`
- `novelty_score`
- `confirmation_score`
- `confidence_score`
- `trust_score`

Composite suggestion:
`event_score = 0.35*impact + 0.25*novelty + 0.20*confirmation + 0.10*confidence + 0.10*trust`

Bands:
- `info`
- `watch`
- `medium`
- `high`
- `critical`

Rules:
- `info` never hits Discord directly; it is digest-only
- `watch` may appear in scheduled digests
- `medium` can hit Discord if novel
- `high` hits immediately
- `critical` bypasses normal suppression

## Novelty model

Novelty should measure:
- change vs previous snapshot
- change vs last sent event
- change vs intraday baseline
- rarity vs rolling history

Example novelty inputs:
- z-score delta
- percentile regime change
- sign flip
- structural break
- new symbol appearing in top-ranked set

## Confirmation model

Require cross-checks:
- market move + breadth + participation
- stock move + residual strength + volume + VWAP
- options move + spot + wall shift + PCR/IV
- FII move + participant matrix + historical percentile

Single-metric alerts should be rare.

## Noise budget

Recommended upper bounds in regular conditions:
- 0–2 high-priority messages per hour
- 1–4 medium messages per hour
- 1 scheduled digest per 30–60 minutes
- unlimited ops alerts only if they are genuinely separate incidents

Recommended burst policy:
- if market is in shock mode, allow bursts for 10 minutes
- after burst, collapse follow-up chatter into one consolidated update

## Suppression rules

Suppress if:
- same dedupe key and same severity band within cooldown
- same condition but change is below follow-up delta threshold
- trust score below floor
- event contradicts a fresher higher-trust source and lacks confirmation
- event is redundant with a broader higher-severity parent alert

## Escalation rules

Send a follow-up if:
- severity increases by at least one band
- confidence increases materially
- the event resolves in an important way
- invalidation occurs
- there is a strong confirmation from another module

## Required fields on every event

- `event_id`
- `event_type`
- `event_family`
- `severity`
- `entity_type`
- `entity_id`
- `as_of`
- `source_freshness`
- `headline`
- `metrics`
- `confirmations`
- `contradictions`
- `risk_flags`
- `dedupe_key`
- `cooldown_until`
- `machine_facts`
- `discord_payload`
- `chart_requested`
- `chart_type`
- `send_decision`
- `suppression_reason`

## Scheduled digest policy

Use scheduled digests to absorb medium-value updates:
- open + 15m
- mid-session
- pre-close
- close summary
- post-close institutional context

Digests should contain:
- what changed since the prior digest
- top leaders / laggards
- volatility and breadth
- options context
- notable stock alerts
- quality status

## Operator review hooks

Store:
- whether the alert was helpful
- whether it was too late
- whether it was noisy
- whether the narrative was clear
- whether the chart helped

This feedback becomes the tuning loop for thresholds and cooldowns.
