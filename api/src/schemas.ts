// Request bodies the API accepts, checked with Zod before anything touches the platform.
// A wrong body gets a 400 with the list of problems instead of reaching the AI.
import { z } from 'zod';
import { EVENT_TYPES } from '@voltify/shared';

const packId = z.string().regex(/^[ABC]-\d{4,}$/, 'pack id looks like "A-0012"');

export const RegisterVehicleBody = z.object({
  id: z.string().min(1).max(40),
  plate: z.string().min(1).max(20),
  driverName: z.string().min(1).max(80),
  driverPhone: z.string().max(30).default(''),
  city: z.enum(['hcmc', 'hanoi']),
  packId,
});

export const AssignPackBody = z.object({
  packId,
  stationId: z.string().max(40).optional(),
});

/** One vendor message, or a batch of them. The adapters decide whether each one is valid. */
export const TelemetryBody = z.union([
  z.object({ messages: z.array(z.unknown()).min(1).max(500) }),
  z.record(z.string(), z.unknown()),
]);

export const ManagerActionBody = z.object({ by: z.string().min(1).max(80) });

export const ResolveBody = z.object({
  by: z.string().min(1).max(80),
  label: z.enum(['confirmed', 'false_alarm']).optional(),
  note: z.string().max(500).optional(),
});

export const NotificationAckBody = z.object({
  action: z.enum(['navigate_station', 'call_support', 'confirm_stopped', 'dismiss']).optional(),
});

export const WebhookBody = z.object({
  url: z.url({ protocol: /^https?$/ }),
  events: z.array(z.enum(EVENT_TYPES as [string, ...string[]])).default([]),
});

/** Demo-only commands that drive the built-in simulator (the presenter's buttons). */
export const DemoCommandBody = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setSpeed'), speed: z.number().positive().max(120) }),
  z.object({ type: z.literal('setPaused'), paused: z.boolean() }),
  z.object({ type: z.literal('focusDriver'), vehicleId: z.string().nullable() }),
  z.object({ type: z.literal('injectShort'), vehicleId: z.string() }),
  z.object({ type: z.literal('drainBattery'), vehicleId: z.string() }),
  z.object({
    type: z.literal('driverAction'),
    vehicleId: z.string(),
    action: z.enum(['navigate_station', 'call_support', 'confirm_stopped', 'dismiss']),
    notificationId: z.string().optional(),
  }),
  z.object({ type: z.literal('acknowledge'), incidentId: z.string(), by: z.string().min(1) }),
  z.object({ type: z.literal('callDriver'), incidentId: z.string(), by: z.string().min(1) }),
  z.object({
    type: z.literal('resolve'),
    incidentId: z.string(),
    by: z.string().min(1),
    label: z.enum(['confirmed', 'false_alarm']).optional(),
    note: z.string().max(500).optional(),
  }),
  z.object({ type: z.literal('reset') }),
]);
