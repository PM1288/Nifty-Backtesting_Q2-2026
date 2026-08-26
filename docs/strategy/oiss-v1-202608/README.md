# OISS v1.202608

Independent strategy identity: `OISS_V1_202608`. Framework `OISS-1.202608`, formula `FORMULA-OISS-1.202608.0`, configuration `RISK-OISS-1.202608.0`.

OISS reuses immutable OIIS point-in-time feature snapshots but applies its own data-quality floor, extension policy, TQS, canonical statuses, carry horizons, explanations, persistence, history and UI. It never renames or overwrites OIIS.

- Dashboard: `/n50/strategy/oiss-v1-202608`
- API: `/n50/v1/oiss-v1/dashboard`, `/runs`, `/export`
- Engine: `services/oiss_v1/src/oiss_v1/`
- Config: `services/oiss_v1/config/oiss-v1-202608.yaml`
- Schema: `db/sql/055_oiss_v1_202608.sql`
- Modes at initial rollout: intelligence on; scheduler, paper, assisted and live-candidate off.

See the linked documents in this directory for data lineage, formulas, operation, validation and limitations.

For the dated handoff snapshot, working/not-working matrix, available source coverage and CSV inventory, read `OISS_CURRENT_STATE_AND_LIMITATIONS_2026-08-26.md`.
