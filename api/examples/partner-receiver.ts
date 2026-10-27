// What a partner (for example a delivery company's app backend) runs to receive Voltify
// webhooks: check the signature, then turn the event into a push notification to the
// driver's phone. Here the "push" is only printed.
//
//   1. npm run dev:api                                   (Voltify API on :8787)
//   2. npm run receiver -w api                           (this file, on :9000)
//   3. curl -X POST localhost:8787/v1/webhooks -H "x-api-key: demo-key" \
//        -H "content-type: application/json" -d '{"url":"http://localhost:9000/voltify"}'
//   4. copy the "secret" from the answer:  WEBHOOK_SECRET=whsec_... npm run receiver -w api
import { createServer } from 'node:http';
import { SIGNATURE_HEADER, verifySignature } from '../src/webhooks';

const secret = process.env.WEBHOOK_SECRET ?? '';
const port = Number(process.env.PORT ?? 9000);

createServer((req, res) => {
  let raw = '';
  req.on('data', (c: Buffer) => (raw += c.toString('utf8')));
  req.on('end', () => {
    const header = req.headers[SIGNATURE_HEADER] as string | undefined;
    if (secret && !verifySignature(secret, raw, header)) {
      res.writeHead(401).end('bad signature');
      console.warn('rejected a delivery with a bad signature');
      return;
    }
    const event = JSON.parse(raw) as { type: string; data: Record<string, any> };
    if (event.type === 'driver.notification') {
      const n = event.data.notification;
      const tag = n.delivery === 'critical' ? '!!! CRITICAL' : n.delivery === 'push' ? 'PUSH' : 'inbox';
      console.log(`[${tag}] to ${event.data.vehicle.driverName} (${event.data.vehicle.plate}): ${n.title.vi} | ${n.body.vi}`);
    } else {
      console.log(`${event.type}`, event.data.incident ? `${event.data.incident.id} ${event.data.incident.level}` : '');
    }
    res.writeHead(200).end('ok');
  });
}).listen(port, () => console.log(`partner receiver on http://localhost:${port}/voltify${secret ? '' : ' (no WEBHOOK_SECRET: signatures not checked)'}`));
