import { backoffMs, sleep } from '../api/client';
import { api } from '../api/endpoints';
import { ApiError, isAbort } from '../api/errors';
import { intentStore } from './intents';

const UNKNOWN_MAX_DELAY_MS = 10_000;

type Deps = { createClaim: typeof api.createClaim; sleep: typeof sleep };

/**
 * Drive one saved intent to a definite outcome. Always sends the SAME key and
 * body, so repeats are safe (same key + same body returns the original claim).
 * - 2xx       -> created
 * - 400/404/409 -> rejected (409 means we changed the body under a key: a bug)
 * - 401       -> stop; the token gate takes over
 * - 429       -> wait retryAfterMs, resend
 * - 5xx/504/network -> state "unknown", back off, resend; never "failed"
 * Runs until done or aborted (screen left); resumes from storage on next visit.
 */
export async function driveIntent(token: string, key: string, signal: AbortSignal, deps: Deps = { createClaim: api.createClaim, sleep }) {
  for (let attempt = 0; ; attempt++) {
    const intent = intentStore.get(key);
    if (!intent || intent.state === 'created' || intent.state === 'rejected') return;
    try {
      const { claim } = await deps.createClaim(token, intent.body, intent.key);
      intentStore.update(key, { state: 'created', claim, error: undefined });
      return;
    } catch (e) {
      if (!(e instanceof ApiError)) {
        // Unexpected client-side failure: we cannot know if the request left. Treat as unknown.
        intentStore.update(key, { state: 'unknown' });
        if (signal.aborted || isAbort(e)) return;
        await deps.sleep(Math.min(UNKNOWN_MAX_DELAY_MS, backoffMs(attempt) + 500), signal).catch(() => {});
        continue;
      }
      switch (e.kind) {
        case 'definite':
          intentStore.update(key, { state: 'rejected', error: { code: e.code, message: e.message, field: e.field } });
          return;
        case 'unauthorized':
          return;
        case 'rateLimited':
          if (signal.aborted) return;
          await deps.sleep((e.retryAfterMs ?? 1000) + backoffMs(0), signal).catch(() => {});
          break;
        default:
          intentStore.update(key, { state: 'unknown' });
          if (signal.aborted) return;
          await deps.sleep(Math.min(UNKNOWN_MAX_DELAY_MS, 500 + backoffMs(attempt)), signal).catch(() => {});
      }
      if (signal.aborted) return;
    }
  }
}
