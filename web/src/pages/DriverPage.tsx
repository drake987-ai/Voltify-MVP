// Screen 1: the driver's side. A simulated partner app (left) shows what a driver would
// see; the presenter's panel (right) drives the demo and shows what Voltify computed
// behind the four-word status, and the webhook that carried it.
import { BatteryWarning, Check, Flame, Info, Shuffle, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { RISK_LEVELS, RISK_RANK, type DriverStatus } from '@voltify/shared';
import { ReasonList } from '@/components/Reasons';
import { Button, Card, LEVEL_COLOR, RiskBadge } from '@/components/ui';
import { useApp } from '@/data/store';
import { Phone } from './driver/Phone';

const LEVEL_TO_STATUS: Record<(typeof RISK_LEVELS)[number], DriverStatus> = { safe: 'good', watch: 'attention', warning: 'check', danger: 'stop' };

export default function DriverPage() {
  const { t } = useTranslation();
  const snapshot = useApp((s) => s.snapshot);
  const driverId = useApp((s) => s.driverId);
  const setDriver = useApp((s) => s.setDriver);
  const send = useApp((s) => s.send);

  // The person at the keyboard plays this driver: the simulator stops reacting for them.
  useEffect(() => {
    void send({ type: 'focusDriver', vehicleId: driverId });
    return () => void send({ type: 'focusDriver', vehicleId: null });
  }, [driverId, send, snapshot === null]);

  const vehicles = useMemo(() => [...(snapshot?.vehicles ?? [])].sort((a, b) => a.id.localeCompare(b.id)), [snapshot?.vehicles]);
  const driver = snapshot?.driver;
  // The webhook that carried this driver's latest notification (rebuilt from it if it has left the recent-events list).
  const lastWebhook = useMemo(() => {
    const n = driver?.notifications[0];
    if (!n) return null;
    const sent = snapshot?.events.find((e) => e.type === 'driver.notification' && (e.data.notification as { id: string }).id === n.id);
    return (
      sent ?? {
        type: 'driver.notification',
        createdAt: new Date(n.at).toISOString(),
        data: { notification: n, vehicle: { id: driver.vehicle.id, plate: driver.vehicle.plate, driverName: driver.vehicle.driverName } },
      }
    );
  }, [snapshot?.events, driver]);

  if (!snapshot || !driver) return <p className="text-muted">{t('source.connecting')}</p>;

  const worst = snapshot.vehicles.find((v) => v.id !== driverId && RISK_RANK[v.level] >= RISK_RANK.warning);

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className="min-w-0">
        <Phone state={driver} now={snapshot.simTimeMs} />
        <p className="mx-auto mt-3 max-w-[360px] text-center text-xs text-muted">{t('driver.phoneCaption')}</p>
      </div>

      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t('driver.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t('driver.intro')}</p>
        </div>

        <Card title={t('driver.presenter')}>
          <div className="space-y-3 p-4">
            <label className="block text-sm">
              <span className="text-muted">{t('driver.pick')}</span>
              <select
                value={driverId}
                onChange={(e) => setDriver(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm"
              >
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} · {v.plate} · {v.driverName} — {t(`level.${v.level}`)}
                    {snapshot.demo.roles[v.id] && snapshot.demo.roles[v.id] !== 'normal' ? ` (${t(`role.${snapshot.demo.roles[v.id]}`)})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => void send({ type: 'injectShort', vehicleId: driverId })}>
                <Flame size={15} /> {t('driver.injectShort')}
              </Button>
              <Button onClick={() => void send({ type: 'drainBattery', vehicleId: driverId })}>
                <BatteryWarning size={15} /> {t('driver.drain')}
              </Button>
              <Button onClick={() => worst && setDriver(worst.id)} disabled={!worst}>
                <Shuffle size={15} /> {t('driver.jumpToIncident')}
              </Button>
            </div>
            <p className="flex gap-1.5 text-xs text-muted">
              <Info size={14} className="mt-px shrink-0" />
              {t('driver.manualNote', { speed: snapshot.speed })}
            </p>
          </div>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={t('driver.behind')} right={<RiskBadge level={driver.behind.level} score={driver.behind.score} />}>
            <div className="space-y-3 p-4">
              {driver.behind.learning ? <p className="text-sm text-muted">{t('driver.learning')}</p> : <ReasonList reasons={driver.behind.reasons} />}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 font-medium">{t('driver.mapAi')}</th>
                    <th className="py-1 font-medium">{t('driver.mapDriver')}</th>
                    <th className="py-1 font-medium">{t('driver.mapHow')}</th>
                  </tr>
                </thead>
                <tbody>
                  {RISK_LEVELS.map((lv) => {
                    const active = lv === driver.behind.level;
                    return (
                      <tr key={lv} className={active ? 'bg-surface-2' : ''}>
                        <td className="py-1.5 pl-1">
                          <span style={{ color: LEVEL_COLOR[lv] }}>{t(`level.${lv}`)}</span>
                          <span className="text-xs text-muted"> {t(`scoreRange.${lv}`)}</span>
                        </td>
                        <td className="py-1.5 font-medium">{t(`driverStatus.${LEVEL_TO_STATUS[lv]}`)}</td>
                        <td className="py-1.5 text-xs text-muted">{t(`deliveryFor.${lv}`)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={t('driver.principles')}>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-1.5 text-xs font-semibold text-risk-safe uppercase">{t('driver.show')}</h3>
                <ul className="space-y-1 text-sm">
                  {(t('driver.showList', { returnObjects: true }) as string[]).map((s) => (
                    <li key={s} className="flex gap-1.5">
                      <Check size={15} className="mt-0.5 shrink-0 text-risk-safe" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-1.5 text-xs font-semibold text-risk-danger uppercase">{t('driver.hide')}</h3>
                <ul className="space-y-1 text-sm">
                  {(t('driver.hideList', { returnObjects: true }) as string[]).map((s) => (
                    <li key={s} className="flex gap-1.5">
                      <X size={15} className="mt-0.5 shrink-0 text-risk-danger" /> {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>

        <Card title={t('driver.webhook')} right={<span className="text-xs text-muted">POST https://partner.example/voltify</span>}>
          <div className="p-4">
            {lastWebhook ? (
              <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed">{JSON.stringify(lastWebhook, null, 2)}</pre>
            ) : (
              <p className="text-sm text-muted">{t('driver.noWebhook')}</p>
            )}
            <p className="mt-2 text-xs text-muted">{t('driver.webhookNote')}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
