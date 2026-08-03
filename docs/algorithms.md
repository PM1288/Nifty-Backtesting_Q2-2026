flowchart LR
  %% ==========================================
  %% Algorithmic Logic and Multi Level Alerting
  %% ==========================================

  classDef input fill:#eef7ff,stroke:#3b82f6,stroke-width:1px,color:#0b1220;
  classDef stage fill:#f0fdf4,stroke:#22c55e,stroke-width:1px,color:#0b1220;
  classDef decision fill:#fff7ed,stroke:#f97316,stroke-width:1px,color:#0b1220;
  classDef output fill:#faf5ff,stroke:#a855f7,stroke-width:1px,color:#0b1220;
  classDef guard fill:#f8fafc,stroke:#64748b,stroke-width:1px,color:#0b1220;

  %% Inputs
  inBars1m["bars 1m"]:::input
  inBars5m["bars 5m"]:::input
  inDaily["bars daily and weekly"]:::input
  inMarket["NIFTY and sector and VIX"]:::input
  inOptions["options OI and ATM strikes"]:::input

  %% Stage 0
  regime["Stage 0 market regime classifier"]:::stage
  regimeOut["regime state and risk budget"]:::output

  %% Stage 1
  candidates["Stage 1 swing candidate generator"]:::stage
  candRules["trend and relative strength and liquidity filters"]:::guard
  candidatesOut["candidate list ranked"]:::output

  %% Stage 2
  setups["Stage 2 intraday setup detector"]:::stage
  setupRules["pullback zones and RSI build and VWAP distance"]:::guard
  setupsOut["setup list filtered"]:::output

  %% Stage 3
  timing["Stage 3 timing engine"]:::stage
  timingRules["confirmations RSI reclaim and VWAP reclaim and volume confirm"]:::guard
  timingDecision{"entry trigger met"}:::decision

  %% Noise control
  cooldown{"cooldown active"}:::decision
  suppress["suppressed with reason"]:::output

  %% Risk and outputs
  risk["risk management stop and targets"]:::stage
  alert["final alert buy zone sell zone exit"]:::output
  store["write to Postgres alerts and state"]:::output
  notify["send webhook to n8n"]:::output

  %% Options guardrails
  optGuard["options guardrail stocks ATM plus minus 1 and NIFTY ATM plus minus 3"]:::guard

  %% Flow
  inBars1m --> regime
  inBars5m --> regime
  inDaily --> regime
  inMarket --> regime
  regime --> regimeOut

  regimeOut --> candidates
  inDaily --> candidates
  inMarket --> candidates
  candRules --> candidates
  candidates --> candidatesOut

  candidatesOut --> setups
  inBars1m --> setups
  inBars5m --> setups
  setupRules --> setups
  setups --> setupsOut

  setupsOut --> timing
  inBars1m --> timing
  inBars5m --> timing
  inOptions --> optGuard
  optGuard --> timing
  timingRules --> timing

  timing --> timingDecision
  timingDecision -- NO --> suppress
  timingDecision -- YES --> cooldown

  cooldown -- YES --> suppress
  cooldown -- NO --> risk

  risk --> alert
  alert --> store
  alert --> notify
