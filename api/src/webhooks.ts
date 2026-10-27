// Webhook delivery: every platform event a partner subscribed to is POSTed to their
// server, signed so they can check it really comes from Voltify.
//
//   Voltify-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the secret>
//
// A failed delivery is retried a few times with a growing pause. The log of the last
// deliveries is kept for the partner to inspect (GET /v1/webhooks/:id/deliveries).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { EventType, VoltifyEvent } from '@voltify/shared';

export interface WebhookSubscription {
  id: string;
  url: string;
  /** Event types to send; empty means all. */
  events: EventType[];
  secret: string;
  createdAt: string;
}

export interface Delivery {
  eventId: string;
  eventType: EventType;
  attempt: number;
  at: string;
  status: number | null;
  ok: boolean;
  error?: string;
  durationMs: number;
}

export const SIGNATURE_HEADER = 'voltify-signature';
const RETRY_DELAYS_MS = [1_000, 5_000, 20_000];
const TIMEOUT_MS = 5_000;
const MAX_LOG = 50;

export function sign(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

/** What a partner runs on their side to check a delivery (see examples/partner-receiver.ts). */
export function verifySignature(secret: string, body: string, header: string | undefined, toleranceS = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceS || !parts.v1) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export class WebhookDispatcher {
  private readonly subs = new Map<string, WebhookSubscription>();
  private readonly logs = new Map<string, Delivery[]>();
  private seq = 0;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  add(url: string, events: EventType[]): WebhookSubscription {
    const sub: WebhookSubscription = {
      id: `wh_${String(++this.seq).padStart(3, '0')}`,
      url,
      events,
      secret: `whsec_${randomBytes(18).toString('hex')}`,
      createdAt: new Date().toISOString(),
    };
    this.subs.set(sub.id, sub);
    this.logs.set(sub.id, []);
    return sub;
  }

  remove(id: string): boolean {
    this.logs.delete(id);
    return this.subs.delete(id);
  }

  list(): Omit<WebhookSubscription, 'secret'>[] {
    return [...this.subs.values()].map(({ secret: _secret, ...rest }) => rest);
  }

  deliveries(id: string): Delivery[] | null {
    return this.logs.get(id) ?? null;
  }

  /** Fan one event out to every matching subscription (does not wait for the deliveries). */
  dispatch(event: VoltifyEvent): void {
    for (const sub of this.subs.values()) {
      if (sub.events.length > 0 && !sub.events.includes(event.type)) continue;
      void this.deliver(sub, event, 1);
    }
  }

  private async deliver(sub: WebhookSubscription, event: VoltifyEvent, attempt: number): Promise<void> {
    const body = JSON.stringify(event);
    const started = Date.now();
    let status: number | null = null;
    let error: string | undefined;
    try {
      const res = await this.fetchImpl(sub.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: sign(sub.secret, body), 'user-agent': 'Voltify-Webhooks/0.1' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const ok = status !== null && status >= 200 && status < 300;
    const log = this.logs.get(sub.id);
    if (!log) return; // unsubscribed meanwhile
    log.unshift({ eventId: event.id, eventType: event.type, attempt, at: new Date().toISOString(), status, ok, durationMs: Date.now() - started, ...(error ? { error } : {}) });
    if (log.length > MAX_LOG) log.pop();
    if (!ok && attempt <= RETRY_DELAYS_MS.length) {
      setTimeout(() => void this.deliver(sub, event, attempt + 1), RETRY_DELAYS_MS[attempt - 1]).unref?.();
    }
  }
}
