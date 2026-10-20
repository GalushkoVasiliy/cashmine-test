import { API_BASE_URL } from './config';
import { ApiError, errorFromResponse, isAbort, networkError } from './errors';

let onUnauthorized: ((rejectedToken: string) => void) | null = null;
/**
 * The token provider registers this so a 401 sends the user back to the token
 * screen. It gets the token that was rejected, so a late 401 from an old token
 * cannot log out a newer one.
 */
export function setUnauthorizedHandler(fn: ((rejectedToken: string) => void) | null) {
  onUnauthorized = fn;
}

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type RawResponse<T> = { data: T; status: number; headers: Headers };

/** A single attempt. Throws ApiError (classified) on any failure. */
export async function request<T>(token: string, path: string, opts: RequestOptions = {}): Promise<RawResponse<T>> {
  const method = opts.method ?? 'GET';
  let res: Response;
  try {
    res = await fetch(API_BASE_URL + path, {
      method,
      signal: opts.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw networkError(method, e);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch (e) {
    if (isAbort(e)) throw e;
    // A 2xx with an unreadable body: for a write we cannot tell what happened.
    if (res.ok) throw new ApiError(method === 'GET' ? 'retryable' : 'unknown', res.status, 'BAD_BODY', 'Unreadable response');
  }
  if (!res.ok) {
    const err = errorFromResponse(res.status, method, json, res.headers.get('Retry-After'));
    if (err.kind === 'unauthorized') onUnauthorized?.(token);
    throw err;
  }
  return { data: json as T, status: res.status, headers: res.headers };
}

export const RETRY = { attempts: 4, baseMs: 400, capMs: 8000 };

/** Exponential backoff with full jitter. */
export function backoffMs(attempt: number, random = Math.random): number {
  const exp = Math.min(RETRY.capMs, RETRY.baseMs * 2 ** attempt);
  return Math.round(random() * exp);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError() {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

/** How long to wait before the next attempt, or null to give up. */
export function retryDelay(err: unknown, attempt: number): number | null {
  if (!(err instanceof ApiError)) return null;
  if (attempt >= RETRY.attempts - 1) return null;
  if (err.kind === 'rateLimited') return (err.retryAfterMs ?? backoffMs(attempt)) + backoffMs(0);
  if (err.kind === 'retryable') return backoffMs(attempt);
  return null;
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * GET with retries (backoff + jitter, honours 429 retryAfterMs) and dedup of
 * identical in-flight requests for the same token.
 * The dedup is shared, so it does not take a per-caller AbortSignal; TanStack
 * Query ignores the result of a cancelled query anyway.
 */
export function getJson<T>(token: string, path: string): Promise<T> {
  const key = `${token}\n${path}`;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return (await request<T>(token, path)).data;
      } catch (e) {
        const delay = retryDelay(e, attempt);
        if (delay === null) throw e;
        await sleep(delay);
      }
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

export function clearInFlight() {
  inFlight.clear();
}
