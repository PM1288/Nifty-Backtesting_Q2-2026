type Row = Record<string, unknown>;

/** Additive evidence warnings; stored outcomes and accounting remain unchanged. */
export function paperEvidenceAudit(row: Row) {
  const issues: string[] = [];
  const invalidPrice = ["average_entry_price", "highest_price", "lowest_price", "last_mark"]
    .some((key) => row[key] != null && (!Number.isFinite(Number(row[key])) || Number(row[key]) <= 0));
  if (invalidPrice) issues.push("INVALID_PRICE_EVIDENCE");
  const horizons = Array.isArray(row.horizons) ? row.horizons as Row[] : [];
  if (horizons.some((horizon) => horizon.status === "COMPLETED")) {
    // Existing completed records do not establish qualified exchange-session
    // coverage or a horizon-closing bar. Never certify them from a counter alone.
    issues.push("LEGACY_HORIZON_REQUIRES_SESSION_RECONCILIATION");
  }
  if (Number(row.remaining_quantity) > 0 && row.observation_status === "THIRTY_SESSION_COMPLETE") {
    issues.push("OPEN_AFTER_OBSERVATION_WINDOW");
  }
  return {
    status: invalidPrice ? "DATA_INVALID" : issues.length ? "UNVERIFIED" : "NOT_AUDITED",
    issues,
    targetTouchIsExecution: false,
    historicalOutcomesRewritten: false,
  };
}
