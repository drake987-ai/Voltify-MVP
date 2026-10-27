// The simulated outside world that the MVP demo needs while no fleet shares real data:
// electric mopeds on the road in TP.HCM, their battery packs (the PoC's physics
// simulator), their vendors' servers (three payload formats) and the drivers, who
// react to the notifications Voltify sends the way the notification asks them to.
//
// Nothing in here is visible to the platform (src/platform): the only things that
// cross over are vendor payloads, pack swaps and the drivers' taps, exactly as they
// would in a real deployment.
import type { Brand } from '../adapters/schema';
import type { DriverNotification, StationRef } from '../platform/types';
import type { VehicleRegistration } from '../platform/hub';
import {
  createBattery,
  encodeTelemetry,
  injectFault,
  NO_CONTROL,
  pickBrand,
  resolveScenario,
  stepBattery,
  uniformFromKey,
  BRAND_SPECS,
  SIM,
  type BatteryControl,
  type BatteryState,
  type Environment,
  type ScenarioSelection,
} from '../sim';
import { distanceM, nearestStation } from '../stations/stations';
import { driverName, phoneNumber, plateNumber } from './people';

/** What the simulator planted in each vehicle (for the presenter only; Voltify never sees it). */
export type Role = 'normal' | 'severe' | 'short' | 'heavy' | 'aged' | 'weakCell';

/** What the driver is doing, from the partner app's point of view. */
export type DriverTask = 'riding' | 'heading_to_station' | 'swapping' | 'stopped_waiting';

export interface WorldVehicle {
  reg: VehicleRegistration;
  index: number;
  role: Role;
  battery: BatteryState;
  control: BatteryControl;
  task: DriverTask;
  /** Simulated second at which the current task ends (arrival, swap done, rescue). */
  taskEndsS: number | null;
  station: StationRef | null;
  /** Simulated second at which the driver acts on the last notification (auto drivers only). */
  reactAtS: number | null;
  pending: DriverNotification | null;
  /** A person drives this one from the phone screen: no automatic reactions. */
  manual: boolean;
}

export interface WorldOptions {
  seed: number;
  n: number;
  /** Air temperature of the day. */
  env?: Pick<Environment, 'ambientMinC' | 'ambientMaxC'>;
}

export interface WorldEvents {
  /** A vendor server forwards one telemetry message to Voltify. */
  frame: (payload: unknown, vehicleId: string) => void;
  /** A swap station (or the operations team) reports a new pack on a vehicle. */
  swap: (vehicleId: string, newPackId: string, stationId: string | null, newSocPct: number) => void;
  /** The driver tapped an action on a notification. */
  driverAck: (notificationId: string) => void;
}

/** Hot afternoon in the city: 29 to 37 degC. */
export const DEMO_ENV = { ambientMinC: 29, ambientMaxC: 37 } as const;

const ROLE_SCENARIO: Record<Role, ScenarioSelection> = {
  normal: 'baseline',
  severe: 'severeHeatLoad',
  short: 'baseline',
  heavy: 'heavyClimb',
  aged: 'agedHigh',
  weakCell: 'cellImbalance',
};

/** How many vehicles get each kind of trouble (the rest are normal). Index 0 is always normal. */
const ROLE_COUNTS: [Role, number][] = [
  ['severe', 2],
  ['short', 3],
  ['heavy', 3],
  ['aged', 3],
  ['weakCell', 2],
];

/** Simulated seconds after the start at which the planted internal shorts begin. */
const SHORT_ONSETS_S = [4 * 60, 18 * 60, 34 * 60];
/** A soft short that tightens within minutes (the PoC's `escalatingShort`). */
const SHORT_FAULT = { rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 } as const;
/**
 * After the planted troubles, a new one starts on a random healthy vehicle every 12 to 20
 * simulated minutes, alternating an internal short and an overloaded ride in a sealed,
 * sun-baked compartment, so a long demo keeps producing incidents.
 */
const TROUBLE_FROM_S = 45 * 60;
const TROUBLE_EVERY_S: readonly [number, number] = [12 * 60, 20 * 60];

/** Driver behaviour (assumptions for the demo). */
export const DRIVER = {
  reactMinS: 30,
  reactMaxS: 90,
  stopReactMinS: 15,
  stopReactMaxS: 40,
  /** Riding speed to the swap station, m/s (slowed down as the notification asks). */
  toStationMs: 5,
  swapHandlingS: 90,
  /** Time for the operations team to bring a new pack to a stopped vehicle, s. */
  rescueS: 12 * 60,
  slowDownFactor: 0.75,
} as const;

const NEW_PACK_SERIAL_BASE = 1000;

export class World {
  readonly seed: number;
  readonly env: Environment;
  readonly vehicles: WorldVehicle[] = [];
  tS = 0;
  private packCounter = 0;
  private nextShort = 0;
  private shortTargets: string[] = [];
  private nextTroubleS = TROUBLE_FROM_S;
  private troubles = 0;

