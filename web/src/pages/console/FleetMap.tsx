// Leaflet map of the fleet: one marker per vehicle, coloured by risk level (with a pulse
// for danger), and the swap station of the selected incident. Falls back to a plain
// background when map tiles cannot be loaded (offline demo).
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CITY_BOX, type StationRef, type VehicleRow } from '@voltify/shared';
import { LEVEL_COLOR } from '@/components/ui';

const CENTER: [number, number] = [(CITY_BOX.hcmc.latMin + CITY_BOX.hcmc.latMax) / 2, (CITY_BOX.hcmc.lngMin + CITY_BOX.hcmc.lngMax) / 2];
const TILE_URL: string = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function icon(v: VehicleRow, selected: boolean): L.DivIcon {
  const pulse = v.level === 'danger' || v.level === 'warning';
  return L.divIcon({
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<div class="vmarker ${pulse ? 'marker-pulse' : ''} ${selected ? 'selected' : ''}" style="background:${LEVEL_COLOR[v.level]};color:${LEVEL_COLOR[v.level]}"></div>`,
  });
}

export function FleetMap({ vehicles, selectedId, station, onPick, height = 420 }: { vehicles: VehicleRow[]; selectedId: string | null; station: StationRef | null; onPick: (id: string) => void; height?: number }) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, { m: L.Marker; key: string }>());
  const stationMarker = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { zoomControl: true }).setView(CENTER, 12);
    const tiles = L.tileLayer(TILE_URL, { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    let loaded = 0;
    let errors = 0;
    tiles.on('tileload', () => loaded++);
    tiles.on('tileerror', () => {
      if (++errors >= 4 && loaded === 0) {
        m.removeLayer(tiles);
        setOffline(true);
      }
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);
    const ms = markers.current;
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      ms.clear();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const v of vehicles) {
      if (v.activity === 'offline' || (v.lat === 0 && v.lng === 0)) continue;
      seen.add(v.id);
      const selected = v.id === selectedId;
      const key = `${v.level}|${selected}`;
      const existing = markers.current.get(v.id);
      if (existing) {
        existing.m.setLatLng([v.lat, v.lng]);
        if (existing.key !== key) {
          existing.m.setIcon(icon(v, selected));
          existing.m.setZIndexOffset(selected ? 1000 : v.level === 'danger' ? 500 : v.level === 'warning' ? 300 : 0);
          existing.key = key;
        }
        existing.m.setTooltipContent(`${v.plate} · ${t(`level.${v.level}`)}`);
      } else {
        const mk = L.marker([v.lat, v.lng], { icon: icon(v, selected), keyboard: true, title: v.plate })
          .addTo(m)
          .bindTooltip(`${v.plate} · ${t(`level.${v.level}`)}`, { direction: 'top', offset: [0, -8] })
          .on('click', () => onPickRef.current(v.id));
        markers.current.set(v.id, { m: mk, key });
      }
    }
    for (const [id, { m: mk }] of markers.current) {
      if (!seen.has(id)) {
        mk.remove();
        markers.current.delete(id);
      }
    }
  }, [vehicles, selectedId, t]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    stationMarker.current?.remove();
    stationMarker.current = station
      ? L.marker([station.lat, station.lng], { icon: L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<div class="station-marker"></div>' }) })
          .addTo(m)
          .bindTooltip(t('console.station', { id: station.id }), { permanent: true, direction: 'right', offset: [8, 0] })
      : null;
  }, [station, t]);

  useEffect(() => {
    const v = vehicles.find((x) => x.id === selectedId);
    if (v && map.current) map.current.panTo([v.lat, v.lng], { animate: true });
    // Pan only when the selection changes, not on every position update.
  }, [selectedId]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border" style={{ height }}>
      <div ref={host} className="fleet-map h-full w-full" role="application" aria-label={t('console.mapAria')} />
      {offline ? (
        <p className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-md border border-border bg-surface/90 px-2 py-1 text-xs text-muted">{t('console.mapOffline')}</p>
      ) : null}
    </div>
  );
}
