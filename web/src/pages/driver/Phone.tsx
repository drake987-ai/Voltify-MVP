// A partner's driver app (fictional), with Voltify's battery status and alerts inside it.
// Everything the phone shows comes from what the platform sends a partner: the simple
// driver view and the notifications (with their ready-made text), nothing else.
import {
  BatteryCharging,
  Bell,
  CircleAlert,
  Home,
  MapPin,
  Navigation,
  Phone as PhoneIcon,
  Signal,
  Thermometer,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DriverAppState, DriverNotification, DriverStatus, NotificationAction } from '@voltify/shared';
import { useApp } from '@/data/store';
import { lang } from '@/i18n';
import { ago, clock, km, minutesLeft } from '@/lib/format';

type Tab = 'home' | 'battery' | 'inbox';

const STATUS_COLOR: Record<DriverStatus, string> = {
  good: 'var(--p-good)',
  attention: 'var(--p-attention)',
  check: 'var(--p-check)',
  stop: 'var(--p-stop)',
};

const KIND_ICON = {
  check_battery: CircleAlert,
  stop_now: CircleAlert,
  low_battery: BatteryCharging,
  pack_swapped: Zap,
  maintenance_due: Wrench,
} as const;

function SocRing({ pct, color }: { pct: number; color: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="h-[84px] w-[84px] shrink-0" aria-hidden>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--p-border)" strokeWidth="8" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(c * Math.max(0, Math.min(100, pct))) / 100} ${c}`}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="45" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--p-text)">
        {pct}%
      </text>
    </svg>
  );
}

