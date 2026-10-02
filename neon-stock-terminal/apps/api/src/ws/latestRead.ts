// One bounded latest-value cache per stream server, shared by tabs/components.
// Failed reads are never cached; callers retain the original source timestamps.
export function latestRead<T>(load: () => Promise<T>, ttlMs: number) {
  let value: T;
  let expiresAt = 0;
  let pending: Promise<T> | undefined;
  return (): Promise<T> => {
    if (Date.now() < expiresAt) return Promise.resolve(value);
    if (!pending) {
      pending = Promise.resolve().then(load).then((next) => {
        value = next;
        expiresAt = Date.now() + ttlMs;
        return next;
      }).finally(() => { pending = undefined; });
    }
    return pending;
  };
}
