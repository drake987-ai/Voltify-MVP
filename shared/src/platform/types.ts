// Public data shapes of the Voltify platform: what the API returns, what the webhooks
// carry and what the screens render. Everything here is plain JSON (no classes, no
// typed arrays) so it travels unchanged over HTTP, Server-Sent Events and postMessage.
import type { Brand } from '../adapters/schema';
import type { SignalCode } from '../ai/types';
import type { RiskLevel } from '../lib/riskLevels';
import type { City } from '../sim/params';

/** A text in both languages the platform ships, so a partner app can show it as is. */
export interface Localized {
  vi: string;
  en: string;
}

export interface StationRef {
  id: string;
  lat: number;
  lng: number;
  distanceM: number;
}

/** What the platform infers the vehicle is doing, from telemetry alone. */
export type Activity = 'riding' | 'stopped' | 'charging' | 'offline';

export interface VehicleRow {
  id: string;
  plate: string;
  driverName: string;
  driverPhone: string;
  city: City;
  /** Battery pack currently fitted (changes when the pack is swapped). */
  packId: string;
  brand: Brand;
  lat: number;
  lng: number;
  level: RiskLevel;
  /** Risk Score 0..100. */
  score: number;
  socPct: number;
  tempC: number;
  /** AI estimate of state of health, null while the engine is still learning this pack. */
  sohPct: number | null;
  learning: boolean;
  activity: Activity;
  rangeKm: number;
  /** The open incident of this vehicle, if any. */
  incidentId: string | null;
  /** The pack has aged enough that it should be scheduled for replacement. */
  maintenanceDue: boolean;
  lastSeenMs: number;
}

export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';
/** Manager's verdict on an alert: the label that measures real-world precision. */
export type IncidentLabel = 'confirmed' | 'false_alarm';
export type IncidentResolution = 'pack_swapped' | 'manager_closed';

export type TimelineKind =
  | 'opened'
  | 'escalated'
  | 'driver_notified'
  | 'driver_confirmed'
  | 'acknowledged'
  | 'driver_called'
  | 'bms_limit'
  | 'risk_normalised'
  | 'pack_swapped'
  | 'resolved';

export interface TimelineEntry {
  at: number;
  kind: TimelineKind;
  level?: RiskLevel;
  /** Who did it, for manager actions. */
  by?: string;
  stationId?: string;
  packId?: string;
  label?: IncidentLabel;
  note?: string;
}

export interface Reason {
  signal: SignalCode;
  value: number;
  unit: string;
  threshold: number;
  /** Risk Score points this signal accounts for. */
  points: number;
  cell?: number;
}

export interface Incident {
  id: string;
  vehicleId: string;
  plate: string;
  driverName: string;
  packId: string;
  status: IncidentStatus;
  openedAt: number;
  /** Highest level reached and the current one. */
  peakLevel: RiskLevel;
  level: RiskLevel;
  peakScore: number;
  score: number;
  /** Top reasons at the moment the incident reached its peak. */
  reasons: Reason[];
  station: StationRef | null;
  lat: number;
  lng: number;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  resolution: IncidentResolution | null;
  label: IncidentLabel | null;
  timeline: TimelineEntry[];
}

export type NotificationKind = 'check_battery' | 'stop_now' | 'low_battery' | 'pack_swapped' | 'maintenance_due';
/** How the partner app should present it: a quiet inbox entry, a push banner, or a full-screen alert. */
export type Delivery = 'in_app' | 'push' | 'critical';
export type NotificationAction = 'navigate_station' | 'call_support' | 'confirm_stopped' | 'dismiss';

export interface DriverNotification {
  id: string;
  vehicleId: string;
  at: number;
  kind: NotificationKind;
  delivery: Delivery;
  title: Localized;
  body: Localized;
  actions: NotificationAction[];
  station: StationRef | null;
  incidentId: string | null;
  /** The driver tapped an action in the partner app (reported back through the API). */
  acknowledgedAt: number | null;
}

/** The simplified battery status a driver sees: four words, not forty numbers. */
export type DriverStatus = 'good' | 'attention' | 'check' | 'stop';
export type TempBand = 'normal' | 'warm' | 'hot';
export type HealthBand = 'good' | 'fair' | 'weak' | 'unknown';

export interface DriverBatteryView {
  socPct: number;
  rangeKm: number;
  status: DriverStatus;
  health: HealthBand;
  temperature: TempBand;
  tempC: number;
  charging: boolean;
  /** True for the first minutes on a new pack, while the AI is still learning it. */
  learning: boolean;
  /** One line telling the driver what to do (or that nothing needs doing). */
  tip: Localized;
  station: StationRef | null;
}

export type EventType =
  | 'incident.opened'
  | 'incident.escalated'
  | 'incident.updated'
  | 'incident.resolved'
  | 'driver.notification'
  | 'vehicle.pack_changed'
  | 'battery.maintenance_due';

export const EVENT_TYPES: readonly EventType[] = [
  'incident.opened',
  'incident.escalated',
  'incident.updated',
  'incident.resolved',
  'driver.notification',
  'vehicle.pack_changed',
  'battery.maintenance_due',
];

/** One webhook event, exactly as it is POSTed to a partner's server. */
export interface VoltifyEvent {
  id: string;
  type: EventType;
  /** ISO 8601. */
  createdAt: string;
  data: Record<string, unknown>;
}

export interface Kpis {
  vehicles: number;
  online: number;
  /** Vehicles at each level: safe, watch, warning, danger. */
  levelCounts: [number, number, number, number];
  openIncidents: number;
  /** Incidents nobody has acknowledged yet. */
  unacknowledged: number;
  /** Median minutes from an incident opening to a manager acknowledging it (null if none yet). */
  medianAckMin: number | null;
  /** Share of closed incidents that carry a manager's label (0..1, null if none closed). */
  labeledShare: number | null;
  maintenanceDue: number;
  notificationsSent: number;
}

export interface HistoryPoint {
  at: number;
  tempC: number;
  socPct: number;
  score: number;
}

export interface VehicleDetail {
  vehicle: VehicleRow;
  history: HistoryPoint[];
  reasons: Reason[];
  notifications: DriverNotification[];
  incident: Incident | null;
  driverView: DriverBatteryView;
}
