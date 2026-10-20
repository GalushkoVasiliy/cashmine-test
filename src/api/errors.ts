/**
 * How the caller should treat a failure.
 * - definite:     the server processed and rejected the request (400/404/409). Do not retry.
 * - unauthorized: 401, token is bad. Go back to the token screen.
 * - rateLimited:  429, not processed. Retry after `retryAfterMs`.
 * - retryable:    a read failed in a way that is safe to repeat (5xx, 504, network).
 * - unknown:      a write may or may not have happened (500/503/504/network on POST).
 *                 Never show "failed"; re-check with the same Idempotency-Key.
 */
export type ErrorKind = 'definite' | 'unauthorized' | 'rateLimited' | 'retryable' | 'unknown';

export class ApiError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly status: number | null,
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ErrorBody = { error?: { code?: string; message?: string; field?: string; retryAfterMs?: number } };

export function classifyStatus(status: number, method: string): ErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'rateLimited';
  if (status >= 400 && status < 500) return 'definite';
  // 5xx: a read is safe to repeat; a write's outcome is unknown.
  return method === 'GET' ? 'retryable' : 'unknown';
}

export function retryAfterFrom(body: ErrorBody | null, header: string | null): number | undefined {
  const ms = body?.error?.retryAfterMs;
  if (typeof ms === 'number' && ms >= 0) return ms;
  if (header) {
    const s = Number(header);
    if (Number.isFinite(s) && s >= 0) return s * 1000;
  }
  return undefined;
}

export function errorFromResponse(status: number, method: string, body: unknown, retryAfterHeader: string | null): ApiError {
  const b = (body && typeof body === 'object' ? body : null) as ErrorBody | null;
  const e = b?.error;
  return new ApiError(
    classifyStatus(status, method),
    status,
    e?.code ?? `HTTP_${status}`,
    e?.message ?? `Request failed (${status})`,
    e?.field,
    status === 429 ? retryAfterFrom(b, retryAfterHeader) : undefined,
  );
}

export function networkError(method: string, cause: unknown): ApiError {
  const msg = cause instanceof Error ? cause.message : 'Network error';
  return new ApiError(method === 'GET' ? 'retryable' : 'unknown', null, 'NETWORK', msg);
}

export function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}
