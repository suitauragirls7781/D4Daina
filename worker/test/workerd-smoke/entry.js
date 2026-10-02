// Local-only wrapper around the REAL Worker (worker/src/index.js), started by check.mjs in local workerd.
// It adds what a smoke run needs and nothing else touches the Worker:
// - outbound calls (Brevo, Razorpay) are answered here and recorded, so nothing leaves the machine;
// - /__smoke/setup creates the schema and a few made-up documents in the local D1;
// - /__smoke/state shows a stored document, the outbound calls and what process.env held at load time.
// Never deployed.
import process from 'node:process';
import worker from '../../src/index.js';
import schema from '../../schema.sql';
import { createStore } from '../../src/docstore.js';

// api/track.js reads its budget from process.env while the module loads: this records that the Worker's
// vars are already there at that moment.
const envAtLoad = { SECURE_COOKIES: process.env.SECURE_COOKIES, TRACK_WRITE_BUDGET: process.env.TRACK_WRITE_BUDGET };

const outbound = [];
const unexpected = [];
let razorpayOrders = 0;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const call = { method: request.method, target: `${url.origin}${url.pathname}`, body: await request.text() };
  outbound.push(call);
  if (call.method === 'POST' && call.target === 'https://api.brevo.com/v3/smtp/email') return json(201, { messageId: '<smoke@brevo>' });
  if (call.method === 'POST' && call.target === 'https://api.razorpay.com/v1/orders') {
    razorpayOrders += 1;
    return json(200, { id: `order_Smoke${razorpayOrders}`, ...JSON.parse(call.body), status: 'created' });
  }
  unexpected.push(`${call.method} ${call.target}`);
  throw new TypeError(`Unmocked outbound request in the smoke run: ${call.method} ${call.target}`);
};

const schemaStatements = () => schema.replace(/--[^\n]*/g, '').split(';').map((statement) => statement.trim()).filter(Boolean);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/__smoke/setup' && request.method === 'POST') {
      await env.DB.batch(schemaStatements().map((statement) => env.DB.prepare(statement)));
      const { docs } = await request.json();
      await createStore(env.DB).commit(docs.map((doc) => ({ type: 'set', ...doc })));
      return json(200, { ok: true });
    }
    if (url.pathname === '/__smoke/state') {
      const [collection, id] = (url.searchParams.get('path') || '/').split('/');
      const doc = collection && id ? await createStore(env.DB).getDoc(collection, id) : null;
      return json(200, { doc: doc?.data ?? null, outbound, unexpected, envAtLoad });
    }
    return worker.fetch(request, env, ctx);
  },
};
