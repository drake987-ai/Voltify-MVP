import { Gauge, LayoutDashboard, Moon, Pause, Play, PlugZap, Smartphone, Sun, Zap } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { SPEEDS } from '@voltify/shared';
import { useApp } from '@/data/store';
import { clock } from '@/lib/format';
import { safeStorage, STORAGE_KEYS } from '@/lib/safeStorage';
import { DataBadge } from './ui';

const NAV = [
  { to: '/', key: 'nav.overview', icon: Zap, end: true },
  { to: '/driver', key: 'nav.driver', icon: Smartphone },
  { to: '/console', key: 'nav.console', icon: LayoutDashboard },
  { to: '/integration', key: 'nav.integration', icon: PlugZap },
];

function SimControls() {
  const { t } = useTranslation();
  const snapshot = useApp((s) => s.snapshot);
  const status = useApp((s) => s.status);
  const send = useApp((s) => s.send);
  if (!snapshot) return <span className="text-xs text-muted">{t(`source.${status}`)}</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span className="hidden text-xs text-muted lg:inline">{t('sim.clock')}</span>
      <span className="font-mono text-sm font-semibold" aria-live="off">
        {clock(snapshot.simTimeMs, true)}
      </span>
      <button
        type="button"
        className="rounded-md p-1.5 hover:bg-surface-2"
        onClick={() => void send({ type: 'setPaused', paused: !snapshot.paused })}
        aria-label={snapshot.paused ? t('sim.play') : t('sim.pause')}
        title={snapshot.paused ? t('sim.play') : t('sim.pause')}
      >
        {snapshot.paused ? <Play size={16} /> : <Pause size={16} />}
      </button>
      <div className="flex items-center rounded-lg border border-border p-0.5" role="group" aria-label={t('sim.speed')}>
        <Gauge size={14} className="mx-1 text-muted" aria-hidden />
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void send({ type: 'setSpeed', speed: s })}
            className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${snapshot.speed === s ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text'}`}
            aria-pressed={snapshot.speed === s}
            title={t('sim.speedHint', { n: s })}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggles() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
  const flipTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    safeStorage.set(STORAGE_KEYS.theme, next);
    setTheme(next);
  };
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
        className="rounded-md px-2 py-1 text-xs font-semibold hover:bg-surface-2"
        aria-label={t('ui.language')}
      >
        {i18n.language === 'vi' ? 'EN' : 'VI'}
      </button>
      <button type="button" onClick={flipTheme} className="rounded-md p-1.5 hover:bg-surface-2" aria-label={t('ui.theme')}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const snapshot = useApp((s) => s.snapshot);
  const status = useApp((s) => s.status);
  const api = useApp((s) => s.api);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-[1000] border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <img src="./favicon.svg" alt="" className="h-7 w-7" />
            <span>Voltify</span>
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold text-accent">MVP</span>
          </NavLink>
          <nav className="flex flex-wrap items-center gap-1" aria-label={t('nav.aria')}>
            {NAV.map(({ to, key, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm ${isActive ? 'bg-surface-2 font-semibold text-text' : 'text-muted hover:text-text'}`
                }
              >
                <Icon size={15} aria-hidden />
                {t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <DataBadge />
            <span
              className={`hidden items-center gap-1 text-xs sm:inline-flex ${status === 'error' ? 'text-risk-danger' : 'text-muted'}`}
              title={api ? api.url : t('source.browserHint')}
            >
              <span className={`h-2 w-2 rounded-full ${status === 'live' ? 'bg-risk-safe' : status === 'error' ? 'bg-risk-danger' : 'bg-risk-watch'}`} />
              {snapshot?.mode === 'server' || api ? t('source.server') : t('source.browser')}
            </span>
            <SimControls />
            <Toggles />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5">{children}</main>
      <footer className="border-t border-border px-4 py-3 text-center text-xs text-muted">{t('footer')}</footer>
    </div>
  );
}
