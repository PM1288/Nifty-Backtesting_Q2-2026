# NIFTY 50 Trader UI/UX standardisation V4

This folder is the implementation control surface for the 23 August 2026 `UX-rehaul-v2` handover.

## Authority and boundaries

- Source handover: `/home/novius2/NIFTY50/UX-rehaul-v2`
- Versioned application: `/home/novius2/NIFTY50/Nifty-Backtesting_Q2-2026`
- Live integration tree: `/home/novius2/trading-stack`
- UI-only programme: strategy, accounting, target, market-data, API and stored-value semantics remain authoritative and unchanged.
- Existing routes and aliases remain compatible until parity and redirect evidence is accepted.
- Every current field remains available in a contextual view or Full Audit.

## Phase A evidence

- [Route and visual preservation manifest](route-visual-preservation-manifest.json)
- [Field preservation manifest](field-preservation-manifest.json)
- [Duplication and consolidation baseline](duplication-and-consolidation-baseline.json)
- [Open-source licence manifest](open-source-licence-manifest.md)
- [Critical review and implementation plan](implementation-plan.md)
- [Implementation report and rollback](implementation-report-2026-08-23.md)
- Existing 386-screen baseline: `docs/trading-app-audit/screenshots/`
- Existing runtime baseline: `docs/trading-app-audit/evidence/runtime-audit.json`

Regenerate the machine-readable gates from repository root:

```bash
node scripts/uiux/generate_phase_a_evidence.mjs
```

## Handover integrity finding

The supplied ZIP validates successfully and its loose files match the packaged copies. The advertised XLSX implementation backlog and visual-blueprint contact-sheet image are absent from both the supplied folder and ZIP. The CSV backlog is authoritative for implementation tracking; the omission does not permit fabricated replacements.
