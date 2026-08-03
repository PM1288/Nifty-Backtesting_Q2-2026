# Document and Archive Review

## Sources reviewed

### Authoritative current-stack documents

The live hierarchy in `docs/SOURCE_OF_TRUTH.md` was followed. Running Compose,
active configuration, source code, `docs/ARCHITECTURE_CURRENT.md`, schema ownership,
and migration strategy override older phase/history documents.

The current platform is a shared PostgreSQL system with Go ingestion/strategy
writers, Python analytics/read models, a Node API/BFF, React surfaces, Redis, nginx,
and an isolated option-chain service. Production and stage share market-data writers
and PostgreSQL; research must not degrade those paths.

### NIFTY target architecture DOCX

`NIFTY_STRATEGY_RESEARCH_AND_LIVE_INTELLIGENCE_ARCHITECTURE_V1.0_FINAL.docx`
defines two modules over shared contracts:

- governed historical research/backtesting;
- later live decision intelligence consuming parity-certified features.

The shared foundation is more important than any individual strategy: point-in-time
data, effective-dated market rules, feature definitions, fees, execution semantics,
experiment/artifact state, and fail-closed publication. Options are buying-only and
must use actual premiums; Greeks are diagnostics. Displayed probabilities require
chronological out-of-fold calibration.

### Five-phase roadmap DOCX and Markdown

`NIFTY_BACKTESTING_FIVE_PHASE_IMPLEMENTATION_ROADMAP_V1.0.docx` and its Markdown
counterpart define sequential gates:

1. data/time qualification;
2. exact economics, feature registry, strategy SDK, and simulator;
3. resumable replay, ledger, metrics, and publication guard;
4. leakage-controlled discovery and calibration;
5. actual-premium options, online parity, and checksummed analyst packs.

Installing the code is not equivalent to accepting every release gate. Production
data, broker contract-note reconciliation, point-in-time history, and options-history
availability remain evidence requirements.

### SmartAPI ingestion DOCX

`docs/source/SmartAPI Ingestion under Rate Limits and Volatile Feeds.docx` supports
the existing WebSocket-first design, fast callback/enqueue behavior, asynchronous
aggregation/writes, heartbeat/reconnect/resubscribe, feed-latency monitoring, and
rate-limited REST gap repair. Order-flow, momentum, and volume are primary short-
horizon features; OI/gamma and IV are context/risk features. This reinforces keeping
research compute outside the collector hot path.

### Multi-strategy swing DOCX

`docs/source/Algorithms for a Multi-Strategy Swing Trade Alert System.docx` proposes
multi-timeframe trend/relative-strength filtering followed by oscillator, volatility,
volume, breadth, and sentiment confirmation. These are candidate hypotheses, not
proven strategies. They belong in immutable manifests and walk-forward evaluation,
not hard-coded live branches.

### Existing backtesting Markdown

`neon-stock-terminal/docs/backtesting/*` documents a functioning daily published-
batch system with three strategies, T+1-open entry, conservative same-bar handling,
finite capital, last-good publication, API marts, and a development-only seeded
fallback. It is retained. Its known current-member universe and dynamic charge
fallback are exactly the limitations the new bounded package must reconcile.

## ZIP classification

All archives passed `unzip -tq` integrity checks.

| Archive | Classification | Decision |
| --- | --- | --- |
| Five-phase complete delivery | Authoritative implementation/reference bundle | Applied phase overlays sequentially; did not install integrated reference ZIP directly. |
| `artifacts_20260403_084129.zip` | UI/routes audit evidence | Retain as evidence; no code overlay. |
| `discord_market_stream_design_pack.zip` | Already-integrated design pack | Retain; current Discord code/migration remains authoritative. |
| `exports/postgres-structure-2026-04-04.zip` | Dated schema snapshot | Compared with live PostgreSQL; live database wins. |
| `nifty100-disclosures-pipeline.zip` | Source archive for an existing live service | Do not re-overlay; `services/nifty100_disclosures_pipeline` is current. |
| `nse_fii_services_pack.zip` | Source archive for existing NSE FII service | Do not re-overlay; current service and `db/sql/012` win. |
| `actual-fii-dii-real-repo.zip` | Historical/source integration archive | Retain; institutional-flow services and worklogs describe the merged state. |

## Conflicts and decisions

1. The reference PostgreSQL adapter selected `universe_weight`; live
   `nse_intraday.universe_membership` uses `weight`. The adapter now aliases
   `weight AS universe_weight`.
2. Existing analytics backtesting uses current members from
   `public.instrument_universe`. It remains available but is not point-in-time
   accepted. Canonical research uses effective dates from
   `nse_intraday.universe_membership`.
3. Existing Python backtesting dynamically imports delivery charges and silently
   falls back to embedded rates. It is retained only for legacy output continuity;
   canonical new runs use the versioned Decimal fee engine. Removal requires broker
   contract-note and row-level parity evidence.
4. Root `bhavcopy_ingest.py` calculates RSI/Williams across a concatenated frame.
   That path is quarantined from canonical features; features must be chronological
   per symbol.
5. Generic new schemas `catalog`, `research`, and `simulation` do not currently
   exist in production and do not conflict with live schemas. They are centrally
   owned by NIFTY StratLab; `nse_app` stays the published dashboard owner.
6. The example exchange calendar has no authoritative holiday set and begins in
   2000. It is suitable for tests, not final historical admission.
7. The FII/DII workbook has useful historical content but no proven publication-time
   rule. Only bounded structure/sample inspection is allowed; it remains excluded
   from model features until `available_at` is approved.
8. Current option data is useful for recent actual-premium research but cannot be
   assumed to support a ten-year options backtest. Missing/stale contracts, premiums,
   or Greeks fail closed.
