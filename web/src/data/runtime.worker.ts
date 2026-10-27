/// <reference lib="webworker" />
// Runs the whole demo (simulated fleet + Voltify platform) off the main thread and posts
// a snapshot to the page four times a second.
import { VoltifyRuntime } from '@voltify/shared';
import type { Focus, FromWorker, ToWorker } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const runtime = new VoltifyRuntime({ mode: 'browser' });
let focus: Focus = { driverId: null, detailId: null };

const post = (m: FromWorker) => scope.postMessage(m);
const publish = () => post({ type: 'snapshot', snapshot: runtime.snapshot(focus) });

scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'focus') {
    focus = m.focus;
    publish();
  } else {
    post({ type: 'result', id: m.id, result: runtime.handle(m.cmd) });
    publish();
  }
};

runtime.start(publish, 250);
