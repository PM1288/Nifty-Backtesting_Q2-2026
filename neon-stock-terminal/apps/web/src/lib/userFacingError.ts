/** Translate read failures at the presentation boundary; never render server diagnostics. */
export function userFacingError(error: unknown, fallback = "We couldn’t load this data. Try again."): string {
  const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You don’t have access to this data.";
  return fallback;
}
