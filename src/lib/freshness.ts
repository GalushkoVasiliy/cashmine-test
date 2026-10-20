/** Snapshots are recomputed every 15s; older than this means something is off. */
export const STALE_AFTER_MS = 45_000;

/**
 * Age of a snapshot. A server clock ahead of ours would give a negative age;
 * clamp it to 0 instead of showing "updated in -3s".
 */
export function snapshotAgeMs(asOf: string, now: number): number {
  const t = Date.parse(asOf);
  if (Number.isNaN(t)) return Infinity;
  return Math.max(0, now - t);
}

export function freshnessLabel(ageMs: number): string {
  if (!Number.isFinite(ageMs)) return 'update time unknown';
  const s = Math.floor(ageMs / 1000);
  if (s < 5) return 'updated just now';
  if (s < 60) return `updated ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `updated ${m}m ago`;
  return `updated ${Math.floor(m / 60)}h ago`;
}

export function isStale(ageMs: number): boolean {
  return ageMs > STALE_AFTER_MS;
}