export function Phone({ state, now }: { state: DriverAppState; now: number }) {
  const { t } = useTranslation();
  const send = useApp((s) => s.send);
  const L = lang();
  const [tab, setTab] = useState<Tab>('home');
  const [banner, setBanner] = useState<DriverNotification | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const seen = useRef<{ vehicle: string; ids: Set<string> } | null>(null);
  const { view, vehicle, notifications, task } = state;

  // A new push notification slides in from the top; switching to another driver does not replay old ones.
  useEffect(() => {
    if (!seen.current || seen.current.vehicle !== vehicle.id) {
      seen.current = { vehicle: vehicle.id, ids: new Set(notifications.map((n) => n.id)) };
      setBanner(null);
      return;
    }
    const fresh = notifications.filter((n) => !seen.current!.ids.has(n.id));
    for (const n of fresh) seen.current.ids.add(n.id);
    const push = fresh.find((n) => n.delivery === 'push');
    if (push) setBanner(push);
  }, [notifications, vehicle.id]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 7000);
    return () => clearTimeout(id);
  }, [banner]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const act = (action: NotificationAction, n: DriverNotification | null) => {
    // Calling support from the critical screen does not dismiss it: the driver still has to confirm they stopped.
    const ackId = action === 'call_support' && n?.delivery === 'critical' ? null : (n?.id ?? null);
    void send({ type: 'driverAction', vehicleId: vehicle.id, action, ...(ackId ? { notificationId: ackId } : {}) });
    if (action === 'call_support') setToast(t('phone.calling'));
    if (action === 'navigate_station') setToast(t('phone.navigating', { station: n?.station?.id ?? view.station?.id ?? '' }));
    setBanner(null);
  };

  const critical = notifications.find((n) => n.delivery === 'critical' && n.acknowledgedAt === null && n.incidentId !== null && n.incidentId === vehicle.incidentId);
  const activeAlert = notifications.find((n) => (n.kind === 'check_battery' || n.kind === 'stop_now') && n.incidentId !== null && n.incidentId === vehicle.incidentId);
  const unread = notifications.filter((n) => n.acknowledgedAt === null && n.delivery !== 'in_app').length;
  const color = STATUS_COLOR[view.status];
  const left = minutesLeft(state.taskEndsAt, now);

  return (
    <div className="phone relative mx-auto flex h-[740px] w-full max-w-[360px] shrink-0 flex-col overflow-hidden rounded-[44px] border-[10px] border-[#0b0f0e] shadow-2xl">
      {/* status bar */}
      <div className="flex items-center justify-between bg-[var(--p-card)] px-6 pt-2.5 pb-1 text-[13px] font-semibold">
        <span>{clock(now)}</span>
        <span className="h-5 w-20 rounded-full bg-[#0b0f0e]" aria-hidden />
        <span className="flex items-center gap-1" aria-hidden>
          <Signal size={13} />
          <Wifi size={13} />
        </span>
      </div>

      {/* app header */}
      <div className="flex items-center justify-between border-b border-[var(--p-border)] bg-[var(--p-card)] px-4 py-2.5">
        <div>
          <div className="text-[15px] font-bold" style={{ color: 'var(--p-brand)' }}>
            {t('phone.appName')}
          </div>
          <div className="text-[11px] text-[var(--p-muted)]">{t('phone.appNote')}</div>
        </div>
        <div className="text-right text-[11px] leading-tight">
          <div className="font-semibold">{vehicle.driverName}</div>
          <div className="text-[var(--p-muted)]">{vehicle.plate}</div>
        </div>
      </div>

      {/* push banner */}
      {banner ? (
        <button
          type="button"
          onClick={() => {
            setTab('home');
            setBanner(null);
          }}
          className="animate-slide-down absolute inset-x-3 top-11 z-30 rounded-2xl bg-white p-3 text-left shadow-xl ring-1 ring-black/10"
        >
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--p-muted)]">
            <span className="grid h-4 w-4 place-items-center rounded bg-[var(--p-brand)] text-white">
              <Zap size={10} />
            </span>
            {t('phone.appName')} · {t('phone.now')}
          </div>
          <div className="mt-1 text-[14px] font-semibold">{banner.title[L]}</div>
          <div className="text-[13px] leading-snug text-[#374151]">{banner.body[L]}</div>
        </button>
      ) : null}

      {/* content */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tab === 'home' ? (
          <div className="space-y-3">
            {task !== 'riding' ? (
              <div className="rounded-2xl bg-[#ecfdf5] p-3 text-[13px] text-[#065f46] ring-1 ring-[#a7f3d0]">
                <div className="font-semibold">{t(`phone.task.${task}`, { station: state.station?.id ?? '' })}</div>
                {left !== null ? <div>{t(`phone.taskLeft.${task}`, { n: left })}</div> : null}
              </div>
            ) : null}

            {activeAlert && task === 'riding' && view.status !== 'good' ? (
              <div className="rounded-2xl p-3 text-white shadow" style={{ background: STATUS_COLOR[activeAlert.kind === 'stop_now' ? 'stop' : 'check'] }}>
                <div className="flex items-center gap-1.5 text-[14px] font-bold">
                  <CircleAlert size={16} /> {activeAlert.title[L]}
                </div>
                <p className="mt-1 text-[13px] leading-snug opacity-95">{activeAlert.body[L]}</p>
                <div className="mt-2.5 flex gap-2">
                  {activeAlert.actions.includes('navigate_station') ? (
                    <button type="button" onClick={() => act('navigate_station', activeAlert)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white px-2 py-2 text-[13px] font-semibold text-[#111827]">
                      <Navigation size={14} /> {t('phone.navigate')}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => act('call_support', activeAlert)} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-white/20 px-2 py-2 text-[13px] font-semibold ring-1 ring-white/60">
                    <PhoneIcon size={14} /> {t('phone.callSupport')}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Voltify battery widget */}
            <div className="rounded-2xl bg-[var(--p-card)] p-3.5 shadow-sm ring-1 ring-[var(--p-border)]">
              <div className="flex items-center justify-between text-[12px] text-[var(--p-muted)]">
                <span>{t('phone.battery')}</span>
                <span className="flex items-center gap-1">
                  <Zap size={11} style={{ color: 'var(--p-brand)' }} /> {t('phone.poweredBy')}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <SocRing pct={view.socPct} color={view.socPct < 20 ? 'var(--p-check)' : 'var(--p-brand)'} />
                <div className="min-w-0">
                  <div className="text-[22px] font-bold leading-none">≈ {view.rangeKm} km</div>
                  <div className="mt-0.5 text-[12px] text-[var(--p-muted)]">{view.charging ? t('phone.charging') : t('phone.rangeLeft')}</div>
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white" style={{ background: color }}>
                    {t(`driverStatus.${view.status}`)}
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-[13px] leading-snug text-[#374151]">{view.tip[L]}</p>
              {view.station && task === 'riding' && !activeAlert ? (
                <button type="button" onClick={() => act('navigate_station', null)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl bg-[var(--p-bg)] px-2 py-2 text-[13px] font-semibold ring-1 ring-[var(--p-border)]">
                  <MapPin size={14} /> {t('phone.toStation', { station: view.station.id, km: km(view.station.distanceM) })}
                </button>
              ) : null}
            </div>

            {/* the partner's own content, unrelated to Voltify */}
            <div className="rounded-2xl bg-[var(--p-card)] p-3.5 text-[13px] shadow-sm ring-1 ring-[var(--p-border)]">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{t('phone.order.title')}</span>
                <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[11px] font-semibold text-[#3730a3]">{t('phone.order.status')}</span>
              </div>
              <div className="mt-2 space-y-1 text-[#374151]">
                <div>• {t('phone.order.pickup')}</div>
                <div>• {t('phone.order.dropoff')}</div>
              </div>
              <div className="mt-2 text-[11px] text-[var(--p-muted)]">{t('phone.order.note')}</div>
            </div>
          </div>
        ) : null}

        {tab === 'battery' ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-[var(--p-card)] p-4 shadow-sm ring-1 ring-[var(--p-border)]">
              <div className="flex items-center gap-3">
                <SocRing pct={view.socPct} color={view.socPct < 20 ? 'var(--p-check)' : 'var(--p-brand)'} />
                <div>
                  <div className="text-[13px] text-[var(--p-muted)]">{t('phone.status')}</div>
                  <div className="text-[18px] font-bold" style={{ color }}>
                    {t(`driverStatus.${view.status}`)}
                  </div>
                  <div className="text-[13px]">≈ {view.rangeKm} km</div>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-snug text-[#374151]">{view.tip[L]}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-[var(--p-card)] p-3 ring-1 ring-[var(--p-border)]">
                <div className="flex items-center gap-1 text-[12px] text-[var(--p-muted)]">
                  <Thermometer size={13} /> {t('phone.temperature')}
                </div>
                <div className="mt-1 text-[15px] font-semibold" style={{ color: view.temperature === 'hot' ? 'var(--p-stop)' : view.temperature === 'warm' ? 'var(--p-attention)' : 'var(--p-good)' }}>
                  {t(`tempBand.${view.temperature}`)}
                </div>
                <div className="text-[12px] text-[var(--p-muted)]">{Math.round(view.tempC)}°C</div>
              </div>
              <div className="rounded-2xl bg-[var(--p-card)] p-3 ring-1 ring-[var(--p-border)]">
                <div className="flex items-center gap-1 text-[12px] text-[var(--p-muted)]">
                  <BatteryCharging size={13} /> {t('phone.health')}
                </div>
                <div className="mt-1 text-[15px] font-semibold">{t(`healthBand.${view.health}`)}</div>
                <div className="text-[12px] text-[var(--p-muted)]">{t(`healthHint.${view.health}`)}</div>
              </div>
            </div>
            <div className="rounded-2xl bg-[var(--p-card)] p-3 text-[12px] text-[var(--p-muted)] ring-1 ring-[var(--p-border)]">
              <div>
                {t('phone.packId')}: <span className="font-mono text-[var(--p-text)]">{vehicle.packId}</span>
              </div>
              <div className="mt-1">{view.learning ? t('phone.learning') : t('phone.checkedEvery')}</div>
            </div>
          </div>
        ) : null}

        {tab === 'inbox' ? (
          <ul className="space-y-2">
            {notifications.length === 0 ? <li className="py-10 text-center text-[13px] text-[var(--p-muted)]">{t('phone.inboxEmpty')}</li> : null}
            {notifications.map((n) => {
              const Icon = KIND_ICON[n.kind];
              return (
                <li key={n.id} className="rounded-2xl bg-[var(--p-card)] p-3 ring-1 ring-[var(--p-border)]">
                  <div className="flex items-start gap-2">
                    <Icon size={16} className="mt-0.5 shrink-0" style={{ color: n.delivery === 'critical' ? 'var(--p-stop)' : n.kind === 'check_battery' ? 'var(--p-check)' : 'var(--p-brand)' }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold">{n.title[L]}</span>
                        <span className="shrink-0 text-[11px] text-[var(--p-muted)]">{ago(n.at, now)}</span>
                      </div>
                      <p className="text-[12px] leading-snug text-[#4b5563]">{n.body[L]}</p>
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--p-muted)]">{t(`delivery.${n.delivery}`)}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {toast ? (
        <div className="absolute inset-x-6 bottom-20 z-30 rounded-xl bg-[#111827] px-3 py-2 text-center text-[13px] text-white shadow-lg" role="status">
          {toast}
        </div>
      ) : null}

      {/* bottom tabs */}
      <nav className="grid grid-cols-3 border-t border-[var(--p-border)] bg-[var(--p-card)] pb-4 pt-1.5 text-[11px]">
        {(
          [
            ['home', Home, t('phone.tab.home')],
            ['battery', BatteryCharging, t('phone.tab.battery')],
            ['inbox', Bell, t('phone.tab.inbox')],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="relative flex flex-col items-center gap-0.5 py-1"
            style={{ color: tab === key ? 'var(--p-brand)' : 'var(--p-muted)' }}
            aria-pressed={tab === key}
          >
            <Icon size={19} />
            {label}
            {key === 'inbox' && unread > 0 ? (
              <span className="absolute top-0 right-[34%] grid h-4 min-w-4 place-items-center rounded-full bg-[var(--p-stop)] px-1 text-[10px] font-bold text-white">{unread}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {/* critical full-screen alert */}
      {critical ? (
        <div className="absolute inset-0 z-40 flex flex-col justify-between bg-[#7f1d1d] p-6 text-white" role="alertdialog" aria-labelledby="crit-title">
          <div className="animate-shake mt-10 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/15 ring-4 ring-white/30">
              <CircleAlert size={44} />
            </div>
            <h3 id="crit-title" className="mt-5 text-[24px] leading-tight font-bold">
              {critical.title[L]}
            </h3>
            <p className="mt-3 text-[15px] leading-snug opacity-95">{critical.body[L]}</p>
          </div>
          <div className="space-y-2.5">
            <button type="button" onClick={() => act('confirm_stopped', critical)} className="w-full rounded-2xl bg-white py-3.5 text-[16px] font-bold text-[#7f1d1d]">
              {t('phone.confirmStopped')}
            </button>
            <button type="button" onClick={() => act('call_support', critical)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-[15px] font-semibold ring-1 ring-white/50">
              <PhoneIcon size={16} /> {t('phone.callSupport')}
            </button>
            <p className="text-center text-[11px] opacity-75">{t('phone.criticalNote')}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
