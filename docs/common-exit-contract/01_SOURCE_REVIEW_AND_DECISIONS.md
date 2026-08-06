# Source Review and Governing Decisions

## Material reviewed

The correction was based on all material in
`/home/novius2/NIFTY50/Rules-of-engegemnt` and the active repository:

- `CODEX_IMPLEMENT_STRATEGY_EVALUATION_RULES_OF_ENGAGEMENT_V1.0.md`: complete
  26-section implementation contract, including target ladders, adverse
  ladders, capital lock, result taxonomy, regimes, database, API, UI, exports
  and test programme.
- `NIFTY_STRATEGY_EVALUATION_RULES_OF_ENGAGEMENT_V1.0.docx`: 1,468 non-empty
  text paragraphs/table cells were inspected. It is the human-formatted Rules
  of Engagement source.
- `NIFTY_STRATEGY_EVALUATION_RULES_AND_CODEX_IMPLEMENTATION_V1.0.zip`: archive
  integrity passed. Its Markdown and DOCX SHA-256 values match the standalone
  copies. The included README and checksum manifest describe the same package.
- `Nifty_50_Event_Regime_Analysis_Master_2016_2026.xlsx`: all nine sheets were
  inspected. The workbook contains 52 event records, 208 event-window rows,
  direction/zone/persistence rules, daily-data templates, controlled
  vocabularies, source register, dictionary and dashboard.
- Existing common-exit declarations in `AGENT_HANDOFF.md`, hybrid workload JSON,
  hybrid catalogue validation, the shared simulator and the daily rising
  oversold runner.
- The OIIS V1.0 formula, runner, database schema, 99-symbol output and its 23
  trades.

## Conflict resolved

The generic Rules document describes stop, strategy, timeout and forced-exit
paths because it supports many possible mandates. The operator's explicit rule
for this programme is narrower and takes precedence: **there is no stop-loss
exit, ever, for these comparative equity-entry studies**. D+5 is retained as an
evaluation checkpoint, not as an instruction to sell.

The resolved interpretation is:

- entry logic belongs to the individual strategy;
- actual exit logic is shared and target-only;
- the selected executable targets are I030 on the entry session and S100 after
  promotion to swing;
- I050, I070, S200 and S500 are comparison/evaluation levels, not extra orders;
- adverse levels A050 through A1000 are risk observations, not stops;
- an unresolved target remains an open liability with occupied capital;
- target-only studies are conservatively labelled `OPPORTUNITY_SCAN` and
  `NOT_RANKABLE` until the Rules-of-Engagement evidence and compatible portfolio
  evaluation are complete.

## Defect found

OIIS V1.0 bypassed the shared contract. It bought at next-session open, used a
structural stop, set a 2R target and forced an exit after ten sessions. That
produced 13 stop exits, five target exits and five timeouts. The resulting
₹-50,181.88 is not a valid answer under the operator-approved exit mandate.
The run remains immutable audit evidence but is superseded for strategy
comparison.

The hybrid catalogue already declared the correct exit but skipped the entry
minute when testing I030. That omission has also been corrected.
