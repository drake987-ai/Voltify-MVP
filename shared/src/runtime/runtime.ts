// Wires the simulated world to the Voltify platform and runs them on a clock. The same
// runtime drives the demo in two places: inside a Web Worker (the static web build,
// no server needed) and inside the API server (where partners reach it over HTTP).
import { RISK_RANK } from '../lib/riskLevels';
import { VoltifyHub } from '../platform/hub';
import type {
  DriverBatteryView,
  DriverNotification,
  Incident,
  IncidentLabel,
  Kpis,
  NotificationAction,
  Reason,
  StationRef,
  VehicleDetail,
  VehicleRow,
  VoltifyEvent,
} from '../platform/types';
import { SIM } from '../sim';
import { World, type DriverTask, type Role } from '../world/world';

export type Command =
  | { type: 'setSpeed'; speed: number }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'focusDriver'; vehicleId: string | null }
  | { type: 'injectShort'; vehicleId: string }
  | { type: 'drainBattery'; vehicleId: string }
  | { type: 'driverAction'; vehicleId: string; action: NotificationAction; notificationId?: string }
  | { type: 'acknowledge'; incidentId: string; by: string }
  | { type: 'callDriver'; incidentId: string; by: string }
  | { type: 'resolve'; incidentId: string; by: string; label?: IncidentLabel; note?: string }
  | { type: 'reset' };

export interface CommandResult {
  ok: boolean;
  error?: string;
}

export interface DriverAppState {
  vehicle: VehicleRow;
  view: DriverBatteryView;
  notifications: DriverNotification[];
  task: DriverTask;
  taskEndsAt: number | null;
  station: StationRef | null;
  manual: boolean;
  /** What Voltify computed behind the simple view (for the presenter's side panel). */
  behind: { score: number; level: VehicleRow['level']; reasons: Reason[]; learning: boolean };
}

export interface Snapshot {
  mode: 'browser' | 'server';
  simTimeMs: number;
  speed: number;
  paused: boolean;
  vehicles: VehicleRow[];
  incidents: Incident[];
  kpis: Kpis;
  events: VoltifyEvent[];
  /** Simulator-only facts for the presenter's demo controls (Voltify never sees these). */
  demo: { roles: Record<string, Role>; tasks: Record<string, DriverTask> };
  driver: DriverAppState | null;
  detail: VehicleDetail | null;
}

export interface RuntimeOptions {
  seed?: number;
  vehicles?: number;
  /** Simulated minutes to run before the demo starts, so the AI has learned every pack. */
  prewarmMin?: number;
  speed?: number;
  mode: Snapshot['mode'];
}

export const SPEEDS = [1, 5, 20, 60] as const;
export const DEFAULT_SPEED = 20;
const MAX_TICKS_PER_PUMP = 60;

export class VoltifyRuntime {
  hub!: VoltifyHub;
  world!: World;
  speed: number;
  paused = false;
  private focusedDriver: string | null = null;
  private carry = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPumpMs = 0;
  private readonly eventListeners = new Set<(e: VoltifyEvent) => void>();

  constructor(private readonly opts: RuntimeOptions) {
    this.speed = opts.speed ?? DEFAULT_SPEED;
    this.build();
  }

  private build(): void {
    const hub = new VoltifyHub();
    const world: World = new World(
      { seed: this.opts.seed ?? 2026, n: this.opts.vehicles ?? 40 },
      {
        frame: (payload) => {
          hub.ingestRaw(payload);
        },
        swap: (vehicleId, packId, stationId, newSocPct) => {
          hub.assignPack(vehicleId, packId, { ...(stationId ? { stationId } : {}), newSocPct });
        },
        driverAck: (id) => {
          hub.driverAck(id);
        },
      },
    );
    for (const v of world.vehicles) hub.registerVehicle(v.reg);
    hub.onEvent((e) => {
      if (e.type === 'driver.notification') world.receive(e.data.notification as DriverNotification);
      for (const l of this.eventListeners) l(e);
    });
    this.hub = hub;
    this.world = world;
    const prewarmTicks = Math.round(((this.opts.prewarmMin ?? 6) * 60) / SIM.tickS);
    for (let i = 0; i < prewarmTicks; i++) world.step();
    if (this.focusedDriver) world.setManual(this.focusedDriver);
  }

