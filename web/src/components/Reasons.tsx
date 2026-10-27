import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { Reason } from '@voltify/shared';
import { num } from '@/lib/format';

const fmt = (x: number, unit: string) => (Number.isFinite(x) ? `${num(x, unit === '×' ? 2 : 1)} ${unit}` : '∞');

/** "Why": each signal that raised the Risk Score, its value against the level where it starts to count. */
export function ReasonList({ reasons, compact = false }: { reasons: Reason[]; compact?: boolean }) {
  const { t } = useTranslation();
  if (reasons.length === 0) return <p className="text-sm text-muted">{t('reasons.none')}</p>;
  return (
    <ul className="space-y-1.5">
      {reasons.map((r) => (
        <li key={r.signal} className="flex items-start justify-between gap-3 text-sm">
          <span>
            {t(`signal.${r.signal}`, { cell: r.cell ?? '' })}
            {compact ? null : (
              <span className="block text-xs text-muted">
                {t('reasons.valueVs', { value: fmt(r.value, r.unit), threshold: fmt(r.threshold, r.unit) })}
              </span>
            )}
          </span>
          <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">+{r.points}</span>
        </li>
      ))}
    </ul>
  );
}

/** One line: the main reason, for lists. */
export function mainReason(reasons: Reason[], t: TFunction): string {
  const r = reasons[0];
  return r ? t(`signal.${r.signal}`, { cell: r.cell ?? '' }) : t('reasons.none');
}
