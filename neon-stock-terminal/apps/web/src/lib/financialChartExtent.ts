export function candlestickAxisValues(value: unknown, axis: "x" | "y"): number[] | null {
  if (!Array.isArray(value)) return null;
  if (axis === "y") {
    return [value[2], value[3]].filter(
      (entry): entry is number => typeof entry === "number" && Number.isFinite(entry),
    );
  }
  const category = value[0];
  return typeof category === "number" && Number.isFinite(category) ? [category] : [];
}
