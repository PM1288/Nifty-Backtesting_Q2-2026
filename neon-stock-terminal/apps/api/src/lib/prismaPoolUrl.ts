export function databaseUrlWithPool(databaseUrl: string, connectionLimit: number, poolTimeoutSeconds: number) {
  if (!Number.isInteger(connectionLimit) || connectionLimit < 1) throw new RangeError("connectionLimit must be a positive integer");
  if (!Number.isInteger(poolTimeoutSeconds) || poolTimeoutSeconds < 1) throw new RangeError("poolTimeoutSeconds must be a positive integer");
  const parsed = new URL(databaseUrl);
  parsed.searchParams.set("connection_limit", String(connectionLimit));
  parsed.searchParams.set("pool_timeout", String(poolTimeoutSeconds));
  return parsed.toString();
}
