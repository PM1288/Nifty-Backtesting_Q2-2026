# RELIANCE acceptance evidence

Final acceptance run: `91992dfe-b09b-4c65-b409-d0a2c13fbece`, executed 2026-08-07.

- Requested range: 2023-08-06 through 2026-08-05.
- Decisions: 718; enterable/accepted paths: 1.
- Existing ladder invariant: PASS.
- Reward rungs: I030, I050, I070, S100, S200 and S500 all observed.
- Actual execution: closed at `TARGET_INTRADAY_0_3` on 2024-01-25.
- H30: 30 checkpoints, indices 0..29, `MATURE_H30_COMPLETE`.
- H30 maximum official close: D+27 on 2024-03-04.
- H30 after-tax-reserve opportunity: 7.81652939%.
- Intraday chart evidence: 1.498614% maximum net opportunity after the
  configured round-trip cost proxy.

This proves the H30 path continued for 27 more eligible sessions after the
actual I030 sale. It therefore did not implement an early H30 exit or change
the execution contract. Both matplotlib charts were visually inspected; PNG,
SVG and source CSV were produced. CSV, Parquet, Excel, Markdown, JSON and all
normalized PostgreSQL rows were reconciled.

Ranking is correctly `PROVISIONAL_BLOCKED` with a diagnostic score of 22.0756.
The blockers include the 100-entry gate, one-stock/month concentration,
one-year diversity, non-certified cost profile, sector proxy and corporate-
action heuristic. None should be bypassed based on this smoke test.

Validation totals: all 69 Python tests passed; API and web TypeScript checks and
production builds passed; the live API and both mounted chart endpoints passed.
The broader API suite passed 56/57. Its one failure is the pre-existing
`analyticsEventContext` fixture, which uses April 2026 events and now expects
them to remain "upcoming" in August 2026. It is unrelated to H30 and was not
masked by changing production code or weakening the assertion.
