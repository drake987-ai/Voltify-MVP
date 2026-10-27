// The Voltify platform: what runs on Voltify's server for one partner.
//
//   vendor payload -> adapter (normalize) -> AI engine (Risk Score) -> incident rules
//   -> driver notifications + webhook events -> partner app / fleet console
//
// It only ever sees what a real deployment would see: telemetry from the packs and
// the partner's own registry (which pack is on which vehicle, who rides it). It never
// reads simulator ground truth and it sends no command to a vehicle; it alerts people.
import { normalize, type AdapterError, type Brand, type Result, type Telemetry } from '../adapters';
import { createEngine, explainAssessment, ingest, LIMIT_TEMP_C, PACK_NOMINAL, type Assessment, type EngineState, type Explanation } from '../ai';
import { RISK_RANK, type RiskLevel } from '../lib/riskLevels';
import type { City } from '../sim/params';
import { distanceM, nearestStation } from '../stations/stations';
import { notificationText, statusTip } from './messages';
import type {
  NotificationAction,
  Activity,
  Delivery,
  DriverBatteryView,
  DriverNotification,
  EventType,
  HistoryPoint,
  Incident,
  IncidentLabel,
  Kpis,
  NotificationKind,
  Reason,
  StationRef,
  TimelineEntry,
  VehicleDetail,
  VehicleRow,
  VoltifyEvent,
} from './types';

/** Assumed riding consumption of an e-moped, Wh per km, for the range estimate shown to drivers. */
export const WH_PER_KM = 22;
/** Nominal cell voltage of the NMC chemistry, V. */
const NOMINAL_CELL_V = 3.7;
/** SOC below which the driver is told to swap soon, and above which that reminder re-arms. */
export const LOW_SOC = 0.2;
const LOW_SOC_REARM = 0.4;
/** A vehicle silent for longer than this (ms) is shown as offline. */
const OFFLINE_AFTER_MS = 120_000;
const HISTORY_EVERY_MS = 60_000;
const HISTORY_POINTS = 60;
const MAX_EVENTS = 200;
const MAX_NOTIFICATIONS_PER_VEHICLE = 30;
const MAX_RESOLVED_LISTED = 30;

export interface VehicleRegistration {
  id: string;
  plate: string;
  driverName: string;
  driverPhone: string;
  city: City;
  packId: string;
}

interface VehicleRecord extends VehicleRegistration {
  brand: Brand;
  telemetry: Telemetry | null;
  assessment: Assessment | null;
  activity: Activity;
  lastSeenMs: number;
  history: HistoryPoint[];
  incidentId: string | null;
  notifications: DriverNotification[];
  lowSocNotified: boolean;
  maintenanceDue: boolean;
  maintenanceNotified: boolean;
}

export type IngestError = AdapterError | { code: 'unknown_pack'; message: string };

export interface IngestResult {
  vehicleId: string;
  packId: string;
  level: RiskLevel;
  score: number;
}

export type HubListener = (event: VoltifyEvent) => void;

const brandOf = (packId: string): Brand => packId.charAt(0) as Brand;

export class VoltifyHub {
  private readonly engine: EngineState = createEngine();
  private readonly vehiclesById = new Map<string, VehicleRecord>();
  private readonly vehicleByPack = new Map<string, string>();
  private readonly incidentsById = new Map<string, Incident>();
  private readonly normalised = new Set<string>();
  private readonly eventLog: VoltifyEvent[] = [];
  private readonly listeners = new Set<HubListener>();
  private seq = { incident: 0, notification: 0, event: 0 };
  private notificationsSent = 0;
  /** Platform clock: the latest telemetry timestamp seen (ms). Manager actions are stamped with it. */
  now = 0;

  // ---------------------------------------------------------------- registry

  registerVehicle(reg: VehicleRegistration): void {
    const rec: VehicleRecord = {
      ...reg,
      brand: brandOf(reg.packId),
      telemetry: null,
      assessment: null,
      activity: 'offline',
      lastSeenMs: 0,
      history: [],
      incidentId: null,
      notifications: [],
      lowSocNotified: false,
      maintenanceDue: false,
      maintenanceNotified: false,
    };
    this.vehiclesById.set(reg.id, rec);
    this.vehicleByPack.set(reg.packId, reg.id);
  }

