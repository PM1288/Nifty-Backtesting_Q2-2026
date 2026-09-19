/** Keep census and rows atomic while a newer read is being assembled. */
export function retainCompletePaperSnapshot<T extends Record<string, unknown>>(previous: T | null, bootstrap: T): T {
  return previous && previous.detailState !== 'LOADING' && Array.isArray(previous.stockTrades) ? previous : bootstrap;
}
