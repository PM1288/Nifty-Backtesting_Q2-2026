export function isPaperExecutionClosed(remainingQuantity: unknown) {
  const parsed = Number(remainingQuantity);
  return Number.isFinite(parsed) && parsed <= 0;
}
