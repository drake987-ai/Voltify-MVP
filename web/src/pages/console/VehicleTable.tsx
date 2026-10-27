import { Search, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RISK_LEVELS, type RiskLevel, type VehicleRow } from '@voltify/shared';
import { LEVEL_COLOR, RiskBadge } from '@/components/ui';
import { num } from '@/lib/format';

export function VehicleTable({ vehicles, selectedId, onSelect }: { vehicles: VehicleRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<RiskLevel | 'all' | 'maintenance'>('all');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter(
      (v) =>
        (level === 'all' || (level === 'maintenance' ? v.maintenanceDue : v.level === level)) &&
        (!q || `${v.id} ${v.plate} ${v.driverName} ${v.packId}`.toLowerCase().includes(q)),
    );
  }, [vehicles, query, level]);

  return (
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold">{t('console.vehicles', { n: vehicles.length })}</h2>
        <div className="flex flex-wrap gap-1 text-xs">
          {(['all', ...RISK_LEVELS, 'maintenance'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setLevel(k)}
              aria-pressed={level === k}
              className={`rounded-full border px-2 py-0.5 ${level === k ? 'border-accent bg-accent/15' : 'border-border text-muted'}`}
              style={k !== 'all' && k !== 'maintenance' ? { color: LEVEL_COLOR[k] } : undefined}
            >
              {k === 'all' ? t('console.filterAll') : k === 'maintenance' ? t('console.filterMaintenance') : t(`level.${k}`)}
            </button>
          ))}
        </div>
        <label className="relative">
          <Search size={14} className="absolute top-1/2 left-2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('console.search')}
            aria-label={t('console.search')}
            className="w-48 rounded-lg border border-border bg-surface-2 py-1 pr-2 pl-7 text-sm"
          />
        </label>
      </header>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{t('console.col.vehicle')}</th>
              <th className="px-3 py-2 font-medium">{t('console.col.driver')}</th>
              <th className="px-3 py-2 font-medium">{t('console.col.risk')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('console.col.soc')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('console.col.temp')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('console.col.soh')}</th>
              <th className="px-3 py-2 font-medium">{t('console.col.activity')}</th>
              <th className="px-3 py-2 font-medium">{t('console.col.pack')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr
                key={v.id}
                onClick={() => onSelect(v.id)}
                className={`cursor-pointer border-t border-border hover:bg-surface-2 ${v.id === selectedId ? 'bg-surface-2' : ''}`}
              >
                <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                  <button type="button" className="text-left" onClick={() => onSelect(v.id)}>
                    {v.plate}
                    <span className="block text-xs font-normal text-muted">{v.id}</span>
                  </button>
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">{v.driverName}</td>
                <td className="px-3 py-1.5">{v.learning ? <span className="text-xs text-muted">{t('console.learning')}</span> : <RiskBadge level={v.level} score={v.score} />}</td>
                <td className="px-3 py-1.5 text-right">{v.socPct}%</td>
                <td className="px-3 py-1.5 text-right">{num(v.tempC, 1)}°C</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  {v.sohPct === null ? '–' : `${v.sohPct}%`}
                  {v.maintenanceDue ? <Wrench size={12} className="ml-1 inline text-risk-watch" aria-label={t('console.maintenanceDue')} /> : null}
                </td>
                <td className="px-3 py-1.5 text-xs whitespace-nowrap text-muted">{t(`activity.${v.activity}`)}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-muted">{v.packId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
