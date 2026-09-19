// D02: a newer history response cannot change the selected section's session.
export function regimeHistoryThrough<T extends { tradeDate: string }>(rows: T[], session: string): T[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session)) return [];
  return rows.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.tradeDate) && row.tradeDate <= session)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate)).slice(-10);
}
