# Open Issues and Explicit Limitations

Date: 2026-08-23

1. Point-in-time NIFTY/F&O membership is unavailable for the full research period. Current membership is applied retrospectively and introduces survivorship bias.
2. Rolling evidence advances only through the latest successfully ingested daily session. It intentionally does not substitute a live intraday mark.
3. The repository lint gate currently fails with 64 errors and 26 warnings in pre-existing API files, primarily legacy `any` and unused-symbol rules. Unit, type, build and E2E gates pass, but lint is not accepted.
4. Clean dependency audit reports 17 existing vulnerabilities: 13 moderate, 3 high and 1 critical. No automatic force upgrade was applied because that could change runtime behaviour; dependency remediation requires a dedicated compatibility pass.
5. Existing container/deployment configuration contains reusable credentials or secret-like configuration in environment/config exports. Values are intentionally omitted here. Rotate genuine exposed credentials through the authorised operational process and migrate remaining reusable values to Docker secrets or the approved secret store.
6. The temporary `/strategy/rolling-monthly/legacy` rollback route should be removed only after user acceptance of both new workspaces.

No live broker order was placed, no Paper Trading endpoint was connected to these research pages, and no production record was deleted.