  hasVehicle(id: string): boolean {
    return this.vehiclesById.has(id);
  }

  /**
   * A pack was swapped (reported by the swap station or the partner). Closes the open
   * incident, tells the driver, and starts learning the new pack from scratch.
   */
  assignPack(vehicleId: string, packId: string, opts: { stationId?: string; newSocPct?: number } = {}): boolean {
    const rec = this.vehiclesById.get(vehicleId);
    if (!rec || rec.packId === packId) return false;
    const oldPack = rec.packId;
    this.vehicleByPack.delete(oldPack);
    this.vehicleByPack.set(packId, vehicleId);
    rec.packId = packId;
    rec.brand = brandOf(packId);
    rec.telemetry = null;
    rec.assessment = null;
    rec.lowSocNotified = false;
    rec.maintenanceDue = false;
    rec.maintenanceNotified = false;

    const inc = rec.incidentId ? this.incidentsById.get(rec.incidentId) : undefined;
    if (inc && inc.status !== 'resolved') {
      inc.timeline.push({ at: this.now, kind: 'pack_swapped', packId, ...(opts.stationId ? { stationId: opts.stationId } : {}) });
      this.closeIncident(inc, 'pack_swapped');
    }
    rec.incidentId = null;
    this.emit('vehicle.pack_changed', { vehicleId, oldPackId: oldPack, newPackId: packId, stationId: opts.stationId ?? null });
    this.notify(rec, 'pack_swapped', 'push', ['dismiss'], null, null, { newSocPct: opts.newSocPct });
    return true;
  }

  // ---------------------------------------------------------------- ingest

  /** Entry point for a raw vendor message (any of the supported formats). */
  ingestRaw(payload: unknown): Result<IngestResult, IngestError> {
    const parsed = normalize(payload);
    if (!parsed.ok) return parsed;
    return this.ingestTelemetry(parsed.value);
  }

  ingestTelemetry(t: Telemetry): Result<IngestResult, IngestError> {
    const vehicleId = this.vehicleByPack.get(t.batteryId);
    const rec = vehicleId ? this.vehiclesById.get(vehicleId) : undefined;
    if (!rec) return { ok: false, error: { code: 'unknown_pack', message: `pack ${t.batteryId} is not fitted to any registered vehicle` } };

    if (t.ts > this.now) this.now = t.ts;
    const a = ingest(this.engine, t);
    const prev = rec.telemetry;
    rec.activity =
      t.current < -0.5
        ? 'charging'
        : prev && distanceM(prev.lat, prev.lng, t.lat, t.lng) < 3 && Math.abs(t.current) < 3
          ? 'stopped'
          : 'riding';
    rec.telemetry = t;
    rec.assessment = a;
    rec.lastSeenMs = t.ts;

    const last = rec.history[rec.history.length - 1];
    if (!last || t.ts - last.at >= HISTORY_EVERY_MS) {
      rec.history.push({ at: t.ts, tempC: round1(t.coreTemp), socPct: Math.round(t.soc * 100), score: Math.round(a.risk.score) });
      if (rec.history.length > HISTORY_POINTS) rec.history.shift();
    }

    this.evaluate(rec, a, t);
    return { ok: true, value: { vehicleId: rec.id, packId: rec.packId, level: a.risk.level, score: Math.round(a.risk.score) } };
  }

