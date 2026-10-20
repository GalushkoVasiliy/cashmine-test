import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { clearInFlight, setUnauthorizedHandler } from '../api/client';
import { storage } from './storage';

const TOKEN_KEY = 'cashmine.token';

type TokenCtx = {
  token: string | null;
  setToken: (t: string) => void;
  clearToken: (reason?: string) => void;
  /** Why we are back on the token screen (e.g. a 401). */
  reason: string | null;
};

const Ctx = createContext<TokenCtx | null>(null);

export function TokenProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setTokenState] = useState<string | null>(() => storage.get(TOKEN_KEY));
  const [reason, setReason] = useState<string | null>(null);

  // Everything cached belongs to the old token: cancel it and drop it.
  const reset = useCallback(() => {
    qc.cancelQueries();
    qc.clear();
    clearInFlight();
  }, [qc]);

  const setToken = useCallback(
    (t: string) => {
      reset();
      storage.set(TOKEN_KEY, t);
      setReason(null);
      setTokenState(t);
    },
    [reset],
  );

  const clearToken = useCallback(
    (why?: string) => {
      reset();
      storage.remove(TOKEN_KEY);
      setReason(why ?? null);
      setTokenState(null);
    },
    [reset],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => clearToken('The token was rejected (401). Enter a valid token.'));
    return () => setUnauthorizedHandler(null);
  }, [clearToken]);

  return <Ctx.Provider value={{ token, setToken, clearToken, reason }}>{children}</Ctx.Provider>;
}

export function useToken() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToken outside TokenProvider');
  return c;
}

/** For screens rendered behind the token gate. */
export function useAuthedToken(): string {
  const { token } = useToken();
  if (!token) throw new Error('No token');
  return token;
}
