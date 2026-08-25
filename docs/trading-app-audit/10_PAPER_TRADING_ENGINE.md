# Paper trading engine

> Evidence basis: static source inspection generated 2026-08-23T11:30:04.012Z. Runtime behaviour is labelled separately. “UNVERIFIED” means the source alone cannot establish the runtime condition.

## Boundary

Universal paper execution is owned by `services/paper_trading`; the workbench aggregation is exposed by `apps/api/src/routes/workspace.ts`; the main UI is `PaperTradingCommandCenter`. Repository policy identifies `public.bars_1m` and `public.instruments` as canonical market inputs and the `paper_trading` schema as durable paper storage.

## Primary flow

`trade intent → validation/idempotency → trade group/legs → paper fill/position events → monitoring → target/horizon observations → webhook/outbox → workspace aggregation → Evidence Workbench`

## Accounting separation

- Actual execution, booked realised, and open marked values are ledger/execution concepts.
- Intraday/swing/5D/30D MFE/MAE and target hits are observations.
- Never-closed, stop-loss, fixed-capital, and scenario results are hypothetical/simulated.
- The UI must not make these additive unless the backend explicitly supplies a compatible reconciliation.

## Persistence and restart

Paper records are PostgreSQL-backed, not browser-only. Worker restart should therefore preserve trades, while in-flight polling/retry timing may change. Verify exact idempotency and lease behaviour in service tests and scheduler/worker code.

## Endpoint evidence

| Method | Path | Implementation |
| --- | --- | --- |
| GET | /api/v1/accounts/{account_id}/summary | [services/paper_trading/src/papertrade/api.py:277](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L277) |
| GET | /api/v1/accounts/{account_id}/summary | [services/paper_trading/src/papertrade/api.py:277](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L277) |
| GET | /api/v1/strategies/{strategy_id}/performance | [services/paper_trading/src/papertrade/api.py:293](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L293) |
| GET | /api/v1/strategies/{strategy_id}/performance | [services/paper_trading/src/papertrade/api.py:293](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L293) |
| GET | /api/v1/trade-groups | [services/paper_trading/src/papertrade/api.py:192](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L192) |
| GET | /api/v1/trade-groups | [services/paper_trading/src/papertrade/api.py:192](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L192) |
| GET | /api/v1/trade-groups/{group_id} | [services/paper_trading/src/papertrade/api.py:185](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L185) |
| GET | /api/v1/trade-groups/{group_id} | [services/paper_trading/src/papertrade/api.py:185](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L185) |
| POST | /api/v1/trade-groups/{group_id}/cancel | [services/paper_trading/src/papertrade/api.py:230](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L230) |
| POST | /api/v1/trade-groups/{group_id}/cancel | [services/paper_trading/src/papertrade/api.py:230](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L230) |
| POST | /api/v1/trade-groups/{group_id}/close-intents | [services/paper_trading/src/papertrade/api.py:216](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L216) |
| POST | /api/v1/trade-groups/{group_id}/close-intents | [services/paper_trading/src/papertrade/api.py:216](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L216) |
| POST | /api/v1/trade-groups/{group_id}/commit | [services/paper_trading/src/papertrade/api.py:272](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L272) |
| POST | /api/v1/trade-groups/{group_id}/commit | [services/paper_trading/src/papertrade/api.py:272](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L272) |
| POST | /api/v1/trade-groups/{group_id}/legs | [services/paper_trading/src/papertrade/api.py:262](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L262) |
| POST | /api/v1/trade-groups/{group_id}/legs | [services/paper_trading/src/papertrade/api.py:262](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L262) |
| POST | /api/v1/trade-groups/building | [services/paper_trading/src/papertrade/api.py:203](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L203) |
| POST | /api/v1/trade-groups/building | [services/paper_trading/src/papertrade/api.py:203](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L203) |
| POST | /api/v1/trade-intents | [services/paper_trading/src/papertrade/api.py:158](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L158) |
| POST | /api/v1/trade-intents | [services/paper_trading/src/papertrade/api.py:158](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L158) |
| GET | /api/v1/trade-intents/{intent_id} | [services/paper_trading/src/papertrade/api.py:173](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L173) |
| GET | /api/v1/trade-intents/{intent_id} | [services/paper_trading/src/papertrade/api.py:173](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/services/paper_trading/src/papertrade/api.py#L173) |
| GET | /v1/analytics/indicators/:slug/strategies/:scenarioId | [neon-stock-terminal/apps/api/src/routes/indicatorStrategySnapshots.ts:68](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/indicatorStrategySnapshots.ts#L68) |
| GET | /v1/backtesting/strategies | [neon-stock-terminal/apps/api/src/routes/backtesting.ts:792](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/backtesting.ts#L792) |
| GET | /v1/backtesting/strategies/:strategyId | [neon-stock-terminal/apps/api/src/routes/backtesting.ts:801](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/backtesting.ts#L801) |
| GET | /v1/backtesting/strategies/:strategyId/drawdown | [neon-stock-terminal/apps/api/src/routes/backtesting.ts:836](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/backtesting.ts#L836) |
| GET | /v1/backtesting/strategies/:strategyId/equity | [neon-stock-terminal/apps/api/src/routes/backtesting.ts:823](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/backtesting.ts#L823) |
| GET | /v1/backtesting/strategies/:strategyId/open-positions | [neon-stock-terminal/apps/api/src/routes/backtesting.ts:849](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/backtesting.ts#L849) |
| GET | /v1/backtesting/strategies/:strategyId/regimes | [neon-stock-terminal/apps/api/src/routes/backtesting.ts:875](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/backtesting.ts#L875) |
| GET | /v1/backtesting/strategies/:strategyId/stocks | [neon-stock-terminal/apps/api/src/routes/backtesting.ts:868](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/backtesting.ts#L868) |
| GET | /v1/backtesting/strategies/:strategyId/summary | [neon-stock-terminal/apps/api/src/routes/backtesting.ts:810](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/backtesting.ts#L810) |
| GET | /v1/backtesting/strategies/:strategyId/trades | [neon-stock-terminal/apps/api/src/routes/backtesting.ts:856](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/backtesting.ts#L856) |
| GET | /v1/trade-quality/policy | [neon-stock-terminal/apps/api/src/routes/workspace.ts:335](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/workspace.ts#L335) |
| GET | /v1/workspace/paper-trading | [neon-stock-terminal/apps/api/src/routes/workspace.ts:340](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/workspace.ts#L340) |
| POST | /v1/workspace/paper-trading/manual-trades | [neon-stock-terminal/apps/api/src/routes/workspace.ts:618](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/workspace.ts#L618) |
| GET | /v1/workspace/paper-trading/trades/:tradeGroupId | [neon-stock-terminal/apps/api/src/routes/workspace.ts:730](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/workspace.ts#L730) |
| GET | /v1/workspace/paper-trading/trades/:tradeGroupId/comments | [neon-stock-terminal/apps/api/src/routes/workspace.ts:825](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/workspace.ts#L825) |
| POST | /v1/workspace/paper-trading/trades/:tradeGroupId/comments | [neon-stock-terminal/apps/api/src/routes/workspace.ts:839](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/workspace.ts#L839) |
| POST | /v1/workspace/paper-trading/trades/:tradeGroupId/quality-review | [neon-stock-terminal/apps/api/src/routes/workspace.ts:871](/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026/neon-stock-terminal/apps/api/src/routes/workspace.ts#L871) |


See [paper-trading-flow.mmd](diagrams/paper-trading-flow.mmd) and the page dossier.
