// One store for the whole app: the latest snapshot, which vehicle each screen is looking
// at, and a `send` for every action. Screens never talk to the worker or the API directly.
import { create } from 'zustand';
import type { Command, CommandResult, Snapshot } from '@voltify/shared';
import { safeStorage, STORAGE_KEYS } from '@/lib/safeStorage';
import { ApiSource, BrowserSource, type DataSource, type SourceStatus } from './sources';

export interface ApiConfig {
  url: string;
  key: string;
}

/** API connection, in order of precedence: ?api=...&key=... in the URL, the last one saved, then the build's env. */
export function initialApiConfig(): ApiConfig | null {
  const q = new URLSearchParams(window.location.search);
  const fromQuery = q.get('api');
  if (fromQuery) {
    const cfg = { url: fromQuery.replace(/\/$/, ''), key: q.get('key') ?? 'demo-key' };
    safeStorage.set(STORAGE_KEYS.api, JSON.stringify(cfg));
    return cfg;
  }
  const saved = safeStorage.get(STORAGE_KEYS.api);
  if (saved) {
    try {
      const cfg = JSON.parse(saved) as ApiConfig;
      if (cfg.url) return cfg;
    } catch {
      /* ignore a broken entry */
    }
  }
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  return envUrl ? { url: envUrl.replace(/\/$/, ''), key: (import.meta.env.VITE_API_KEY as string | undefined) ?? 'demo-key' } : null;
}

interface AppState {
  snapshot: Snapshot | null;
  status: SourceStatus;
  statusDetail: string | null;
  source: DataSource | null;
  api: ApiConfig | null;
  driverId: string;
  detailId: string | null;
  connect(api: ApiConfig | null): void;
  setDriver(id: string): void;
  setDetail(id: string | null): void;
  send(cmd: Command): Promise<CommandResult>;
}

export const useApp = create<AppState>((set, get) => ({
  snapshot: null,
  status: 'connecting',
  statusDetail: null,
  source: null,
  api: null,
  driverId: safeStorage.get(STORAGE_KEYS.driver) ?? 'V-001',
  detailId: null,

  connect(api) {
    get().source?.stop();
    safeStorage.set(STORAGE_KEYS.api, api ? JSON.stringify(api) : null);
    const source: DataSource = api ? new ApiSource(api.url, api.key) : new BrowserSource();
    set({ source, api, snapshot: null, status: 'connecting', statusDetail: null });
    source.start(
      (snapshot) => set({ snapshot }),
      (status, statusDetail) => set({ status, statusDetail: statusDetail ?? null }),
    );
    source.setFocus({ driverId: get().driverId, detailId: get().detailId });
  },

  setDriver(id) {
    safeStorage.set(STORAGE_KEYS.driver, id);
    set({ driverId: id });
    get().source?.setFocus({ driverId: id, detailId: get().detailId });
  },

  setDetail(id) {
    set({ detailId: id });
    get().source?.setFocus({ driverId: get().driverId, detailId: id });
  },

  send(cmd) {
    const source = get().source;
    return source ? source.send(cmd) : Promise.resolve({ ok: false, error: 'not connected' });
  },
}));
