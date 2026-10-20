import { queryOptions } from '@tanstack/react-query';
import { api, qk } from '../api/endpoints';

/** Poll fast at first (claims settle in ~20s), then back off. 429s are handled by the client. */
export function pollInterval(polls: number): number {
  return polls < 10 ? 2000 : 5000;
}

/**
 * One definition shared by the background runner and the status screen, so
 * both observe the same query (one request stream, not two).
 */
export function claimPollQuery(token: string, claimId: string) {
  return queryOptions({
    queryKey: qk.claim(token, claimId),
    queryFn: () => api.claim(token, claimId),
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      if (st && st !== 'pending') return false;
      return pollInterval(query.state.dataUpdateCount);
    },
  });
}