  constructor(opts: WorldOptions, private readonly on: WorldEvents) {
    this.seed = opts.seed;
    this.env = { ...(opts.env ?? DEMO_ENV), offsetC: 0 };
    const roles = assignRoles(opts.seed, opts.n);
    for (let index = 0; index < opts.n; index++) {
      const brand = pickBrand(opts.seed, index);
      const role = roles[index];
      const battery = createBattery({
        seed: opts.seed,
        index,
        brand,
        city: 'hcmc',
        env: this.env,
        scenario: resolveScenario(ROLE_SCENARIO[role]),
        startTS: 0,
      });
      const id = `V-${String(index + 1).padStart(3, '0')}`;
      if (role === 'short') this.shortTargets.push(id);
      this.vehicles.push({
        reg: {
          id,
          plate: plateNumber(index),
          driverName: driverName(index),
          driverPhone: phoneNumber(index),
          city: 'hcmc',
          packId: battery.config.id,
        },
        index,
        role,
        battery,
        control: NO_CONTROL,
        task: 'riding',
        taskEndsS: null,
        station: null,
        reactAtS: null,
        pending: null,
        manual: false,
      });
    }
  }

  find(vehicleId: string): WorldVehicle | undefined {
    return this.vehicles.find((v) => v.reg.id === vehicleId);
  }

  get simTimeMs(): number {
    return SIM.epochMs + this.tS * 1000;
  }

  /** Advance everything by one physics tick (5 simulated seconds). */
  step(): void {
    while (this.nextShort < SHORT_ONSETS_S.length && SHORT_ONSETS_S[this.nextShort] <= this.tS) {
      const target = this.find(this.shortTargets[this.nextShort++] ?? '');
      if (target && target.role === 'short') injectFault(target.battery, { onsetS: this.tS, ...SHORT_FAULT });
    }
    if (this.tS >= this.nextTroubleS) this.startTrouble();

    for (const v of this.vehicles) {
      this.advanceDriver(v);
      stepBattery(v.battery, this.env, v.control);
    }
    this.tS += SIM.tickS;

    // Each vendor's server forwards its packs' messages at its own cadence.
    const tick = Math.round(this.tS / SIM.tickS);
    for (const v of this.vehicles) {
      const b = v.battery;
      if ((tick + b.config.emitPhase) % BRAND_SPECS[b.config.brand].emitEveryTicks === 0) {
        this.on.frame(encodeTelemetry(b.reading), v.reg.id);
      }
    }
  }

  // ------------------------------------------------------------ drivers

  /** A notification reached the driver's phone. Automatic drivers act on it after a short delay. */
  receive(n: DriverNotification): void {
    const v = this.find(n.vehicleId);
    if (!v || v.manual) return;
    if (n.kind === 'stop_now') {
      v.pending = n;
      v.reactAtS = this.tS + this.delay(v, 'stop', DRIVER.stopReactMinS, DRIVER.stopReactMaxS);
    } else if ((n.kind === 'check_battery' || n.kind === 'low_battery') && v.task === 'riding') {
      v.pending = n;
      v.reactAtS = this.tS + this.delay(v, 'go', DRIVER.reactMinS, DRIVER.reactMaxS);
    }
  }

  /** The driver heads for the swap station (from the phone, or automatically). */
  goToStation(vehicleId: string, station: StationRef | null): boolean {
    const v = this.find(vehicleId);
    if (!v || v.task === 'stopped_waiting' || v.task === 'swapping') return false;
    const b = v.battery;
    const st = station ?? this.nearest(v);
    const d = st ? distanceM(b.reading.lat, b.reading.lng, st.lat, st.lng) : 2000;
    v.station = st;
    v.task = 'heading_to_station';
    v.taskEndsS = this.tS + d / DRIVER.toStationMs;
    b.load = { ...b.load, speedScale: b.load.speedScale * DRIVER.slowDownFactor };
    return true;
  }

  /** The driver pulls over and waits for the operations team to bring a new pack. */
  stopAndWait(vehicleId: string): boolean {
    const v = this.find(vehicleId);
    if (!v || v.task === 'stopped_waiting') return false;
    v.task = 'stopped_waiting';
    v.taskEndsS = this.tS + DRIVER.rescueS;
    v.control = { ...NO_CONTROL, parked: true };
    return true;
  }

  setManual(vehicleId: string | null): void {
    for (const v of this.vehicles) {
      v.manual = v.reg.id === vehicleId;
      if (v.manual) {
        v.pending = null;
        v.reactAtS = null;
      }
    }
  }

