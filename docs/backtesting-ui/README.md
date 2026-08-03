# Backtesting visual analytics UI

This folder is the human-readable design, implementation, and verification record for the 3 August 2026 backtesting UI rebuild.

## Start here

1. `CURRENT_STATE_AND_GAP_MAP.md` explains the old UI, the requested journeys, and deliberately unavailable research evidence.
2. `ADR-001-BACKTESTING-VISUAL-VERTICAL-SLICE.md` records the visual and architecture decision.
3. `DATA_TO_WIDGET_MAPPING.md` identifies which server-owned fields feed each new widget.
4. `BACKTEST_UI_COMPLETION.md` explains what changed and where to review it.
5. `BACKTEST_UI_TEST_RESULTS.json` contains the automated browser acceptance result.
6. `screenshots/` contains current desktop and mobile evidence.

## Story order

The implemented order is: trust and run identity, portfolio verdict, closed-versus-open money, risk, explanation, stability limitations, and next action. Comparisons are explicitly scoped to compatible runs and change leader when the ranking objective changes. Strategy detail follows rules, signals, closed book, open book, and final portfolio outcome.
