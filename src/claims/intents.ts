import { useSyncExternalStore } from 'react';
import type { Claim, ClaimBody } from '../api/types';
import { storage } from '../lib/storage';

/**
 * A claim the user confirmed. Saved (with its Idempotency-Key and exact body)
 * BEFORE the first POST, so a reload or a lost response can resend the same
 * key + body and get the original claim back instead of a duplicate.
 *
 * state:
 *  - sending:  POST in flight, no answer yet
 *  - unknown:  POST got 5xx/504/network; outcome unknown, we keep resending
 *  - created:  server returned the claim (201 or idempotent replay)
 *  - rejected: definite 4xx; nothing was created
 */
export type IntentState = 'sending' | 'unknown' | 'created' | 'rejected';

export type ClaimIntent = {
  key: string;
  owner: string; // fingerprint of the token that made it (never the token itself)
  body: ClaimBody;
  decimals: number;
  createdAtLocal: number;
  state: IntentState;
  claim?: Claim;
  error?: { code: string; message: string; field?: string };
};

const STORE_KEY = 'cashmine.claimIntents.v1';

/** FNV-1a; just enough to keep different tokens' intents apart without storing the token. */
export function tokenFingerprint(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function load(): ClaimIntent[] {
  const raw = storage.get(STORE_KEY);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

let intents: ClaimIntent[] = load();
const listeners = new Set<() => void>();

function commit(next: ClaimIntent[]) {
  // Keep the list bounded: drop old finished intents, never unresolved ones.
  const unresolved = next.filter((i) => i.state === 'sending' || i.state === 'unknown');
  const done = next.filter((i) => !(i.state === 'sending' || i.state === 'unknown')).slice(-30);
  intents = [...done, ...unresolved].sort((a, b) => a.createdAtLocal - b.createdAtLocal);
  storage.set(STORE_KEY, JSON.stringify(intents));
  listeners.forEach((l) => l());
}

export const intentStore = {
  all: () => intents,
  get: (key: string) => intents.find((i) => i.key === key),
  add(i: ClaimIntent) {
    commit([...intents, i]);
  },
  update(key: string, patch: Partial<ClaimIntent>) {
    commit(intents.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** test helper */
  _reset() {
    intents = [];
    storage.remove(STORE_KEY);
  },
};

export function useIntents(owner: string): ClaimIntent[] {
  const all = useSyncExternalStore(intentStore.subscribe, intentStore.all, intentStore.all);
  return all.filter((i) => i.owner === owner);
}

export function isUnresolved(i: ClaimIntent) {
  return i.state === 'sending' || i.state === 'unknown';
}

export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for old browsers: RFC4122 v4 from getRandomValues.
  const b = new Uint8Array(16);
  c!.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
