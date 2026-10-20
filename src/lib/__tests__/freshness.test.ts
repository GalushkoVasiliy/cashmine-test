import { freshnessLabel, isStale, snapshotAgeMs } from '../freshness';

describe('freshness', () => {
  const now = Date.parse('2026-10-20T20:00:30Z');
  it('computes age and clamps clock skew', () => {
    expect(snapshotAgeMs('2026-10-20T20:00:00Z', now)).toBe(30_000);
    expect(snapshotAgeMs('2026-10-20T20:00:40Z', now)).toBe(0);
    expect(snapshotAgeMs('garbage', now)).toBe(Infinity);
  });
  it('labels and flags stale', () => {
    expect(freshnessLabel(0)).toBe('updated just now');
    expect(freshnessLabel(12_000)).toBe('updated 12s ago');
    expect(freshnessLabel(125_000)).toBe('updated 2m ago');
    expect(isStale(30_000)).toBe(false);
    expect(isStale(60_000)).toBe(true);
    expect(isStale(Infinity)).toBe(true);
  });
});
