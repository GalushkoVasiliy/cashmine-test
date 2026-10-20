import { getJson, request } from './client';
import type { ActivityResponse, BalancesResponse, Claim, ClaimBody, ClaimOptions } from './types';

export const api = {
  balances: (token: string) => getJson<BalancesResponse>(token, '/v1/balances'),
  activity: (token: string, cursor: string | null, limit = 20) =>
    getJson<ActivityResponse>(
      token,
      `/v1/activity?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  claimOptions: (token: string, asset: string) =>
    getJson<ClaimOptions>(token, `/v1/claim-options?asset=${encodeURIComponent(asset)}`),
  claim: (token: string, id: string) => getJson<Claim>(token, `/v1/claims/${encodeURIComponent(id)}`),
  /** One attempt; the retry policy for writes lives with the claim flow (idempotency). */
  createClaim: async (token: string, body: ClaimBody, idempotencyKey: string) => {
    const r = await request<Claim>(token, '/v1/claims', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    return { claim: r.data, replayed: r.headers.get('Idempotent-Replayed') === 'true' };
  },
};

export const qk = {
  balances: (token: string) => ['balances', token] as const,
  activity: (token: string) => ['activity', token] as const,
  claimOptions: (token: string, asset: string) => ['claimOptions', token, asset] as const,
  claim: (token: string, id: string) => ['claim', token, id] as const,
};
