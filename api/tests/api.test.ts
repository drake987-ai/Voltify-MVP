import { describe, expect, it } from 'vitest';
import { VoltifyRuntime, encodeTelemetry } from '@voltify/shared';
import { buildApp } from '../src/app';
import { sign, verifySignature, WebhookDispatcher } from '../src/webhooks';

const KEY = 'test-key';
const auth = { 'x-api-key': KEY };

function make(vehicles = 8) {
  const runtime = new VoltifyRuntime({ mode: 'server', vehicles, prewarmMin: 6 });
  const calls: { url: string; body: string; signature: string }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body), signature: (init.headers as Record<string, string>)['voltify-signature'] });
    return new Response('ok', { status: 200 });
  }) as unknown as typeof fetch;
  const app = buildApp({ runtime, apiKey: KEY, demo: true, webhooks: new WebhookDispatcher(fakeFetch) });
  return { app, runtime, calls };
}

describe('API', () => {
  it('refuses requests without the API key but serves the OpenAPI description to anyone', async () => {
    const { app } = make(2);
    expect((await app.inject({ method: 'GET', url: '/v1/vehicles' })).statusCode).toBe(401);
    const doc = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(doc.statusCode).toBe(200);
    expect(doc.json().openapi).toBe('3.1.0');
  });

  it('lists vehicles and returns the driver view of one', async () => {
    const { app } = make(3);
    const list = await app.inject({ method: 'GET', url: '/v1/vehicles', headers: auth });
    expect(list.json().data).toHaveLength(3);
    const view = await app.inject({ method: 'GET', url: '/v1/vehicles/V-001/driver-view', headers: auth });
    expect(view.statusCode).toBe(200);
    expect(['good', 'attention', 'check', 'stop']).toContain(view.json().data.view.status);
    expect((await app.inject({ method: 'GET', url: '/v1/vehicles/nope', headers: auth })).statusCode).toBe(404);
  });

  it('ingests vendor telemetry for a registered vehicle and reports bad messages one by one', async () => {
    const { app, runtime } = make(1);
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/vehicles',
      headers: auth,
      payload: { id: 'REAL-01', plate: '59-X1 123.45', driverName: 'Tài xế thử', city: 'hcmc', packId: 'A-0777' },
    });
    expect(reg.statusCode).toBe(201);
    const t = { ...runtime.world.vehicles[0].battery.reading, batteryId: 'A-0777', brand: 'A' as const, ts: runtime.simTimeMs };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/telemetry',
      headers: auth,
      payload: { messages: [encodeTelemetry(t), { not: 'a vendor format' }] },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ accepted: 1, rejected: 1 });
    expect(res.json().results[0]).toMatchObject({ ok: true, vehicleId: 'REAL-01' });
    expect(res.json().results[1].error.code).toBe('unknown_format');
  });

  it('validates bodies with a 400 and a list of problems', async () => {
    const { app } = make(1);
    const res = await app.inject({ method: 'POST', url: '/v1/vehicles', headers: auth, payload: { id: 'x', city: 'paris' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it('delivers signed webhooks for incidents and driver notifications', async () => {
    const { app, runtime, calls } = make(4);
    const sub = await app.inject({ method: 'POST', url: '/v1/webhooks', headers: auth, payload: { url: 'https://partner.example/voltify' } });
    expect(sub.statusCode).toBe(201);
    const secret = sub.json().data.secret as string;

    runtime.handle({ type: 'focusDriver', vehicleId: 'V-001' });
    runtime.handle({ type: 'injectShort', vehicleId: 'V-001' });
    runtime.tick(12 * 40);
    await new Promise((r) => setTimeout(r, 10));

    const types = calls.map((c) => JSON.parse(c.body).type);
    expect(types).toContain('incident.opened');
    expect(types).toContain('driver.notification');
    for (const c of calls) expect(verifySignature(secret, c.body, c.signature)).toBe(true);

    const incidents = await app.inject({ method: 'GET', url: '/v1/incidents?status=active', headers: auth });
    const inc = incidents.json().data.find((i: { vehicleId: string }) => i.vehicleId === 'V-001');
    expect(inc).toBeDefined();
    const ack = await app.inject({ method: 'POST', url: `/v1/incidents/${inc.id}/acknowledge`, headers: auth, payload: { by: 'Quản lý' } });
    expect(ack.json().data.status).toBe('acknowledged');
    const done = await app.inject({ method: 'POST', url: `/v1/incidents/${inc.id}/resolve`, headers: auth, payload: { by: 'Quản lý', label: 'confirmed' } });
    expect(done.json().data).toMatchObject({ status: 'resolved', label: 'confirmed' });
  });

  it('rejects a tampered webhook body', () => {
    const header = sign('whsec_x', '{"a":1}');
    expect(verifySignature('whsec_x', '{"a":1}', header)).toBe(true);
    expect(verifySignature('whsec_x', '{"a":2}', header)).toBe(false);
    expect(verifySignature('whsec_y', '{"a":1}', header)).toBe(false);
  });

  it('runs demo commands and validates them', async () => {
    const { app, runtime } = make(2);
    const ok = await app.inject({ method: 'POST', url: '/v1/demo/commands', headers: auth, payload: { type: 'setSpeed', speed: 60 } });
    expect(ok.statusCode).toBe(200);
    expect(runtime.speed).toBe(60);
    const bad = await app.inject({ method: 'POST', url: '/v1/demo/commands', headers: auth, payload: { type: 'explode' } });
    expect(bad.statusCode).toBe(400);
  });
});
