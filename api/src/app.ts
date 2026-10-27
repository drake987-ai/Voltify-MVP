// The HTTP API a partner integrates with (fleet operator, vehicle maker, ride-hailing app).
// Route list and payloads: GET /v1/openapi.json, or README.md.
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { VoltifyRuntime, type Command, type EventType } from '@voltify/shared';
import { openApiDocument } from './openapi';
import {
  AssignPackBody,
  DemoCommandBody,
  ManagerActionBody,
  NotificationAckBody,
  RegisterVehicleBody,
  ResolveBody,
  TelemetryBody,
  WebhookBody,
} from './schemas';
import { WebhookDispatcher } from './webhooks';

export interface AppOptions {
  runtime: VoltifyRuntime;
  apiKey: string;
  /** Allow the demo routes (simulator controls). */
  demo: boolean;
  /** Interval between two snapshots on the live stream, ms. */
  streamEveryMs?: number;
  corsOrigin?: string | boolean;
  webhooks?: WebhookDispatcher;
  logger?: boolean;
}

type Params = { id: string };

export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1_000_000 });
  const { runtime } = opts;
  const hooks = opts.webhooks ?? new WebhookDispatcher();
  runtime.onEvent((e) => hooks.dispatch(e));

  void app.register(cors, { origin: opts.corsOrigin ?? true });

  /** Parse a body with a Zod schema; on failure answer 400 and return null. */
  function parse<S extends z.ZodType>(schema: S, req: FastifyRequest, reply: FastifyReply): z.infer<S> | null {
    const r = schema.safeParse(req.body ?? {});
    if (r.success) return r.data;
    void reply.code(400).send({ error: 'invalid_body', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    return null;
  }

  const notFound = (reply: FastifyReply, what: string) => reply.code(404).send({ error: 'not_found', message: `${what} not found` });

  // Every /v1 route needs the partner's key, except the API description. The live stream
  // takes it as ?key= because a browser's EventSource cannot set headers.
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/v1/') || req.url.startsWith('/v1/openapi.json')) return;
    const header = req.headers['x-api-key'] ?? req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const query = (req.query as Record<string, string | undefined>).key;
    if ((header ?? query) !== opts.apiKey) {
      return reply.code(401).send({ error: 'unauthorized', message: 'missing or wrong API key (header x-api-key)' });
    }
  });

  app.get('/health', async () => ({ ok: true, simTime: new Date(runtime.simTimeMs).toISOString() }));
  app.get('/v1/openapi.json', async () => openApiDocument);

  // ------------------------------------------------------------ vehicles and telemetry

  app.get('/v1/vehicles', async () => ({ data: runtime.hub.vehicles() }));

  app.post('/v1/vehicles', async (req, reply) => {
    const body = parse(RegisterVehicleBody, req, reply);
    if (!body) return;
    if (runtime.hub.hasVehicle(body.id)) return reply.code(409).send({ error: 'conflict', message: 'vehicle already registered' });
    runtime.hub.registerVehicle(body);
    return reply.code(201).send({ data: runtime.hub.vehicle(body.id) });
  });

  app.get<{ Params: Params }>('/v1/vehicles/:id', async (req, reply) => {
    const d = runtime.hub.detail(req.params.id);
    return d ? { data: d } : notFound(reply, 'vehicle');
  });

  /** Exactly what the partner's driver app should render for this vehicle. */
  app.get<{ Params: Params }>('/v1/vehicles/:id/driver-view', async (req, reply) => {
    const view = runtime.hub.driverView(req.params.id);
    if (!view) return notFound(reply, 'vehicle');
    return { data: { view, notifications: runtime.hub.notificationsOf(req.params.id).slice(0, 15) } };
  });

  app.put<{ Params: Params }>('/v1/vehicles/:id/pack', async (req, reply) => {
    const body = parse(AssignPackBody, req, reply);
    if (!body) return;
    if (!runtime.hub.hasVehicle(req.params.id)) return notFound(reply, 'vehicle');
    runtime.hub.assignPack(req.params.id, body.packId, body.stationId ? { stationId: body.stationId } : {});
    return { data: runtime.hub.vehicle(req.params.id) };
  });

  app.post('/v1/telemetry', async (req, reply) => {
    const body = parse(TelemetryBody, req, reply);
    if (!body) return;
    const messages = 'messages' in body && Array.isArray(body.messages) ? body.messages : [body];
    const results = messages.map((m) => {
      const r = runtime.hub.ingestRaw(m);
      return r.ok ? { ok: true, ...r.value } : { ok: false, error: r.error };
    });
    const accepted = results.filter((r) => r.ok).length;
    return reply.code(accepted > 0 ? 202 : 422).send({ accepted, rejected: results.length - accepted, results });
  });

  // ------------------------------------------------------------ incidents and notifications

  app.get<{ Querystring: { status?: string } }>('/v1/incidents', async (req) => {
    const status = req.query.status;
    const all = runtime.hub.incidents();
    return { data: status ? all.filter((i) => (status === 'active' ? i.status !== 'resolved' : i.status === status)) : all };
  });

  app.get<{ Params: Params }>('/v1/incidents/:id', async (req, reply) => {
    const inc = runtime.hub.incident(req.params.id);
    return inc ? { data: inc } : notFound(reply, 'incident');
  });

  app.post<{ Params: Params }>('/v1/incidents/:id/acknowledge', async (req, reply) => {
    const body = parse(ManagerActionBody, req, reply);
    if (!body) return;
    const inc = runtime.hub.acknowledge(req.params.id, body.by);
    return inc ? { data: inc } : notFound(reply, 'incident');
  });

  app.post<{ Params: Params }>('/v1/incidents/:id/call', async (req, reply) => {
    const body = parse(ManagerActionBody, req, reply);
    if (!body) return;
    const inc = runtime.hub.logDriverCall(req.params.id, body.by);
    return inc ? { data: inc } : notFound(reply, 'incident');
  });

  app.post<{ Params: Params }>('/v1/incidents/:id/resolve', async (req, reply) => {
    const body = parse(ResolveBody, req, reply);
    if (!body) return;
    const inc = runtime.hub.resolve(req.params.id, {
      by: body.by,
      ...(body.label ? { label: body.label } : {}),
      ...(body.note ? { note: body.note } : {}),
    });
    return inc ? { data: inc } : notFound(reply, 'incident');
  });

  /** The partner app reports that the driver tapped an action on a notification. */
  app.post<{ Params: Params }>('/v1/notifications/:id/ack', async (req, reply) => {
    const body = parse(NotificationAckBody, req, reply);
    if (!body) return;
    const n = runtime.hub.driverAck(req.params.id);
    if (!n) return notFound(reply, 'notification');
    if (body.action && opts.demo) runtime.handle({ type: 'driverAction', vehicleId: n.vehicleId, action: body.action });
    return { data: n };
  });

  app.get('/v1/kpis', async () => ({ data: runtime.hub.kpis() }));

  app.get<{ Querystring: { limit?: string } }>('/v1/events', async (req) => ({
    data: runtime.hub.recentEvents(Math.min(200, Number(req.query.limit ?? 50) || 50)),
  }));

  // ------------------------------------------------------------ webhooks

  app.post('/v1/webhooks', async (req, reply) => {
    const body = parse(WebhookBody, req, reply);
    if (!body) return;
    const sub = hooks.add(body.url, body.events as EventType[]);
    // The secret is shown once, here; the partner keeps it to verify signatures.
    return reply.code(201).send({ data: sub });
  });

  app.get('/v1/webhooks', async () => ({ data: hooks.list() }));

  app.delete<{ Params: Params }>('/v1/webhooks/:id', async (req, reply) =>
    hooks.remove(req.params.id) ? reply.code(204).send() : notFound(reply, 'webhook'),
  );

  app.get<{ Params: Params }>('/v1/webhooks/:id/deliveries', async (req, reply) => {
    const log = hooks.deliveries(req.params.id);
    return log ? { data: log } : notFound(reply, 'webhook');
  });

  // ------------------------------------------------------------ live stream (Server-Sent Events)

  app.get<{ Querystring: { driver?: string; detail?: string } }>('/v1/stream', (req, reply) => {
    const origin = req.headers.origin;
    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
    });
    const send = () => {
      const snap = runtime.snapshot({ driverId: req.query.driver ?? null, detailId: req.query.detail ?? null });
      reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
    };
    send();
    const timer = setInterval(send, opts.streamEveryMs ?? 500);
    req.raw.on('close', () => clearInterval(timer));
  });

  // ------------------------------------------------------------ demo controls

  app.post('/v1/demo/commands', async (req, reply) => {
    if (!opts.demo) return reply.code(403).send({ error: 'forbidden', message: 'demo controls are disabled on this server' });
    const body = parse(DemoCommandBody, req, reply);
    if (!body) return;
    const result = runtime.handle(body as Command);
    return reply.code(result.ok ? 200 : 422).send(result);
  });

  return app;
}
