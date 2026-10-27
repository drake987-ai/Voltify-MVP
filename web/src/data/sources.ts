// Where the screens get their data from. Two interchangeable sources:
//  - BrowserSource: the simulator and the platform run in a Web Worker in this tab
//    (default; the static site needs no server, good for a demo anywhere);
//  - ApiSource: a running Voltify API (apps/api) over Server-Sent Events + REST,
//    which is how a partner's own app would talk to Voltify.
import { VoltifyRuntime, type Command, type CommandResult, type Snapshot } from '@voltify/shared';
import type { Focus, FromWorker, ToWorker } from './protocol';

export type SourceStatus = 'connecting' | 'live' | 'error';

export interface DataSource {
  kind: Snapshot['mode'];
  label: string;
  start(onSnapshot: (s: Snapshot) => void, onStatus: (s: SourceStatus, detail?: string) => void): void;
  setFocus(focus: Focus): void;
  send(cmd: Command): Promise<CommandResult>;
  stop(): void;
}

export class BrowserSource implements DataSource {
  kind = 'browser' as const;
  label = 'Web Worker';
  private worker: Worker | null = null;
  private fallback: VoltifyRuntime | null = null;
  private focus: Focus = { driverId: null, detailId: null };
  private pending = new Map<number, (r: CommandResult) => void>();
  private seq = 0;
  private onSnapshot: (s: Snapshot) => void = () => {};

  start(onSnapshot: (s: Snapshot) => void, onStatus: (s: SourceStatus, detail?: string) => void): void {
    this.onSnapshot = onSnapshot;
    try {
      this.worker = new Worker(new URL('./runtime.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'snapshot') onSnapshot(m.snapshot);
        else this.pending.get(m.id)?.(m.result);
      };
      this.worker.onerror = () => onStatus('error', 'worker');
      this.post({ type: 'focus', focus: this.focus });
    } catch {
      // No module workers (very old browser, some file:// setups): run on the main thread.
      this.fallback = new VoltifyRuntime({ mode: 'browser' });
      this.fallback.start(() => onSnapshot(this.fallback!.snapshot(this.focus)), 300);
    }
    onStatus('live');
  }

  private post(m: ToWorker) {
    this.worker?.postMessage(m);
  }

  setFocus(focus: Focus): void {
    this.focus = focus;
    this.post({ type: 'focus', focus });
    if (this.fallback) this.onSnapshot(this.fallback.snapshot(focus));
  }

  send(cmd: Command): Promise<CommandResult> {
    if (this.fallback) {
      const r = this.fallback.handle(cmd);
      this.onSnapshot(this.fallback.snapshot(this.focus));
      return Promise.resolve(r);
    }
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, (r) => {
        this.pending.delete(id);
        resolve(r);
      });
      this.post({ type: 'command', id, cmd });
    });
  }

  stop(): void {
    this.worker?.terminate();
    this.fallback?.stop();
  }
}

export class ApiSource implements DataSource {
  kind = 'server' as const;
  private es: EventSource | null = null;
  private focus: Focus = { driverId: null, detailId: null };
  private onSnapshot: (s: Snapshot) => void = () => {};
  private onStatus: (s: SourceStatus, detail?: string) => void = () => {};

  constructor(
    readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  get label() {
    return this.baseUrl;
  }

  start(onSnapshot: (s: Snapshot) => void, onStatus: (s: SourceStatus, detail?: string) => void): void {
    this.onSnapshot = onSnapshot;
    this.onStatus = onStatus;
    this.open();
  }

  private open() {
    this.es?.close();
    const q = new URLSearchParams({ key: this.apiKey });
    if (this.focus.driverId) q.set('driver', this.focus.driverId);
    if (this.focus.detailId) q.set('detail', this.focus.detailId);
    this.onStatus('connecting');
    const es = new EventSource(`${this.baseUrl}/v1/stream?${q}`);
    es.addEventListener('snapshot', (e) => {
      this.onStatus('live');
      this.onSnapshot(JSON.parse((e as MessageEvent<string>).data) as Snapshot);
    });
    es.onerror = () => this.onStatus('error', this.baseUrl);
    this.es = es;
  }

  setFocus(focus: Focus): void {
    if (focus.driverId === this.focus.driverId && focus.detailId === this.focus.detailId) return;
    this.focus = focus;
    if (this.es) this.open();
  }

  /** Manager actions use the real partner endpoints; simulator controls use the demo route. */
  async send(cmd: Command): Promise<CommandResult> {
    let path = '/v1/demo/commands';
    let body: unknown = cmd;
    if (cmd.type === 'acknowledge') [path, body] = [`/v1/incidents/${cmd.incidentId}/acknowledge`, { by: cmd.by }];
    else if (cmd.type === 'callDriver') [path, body] = [`/v1/incidents/${cmd.incidentId}/call`, { by: cmd.by }];
    else if (cmd.type === 'resolve') [path, body] = [`/v1/incidents/${cmd.incidentId}/resolve`, { by: cmd.by, label: cmd.label, note: cmd.note }];
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true };
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      return { ok: false, error: j.message ?? j.error ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  stop(): void {
    this.es?.close();
    this.es = null;
  }
}
