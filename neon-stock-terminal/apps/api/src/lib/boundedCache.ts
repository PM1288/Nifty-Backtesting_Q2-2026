/** Small process-local cache. Expiration and capacity are enforced on writes. */
export class BoundedCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Invalid cache capacity");
  }
  get size() { return this.entries.size; }
  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) { this.entries.delete(key); return undefined; }
    return entry.value;
  }
  set(key: string, value: T, expiresAt: number, now = Date.now()): void {
    for (const [existingKey, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(existingKey);
    this.entries.delete(key);
    if (expiresAt <= now) return;
    while (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { value, expiresAt });
  }
}
