// localStorage can throw or be empty (private mode, blocked site data), so every
// access is wrapped and the app must work without it.
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      /* not remembered, that is all */
    }
  },
};

export const STORAGE_KEYS = {
  theme: 'voltify.theme',
  lang: 'voltify.lang',
  api: 'voltify.mvp.api',
  driver: 'voltify.mvp.driver',
} as const;
