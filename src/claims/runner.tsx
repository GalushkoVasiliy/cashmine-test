import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { qk } from '../api/endpoints';
import { intentStore, isUnresolved, tokenFingerprint, useIntents } from './intents';
import { claimPollQuery } from './polling';
import { driveIntent } from './submit';

const running = new Map<string, AbortController>();

/**
 * Mounted once behind the token gate. Any unresolved intent for this token
 * (including ones restored after a reload) is driven to a definite outcome,
 * exactly once at a time per key. Created claims that are still pending are
 * polled here too, so Home banners and the balance overlay settle even when
 * the status screen is not open.
 */
export function IntentRunner({ token }: { token: string }) {
  const qc = useQueryClient();
  const intents = useIntents(tokenFingerprint(token));
  const pendingKeys = intents.filter(isUnresolved).map((i) => i.key);

  useEffect(() => {
    for (const key of pendingKeys) {
      if (running.has(key)) continue;
      const ac = new AbortController();
      running.set(key, ac);
      driveIntent(token, key, ac.signal).finally(() => {
        running.delete(key);
        qc.invalidateQueries({ queryKey: qk.balances(token) });
      });
    }
  }, [pendingKeys.join(','), token, qc]);

  const polling = intents.filter((i) => i.state === 'created' && i.claim?.status === 'pending');
  const results = useQueries({ queries: polling.map((i) => claimPollQuery(token, i.claim!.id)) });
  const stamp = results.map((r) => r.dataUpdatedAt).join(',');

  useEffect(() => {
    let settled = false;
    results.forEach((r, n) => {
      const i = polling[n];
      if (r.data && i && intentStore.applyClaimUpdate(i.key, r.data) === 'settled') settled = true;
    });
    if (settled) qc.invalidateQueries({ queryKey: qk.balances(token) });
  }, [stamp]);

  // Token changed or gate unmounted: stop all drivers (they resume from storage later).
  useEffect(
    () => () => {
      running.forEach((ac) => ac.abort());
      running.clear();
    },
    [token],
  );

  return null;
}
