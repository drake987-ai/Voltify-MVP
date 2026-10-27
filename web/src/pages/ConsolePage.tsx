// Screen 2: the fleet manager's remote console. Who is on the road, who is in trouble,
// what the driver has been told, and the manager's own actions (take, call, close + label).
import { useTranslation } from 'react-i18next';
import { Kpi, LEVEL_COLOR } from '@/components/ui';
import { useApp } from '@/data/store';
import { num } from '@/lib/format';
import { FleetMap } from './console/FleetMap';
import { IncidentQueue } from './console/IncidentQueue';
import { VehicleDrawer } from './console/VehicleDrawer';
import { VehicleTable } from './console/VehicleTable';

export default function ConsolePage() {
  const { t } = useTranslation();
  const snapshot = useApp((s) => s.snapshot);
  const detailId = useApp((s) => s.detailId);
  const setDetail = useApp((s) => s.setDetail);
  if (!snapshot) return <p className="text-muted">{t('source.connecting')}</p>;
  const k = snapshot.kpis;
  const detail = snapshot.detail && snapshot.detail.vehicle.id === detailId ? snapshot.detail : null;
  const station = detail?.incident && detail.incident.status !== 'resolved' ? detail.incident.station : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t('console.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t('console.intro')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
        <Kpi label={t('kpi.online')} value={`${k.online}/${k.vehicles}`} />
        <Kpi label={t('level.safe')} value={k.levelCounts[0]} color={LEVEL_COLOR.safe} />
        <Kpi label={t('level.watch')} value={k.levelCounts[1]} color={LEVEL_COLOR.watch} />
        <Kpi label={t('level.warning')} value={k.levelCounts[2]} color={LEVEL_COLOR.warning} />
        <Kpi label={t('level.danger')} value={k.levelCounts[3]} color={LEVEL_COLOR.danger} />
        <Kpi label={t('kpi.unacknowledged')} value={k.unacknowledged} hint={t('kpi.openOf', { n: k.openIncidents })} color={k.unacknowledged > 0 ? LEVEL_COLOR.warning : undefined} />
        <Kpi label={t('kpi.ack')} value={k.medianAckMin === null ? '–' : t('kpi.minutes', { n: num(k.medianAckMin, 1) })} hint={t('kpi.ackHint')} />
        <Kpi label={t('kpi.maintenance')} value={k.maintenanceDue} hint={k.labeledShare === null ? t('kpi.labeledNone') : t('kpi.labeled', { pct: Math.round(k.labeledShare * 100) })} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-4">
          <FleetMap vehicles={snapshot.vehicles} selectedId={detailId} station={station} onPick={setDetail} height={440} />
          <VehicleTable vehicles={snapshot.vehicles} selectedId={detailId} onSelect={setDetail} />
        </div>
        <div className="space-y-4">
          {detail ? <VehicleDrawer detail={detail} now={snapshot.simTimeMs} onClose={() => setDetail(null)} /> : null}
          <IncidentQueue incidents={snapshot.incidents} now={snapshot.simTimeMs} selectedId={detailId} onSelect={setDetail} />
        </div>
      </div>
    </div>
  );
}