  private advanceDriver(v: WorldVehicle): void {
    if (v.reactAtS !== null && this.tS >= v.reactAtS && v.pending) {
      const n = v.pending;
      v.pending = null;
      v.reactAtS = null;
      this.on.driverAck(n.id);
      if (n.kind === 'stop_now') this.stopAndWait(v.reg.id);
      else this.goToStation(v.reg.id, n.station);
    }
    if (v.taskEndsS === null || this.tS < v.taskEndsS) return;
    if (v.task === 'heading_to_station') {
      v.task = 'swapping';
      v.taskEndsS = this.tS + DRIVER.swapHandlingS;
      v.control = { ...NO_CONTROL, parked: true };
    } else if (v.task === 'swapping' || v.task === 'stopped_waiting') {
      this.swapPack(v);
    }
  }

  /** Put a fresh, charged pack on the vehicle; the old one is kept at the station for inspection. */
  private swapPack(v: WorldVehicle): void {
    const old = v.battery;
    const brand: Brand = old.config.brand;
    const serial = NEW_PACK_SERIAL_BASE + ++this.packCounter;
    const fresh = createBattery({
      seed: this.seed,
      index: serial - 1,
      brand,
      city: 'hcmc',
      env: this.env,
      scenario: { id: 'freshPack', socRange: [0.9, 0.97], soh: 0.93 + 0.05 * uniformFromKey(this.seed, `soh:${serial}`) },
      startTS: this.tS,
    });
    // Same bike, same rider, same road: only the pack is new.
    fresh.config.route = old.config.route;
    fresh.config.cruiseMs = old.config.cruiseMs;
    fresh.distanceM = old.distanceM;
    fresh.reading = { ...fresh.reading, lat: old.reading.lat, lng: old.reading.lng };
    v.battery = fresh;
    v.role = 'normal';
    v.control = NO_CONTROL;
    v.task = 'riding';
    v.taskEndsS = null;
    const stationId = v.station?.id ?? null;
    v.station = null;
    v.reg = { ...v.reg, packId: fresh.config.id };
    this.on.swap(v.reg.id, fresh.config.id, stationId, Math.round(fresh.reading.soc * 100));
  }

  // ------------------------------------------------------------ demo controls

  /** Start an internal short in this vehicle's pack now (presenter button). */
  injectShort(vehicleId: string): boolean {
    const v = this.find(vehicleId);
    if (!v) return false;
    injectFault(v.battery, { onsetS: this.tS, ...SHORT_FAULT });
    return true;
  }

  /** Run the pack down to about 18 % so the low-battery reminder can be shown (presenter button). */
  drainBattery(vehicleId: string): boolean {
    const v = this.find(vehicleId);
    if (!v) return false;
    const b = v.battery;
    const mean = b.cellSoc.reduce((s, x) => s + x, 0) / b.cellSoc.length;
    const target = 0.185;
    if (mean <= target) return false;
    b.cellSoc = b.cellSoc.map((s) => Math.max(0, s - (mean - target)));
    return true;
  }

  private startTrouble(): void {
    const k = this.troubles++;
    const u = (key: string) => uniformFromKey(this.seed, `trouble:${k}:${key}`);
    this.nextTroubleS = this.tS + TROUBLE_EVERY_S[0] + (TROUBLE_EVERY_S[1] - TROUBLE_EVERY_S[0]) * u('gap');
    const healthy = this.vehicles.filter((v) => v.role === 'normal' && !v.manual && v.task === 'riding' && v.battery.mode === 'riding');
    if (healthy.length === 0) return;
    const v = healthy[Math.floor(u('pick') * healthy.length)];
    if (k % 2 === 0) {
      v.role = 'short';
      injectFault(v.battery, { onsetS: this.tS, ...SHORT_FAULT });
    } else {
      // The severe heat-load day of the PoC: 100 kg of cargo, steep climbs, a fast pace and a pack sealed in the sun.
      v.role = 'severe';
      const severe = resolveScenario('severeHeatLoad');
      v.battery.load = { ...v.battery.load, ...severe.load, autoCharge: true };
      v.battery.config.thermalConductanceWPerK *= severe.coolingScale ?? 1;
    }
  }

  // ------------------------------------------------------------ helpers

  private nearest(v: WorldVehicle): StationRef | null {
    const s = nearestStation('hcmc', v.battery.reading.lat, v.battery.reading.lng);
    return s ? { id: s.station.id, lat: s.station.lat, lng: s.station.lng, distanceM: Math.round(s.distanceM) } : null;
  }

  private delay(v: WorldVehicle, key: string, min: number, max: number): number {
    return min + (max - min) * uniformFromKey(this.seed, `${key}:${v.reg.id}:${Math.round(this.tS)}`);
  }
}

/** Deterministic roles: index 0 stays normal so the presenter starts from a calm phone. */
export function assignRoles(seed: number, n: number): Role[] {
  const roles: Role[] = new Array<Role>(n).fill('normal');
  const order = Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1).sort(
    (a, b) => uniformFromKey(seed, `role:${a}`) - uniformFromKey(seed, `role:${b}`),
  );
  let k = 0;
  for (const [role, count] of ROLE_COUNTS) {
    for (let c = 0; c < count && k < order.length; c++) roles[order[k++]] = role;
  }
  return roles;
}