  /** The alert rules: when to open an incident, when to tell the driver, and what. */
  private evaluate(rec: VehicleRecord, a: Assessment, t: Telemetry): void {
    const level = a.risk.level;
    const rank = RISK_RANK[level];
    const inc = rec.incidentId ? this.incidentsById.get(rec.incidentId) : undefined;

    if (!a.learning) {
      if ((!inc || inc.status === 'resolved') && rank >= RISK_RANK.warning) {
        this.openIncident(rec, a, t);
      } else if (inc && inc.status !== 'resolved') {
        this.updateIncident(rec, inc, a, t);
      }
    }

    // Low charge: a reminder, not an incident.
    if (t.soc >= LOW_SOC_REARM) rec.lowSocNotified = false;
    if (!rec.lowSocNotified && t.soc < LOW_SOC && rec.activity !== 'charging' && rank < RISK_RANK.warning) {
      rec.lowSocNotified = true;
      const station = this.stationNear(rec, t);
      this.notify(rec, 'low_battery', 'push', ['navigate_station', 'dismiss'], station, null, {
        socPct: t.soc * 100,
        rangeKm: rangeKm(t, a),
      });
    }

    // Aged pack: quietly flag it for replacement (the manager's weekly view, and an inbox note for the driver).
    if (!a.learning && !rec.maintenanceNotified && a.impedance.class === 'weak' && a.impedance.confidence >= 0.5) {
      rec.maintenanceNotified = true;
      rec.maintenanceDue = true;
      this.emit('battery.maintenance_due', { vehicleId: rec.id, packId: rec.packId, sohPct: Math.round(a.impedance.sohEst * 100) });
      this.notify(rec, 'maintenance_due', 'in_app', ['dismiss'], null, null, {});
    }
  }

  private openIncident(rec: VehicleRecord, a: Assessment, t: Telemetry): void {
    const station = this.stationNear(rec, t);
    const level = a.risk.level;
    const id = `inc_${String(++this.seq.incident).padStart(4, '0')}`;
    const inc: Incident = {
      id,
      vehicleId: rec.id,
      plate: rec.plate,
      driverName: rec.driverName,
      packId: rec.packId,
      status: 'open',
      openedAt: t.ts,
      peakLevel: level,
      level,
      peakScore: Math.round(a.risk.score),
      score: Math.round(a.risk.score),
      reasons: toReasons(explainAssessment(a)),
      station,
      lat: t.lat,
      lng: t.lng,
      acknowledgedAt: null,
      resolvedAt: null,
      resolution: null,
      label: null,
      timeline: [{ at: t.ts, kind: 'opened', level }],
    };
    this.incidentsById.set(id, inc);
    rec.incidentId = id;
    this.emit('incident.opened', { incident: incidentSummary(inc) });
    this.notifyForLevel(rec, inc, level);
  }

  private updateIncident(rec: VehicleRecord, inc: Incident, a: Assessment, t: Telemetry): void {
    const level = a.risk.level;
    const score = Math.round(a.risk.score);
    inc.level = level;
    inc.score = score;
    inc.lat = t.lat;
    inc.lng = t.lng;

    if (RISK_RANK[level] > RISK_RANK[inc.peakLevel]) {
      inc.peakLevel = level;
      inc.timeline.push({ at: t.ts, kind: 'escalated', level });
      inc.reasons = toReasons(explainAssessment(a));
      inc.peakScore = Math.max(inc.peakScore, score);
      this.normalised.delete(inc.id);
      this.emit('incident.escalated', { incident: incidentSummary(inc) });
      this.notifyForLevel(rec, inc, level);
    } else if (score > inc.peakScore) {
      inc.peakScore = score;
      if (level === inc.peakLevel) inc.reasons = toReasons(explainAssessment(a));
    }

    if (t.coreTemp >= LIMIT_TEMP_C - 1 && !inc.timeline.some((e) => e.kind === 'bms_limit')) {
      inc.timeline.push({ at: t.ts, kind: 'bms_limit' });
      this.emit('incident.updated', { incident: incidentSummary(inc), change: 'bms_limit' });
    }

    if (level === 'safe' && !this.normalised.has(inc.id)) {
      this.normalised.add(inc.id);
      inc.timeline.push({ at: t.ts, kind: 'risk_normalised' });
      this.emit('incident.updated', { incident: incidentSummary(inc), change: 'risk_normalised' });
    } else if (RISK_RANK[level] >= RISK_RANK.warning) {
      this.normalised.delete(inc.id);
    }
  }

