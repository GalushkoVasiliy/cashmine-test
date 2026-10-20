import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { qk } from '../api/endpoints';
import { isUnresolved, tokenFingerprint, useIntents } from './intents';
import { driveIntent } from './submit';

const running = new Map<string, AbortController>();

/**
 * Mounted once behind the token gate. Any unresolved intent for this token
 * (including ones restored after a reload) is driven to a definite outcome,
 * exactly once at a time per key.
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
