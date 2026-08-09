# Product Intent and Information Architecture

The platform helps an operator move from current market context to a governed decision, historical evidence and operational status without confusing opportunity diagnostics with realised execution.

## Active domains

| Domain | User question | Implemented destinations |
|---|---|---|
| Home | What is happening now? | Protected Home tape |
| Market | What is the market, regime and participation context? | Market overview/state/regimes, institutional flow |
| OIIS | What did OIIS select and how is it evaluated? | Live selection, strategy evaluation |
| Stocks | Which stocks lead and what is the symbol evidence? | Leadership, daily setups, stock detail |
| Backtests | Does historical evidence support the strategy? | Overview, lab, leaderboard, results, runs, compare |
| Options | What does the options structure show? | Structure and snapshot |
| Research / DOE | What deeper diagnostic evidence exists? | H30, indicator research and heatmaps |
| Operations | Is the data/application healthy? | System map and data quality |

Paper Trading, Futures and Administration remain in the target catalogue but are intentionally absent from active navigation until real UI/API vertical slices exist. Legacy routes remain valid; `/dashboard/*` aliases support the target information architecture.

The stable journey is: context → candidate → governed strategy → run identity → validation → economics → trade evidence → operational health.
