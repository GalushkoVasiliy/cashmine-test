import { ApiError, classifyStatus, errorFromResponse, retryAfterFrom } from '../errors';
import { getJson, retryDelay, RETRY, setUnauthorizedHandler } from '../client';

describe('classifyStatus', () => {
  it('splits definite / retryable / unknown by method', () => {
    expect(classifyStatus(400, 'POST')).toBe('definite');
    expect(classifyStatus(404, 'GET')).toBe('definite');
    expect(classifyStatus(409, 'POST')).toBe('definite');
    expect(classifyStatus(401, 'GET')).toBe('unauthorized');
    expect(classifyStatus(429, 'POST')).toBe('rateLimited');
    expect(classifyStatus(500, 'GET')).toBe('retryable');
    expect(classifyStatus(504, 'GET')).toBe('retryable');
    expect(classifyStatus(500, 'POST')).toBe('unknown');
    expect(classifyStatus(503, 'POST')).toBe('unknown');
    expect(classifyStatus(504, 'POST')).toBe('unknown');
  });
});

describe('retryAfter', () => {
  it('prefers body retryAfterMs, falls back to header seconds', () => {
    expect(retryAfterFrom({ error: { retryAfterMs: 1200 } }, '5')).toBe(1200);
    expect(retryAfterFrom(null, '2')).toBe(2000);
    expect(retryAfterFrom(null, null)).toBeUndefined();
  });
  it('is parsed from a 429 response', () => {
    const e = errorFromResponse(429, 'GET', { error: { code: 'RATE_LIMITED', message: 'slow', retryAfterMs: 700 } }, null);
    expect(e.kind).toBe('rateLimited');
    expect(e.retryAfterMs).toBe(700);
  });
});

describe('retryDelay', () => {
  it('never retries definite errors or writes with unknown outcome here', () => {
    expect(retryDelay(new ApiError('definite', 400, 'VALIDATION', 'x'), 0)).toBeNull();
    expect(retryDelay(new ApiError('unknown', 504, 'TIMEOUT', 'x'), 0)).toBeNull();
    expect(retryDelay(new ApiError('unauthorized', 401, 'UNAUTHORIZED', 'x'), 0)).toBeNull();
  });
  it('waits at least retryAfterMs on 429', () => {
    expect(retryDelay(new ApiError('rateLimited', 429, 'RATE_LIMITED', 'x', undefined, 3000), 0)).toBeGreaterThanOrEqual(3000);
  });
  it('stops after the attempt budget', () => {
    expect(retryDelay(new ApiError('retryable', 503, 'SERVER', 'x'), RETRY.attempts - 1)).toBeNull();
  });
});

describe('getJson', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    jest.useRealTimers();
  });

  // jsdom has no Response; a minimal stand-in is enough for the client.
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      headers: { get: (k: string) => headers[k] ?? null },
    });

  it('dedups identical in-flight GETs', async () => {
    const f = jest.fn(() => json(200, { ok: 1 }));
    globalThis.fetch = f as unknown as typeof fetch;
    const [a, b] = await Promise.all([getJson('t', '/v1/x'), getJson('t', '/v1/x')]);
    expect(a).toEqual({ ok: 1 });
    expect(b).toBe(a);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('does not share in-flight requests across tokens', async () => {
    const f = jest.fn(() => json(200, {}));
    globalThis.fetch = f as unknown as typeof fetch;
    await Promise.all([getJson('t1', '/v1/x'), getJson('t2', '/v1/x')]);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('retries a 503 then succeeds', async () => {
    const f = jest
      .fn()
      .mockImplementationOnce(() => json(503, { error: { code: 'SERVER', message: 'down' } }))
      .mockImplementationOnce(() => json(200, { ok: 2 }));
    globalThis.fetch = f as unknown as typeof fetch;
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await expect(getJson('t', '/v1/y')).resolves.toEqual({ ok: 2 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400', async () => {
    const f = jest.fn(() => json(400, { error: { code: 'VALIDATION', message: 'bad', field: 'asset' } }));
    globalThis.fetch = f as unknown as typeof fetch;
    await expect(getJson('t', '/v1/z')).rejects.toMatchObject({ kind: 'definite', field: 'asset' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('tells the 401 handler which token was rejected', async () => {
    globalThis.fetch = jest.fn(() => json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } })) as unknown as typeof fetch;
    const handler = jest.fn();
    setUnauthorizedHandler(handler);
    await expect(getJson('old-token', '/v1/balances')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(handler).toHaveBeenCalledWith('old-token');
    setUnauthorizedHandler(null);
  });
});
