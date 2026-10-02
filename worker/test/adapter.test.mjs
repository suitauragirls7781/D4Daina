// The Node adapter must give the unchanged api/** handlers the req / res they were written for.
// Run: node --test worker/test/adapter.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { MAX_BODY_BYTES, parseParams, runNodeHandler } from '../src/node-adapter.js';

const ORIGIN = 'https://www.suitauragirls.in';
const post = (path, body, headers = {}) => new Request(`${ORIGIN}${path}`, { method: 'POST', body, headers });

// Captures what a handler saw, then answers.
const capture = (seen) => (req, res) => {
  Object.assign(seen, { method: req.method, url: req.url, headers: req.headers, query: req.query, body: req.body, cookies: req.cookies, ip: req.socket?.remoteAddress });
  res.status(200).end('ok');
};

const silenced = async (run) => {
  const original = console.error;
  const lines = [];
  console.error = (line) => lines.push(String(line));
  try {
    return { result: await run(), lines };
  } finally {
    console.error = original;
  }
};

test('JSON body is parsed; method, url and headers are passed on', async () => {
  const seen = {};
  const response = await runNodeHandler(capture(seen), post('/api/orders?x=1', JSON.stringify({ action: 'quote', items: [{ id: 'p1', qty: 2 }] }), {
    'Content-Type': 'application/json; charset=utf-8', Origin: ORIGIN, Authorization: 'Bearer abc', 'User-Agent': 'UA/1',
  }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
  assert.equal(seen.method, 'POST');
  assert.equal(seen.url, '/api/orders?x=1');
  assert.deepEqual(seen.body, { action: 'quote', items: [{ id: 'p1', qty: 2 }] });
  assert.equal(seen.headers.origin, ORIGIN);
  assert.equal(seen.headers.authorization, 'Bearer abc');
  assert.equal(seen.headers['user-agent'], 'UA/1');
  assert.equal(seen.headers['content-type'], 'application/json; charset=utf-8');
});

test('host headers come from the URL, so the same-origin check of api/_lib/http.js works and cannot be spoofed', async () => {
  const seen = {};
  await runNodeHandler(capture(seen), post('/api/track', '{}', { 'Content-Type': 'application/json', Origin: ORIGIN, 'X-Forwarded-Host': 'evil.example' }));
  assert.equal(seen.headers.host, 'www.suitauragirls.in');
  assert.equal(seen.headers['x-forwarded-host'], 'www.suitauragirls.in');
  assert.equal(seen.headers['x-forwarded-proto'], 'https');
  assert.equal(new URL(seen.headers.origin).host, seen.headers['x-forwarded-host'] || seen.headers.host);
});

test('client IP comes only from cf-connecting-ip', async () => {
  const withCf = {};
  await runNodeHandler(capture(withCf), post('/api/track', '{}', { 'CF-Connecting-IP': '203.0.113.7', 'X-Forwarded-For': '1.1.1.1' }));
  assert.equal(withCf.headers['x-forwarded-for'], '203.0.113.7');
  assert.equal(withCf.ip, '203.0.113.7');

  const withoutCf = {};
  await runNodeHandler(capture(withoutCf), post('/api/track', '{}', { 'X-Forwarded-For': '1.1.1.1' }));
  assert.equal(withoutCf.headers['x-forwarded-for'], undefined);
  assert.equal(withoutCf.ip, undefined);
});

test('query: single values are strings, repeated keys become arrays, values are decoded', async () => {
  const seen = {};
  await runNodeHandler(capture(seen), new Request(`${ORIGIN}/api/admin-config?action=catalog&v=123&tag=a&tag=b%20c&empty=`));
  assert.deepEqual({ ...seen.query }, { action: 'catalog', v: '123', tag: ['a', 'b c'], empty: '' });
  assert.equal(seen.method, 'GET');
  assert.equal(seen.body, undefined);
  assert.deepEqual({ ...parseParams('a=1&a=2&a=3') }, { a: ['1', '2', '3'] });
  assert.equal(parseParams('__proto__=x').polluted, undefined);
});

test('urlencoded body (PayU callback) becomes an object and the handler can answer with a 303 redirect', async () => {
  const payuLike = (req, res) => {
    const fields = req.body;
    const webhook = String(req.query?.webhook || '') === '1';
    assert.equal(webhook, false);
    res.status(303).setHeader('Location', `/checkout?payment=done&order=${encodeURIComponent(fields.udf1)}`).setHeader('Cache-Control', 'no-store');
    res.end();
  };
  const form = new URLSearchParams({ txnid: 'T123', udf1: 'SAG-1001', status: 'success', productinfo: 'Order SAG 1001 & more', hash: 'ab+cd/ef=' });
  const response = await runNodeHandler(payuLike, post('/api/payu', form.toString(), { 'Content-Type': 'application/x-www-form-urlencoded' }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/checkout?payment=done&order=SAG-1001');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '');

  const seen = {};
  await runNodeHandler(capture(seen), post('/api/payu?webhook=1', form.toString(), { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }));
  assert.deepEqual({ ...seen.body }, { txnid: 'T123', udf1: 'SAG-1001', status: 'success', productinfo: 'Order SAG 1001 & more', hash: 'ab+cd/ef=' });
  assert.equal(seen.query.webhook, '1');
});

test('other body types: text stays a string, octet-stream a Buffer, no Content-Type gives undefined, empty JSON gives {}', async () => {
  const text = {};
  await runNodeHandler(capture(text), post('/api/x', '{"a":1}', { 'Content-Type': 'text/plain' }));
  assert.equal(text.body, '{"a":1}');

  const binary = {};
  await runNodeHandler(capture(binary), post('/api/x', new Uint8Array([1, 2, 255]), { 'Content-Type': 'application/octet-stream' }));
  assert.ok(Buffer.isBuffer(binary.body));
  assert.deepEqual([...binary.body], [1, 2, 255]);

  const untyped = {};
  await runNodeHandler(capture(untyped), new Request(`${ORIGIN}/api/x`, { method: 'POST', body: new Uint8Array([123, 125]) }));
  assert.equal(untyped.body, undefined);

  const empty = {};
  await runNodeHandler(capture(empty), new Request(`${ORIGIN}/api/x`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }));
  assert.deepEqual(empty.body, {});
});

test('broken JSON is answered with 400 when the handler reads req.body outside a try block', async () => {
  const response = await runNodeHandler((req, res) => res.status(200).json(req.body), post('/api/orders', '{not json', { 'Content-Type': 'application/json' }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid JSON' });
});

test('raw body handler (Razorpay webhook) reads the exact bytes from the stream and its HMAC matches', async () => {
  // Same reader as api/webhooks/razorpay.js
  const readRawBody = async (req) => {
    if (typeof req.body === 'string') return req.body;
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
    const chunks = [];
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    return Buffer.concat(chunks).toString('utf8');
  };
  const secret = 'test-webhook-secret';
  // Spacing, key order, an escaped slash and non-ASCII text: a re-serialised copy would not match the signature.
  const raw = '{ "event":"payment.captured",  "payload":{"payment":{"entity":{"id":"pay_1","notes":{"name":"सूट \\/ ₹1,499"}}}} }\n';
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  const webhook = async (req, res) => {
    assert.equal(req.body, undefined);
    const body = await readRawBody(req);
    const valid = createHmac('sha256', secret).update(body).digest('hex') === req.headers['x-razorpay-signature'];
    res.status(valid ? 200 : 401).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ valid, same: body === raw }));
  };
  const request = () => post('/api/webhooks/razorpay', raw, { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature });
  const response = await runNodeHandler(webhook, request(), { rawBody: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { valid: true, same: true });

  // The stream is also there for handlers that use events instead of async iteration
  const viaEvents = (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    return new Promise((resolve) => req.on('end', () => { res.end(Buffer.concat(chunks)); resolve(); }));
  };
  assert.equal(await (await runNodeHandler(viaEvents, request(), { rawBody: true })).text(), raw);

  // Without the raw flag the parsed body is given and the bytes can still be read
  const both = async (req, res) => res.json({ parsed: req.body.event, raw: await readRawBody({ [Symbol.asyncIterator]: () => req[Symbol.asyncIterator]() }) === raw });
  assert.deepEqual(await (await runNodeHandler(both, request())).json(), { parsed: 'payment.captured', raw: true });
});

test('several Set-Cookie headers reach the client as separate headers', async () => {
  const handler = (req, res) => {
    res.setHeader('Set-Cookie', ['a=1; Path=/; HttpOnly', 'b=2; Path=/api; Expires=Wed, 21 Oct 2026 07:28:00 GMT']);
    res.appendHeader('Set-Cookie', 'c=3');
    res.status(200).json({ ok: true });
  };
  const response = await runNodeHandler(handler, new Request(`${ORIGIN}/api/admin-config?action=session`));
  assert.deepEqual(response.headers.getSetCookie(), ['a=1; Path=/; HttpOnly', 'b=2; Path=/api; Expires=Wed, 21 Oct 2026 07:28:00 GMT', 'c=3']);

  // The admin login sets one cookie with a plain string, and a later setHeader replaces it (Node behaviour)
  const single = (req, res) => {
    res.setHeader('Set-Cookie', 'old=1');
    res.setHeader('Set-Cookie', 'sag_admin_session=tok; HttpOnly; SameSite=Strict; Path=/api/admin-config; Max-Age=60; Secure');
    res.status(200).end('{}');
  };
  const one = await runNodeHandler(single, new Request(`${ORIGIN}/api/admin-config`));
  assert.deepEqual(one.headers.getSetCookie(), ['sag_admin_session=tok; HttpOnly; SameSite=Strict; Path=/api/admin-config; Max-Age=60; Secure']);
});

test('request cookies are in req.headers.cookie and req.cookies', async () => {
  const seen = {};
  await runNodeHandler(capture(seen), new Request(`${ORIGIN}/api/admin-config?action=session`, { headers: { Cookie: 'sag_admin_session=abc.def; theme=a%20b' } }));
  assert.equal(seen.headers.cookie, 'sag_admin_session=abc.def; theme=a%20b');
  assert.deepEqual({ ...seen.cookies }, { sag_admin_session: 'abc.def', theme: 'a b' });
});

test('response helpers: chaining, getHeader, statusCode, json, send, redirect, writeHead + write', async () => {
  const reply = (req, res) => {
    // The reply() of api/_lib/http.js
    res.status(429).setHeader('Content-Type', 'application/json; charset=utf-8').setHeader('Cache-Control', 'no-store, max-age=0');
    assert.equal(res.getHeader('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.statusCode, 429);
    assert.equal(res.headersSent, false);
    res.end(JSON.stringify({ error: 'Too many' }));
    assert.equal(res.headersSent, true);
  };
  const limited = await runNodeHandler(reply, post('/api/orders', '{}', { 'Content-Type': 'application/json' }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('cache-control'), 'no-store, max-age=0');
  assert.deepEqual(await limited.json(), { error: 'Too many' });

  const json = await runNodeHandler((req, res) => res.status(201).json({ id: 7 }), new Request(`${ORIGIN}/api/x`));
  assert.equal(json.status, 201);
  assert.equal(json.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await json.json(), { id: 7 });

  const sentObject = await runNodeHandler((req, res) => res.send({ a: 1 }), new Request(`${ORIGIN}/api/x`));
  assert.deepEqual(await sentObject.json(), { a: 1 });
  const sentText = await runNodeHandler((req, res) => res.send('<p>hi</p>'), new Request(`${ORIGIN}/api/x`));
  assert.equal(sentText.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await sentText.text(), '<p>hi</p>');

  const defaultRedirect = await runNodeHandler((req, res) => res.redirect('/checkout'), new Request(`${ORIGIN}/api/payu`));
  assert.equal(defaultRedirect.status, 307);
  assert.equal(defaultRedirect.headers.get('location'), '/checkout');
  const seeOther = await runNodeHandler((req, res) => res.redirect(303, '/checkout?payment=failed'), new Request(`${ORIGIN}/api/payu`));
  assert.equal(seeOther.status, 303);
  assert.equal(seeOther.headers.get('location'), '/checkout?payment=failed');

  const written = await runNodeHandler((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Test': 'yes' });
    res.write('one,');
    res.write(Buffer.from('two,'));
    res.end('three');
  }, new Request(`${ORIGIN}/api/x`));
  assert.equal(written.headers.get('x-test'), 'yes');
  assert.equal(await written.text(), 'one,two,three');
});

test('204 (OPTIONS in admin-config) and HEAD answers have no body', async () => {
  const options = await runNodeHandler((req, res) => { res.status(204).end(); }, new Request(`${ORIGIN}/api/admin-config`, { method: 'OPTIONS' }));
  assert.equal(options.status, 204);
  assert.equal(options.body, null);

  const sitemapLike = (req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).end(req.method === 'HEAD' ? undefined : '<urlset/>');
  };
  const head = await runNodeHandler(sitemapLike, new Request(`${ORIGIN}/sitemap.xml`, { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('cache-control'), 'public, s-maxage=3600, stale-while-revalidate=86400');
  assert.equal(await head.text(), '');
  const get = await runNodeHandler(sitemapLike, new Request(`${ORIGIN}/sitemap.xml`));
  assert.equal(await get.text(), '<urlset/>');
});

test('other methods are passed through to the handler', async () => {
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    const seen = {};
    await runNodeHandler(capture(seen), new Request(`${ORIGIN}/api/admin-config`, { method, body: '{"a":1}', headers: { 'Content-Type': 'application/json' } }));
    assert.equal(seen.method, method);
    assert.deepEqual(seen.body, { a: 1 });
  }
});

test('a body above 1 MB is refused with 413 before the handler runs', async () => {
  let called = false;
  const handler = (req, res) => { called = true; res.end('ok'); };
  const tooBig = await runNodeHandler(handler, post('/api/orders', 'x'.repeat(MAX_BODY_BYTES + 1), { 'Content-Type': 'text/plain' }));
  assert.equal(tooBig.status, 413);
  assert.equal(called, false);

  // No Content-Length (streamed upload): the cap is enforced while reading
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 5; i += 1) controller.enqueue(new Uint8Array(300 * 1024));
      controller.close();
    },
  });
  const streamed = await runNodeHandler(handler, new Request(`${ORIGIN}/api/orders`, { method: 'POST', body: stream, duplex: 'half' }));
  assert.equal(streamed.status, 413);
  assert.equal(called, false);

  const atLimit = await runNodeHandler(handler, post('/api/orders', 'x'.repeat(MAX_BODY_BYTES), { 'Content-Type': 'text/plain' }));
  assert.equal(atLimit.status, 200);
});

test('errors: a throwing handler gives a logged 500 JSON without details; an answer already sent is kept', async () => {
  const { result: thrown, lines } = await silenced(() => runNodeHandler(async () => { throw new Error('db exploded: secret detail'); }, post('/api/orders?token=abc', '{}')));
  assert.equal(thrown.status, 500);
  assert.equal(thrown.headers.get('cache-control'), 'no-store, max-age=0');
  assert.deepEqual(await thrown.json(), { error: 'Something went wrong. Please try again.' });
  const logged = JSON.parse(lines[0]);
  assert.equal(logged.level, 'error');
  assert.equal(logged.path, '/api/orders');
  assert.equal(logged.error, 'db exploded: secret detail');
  assert.ok(!lines[0].includes('token=abc'));

  const { result: silent } = await silenced(() => runNodeHandler(() => {}, new Request(`${ORIGIN}/api/x`)));
  assert.equal(silent.status, 500);

  const { result: late, lines: lateLines } = await silenced(() => runNodeHandler(async (req, res) => {
    res.status(200).json({ ok: true, paid: true });
    throw new Error('email failed afterwards');
  }, post('/api/orders', '{}')));
  assert.equal(late.status, 200);
  assert.deepEqual(await late.json(), { ok: true, paid: true });
  assert.equal(JSON.parse(lateLines[0]).error, 'email failed afterwards');
});
