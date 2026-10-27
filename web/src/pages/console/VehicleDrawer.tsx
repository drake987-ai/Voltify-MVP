// Everything about one vehicle on one panel: who rides it, its battery now and over the
// last hour, why the AI scored it so, the incident timeline and what the driver was told.
import { Phone, Smartphone, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { VehicleDetail } from '@voltify/shared';
import { ReasonList } from '@/components/Reasons';
import { Card, LEVEL_COLOR, RiskBadge, Sparkline } from '@/components/ui';
import { useApp } from '@/data/store';
import { lang } from '@/i18n';
import { ago, clock, num } from '@/lib/format';

export function VehicleDrawer({ detail, now, onClose }: { detail: VehicleDetail; now: number; onClose: () => void }) {
  const { t } = useTranslation();
  const setDriver = useApp((s) => s.setDriver);
  const v = detail.vehicle;
  const h = detail.history;
  const inc = detail.incident;
  const L = lang();

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {v.plate} <span className="font-normal text-muted">· {v.id}</span>
        </span>
      }
      right={
        <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-surface-2" aria-label={t('ui.close')}>
          <X size={16} />
        </button>
      }
    >
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-medium">{v.driverName}</div>
            <a href={`tel:${v.driverPhone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-sm text-accent">
              <Phone size={13} /> {v.driverPhone}
            </a>
          </div>
          {v.learning ? <span className="text-xs text-muted">{t('console.learning')}</span> : <RiskBadge level={v.level} score={v.score} size="md" />}
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            [t('console.col.soc'), `${v.socPct}%`],
            [t('console.range'), `${v.rangeKm} km`],
            [t('console.col.temp'), `${num(v.tempC, 1)}°C`],
            [t('console.col.soh'), v.sohPct === null ? '–' : `${v.sohPct}%`],
          ].map(([k, val]) => (
            <div key={k} className="rounded-lg bg-surface-2 px-1 py-2">
              <div className="text-[11px] text-muted">{k}</div>
              <div className="font-semibold">{val}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-muted">{t('console.chart.temp')}</div>
            <Sparkline values={h.map((p) => p.tempC)} color="var(--c-risk-warning)" min={25} label={t('console.chart.temp')} />
          </div>
          <div>
            <div className="text-xs text-muted">{t('console.chart.soc')}</div>
            <Sparkline values={h.map((p) => p.socPct)} color="var(--c-accent)" min={0} max={100} label={t('console.chart.soc')} />
          </div>
          <div>
            <div className="text-xs text-muted">{t('console.chart.score')}</div>
            <Sparkline values={h.map((p) => p.score)} color={LEVEL_COLOR[v.level]} min={0} max={100} label={t('console.chart.score')} />
          </div>
        </div>

        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-muted uppercase">{t('console.why')}</h3>
          <ReasonList reasons={inc && inc.status !== 'resolved' && detail.reasons.length === 0 ? inc.reasons : detail.reasons} />
        </div>

        {inc ? (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold text-muted uppercase">{t('console.timeline', { id: inc.id })}</h3>
            <ol className="space-y-1 border-l border-border pl-3 text-sm">
              {inc.timeline.map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-1.5 -left-[17px] h-2 w-2 rounded-full bg-accent" />
                  <span className="mr-2 font-mono text-xs text-muted">{clock(e.at, true)}</span>
                  {t(`timeline.${e.kind}`, { level: e.level ? t(`level.${e.level}`) : '', by: e.by ?? '', station: e.stationId ?? '', pack: e.packId ?? '' })}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-muted uppercase">{t('console.sentToDriver')}</h3>
          {detail.notifications.length === 0 ? <p className="text-sm text-muted">{t('console.nothingSent')}</p> : null}
          <ul className="space-y-1.5 text-sm">
            {detail.notifications.slice(0, 5).map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-2">
                <span>
                  <span className="font-medium">{n.title[L]}</span>
                  <span className="ml-1.5 text-xs text-muted">{t(`delivery.${n.delivery}`)}</span>
                  {n.acknowledgedAt !== null ? <span className="ml-1.5 text-xs text-accent">✓ {t('console.seen')}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted">{ago(n.at, now)}</span>
              </li>
            ))}
          </ul>
        </div>

        <Link to="/driver" onClick={() => setDriver(v.id)} className="inline-flex items-center gap-1.5 text-sm text-accent">
          <Smartphone size={14} /> {t('console.openAsDriver')}
        </Link>
      </div>
    </Card>
  );
}
