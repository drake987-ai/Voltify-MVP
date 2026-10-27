// Screen 3: how a partner plugs Voltify in. Endpoints, the live webhook feed, code
// samples, and the switch between the in-browser simulator and a running API server.
import { ChevronDown, Server, Globe } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '@/components/ui';
import { useApp } from '@/data/store';
import { clock } from '@/lib/format';

const ENDPOINTS: [string, string, string][] = [
  ['POST', '/v1/telemetry', 'telemetry'],
  ['POST', '/v1/vehicles', 'registerVehicle'],
  ['PUT', '/v1/vehicles/{id}/pack', 'pack'],
  ['GET', '/v1/vehicles/{id}/driver-view', 'driverView'],
  ['GET', '/v1/incidents', 'incidents'],
  ['POST', '/v1/incidents/{id}/acknowledge', 'ack'],
  ['POST', '/v1/incidents/{id}/resolve', 'resolve'],
  ['POST', '/v1/notifications/{id}/ack', 'notificationAck'],
  ['POST', '/v1/webhooks', 'webhooks'],
  ['GET', '/v1/stream', 'stream'],
  ['GET', '/v1/openapi.json', 'openapi'],
];

const CURL = `curl -X POST http://localhost:8787/v1/telemetry \\
  -H "x-api-key: demo-key" -H "content-type: application/json" \\
  -d '{"bat_id":"SLX-0001","ts_ms":1781499600000,
       "cells_mv":[3901,3899,3902,3900,3898,3901,3903,3900,
                   3899,3901,3900,3902,3898,3900,3901,3899],
       "i_a":18.4,"temp_c":38.2,"amb_c":33.1,"soc_pct":71.5,
       "gps":{"lat":10.7769,"lng":106.7009},"cycles":212}'`;

const VERIFY = `// Partner server (Node.js): check the signature, then push to the driver
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(secret, rawBody, header) {
  const { t, v1 } = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const mac = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest();
  return timingSafeEqual(mac, Buffer.from(v1, 'hex'));
}

// event.type === 'driver.notification'
//   -> event.data.notification.title.vi / .body.vi : ready-to-show text
//   -> event.data.notification.delivery : 'in_app' | 'push' | 'critical'`;

export default function IntegrationPage() {
  const { t } = useTranslation();
  const snapshot = useApp((s) => s.snapshot);
  const api = useApp((s) => s.api);
  const connect = useApp((s) => s.connect);
  const status = useApp((s) => s.status);
  const [url, setUrl] = useState(api?.url ?? 'http://localhost:8787');
  const [key, setKey] = useState(api?.key ?? 'demo-key');
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('integration.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t('integration.intro')}</p>
      </div>

      <Card title={t('integration.source')}>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              {api ? <Server size={16} className="text-accent" /> : <Globe size={16} className="text-accent" />}
              <span className="font-medium">{api ? t('integration.usingApi', { url: api.url }) : t('integration.usingBrowser')}</span>
              <span className={`text-xs ${status === 'error' ? 'text-risk-danger' : 'text-muted'}`}>({t(`source.${status}`)})</span>
            </p>
            <p className="text-muted">{t('integration.sourceHint')}</p>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              connect({ url: url.replace(/\/$/, ''), key });
            }}
          >
            <label className="text-sm">
              <span className="text-xs text-muted">API URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} className="mt-0.5 block w-56 rounded-lg border border-border bg-surface-2 px-2 py-1.5" />
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted">API key</span>
              <input value={key} onChange={(e) => setKey(e.target.value)} className="mt-0.5 block w-32 rounded-lg border border-border bg-surface-2 px-2 py-1.5" />
            </label>
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg">
              {t('integration.connect')}
            </button>
            {api ? (
              <Button variant="ghost" onClick={() => connect(null)}>
                {t('integration.useBrowser')}
              </Button>
            ) : null}
          </form>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('integration.endpoints')}>
          <table className="w-full text-sm">
            <tbody>
              {ENDPOINTS.map(([m, p, k]) => (
                <tr key={p} className="border-t border-border first:border-t-0">
                  <td className="py-1.5 pl-4 font-mono text-xs font-semibold text-accent">{m}</td>
                  <td className="py-1.5 font-mono text-xs">{p}</td>
                  <td className="py-1.5 pr-4 text-xs text-muted">{t(`integration.ep.${k}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-xs text-muted">{t('integration.auth')}</p>
        </Card>

        <Card title={t('integration.feed')} right={<span className="text-xs text-muted">{t('integration.feedHint')}</span>}>
          <ul className="max-h-[460px] divide-y divide-border overflow-y-auto">
            {(snapshot?.events ?? []).map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-surface-2">
                  <span className="font-mono text-xs text-muted">{clock(Date.parse(e.createdAt), true)}</span>
                  <span className="font-mono text-xs font-semibold">{e.type}</span>
                  <span className="truncate text-xs text-muted">{summary(e.data)}</span>
                  <ChevronDown size={14} className={`ml-auto shrink-0 transition ${open === e.id ? 'rotate-180' : ''}`} />
                </button>
                {open === e.id ? <pre className="mx-4 mb-2 max-h-64 overflow-auto rounded-lg bg-surface-2 p-2 text-[11px]">{JSON.stringify(e, null, 2)}</pre> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={t('integration.sendTelemetry')}>
          <pre className="overflow-auto p-4 text-xs leading-relaxed">{CURL}</pre>
        </Card>
        <Card title={t('integration.receive')}>
          <pre className="overflow-auto p-4 text-xs leading-relaxed">{VERIFY}</pre>
        </Card>
      </div>
    </div>
  );
}

function summary(data: Record<string, unknown>): string {
  const inc = data.incident as { id: string; plate: string; level: string } | undefined;
  if (inc) return `${inc.id} · ${inc.plate} · ${inc.level}`;
  const n = data.notification as { kind: string } | undefined;
  const v = data.vehicle as { plate: string } | undefined;
  if (n && v) return `${v.plate} · ${n.kind}`;
  return String(data.vehicleId ?? '');
}
