// localStorage can be missing or throw (private mode, blocked storage); never crash on it.
export const storage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {}
  },
  remove(key: string) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {}
  },
};
