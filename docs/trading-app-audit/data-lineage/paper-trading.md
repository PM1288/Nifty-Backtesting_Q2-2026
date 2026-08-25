# Paper Trading lineage

`/paper-trading` → `PaperTradingCommandCenter.tsx` → direct authenticated fetch
of `GET /v1/workspace/paper-trading` → `workspace.ts` → sequential bounded
queries across `paper_trading.*`, current marks, OIIS entry evidence, F&O lot
metadata and trade-quality policy → projection/scenario helpers → workbench
KPIs, parallel plot, target/horizon table, reward/pain, simulations and audit
inspector.

Mutations use separate POST/PATCH endpoints with session, CSRF, role and
validation checks. The UI workbench does not place live broker orders.

Actual/booked, open actual, observed, hypothetical and simulated values remain
separate accounting classes. Their exact endpoint observations are listed in
`../pages/paper-trading.md`.
