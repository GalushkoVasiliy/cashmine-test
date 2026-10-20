import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, qk } from '../api/endpoints';
import { parseBalance, totals } from '../money/balances';
import { tokenFingerprint, useIntents } from './intents';
import { applyOverlay } from './overlay';

/** Balances snapshot (auto-refresh ~15s) with the local claim overlay applied. */
export function useBalances(token: string) {
  const q = useQuery({
    queryKey: qk.balances(token),
    queryFn: () => api.balances(token),
    refetchInterval: 15_000,
  });
  const intents = useIntents(tokenFingerprint(token));

  const parsed = useMemo(() => {
    if (!q.data) return null;
    try {
      const items = applyOverlay(q.data.items.map(parseBalance), q.data.asOf, intents);
      return { ok: true as const, items, totals: totals(items) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : 'Bad data' };
    }
  }, [q.data, intents]);

  return { q, parsed, intents };
}