  private notifyForLevel(rec: VehicleRecord, inc: Incident, level: RiskLevel): void {
    const already = (kind: NotificationKind) => rec.notifications.some((n) => n.incidentId === inc.id && n.kind === kind);
    if (level === 'danger' && !already('stop_now')) {
      this.notify(rec, 'stop_now', 'critical', ['confirm_stopped', 'call_support'], inc.station, inc, {});
    } else if (level === 'warning' && !already('check_battery') && !already('stop_now')) {
      this.notify(rec, 'check_battery', 'push', ['navigate_station', 'call_support'], inc.station, inc, {});
    }
  }

  private notify(
    rec: VehicleRecord,
    kind: NotificationKind,
    delivery: Delivery,
    actions: NotificationAction[],
    station: StationRef | null,
    inc: Incident | null,
    extra: { socPct?: number; rangeKm?: number; newSocPct?: number },
  ): DriverNotification {
    const text = notificationText(kind, { station, ...extra });
    const n: DriverNotification = {
      id: `ntf_${String(++this.seq.notification).padStart(5, '0')}`,
      vehicleId: rec.id,
      at: this.now,
      kind,
      delivery,
      title: text.title,
      body: text.body,
      actions,
      station,
      incidentId: inc?.id ?? null,
      acknowledgedAt: null,
    };
    rec.notifications.push(n);
    if (rec.notifications.length > MAX_NOTIFICATIONS_PER_VEHICLE) rec.notifications.shift();
    this.notificationsSent++;
    if (inc) inc.timeline.push({ at: this.now, kind: 'driver_notified', level: inc.level });
    this.emit('driver.notification', {
      notification: n,
      vehicle: { id: rec.id, plate: rec.plate, driverName: rec.driverName },
    });
    return n;
  }

  private stationNear(rec: VehicleRecord, t: Telemetry): StationRef | null {
    const s = nearestStation(rec.city, t.lat, t.lng);
    return s ? { id: s.station.id, lat: s.station.lat, lng: s.station.lng, distanceM: Math.round(s.distanceM) } : null;
  }

  // ---------------------------------------------------------------- people acting

  /** The driver tapped an action on a notification in the partner app. */
  driverAck(notificationId: string): DriverNotification | null {
    for (const rec of this.vehiclesById.values()) {
      const n = rec.notifications.find((x) => x.id === notificationId);
      if (!n) continue;
      if (n.acknowledgedAt === null) {
        n.acknowledgedAt = this.now;
        const inc = n.incidentId ? this.incidentsById.get(n.incidentId) : undefined;
        if (inc && inc.status !== 'resolved') {
          inc.timeline.push({ at: this.now, kind: 'driver_confirmed' });
          this.emit('incident.updated', { incident: incidentSummary(inc), change: 'driver_confirmed' });
        }
      }
      return n;
    }
    return null;
  }

  acknowledge(incidentId: string, by: string): Incident | null {
    const inc = this.incidentsById.get(incidentId);
    if (!inc || inc.status !== 'open') return inc ?? null;
    inc.status = 'acknowledged';
    inc.acknowledgedAt = this.now;
    inc.timeline.push({ at: this.now, kind: 'acknowledged', by });
    this.emit('incident.updated', { incident: incidentSummary(inc), change: 'acknowledged' });
    return inc;
  }

  logDriverCall(incidentId: string, by: string): Incident | null {
    const inc = this.incidentsById.get(incidentId);
    if (!inc) return null;
    if (inc.status === 'open') this.acknowledge(incidentId, by);
    inc.timeline.push({ at: this.now, kind: 'driver_called', by });
    return inc;
  }

  /** Close an incident (if still open) and/or record the manager's verdict on the alert. */
  resolve(incidentId: string, opts: { by: string; label?: IncidentLabel; note?: string }): Incident | null {
    const inc = this.incidentsById.get(incidentId);
    if (!inc) return null;
    if (opts.label) inc.label = opts.label;
    if (inc.status !== 'resolved') {
      if (inc.acknowledgedAt === null) inc.acknowledgedAt = this.now;
      inc.timeline.push({
        at: this.now,
        kind: 'resolved',
        by: opts.by,
        ...(opts.label ? { label: opts.label } : {}),
        ...(opts.note ? { note: opts.note } : {}),
      });
      this.closeIncident(inc, 'manager_closed');
      const rec = this.vehiclesById.get(inc.vehicleId);
      if (rec && rec.incidentId === inc.id) rec.incidentId = null;
    } else {
      this.emit('incident.updated', { incident: incidentSummary(inc), change: 'labelled' });
    }
    return inc;
  }

