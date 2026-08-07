# H30 V3 maximum-close opportunity evaluation

This module extends the immutable D0/D+5 full-path ladder with a separate
30-session hindsight observation. It answers: after an accepted entry, what
was the highest official daily close in D0 through D+29, how long did it take,
and what adverse path occurred before and during that opportunity?

It does **not** answer what the execution engine sold at. Execution remains the
shared `COMMON-TARGET-ONLY-0.3-1.0-V1` contract. The H30 evaluator has no exit
argument, never releases capital, never stops at a target, and is labelled
`HYPOTHETICAL_MAX_CLOSE_OPPORTUNITY_NOT_REALISED_PNL` in every observation.

Start here, then read:

- `01_CONTRACT_AND_DECISIONS.md` for calculation semantics.
- `02_IMPLEMENTATION_MAP.md` for code, database, files and dashboard routes.
- `03_OPERATOR_RUNBOOK.md` for exact commands.
- `04_ACCEPTANCE_EVIDENCE.md` for the completed RELIANCE proof.

Source specification reviewed from `/home/novius2/NIFTY50/new30dayevval`:
both Markdown prompts, three JSON contracts, the DOCX context and every file
inside the V3 ZIP/reference test package. The duplicate Markdown files are
byte-identical. The V2 DOCX is inherited context; V3's JSON policy and corrected
contract control the extension where they differ.
