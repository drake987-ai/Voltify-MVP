// OpenAPI 3.1 description of the partner API, served at GET /v1/openapi.json so a
// partner's developers can read it in any OpenAPI viewer (Swagger UI, Postman, Insomnia).
const json = (schema: object) => ({ content: { 'application/json': { schema } } });
const ok = (description: string) => ({ description, ...json({ type: 'object' }) });
const idParam = (name: string) => ({ name: 'id', in: 'path', required: true, description: name, schema: { type: 'string' } });
const body = (schema: object) => ({ required: true, ...json(schema) });

const managerAction = { type: 'object', required: ['by'], properties: { by: { type: 'string', example: 'Quản lý ca sáng' } } };

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Voltify Partner API',
    version: '0.1.0',
    description:
      'Battery fire-risk alerts for electric two-wheeler fleets. Send pack telemetry, receive incidents and ready-to-show driver notifications (Vietnamese and English) by webhook. MVP: data comes from a simulator until a pilot fleet connects.',
  },
  servers: [{ url: 'http://localhost:8787' }],
  security: [{ apiKey: [] }],
  components: {
    securitySchemes: { apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
  },
  paths: {
    '/v1/telemetry': {
      post: {
        summary: 'Send one vendor telemetry message, or a batch as { messages: [...] }',
        description: 'Accepts the three supported vendor formats; the format is detected from the shape. Invalid messages are reported one by one.',
        requestBody: body({ oneOf: [{ type: 'object' }, { type: 'object', properties: { messages: { type: 'array', items: { type: 'object' } } } }] }),
        responses: { '202': ok('At least one message accepted'), '422': ok('No message accepted') },
      },
    },
    '/v1/vehicles': {
      get: { summary: 'All vehicles with their latest battery status', responses: { '200': ok('Vehicle list') } },
      post: {
        summary: 'Register a vehicle and the pack fitted to it',
        requestBody: body({
          type: 'object',
          required: ['id', 'plate', 'driverName', 'city', 'packId'],
          properties: {
            id: { type: 'string' },
            plate: { type: 'string' },
            driverName: { type: 'string' },
            driverPhone: { type: 'string' },
            city: { enum: ['hcmc', 'hanoi'] },
            packId: { type: 'string', example: 'A-0012' },
          },
        }),
        responses: { '201': ok('Registered'), '409': ok('Already registered') },
      },
    },
    '/v1/vehicles/{id}': { get: { summary: 'Vehicle detail: status, last hour, reasons, notifications, open incident', parameters: [idParam('Vehicle id')], responses: { '200': ok('Detail') } } },
    '/v1/vehicles/{id}/driver-view': {
      get: { summary: 'The simplified status and notifications a driver app shows', parameters: [idParam('Vehicle id')], responses: { '200': ok('Driver view') } },
    },
    '/v1/vehicles/{id}/pack': {
      put: {
        summary: 'Report a pack swap',
        parameters: [idParam('Vehicle id')],
        requestBody: body({ type: 'object', required: ['packId'], properties: { packId: { type: 'string' }, stationId: { type: 'string' } } }),
        responses: { '200': ok('Updated') },
      },
    },
    '/v1/incidents': {
      get: {
        summary: 'Incidents, most severe open ones first',
        parameters: [{ name: 'status', in: 'query', schema: { enum: ['active', 'open', 'acknowledged', 'resolved'] } }],
        responses: { '200': ok('Incident list') },
      },
    },
    '/v1/incidents/{id}': { get: { summary: 'One incident with its timeline', parameters: [idParam('Incident id')], responses: { '200': ok('Incident') } } },
    '/v1/incidents/{id}/acknowledge': { post: { summary: 'A manager takes the incident', parameters: [idParam('Incident id')], requestBody: body(managerAction), responses: { '200': ok('Updated') } } },
    '/v1/incidents/{id}/call': { post: { summary: 'Log a call to the driver', parameters: [idParam('Incident id')], requestBody: body(managerAction), responses: { '200': ok('Updated') } } },
    '/v1/incidents/{id}/resolve': {
      post: {
        summary: 'Close the incident and/or label the alert (confirmed / false_alarm)',
        parameters: [idParam('Incident id')],
        requestBody: body({ type: 'object', required: ['by'], properties: { by: { type: 'string' }, label: { enum: ['confirmed', 'false_alarm'] }, note: { type: 'string' } } }),
        responses: { '200': ok('Updated') },
      },
    },
    '/v1/notifications/{id}/ack': {
      post: {
        summary: 'The driver tapped an action on a notification',
        parameters: [idParam('Notification id')],
        requestBody: body({ type: 'object', properties: { action: { enum: ['navigate_station', 'call_support', 'confirm_stopped', 'dismiss'] } } }),
        responses: { '200': ok('Recorded') },
      },
    },
    '/v1/kpis': { get: { summary: 'Fleet KPIs', responses: { '200': ok('KPIs') } } },
    '/v1/events': { get: { summary: 'Latest platform events (the same objects the webhooks deliver)', responses: { '200': ok('Events') } } },
    '/v1/webhooks': {
      get: { summary: 'Webhook subscriptions', responses: { '200': ok('Subscriptions') } },
      post: {
        summary: 'Subscribe a URL to events; the response holds the signing secret (shown once)',
        description: 'Each delivery carries the header Voltify-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">. Failed deliveries are retried after 1 s, 5 s and 20 s.',
        requestBody: body({ type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri' }, events: { type: 'array', items: { type: 'string' } } } }),
        responses: { '201': ok('Created') },
      },
    },
    '/v1/webhooks/{id}': { delete: { summary: 'Remove a subscription', parameters: [idParam('Webhook id')], responses: { '204': { description: 'Removed' } } } },
    '/v1/webhooks/{id}/deliveries': { get: { summary: 'Last deliveries and their HTTP status', parameters: [idParam('Webhook id')], responses: { '200': ok('Delivery log') } } },
    '/v1/stream': {
      get: {
        summary: 'Live snapshots as Server-Sent Events (key in ?key= for browsers)',
        parameters: [
          { name: 'key', in: 'query', schema: { type: 'string' } },
          { name: 'driver', in: 'query', description: 'Vehicle id whose driver view to include', schema: { type: 'string' } },
          { name: 'detail', in: 'query', description: 'Vehicle id whose detail to include', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'text/event-stream' } },
      },
    },
    '/v1/demo/commands': { post: { summary: 'Demo only: control the built-in simulator', responses: { '200': ok('Done') } } },
  },
} as const;