  private closeIncident(inc: Incident, resolution: Incident['resolution']): void {
    inc.status = 'resolved';
    inc.resolvedAt = this.now;
    inc.resolution = resolution;
    if (resolution === 'pack_swapped') inc.timeline.push({ at: this.now, kind: 'resolved' });
    this.normalised.delete(inc.id);
    this.emit('incident.resolved', { incident: incidentSummary(inc) });
  }

  // ---------------------------------------------------------------- events

  onEvent(listener: HubListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(type: EventType, data: Record<string, unknown>): void {
    const event: VoltifyEvent = {
      id: `evt_${String(++this.seq.event).padStart(6, '0')}`,
      type,
      createdAt: new Date(this.now).toISOString(),
      data,
    };
    this.eventLog.push(event);
    if (this.eventLog.length > MAX_EVENTS) this.eventLog.shift();
    for (const l of this.listeners) l(event);
  }

  recentEvents(limit = 30): VoltifyEvent[] {
    return this.eventLog.slice(-limit).reverse();
  }

  // ---------------------------------------------------------------- read models

  vehicles(): VehicleRow[] {
    return [...this.vehiclesById.values()].map((r) => this.row(r));
  }

  vehicle(id: string): VehicleRow | null {
    const r = this.vehiclesById.get(id);
    return r ? this.row(r) : null;
  }

  private row(r: VehicleRecord): VehicleRow {
    const t = r.telemetry;
    const a = r.assessment;
    const offline = !t || this.now - r.lastSeenMs > OFFLINE_AFTER_MS;
    return {
      id: r.id,
      plate: r.plate,
      driverName: r.driverName,
      driverPhone: r.driverPhone,
      city: r.city,
      packId: r.packId,
      brand: r.brand,
      lat: t?.lat ?? 0,
      lng: t?.lng ?? 0,
      level: a?.risk.level ?? 'safe',
      score: a ? Math.round(a.risk.score) : 0,
      socPct: t ? Math.round(t.soc * 100) : 0,
      tempC: t ? round1(t.coreTemp) : 0,
      sohPct: a && !a.learning ? Math.round(a.impedance.sohEst * 100) : null,
      learning: !a || a.learning,
      activity: offline ? 'offline' : r.activity,
      rangeKm: t ? Math.round(rangeKm(t, a)) : 0,
      incidentId: r.incidentId,
      maintenanceDue: r.maintenanceDue,
      lastSeenMs: r.lastSeenMs,
    };
  }

  incidents(): Incident[] {
    const all = [...this.incidentsById.values()];
    const active = all
      .filter((i) => i.status !== 'resolved')
      .sort((x, y) => RISK_RANK[y.level] - RISK_RANK[x.level] || y.openedAt - x.openedAt);
    const closed = all
      .filter((i) => i.status === 'resolved')
      .sort((x, y) => (y.resolvedAt ?? 0) - (x.resolvedAt ?? 0))
      .slice(0, MAX_RESOLVED_LISTED);
    return [...active, ...closed];
  }

  incident(id: string): Incident | null {
    return this.incidentsById.get(id) ?? null;
  }

  notificationsOf(vehicleId: string): DriverNotification[] {
    return [...(this.vehiclesById.get(vehicleId)?.notifications ?? [])].reverse();
  }

  driverView(vehicleId: string): DriverBatteryView | null {
    const r = this.vehiclesById.get(vehicleId);
    if (!r) return null;
    return driverViewOf(r.telemetry, r.assessment, r.incidentId ? (this.incidentsById.get(r.incidentId) ?? null) : null, r.activity);
  }

  detail(vehicleId: string): VehicleDetail | null {
    const r = this.vehiclesById.get(vehicleId);
    if (!r) return null;
    return {
      vehicle: this.row(r),
      history: [...r.history],
      reasons: r.assessment && !r.assessment.learning ? toReasons(explainAssessment(r.assessment)) : [],
      notifications: this.notificationsOf(vehicleId).slice(0, 10),
      incident: r.incidentId ? (this.incidentsById.get(r.incidentId) ?? null) : null,
      driverView: this.driverView(vehicleId)!,
    };
  }

  kpis(): Kpis {
    const rows = this.vehicles();
    const levelCounts: Kpis['levelCounts'] = [0, 0, 0, 0];
    let online = 0;
    let maintenanceDue = 0;
    for (const r of rows) {
      if (r.activity !== 'offline') {
        online++;
        levelCounts[RISK_RANK[r.level]]++;
      }
      if (r.maintenanceDue) maintenanceDue++;
    }
    const all = [...this.incidentsById.values()];
    const ackMins = all
      .filter((i) => i.acknowledgedAt !== null)
      .map((i) => (i.acknowledgedAt! - i.openedAt) / 60_000)
      .sort((x, y) => x - y);
    const closed = all.filter((i) => i.status === 'resolved');
    return {
      vehicles: rows.length,
      online,
      levelCounts,
      openIncidents: all.filter((i) => i.status !== 'resolved').length,
      unacknowledged: all.filter((i) => i.status === 'open').length,
      medianAckMin: ackMins.length ? ackMins[Math.floor(ackMins.length / 2)] : null,
      labeledShare: closed.length ? closed.filter((i) => i.label !== null).length / closed.length : null,
      maintenanceDue,
      notificationsSent: this.notificationsSent,
    };
  }
}

// -------------------------------------------------------------------- helpers

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Riding range left, km: energy left in the pack divided by an assumed consumption. */
export function rangeKm(t: Telemetry, a: Assessment | null): number {
  const nom = PACK_NOMINAL[t.brand];
  const soh = a && !a.learning ? a.impedance.sohEst : 0.9;
  const wh = t.soc * nom.capacityAh * soh * nom.seriesCells * NOMINAL_CELL_V;
  return wh / WH_PER_KM;
}

export function toReasons(ex: Explanation[], max = 3): Reason[] {
  return ex
    .filter((e) => e.points >= 0.5)
    .slice(0, max)
    .map((e) => ({
      signal: e.signal,
      value: Number.isFinite(e.value) ? Math.round(e.value * 10) / 10 : e.value,
      unit: e.unit,
      threshold: e.threshold,
      points: Math.round(e.points),
      ...(e.cell !== undefined ? { cell: e.cell + 1 } : {}),
    }));
}

/** What goes into a webhook: the incident without its long timeline. */
function incidentSummary(i: Incident): Omit<Incident, 'timeline'> & { timelineLength: number } {
  const { timeline, ...rest } = i;
  return { ...rest, reasons: [...rest.reasons], timelineLength: timeline.length };
}

/** Translate the AI's assessment into the four-word view a driver gets. */
export function driverViewOf(
  t: Telemetry | null,
  a: Assessment | null,
  inc: Incident | null,
  activity: Activity,
): DriverBatteryView {
  const level: RiskLevel = a && !a.learning ? a.risk.level : 'safe';
  const status = level === 'danger' ? 'stop' : level === 'warning' ? 'check' : level === 'watch' ? 'attention' : 'good';
  const tempC = t ? round1(t.coreTemp) : 0;
  const station = inc && inc.status !== 'resolved' ? inc.station : null;
  const charging = activity === 'charging';
  const learning = !a || a.learning;
  const lowSoc = !!t && t.soc < LOW_SOC;
  return {
    socPct: t ? Math.round(t.soc * 100) : 0,
    rangeKm: t ? Math.round(rangeKm(t, a)) : 0,
    status,
    health:
      !a || a.learning || a.impedance.confidence < 0.3
        ? 'unknown'
        : a.impedance.class === 'good'
          ? 'good'
          : a.impedance.class === 'fair'
            ? 'fair'
            : 'weak',
    temperature: tempC >= 55 ? 'hot' : tempC >= 45 ? 'warm' : 'normal',
    tempC,
    charging,
    learning,
    tip: statusTip(status, { learning, charging, lowSoc, station }),
    station,
  };
}

export type { TimelineEntry };
