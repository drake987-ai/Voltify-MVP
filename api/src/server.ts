// Start the Voltify API. Settings come from environment variables (see README.md):
//   PORT (8787), HOST (0.0.0.0), VOLTIFY_API_KEY (demo-key), VOLTIFY_SIMULATOR (on),
//   VOLTIFY_VEHICLES (40), VOLTIFY_SPEED (20), VOLTIFY_DEMO (on), CORS_ORIGIN (any).
import { DEFAULT_SPEED, VoltifyRuntime } from '@voltify/shared';
import { buildApp } from './app';

const env = process.env;
const flag = (v: string | undefined, dflt: boolean) => (v === undefined ? dflt : !['0', 'off', 'false', 'no'].includes(v.toLowerCase()));

const simulator = flag(env.VOLTIFY_SIMULATOR, true);
const runtime = new VoltifyRuntime({
  mode: 'server',
  vehicles: simulator ? Number(env.VOLTIFY_VEHICLES ?? 40) : 0,
  speed: Number(env.VOLTIFY_SPEED ?? DEFAULT_SPEED),
  prewarmMin: simulator ? 6 : 0,
});
if (simulator) runtime.start();

const apiKey = env.VOLTIFY_API_KEY ?? 'demo-key';
const app = buildApp({
  runtime,
  apiKey,
  demo: flag(env.VOLTIFY_DEMO, true),
  corsOrigin: env.CORS_ORIGIN ?? true,
  logger: true,
});

const port = Number(env.PORT ?? 8787);
const host = env.HOST ?? '0.0.0.0';
await app.listen({ port, host });
app.log.info(`Voltify API on http://localhost:${port}  (simulator ${simulator ? 'on' : 'off'}, key "${apiKey === 'demo-key' ? apiKey : '***'}")`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    runtime.stop();
    void app.close().then(() => process.exit(0));
  });
}
