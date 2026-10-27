// The manager's to-do list: open incidents, most severe first, each with the one line
// that says why, what the driver was told, and the three things a manager does.
import { BellRing, Check, CheckCheck, Hand, MapPin, PhoneCall, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Incident } from '@voltify/shared';
import { mainReason } from '@/components/Reasons';
import { Button, LEVEL_COLOR, RiskBadge } from '@/components/ui';
import { useApp } from '@/data/store';
import { ago, clock, km } from '@/lib/format';

function IncidentCard({ inc, now, selected, onSelect }: { inc: Incident; now: number; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const send = useApp((s) => s.send);
  const by = t('console.managerName');
  const notified = inc.timeline.some((e) => e.kind === 'driver_notified');
  const confirmed = inc.timeline.some((e) => e.kind === 'driver_confirmed');
  const resolved = inc.status === 'resolved';

  return (
    <li
      className={`rounded-xl border bg-surface p-3 ${selected ? 'border-accent' : 'border-border'}`}
      style={!resolved ? { borderLeft: `4px solid ${LEVEL_COLOR[inc.level]}` } : undefined}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">
              {inc.plate} <span className="font-normal text-muted">· {inc.driverName}</span>
            </div>
            <div className="text-xs text-muted">
              {inc.id} · {t('console.openedAt', { time: clock(inc.openedAt), ago: ago(inc.openedAt, now) })}
            </div>
          </div>
          <RiskBadge level={resolved ? inc.peakLevel : inc.level} score={resolved ? inc.peakScore : inc.score} />
        </div>
        <p className="mt-1.5 text-sm">{mainReason(inc.reasons, t)}</p>
        {inc.station && !resolved ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <MapPin size={12} /> {t('console.sentTo', { id: inc.station.id, km: km(inc.station.distanceM) })}
          </p>
        ) : null}
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${notified ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted'}`}>
          <BellRing size={11} /> {t('console.chip.notified')}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${confirmed ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted'}`}>
          <Check size={11} /> {t('console.chip.confirmed')}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${inc.status !== 'open' ? 'bg-accent/15 text-accent' : 'bg-risk-warning/15 text-risk-warning'}`}>
          <Hand size={11} /> {inc.status === 'open' ? t('console.chip.waiting') : t(`incidentStatus.${inc.status}`)}
        </span>
        {resolved && inc.resolution ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">{t(`resolution.${inc.resolution}`)}</span> : null}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {inc.status === 'open' ? (
          <Button variant="primary" onClick={() => void send({ type: 'acknowledge', incidentId: inc.id, by })}>
            <CheckCheck size={14} /> {t('console.ack')}
          </Button>
        ) : null}
        {!resolved ? (
          <Button onClick={() => void send({ type: 'callDriver', incidentId: inc.id, by })}>
            <PhoneCall size={14} /> {t('console.call')}
          </Button>
        ) : null}
        {inc.label === null ? (
          <>
            <Button onClick={() => void send({ type: 'resolve', incidentId: inc.id, by, label: 'confirmed' })} title={t('console.labelHint')}>
              <ThumbsUp size={14} /> {resolved ? t('console.labelConfirmed') : t('console.closeConfirmed')}
            </Button>
            <Button variant="ghost" onClick={() => void send({ type: 'resolve', incidentId: inc.id, by, label: 'false_alarm' })} title={t('console.labelHint')}>
              <ThumbsDown size={14} /> {t('console.falseAlarm')}
            </Button>
          </>
        ) : (
          <span className="self-center text-xs text-muted">{t(`label.${inc.label}`)}</span>
        )}
      </div>
    </li>
  );
}

export function IncidentQueue({ incidents, now, selectedId, onSelect }: { incidents: Incident[]; now: number; selectedId: string | null; onSelect: (vehicleId: string) => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'active' | 'resolved'>('active');
  const active = incidents.filter((i) => i.status !== 'resolved');
  const resolved = incidents.filter((i) => i.status === 'resolved');
  const list = tab === 'active' ? active : resolved;
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{t('console.incidents')}</h2>
        <div className="flex rounded-lg border border-border p-0.5 text-xs" role="tablist">
          {(['active', 'resolved'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`rounded-md px-2 py-0.5 ${tab === k ? 'bg-surface-2 font-semibold' : 'text-muted'}`}
            >
              {t(`console.tab.${k}`)} ({k === 'active' ? active.length : resolved.length})
            </button>
          ))}
        </div>
      </header>
      <ul className="max-h-[560px] min-h-[200px] space-y-2 overflow-y-auto p-2.5">
        {list.length === 0 ? <li className="py-10 text-center text-sm text-muted">{tab === 'active' ? t('console.noIncidents') : t('console.noResolved')}</li> : null}
        {list.map((inc) => (
          <IncidentCard key={inc.id} inc={inc} now={now} selected={inc.vehicleId === selectedId} onSelect={() => onSelect(inc.vehicleId)} />
        ))}
      </ul>
    </section>
  );
}