  /** Every platform event as it happens (the API turns these into webhook deliveries). */
  onEvent(listener: (e: VoltifyEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Simulated clock; with no simulated vehicles, the platform clock (latest telemetry received). */
  get simTimeMs(): number {
    return this.world.vehicles.length > 0 ? this.world.simTimeMs : this.hub.now;
  }

  tick(n = 1): void {
    for (let i = 0; i < n; i++) this.world.step();
  }

  /** Run in real time at `speed` x; `onPump` is called after each batch of ticks. */
  start(onPump?: () => void, everyMs = 250): void {
    if (this.timer) return;
    this.lastPumpMs = Date.now();
    this.timer = setInterval(() => {
      const nowMs = Date.now();
      const elapsed = nowMs - this.lastPumpMs;
      this.lastPumpMs = nowMs;
      if (!this.paused) {
        this.carry += (elapsed / 1000) * this.speed / SIM.tickS;
        const n = Math.min(MAX_TICKS_PER_PUMP, Math.floor(this.carry));
        this.carry -= n;
        if (this.carry > MAX_TICKS_PER_PUMP) this.carry = 0; // fell behind: drop rather than spiral
        this.tick(n);
      }
      onPump?.();
    }, everyMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  handle(cmd: Command): CommandResult {
    const hub = this.hub;
    const world = this.world;
    const fail = (error: string): CommandResult => ({ ok: false, error });
    switch (cmd.type) {
      case 'setSpeed':
        if (!Number.isFinite(cmd.speed) || cmd.speed <= 0 || cmd.speed > 120) return fail('speed must be between 0 and 120');
        this.speed = cmd.speed;
        return { ok: true };
      case 'setPaused':
        this.paused = cmd.paused;
        return { ok: true };
      case 'focusDriver':
        if (cmd.vehicleId !== null && !world.find(cmd.vehicleId)) return fail('unknown vehicle');
        this.focusedDriver = cmd.vehicleId;
        world.setManual(cmd.vehicleId);
        return { ok: true };
      case 'injectShort':
        return world.injectShort(cmd.vehicleId) ? { ok: true } : fail('unknown vehicle');
      case 'drainBattery':
        return world.drainBattery(cmd.vehicleId) ? { ok: true } : fail('battery already low or unknown vehicle');
      case 'driverAction': {
        if (!hub.hasVehicle(cmd.vehicleId)) return fail('unknown vehicle');
        const n = cmd.notificationId ? hub.notificationsOf(cmd.vehicleId).find((x) => x.id === cmd.notificationId) : undefined;
        if (cmd.notificationId) hub.driverAck(cmd.notificationId);
        // A real vehicle (registered through the API) has no simulated driver to move.
        if (!world.find(cmd.vehicleId)) return { ok: true };
        if (cmd.action === 'navigate_station') {
          const station = n?.station ?? hub.driverView(cmd.vehicleId)?.station ?? null;
          return world.goToStation(cmd.vehicleId, station) ? { ok: true } : fail('driver cannot head to a station now');
        }
        if (cmd.action === 'confirm_stopped') return world.stopAndWait(cmd.vehicleId) ? { ok: true } : fail('already stopped');
        return { ok: true };
      }
      case 'acknowledge':
        return hub.acknowledge(cmd.incidentId, cmd.by) ? { ok: true } : fail('unknown incident');
      case 'callDriver':
        return hub.logDriverCall(cmd.incidentId, cmd.by) ? { ok: true } : fail('unknown incident');
      case 'resolve':
        return hub.resolve(cmd.incidentId, {
          by: cmd.by,
          ...(cmd.label ? { label: cmd.label } : {}),
          ...(cmd.note ? { note: cmd.note } : {}),
        })
          ? { ok: true }
          : fail('unknown incident');
      case 'reset':
        this.build();
        return { ok: true };
    }
  }

  driverState(vehicleId: string): DriverAppState | null {
    // A vehicle registered through the API (a real one) has no simulated driver behind it.
    const v = this.world.find(vehicleId);
    const row = this.hub.vehicle(vehicleId);
    const view = this.hub.driverView(vehicleId);
    if (!row || !view) return null;
    const detail = this.hub.detail(vehicleId);
    return {
      vehicle: row,
      view,
      notifications: this.hub.notificationsOf(vehicleId).slice(0, 15),
      task: v?.task ?? 'riding',
      taskEndsAt: v?.taskEndsS == null ? null : SIM.epochMs + v.taskEndsS * 1000,
      station: v?.station ?? view.station,
      manual: v?.manual ?? false,
      behind: { score: row.score, level: row.level, reasons: detail?.reasons ?? [], learning: row.learning },
    };
  }

  snapshot(opts: { driverId?: string | null; detailId?: string | null; events?: number } = {}): Snapshot {
    const roles: Record<string, Role> = {};
    const tasks: Record<string, DriverTask> = {};
    for (const v of this.world.vehicles) {
      roles[v.reg.id] = v.role;
      tasks[v.reg.id] = v.task;
    }
    const vehicles = this.hub.vehicles().sort((a, b) => RISK_RANK[b.level] - RISK_RANK[a.level] || b.score - a.score);
    return {
      mode: this.opts.mode,
      simTimeMs: this.simTimeMs,
      speed: this.speed,
      paused: this.paused,
      vehicles,
      incidents: this.hub.incidents(),
      kpis: this.hub.kpis(),
      events: this.hub.recentEvents(opts.events ?? 20),
      demo: { roles, tasks },
      driver: opts.driverId ? this.driverState(opts.driverId) : null,
      detail: opts.detailId ? this.hub.detail(opts.detailId) : null,
    };
  }
}
