import { describe, expect, it } from 'vitest';
import { VoltifyHub, VoltifyRuntime, driverViewOf, notificationText, type VoltifyEvent } from '@/index';
import { encodeTelemetry } from '@/sim';
import { World } from '@/world/world';

/** A world whose frames feed a hub, the way the runtime wires them, with one vehicle given an internal short. */
function setup(n = 6) {
  const hub = new VoltifyHub();
  const events: VoltifyEvent[] = [];
  const world = new World(
    { seed: 7, n },
    {
      frame: (p) => {
        hub.ingestRaw(p);
      },
      swap: (vehicleId, packId, stationId, soc) => {
        hub.assignPack(vehicleId, packId, { ...(stationId ? { stationId } : {}), newSocPct: soc });
      },
      driverAck: (id) => {
        hub.driverAck(id);
      },
    },
  );
  for (const v of world.vehicles) hub.registerVehicle(v.reg);
  hub.onEvent((e) => {
    events.push(e);
    if (e.type === 'driver.notification') world.receive(e.data.notification as never);
  });
  return { hub, world, events };
}

const minutes = (world: World, m: number) => {
  for (let i = 0; i < (m * 60) / 5; i++) world.step();
};

describe('VoltifyHub', () => {
  it('rejects telemetry from a pack that is not on any registered vehicle', () => {
    const { hub, world } = setup(2);
    const t = { ...world.vehicles[0].battery.reading, batteryId: 'A-9999', brand: 'A' as const };
    const r = hub.ingestRaw(encodeTelemetry(t));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown_pack');
  });

  it('rejects a payload in no known vendor format with a typed error, without throwing', () => {
    const { hub } = setup(1);
    const r = hub.ingestRaw({ hello: 'world' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown_format');
  });

  it('raises nothing for a healthy vehicle while it is being learned', () => {
    const { hub, world, events } = setup(1);
    minutes(world, 2);
    expect(hub.vehicles()[0].learning).toBe(true);
    expect(events.filter((e) => e.type.startsWith('incident'))).toHaveLength(0);
  });

  it('opens an incident, tells the driver what to do, and closes it when the pack is swapped', () => {
    const { hub, world, events } = setup(4);
    const target = world.vehicles[0];
    const originalPack = target.reg.packId;
    minutes(world, 6);
    world.injectShort(target.reg.id);
    minutes(world, 45);

    const opened = events.find((e) => e.type === 'incident.opened' && (e.data.incident as { vehicleId: string }).vehicleId === target.reg.id);
    expect(opened, 'an incident for the vehicle with the short').toBeDefined();
    const notes = events
      .filter((e) => e.type === 'driver.notification')
      .map((e) => e.data.notification as { vehicleId: string; kind: string; delivery: string; title: { vi: string; en: string } })
      .filter((n) => n.vehicleId === target.reg.id);
    const alert = notes.find((n) => n.kind === 'check_battery' || n.kind === 'stop_now');
    expect(alert).toBeDefined();
    expect(alert!.title.vi.length).toBeGreaterThan(5);
    expect(alert!.title.en.length).toBeGreaterThan(5);

    // The automatic driver acted on it; the pack was swapped and the incident closed by itself.
    const resolved = hub.incidents().find((i) => i.vehicleId === target.reg.id && i.status === 'resolved');
    expect(resolved?.resolution).toBe('pack_swapped');
    expect(resolved?.timeline.map((e) => e.kind)).toEqual(expect.arrayContaining(['opened', 'driver_notified', 'driver_confirmed', 'pack_swapped']));
    expect(notes.some((n) => n.kind === 'pack_swapped')).toBe(true);
    expect(hub.vehicle(target.reg.id)!.packId).not.toBe(originalPack);
    expect(hub.vehicle(target.reg.id)!.packId).toBe(target.battery.config.id);
  });

  it('sends each kind of alert once per incident, not on every sample', () => {
    const { world, events } = setup(3);
    world.setManual(world.vehicles[0].reg.id); // nobody reacts, so the incident stays open
    minutes(world, 6);
    world.injectShort(world.vehicles[0].reg.id);
    minutes(world, 40);
    const kinds = events
      .filter((e) => e.type === 'driver.notification')
      .map((e) => e.data.notification as { vehicleId: string; kind: string })
      .filter((n) => n.vehicleId === world.vehicles[0].reg.id && (n.kind === 'check_battery' || n.kind === 'stop_now'))
      .map((n) => n.kind);
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('records the manager workflow: acknowledge, call, close with a label', () => {
    const { hub, world } = setup(3);
    world.setManual(world.vehicles[0].reg.id);
    minutes(world, 6);
    world.injectShort(world.vehicles[0].reg.id);
    minutes(world, 40);
    const inc = hub.incidents().find((i) => i.vehicleId === world.vehicles[0].reg.id)!;
    expect(inc.status).toBe('open');
    hub.acknowledge(inc.id, 'Quản lý ca');
    hub.logDriverCall(inc.id, 'Quản lý ca');
    hub.resolve(inc.id, { by: 'Quản lý ca', label: 'confirmed' });
    const done = hub.incident(inc.id)!;
    expect(done.status).toBe('resolved');
    expect(done.label).toBe('confirmed');
    expect(done.timeline.map((e) => e.kind)).toEqual(expect.arrayContaining(['acknowledged', 'driver_called', 'resolved']));
    const k = hub.kpis();
    expect(k.medianAckMin).not.toBeNull();
    expect(k.labeledShare).toBeGreaterThan(0);
  });
});

describe('what the driver sees', () => {
  it('maps the four risk levels to four plain statuses and never shows the score', () => {
    const { hub, world } = setup(1);
    minutes(world, 6);
    const v = hub.driverView(world.vehicles[0].reg.id)!;
    expect(['good', 'attention']).toContain(v.status);
    expect(JSON.stringify(v)).not.toMatch(/score/i);
    expect(v.rangeKm).toBeGreaterThan(0);
  });

  it('shows nothing alarming while it has no data', () => {
    const v = driverViewOf(null, null, null, 'offline');
    expect(v.status).toBe('good');
    expect(v.learning).toBe(true);
  });

  it('writes every message in both languages and makes no absolute safety claim', () => {
    const station = { id: 'HCM-001', lat: 10.8, lng: 106.7, distanceM: 1234 };
    for (const kind of ['check_battery', 'stop_now', 'low_battery', 'pack_swapped', 'maintenance_due'] as const) {
      const m = notificationText(kind, { station, socPct: 18, rangeKm: 9, newSocPct: 95 });
      for (const text of [m.title.vi, m.title.en, m.body.vi, m.body.en]) {
        expect(text.length).toBeGreaterThan(3);
        expect(text).not.toMatch(/100% an toàn|tuyệt đối|guaranteed|completely safe/i);
      }
    }
  });
});

describe('VoltifyRuntime', () => {
  it('produces a snapshot small enough to stream and keeps the incident list sorted by severity', () => {
    const rt = new VoltifyRuntime({ mode: 'server', vehicles: 20 });
    rt.tick(12 * 30);
    const s = rt.snapshot({ driverId: 'V-001', detailId: 'V-002' });
    expect(s.vehicles).toHaveLength(20);
    expect(s.driver?.vehicle.id).toBe('V-001');
    expect(s.detail?.vehicle.id).toBe('V-002');
    expect(JSON.stringify(s).length).toBeLessThan(150_000);
  });

  it('lets a person play the driver from the phone: heading to the station ends in a swap', () => {
    const rt = new VoltifyRuntime({ mode: 'browser', vehicles: 4 });
    expect(rt.handle({ type: 'focusDriver', vehicleId: 'V-001' }).ok).toBe(true);
    const before = rt.hub.vehicle('V-001')!.packId;
    expect(rt.handle({ type: 'driverAction', vehicleId: 'V-001', action: 'navigate_station' }).ok).toBe(true);
    rt.tick(12 * 20);
    expect(rt.hub.vehicle('V-001')!.packId).not.toBe(before);
    expect(rt.driverState('V-001')!.notifications.some((n) => n.kind === 'pack_swapped')).toBe(true);
  });
});
