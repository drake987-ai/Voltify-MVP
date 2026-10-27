// Small building blocks shared by the screens.
import { AlertTriangle, Eye, Flame, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RiskLevel } from '@voltify/shared';

export const LEVEL_COLOR: Record<RiskLevel, string> = {
  safe: 'var(--c-risk-safe)',
  watch: 'var(--c-risk-watch)',
  warning: 'var(--c-risk-warning)',
  danger: 'var(--c-risk-danger)',
};

export const LEVEL_ICON: Record<RiskLevel, LucideIcon> = {
  safe: ShieldCheck,
  watch: Eye,
  warning: AlertTriangle,
  danger: Flame,
};

/** Colour + icon + word, so the level never depends on colour alone. */
export function RiskBadge({ level, score, size = 'sm' }: { level: RiskLevel; score?: number; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const Icon = LEVEL_ICON[level];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap ${size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}
      style={{ color: LEVEL_COLOR[level], borderColor: LEVEL_COLOR[level] }}
    >
      <Icon size={size === 'md' ? 15 : 13} aria-hidden />
      {t(`level.${level}`)}
      {score !== undefined ? <span className="opacity-80">· {score}</span> : null}
    </span>
  );
}

export function Card({ children, className = '', title, right }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-border bg-surface ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {right}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, color }: { label: string; value: ReactNode; hint?: ReactNode; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3.5 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

/** A tiny line chart for the last hour, drawn as SVG (no chart library needed). */
export function Sparkline({ values, color, height = 40, min, max, label }: { values: number[]; color: string; height?: number; min?: number; max?: number; label: string }) {
  const w = 160;
  if (values.length < 2) return <div className="text-xs text-muted" style={{ height }} aria-label={label} />;
  const lo = min ?? Math.min(...values);
  const hi = Math.max(max ?? Math.max(...values), lo + 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - 2 - ((v - lo) / (hi - lo)) * (height - 4)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} role="img" aria-label={label} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  className = '',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const styles = {
    default: 'border border-border bg-surface-2 hover:border-accent',
    primary: 'bg-accent text-accent-fg hover:opacity-90',
    danger: 'border border-risk-danger text-risk-danger hover:bg-risk-danger/10',
    ghost: 'hover:bg-surface-2',
  }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function DataBadge() {
  const { t } = useTranslation();
  return (
    <span className="rounded-md border border-risk-watch/60 px-1.5 py-0.5 text-[11px] font-medium text-risk-watch" title={t('data.simulatedHint')}>
      {t('data.simulated')}
    </span>
  );
}
