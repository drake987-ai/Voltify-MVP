// Landing screen: what Voltify is in one sentence, the integration flow, and the way in
// to the two demo screens.
import { ArrowRight, LayoutDashboard, PlugZap, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, Kpi, LEVEL_COLOR } from '@/components/ui';
import { useApp } from '@/data/store';

const FLOW = ['bms', 'vendor', 'voltify', 'webhook', 'partner', 'driver'] as const;

export function OverviewPage() {
  const { t } = useTranslation();
  const snapshot = useApp((s) => s.snapshot);
  const k = snapshot?.kpis;

  const entries = [
    { to: '/driver', icon: Smartphone, key: 'driver' },
    { to: '/console', icon: LayoutDashboard, key: 'console' },
    { to: '/integration', icon: PlugZap, key: 'integration' },
  ] as const;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-6 md:p-8">
        <p className="text-sm font-semibold text-accent">{t('overview.kicker')}</p>
        <h1 className="mt-2 max-w-3xl text-2xl leading-tight font-bold md:text-3xl">{t('overview.headline')}</h1>
        <p className="mt-3 max-w-3xl text-muted">{t('overview.sub')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/driver" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
            {t('overview.ctaDriver')} <ArrowRight size={15} />
          </Link>
          <Link to="/console" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold">
            {t('overview.ctaConsole')}
          </Link>
        </div>
      </section>

      <Card title={t('overview.flowTitle')}>
        <div className="p-4">
          <ol className="grid gap-2 md:grid-cols-6">
            {FLOW.map((step, i) => (
              <li key={step} className={`relative rounded-xl border p-3 ${step === 'voltify' ? 'border-accent bg-accent/10' : 'border-border bg-surface-2'}`}>
                <div className="text-xs text-muted">{i + 1}</div>
                <div className="text-sm font-semibold">{t(`overview.flow.${step}.title`)}</div>
                <div className="mt-0.5 text-xs text-muted">{t(`overview.flow.${step}.body`)}</div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-muted">{t('overview.flowNote')}</p>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {entries.map(({ to, icon: Icon, key }) => (
          <Link key={to} to={to} className="group rounded-xl border border-border bg-surface p-5 hover:border-accent">
            <Icon className="text-accent" size={22} />
            <h2 className="mt-3 font-semibold">{t(`overview.cards.${key}.title`)}</h2>
            <p className="mt-1 text-sm text-muted">{t(`overview.cards.${key}.body`)}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm text-accent">
              {t('overview.open')} <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      {k ? (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
          <Kpi label={t('kpi.online')} value={`${k.online}/${k.vehicles}`} />
          <Kpi label={t('level.warning')} value={k.levelCounts[2]} color={LEVEL_COLOR.warning} />
          <Kpi label={t('level.danger')} value={k.levelCounts[3]} color={LEVEL_COLOR.danger} />
          <Kpi label={t('kpi.openIncidents')} value={k.openIncidents} />
          <Kpi label={t('kpi.notifications')} value={k.notificationsSent} />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('overview.scriptTitle')}>
          <ol className="list-decimal space-y-1.5 p-4 pl-8 text-sm">
            {(t('overview.script', { returnObjects: true }) as string[]).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Card>
        <Card title={t('overview.honestTitle')}>
          <ul className="list-disc space-y-1.5 p-4 pl-8 text-sm text-muted">
            {(t('overview.honest', { returnObjects: true }) as string[]).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
