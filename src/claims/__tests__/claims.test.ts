import { ApiError } from '../../api/errors';
import type { Claim } from '../../api/types';
import { parseBalance } from '../../money/balances';
import { ClaimIntent, intentStore, newIdempotencyKey } from '../intents';
import { applyOverlay } from '../overlay';
import { driveIntent } from '../submit';

const body = { asset: 'BTC', amount: '0.1', destinationId: 'd1' };
const claim: Claim = {
  id: 'c1',
  asset: 'BTC',
  amount: '0.1',
  fee: '0.0005',
  receiveAmount: '0.0995',
  destinationId: 'd1',
  status: 'pending',
  failureReason: null,
  createdAt: '2026-10-20T20:00:10Z',
  updatedAt: '2026-10-20T20:00:10Z',
};

function intent(over: Partial<ClaimIntent> = {}): ClaimIntent {
  return { key: 'k1', owner: 'o', body, decimals: 8, createdAtLocal: 1, state: 'sending', ...over };
}

const noSleep = () => Promise.resolve();

describe('driveIntent', () => {
  beforeEach(() => intentStore._reset());

  it('resends the same key and body through unknown outcomes until created', async () => {
    intentStore.add(intent());
    const createClaim = jest
      .fn()
      .mockRejectedValueOnce(new ApiError('unknown', 504, 'TIMEOUT', 'timeout'))
      .mockRejectedValueOnce(new ApiError('unknown', null, 'NETWORK', 'offline'))
      .mockRejectedValueOnce(new ApiError('rateLimited', 429, 'RATE_LIMITED', 'slow', undefined, 10))
      .mockResolvedValueOnce({ claim, replayed: true });
    await driveIntent('tok', 'k1', new AbortController().signal, { createClaim, sleep: noSleep });
    expect(createClaim).toHaveBeenCalledTimes(4);
    for (const call of createClaim.mock.calls) {
      expect(call).toEqual(['tok', body, 'k1']);
    }
    expect(intentStore.get('k1')).toMatchObject({ state: 'created', claim: { id: 'c1' } });
  });

  it('marks unknown (never failed) while the outcome is not known', async () => {
    intentStore.add(intent());
    const ac = new AbortController();
    const createClaim = jest.fn().mockImplementation(() => {
      ac.abort();
      return Promise.reject(new ApiError('unknown', 500, 'SERVER', 'oops'));
    });
    await driveIntent('tok', 'k1', ac.signal, { createClaim, sleep: noSleep });
    expect(intentStore.get('k1')?.state).toBe('unknown');
  });

  it('stops on a definite rejection and keeps the error', async () => {
    intentStore.add(intent());
    const createClaim = jest.fn().mockRejectedValue(new ApiError('definite', 400, 'VALIDATION', 'too much', 'amount'));
    await driveIntent('tok', 'k1', new AbortController().signal, { createClaim, sleep: noSleep });
    expect(createClaim).toHaveBeenCalledTimes(1);
    expect(intentStore.get('k1')).toMatchObject({ state: 'rejected', error: { code: 'VALIDATION', field: 'amount' } });
  });

  it('does nothing for an already created intent', async () => {
    intentStore.add(intent({ state: 'created', claim }));
    const createClaim = jest.fn();
    await driveIntent('tok', 'k1', new AbortController().signal, { createClaim, sleep: noSleep });
    expect(createClaim).not.toHaveBeenCalled();
  });

  it('persists intents so a reload can resume', () => {
    intentStore.add(intent({ state: 'unknown' }));
    const saved = JSON.parse(globalThis.localStorage.getItem('cashmine.claimIntents.v1')!);
    expect(saved[0]).toMatchObject({ key: 'k1', body, state: 'unknown' });
  });

  it('makes distinct UUID keys', () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});

describe('applyClaimUpdate', () => {
  beforeEach(() => intentStore._reset());

  it('reports settled once when a pending claim completes, then unchanged', () => {
    intentStore.add(intent({ state: 'created', claim }));
    const done = { ...claim, status: 'completed' as const, updatedAt: '2026-10-20T20:00:30Z' };
    expect(intentStore.applyClaimUpdate('k1', done)).toBe('settled');
    expect(intentStore.get('k1')?.claim?.status).toBe('completed');
    expect(intentStore.applyClaimUpdate('k1', done)).toBe('unchanged');
  });

  it('ignores a claim with a different id or an unknown key', () => {
    intentStore.add(intent({ state: 'created', claim }));
    expect(intentStore.applyClaimUpdate('k1', { ...claim, id: 'other', status: 'failed' })).toBe('unchanged');
    expect(intentStore.applyClaimUpdate('nope', claim)).toBe('unchanged');
    expect(intentStore.get('k1')?.claim?.status).toBe('pending');
  });
});

describe('applyOverlay', () => {
  const btc = parseBalance({ asset: 'BTC', decimals: 8, available: '1', pending: '0', claiming: '0', usdPrice: '100' });

  it('moves a fresh claim from available to claiming until the snapshot catches up', () => {
    const [b] = applyOverlay([btc], '2026-10-20T20:00:00Z', [intent({ state: 'created', claim })]);
    expect(b.available).toBe(90000000n);
    expect(b.claiming).toBe(10000000n);
    expect(b.updating).toBe(true);
  });

  it('trusts a snapshot taken at or after the claim', () => {
    const [b] = applyOverlay([btc], '2026-10-20T20:00:10Z', [intent({ state: 'created', claim })]);
    expect(b.available).toBe(100000000n);
    expect(b.updating).toBe(false);
  });

  it('ignores failed and rejected claims, counts unresolved ones', () => {
    const failed = intent({ key: 'a', state: 'created', claim: { ...claim, status: 'failed' } });
    const rejected = intent({ key: 'b', state: 'rejected' });
    const unknown = intent({ key: 'c', state: 'unknown' });
    const [b] = applyOverlay([btc], '2026-10-20T20:00:00Z', [failed, rejected, unknown]);
    expect(b.available).toBe(90000000n);
  });

  it('never goes below zero', () => {
    const big = intent({ state: 'unknown', body: { ...body, amount: '5' } });
    const [b] = applyOverlay([btc], '2026-10-20T20:00:00Z', [big]);
    expect(b.available).toBe(0n);
    expect(b.claiming).toBe(100000000n);
  });
});
