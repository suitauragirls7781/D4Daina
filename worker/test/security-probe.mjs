// The live store, as someone with no login: every door that must stay shut. Reads and refused requests only:
// no request here can change anything even if a door were open (writes are sent with empty or invalid bodies
// that the server rejects before doing work, and never to a real order or product).
// Run: node worker/test/security-probe.mjs            (SITE=https://... for another address)
const LIVE = (process.env.SITE || 'https://www.suitauragirls.in').replace(/\/+$/, '');
const post = async (path, body, headers = {}) => { const r = await fetch(LIVE + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: LIVE, ...headers }, body: JSON.stringify(body) }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, text, json }; };
const get = async (path, headers = {}) => { const r = await fetch(LIVE + path, { headers }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, text, json, headers: r.headers }; };
const out = []; const check = (name, ok, detail = '') => { out.push(ok); console.log(`${ok ? 'SHUT ' : 'OPEN!'} ${name}${detail ? '  | ' + String(detail).slice(0, 150) : ''}`); };
const db = (ops) => post('/api/db', { ops });
const denied = (res) => Boolean(res?.error) && /permission|denied|unauth/i.test(JSON.stringify(res.error));

// 1. the database gateway
for (const path of ['private_settings/payment_gateways', 'private_settings/ai_assistant', 'admin_credentials/singleton', 'customer_email_otps/x', 'rate_limits/x', 'orders/SAG-261012-XPK6C', 'customers/someone@gmail.com', 'profiles/someone@gmail.com', 'leads/x', 'abandoned_checkouts/x', 'visitor_sessions/x', 'daily_analytics/2026-10-12', 'admin_settings/x', 'inventory_log/x', 'presence/x', 'docs/x']) {
  const r = await db([{ op: 'get', path }]);
  const res = r.json?.results?.[0];
  check(`read ${path}`, denied(res) && !res.data, JSON.stringify(res));
}
for (const collection of ['orders', 'customers', 'profiles', 'leads', 'abandoned_checkouts', 'private_settings', 'admin_credentials', 'visitor_sessions', 'reviews']) {
  const r = await db([{ op: 'query', collection, limit: 5 }]);
  const res = r.json?.results?.[0];
  check(`list ${collection}`, denied(res) && !res.docs?.length, JSON.stringify(res));
}
// what an anonymous visitor CAN read: is anything in it private?
const settings = await db([{ op: 'query', collection: 'storefront_settings', limit: 100 }]);
const sdocs = settings.json?.results?.[0]?.docs || [];
const flat = JSON.stringify(sdocs);
console.log('settings anyone can read:', sdocs.map((d) => d.id).join(', '));
check('public settings hold no key, password, hash or salt', !/rzp_(live|test)_[A-Za-z0-9]{6,}["\\]|key_secret|keySecret|"salt"|passwordHash|pbkdf2|xkeysib|AIza[0-9A-Za-z_-]{20}|webhook_?secret|private_key/i.test(flat), (flat.match(/.{0,30}(key_secret|keySecret|"salt"|passwordHash|pbkdf2|xkeysib|webhook_?secret|private_key).{0,30}/i) || [''])[0]);
const prod = await db([{ op: 'query', collection: 'products', limit: 3 }]);
const pkeys = Object.keys(prod.json?.results?.[0]?.docs?.[0]?.data || {});
console.log('fields of a product anyone can read:', pkeys.join(', '));
check('a product carries no cost price or supplier field', !pkeys.some((k) => /cost|supplier|vendor|margin|purchase/i.test(k)));

// 2. the admin doors, without a session
for (const action of ['payment-gateways', 'ai-assistant', 'usage', 'live', 'razorpay-payments', 'security']) {
  const r = await get(`/api/admin-config?action=${action}`);
  check(`admin "${action}" (read)`, r.status === 401 || r.status === 403, `${r.status} ${r.text.slice(0, 80)}`);
}
for (const action of ['payment-gateways', 'ai-assistant', 'security', 'media-grant', 'media-delete', 'ai-describe']) {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const raw = await fetch(LIVE + `/api/admin-config?action=${action}`, { method, headers: { 'content-type': 'application/json', origin: LIVE }, body: '{}' });
    const r = { status: raw.status, text: await raw.text() };
    check(`admin "${action}" (${method})`, [401, 403, 405].includes(r.status), `${r.status} ${r.text.slice(0, 60)}`);
  }
}
const session = await get('/api/admin-config?action=session');
check('admin session check says "not signed in"', session.status === 401 || session.json?.authenticated === false || session.json?.admin === false, `${session.status} ${session.text.slice(0, 80)}`);
for (const action of ['admin-update', 'admin-return', 'admin-test-email', 'admin-email-events']) {
  const r = await post('/api/orders', { action, orderNumber: 'SAG-DOES-NOT-EXIST', status: 'Cancelled' });
  check(`orders "${action}"`, r.status === 401 || r.status === 403, `${r.status} ${r.text.slice(0, 80)}`);
}
const mine = await post('/api/orders', { action: 'my-orders' });
check('orders "my-orders" without sign-in', mine.status === 401 || (mine.json?.orders || []).length === 0, `${mine.status} ${mine.text.slice(0, 80)}`);
const track = await post('/api/orders', { action: 'track', orderNumber: 'SAG-261012-XPK6C', contact: 'wrong@example.com' });
check('track an order with the wrong contact', track.status === 404 || track.status === 400 || track.status === 429, `${track.status} ${track.text.slice(0, 80)}`);
const forged = await post('/api/orders', { action: 'verify', orderNumber: 'SAG-DOES-NOT-EXIST', razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_x', razorpay_signature: 'a'.repeat(64) });
check('a forged "payment done" is refused', forged.status === 400, `${forged.status} ${forged.text.slice(0, 80)}`);
const hook = await fetch(LIVE + '/api/webhooks/razorpay', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'a'.repeat(64) }, body: JSON.stringify({ event: 'payment.captured', payload: {} }) });
check('a forged Razorpay webhook is refused', hook.status === 400 || hook.status === 401 || hook.status === 403, `${hook.status} ${(await hook.text()).slice(0, 80)}`);
const payu = await fetch(LIVE + '/api/payu', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'status=success&txnid=SAG-DOES-NOT-EXIST-1&hash=aaaa&amount=1&key=x' });
check('a forged PayU "success" marks nothing paid', payu.status >= 300 || !/order-confirmation/.test(payu.url) || /fail|pending|error/i.test(payu.url), `${payu.status} ${payu.url.replace(LIVE, '')}`);
const up = await fetch(LIVE + '/api/media', { method: 'PUT', headers: { 'content-type': 'image/webp', origin: LIVE }, body: new Uint8Array([1, 2, 3]) });
check('upload a file without a grant', up.status === 401 || up.status === 403 || up.status === 400, `${up.status} ${(await up.text()).slice(0, 80)}`);
// 3. another website calling the store's doors in a shopper's browser
const cross = await post('/api/orders', { action: 'gateways' }, { origin: 'https://evil.example' });
check('a request from another website is refused', cross.status === 403, `${cross.status} ${cross.text.slice(0, 60)}`);
const crossDb = await post('/api/db', { ops: [{ op: 'get', path: 'products/x' }] }, { origin: 'https://evil.example' });
check('the database gateway refuses another website', crossDb.status === 403, `${crossDb.status}`);
// 4. files that must not be served
for (const path of ['/.env', '/.env.local', '/.git/config', '/worker/.dev.vars', '/wrangler.jsonc', '/package.json', '/migration/data/', '/api/_lib/orders.js', '/src/main.tsx', '/firebase-applet-config.json', '/admin', '/drdaina/../.env']) {
  const r = await get(path);
  const looksLikeApp = /<div id="root">/.test(r.text);
  check(`file ${path}`, r.status === 404 || looksLikeApp, `${r.status} ${looksLikeApp ? '(the store page, not a file)' : r.text.slice(0, 60).replace(/\s+/g, ' ')}`);
}
// 5. headers and cookies
const home = await get('/');
const h = (n) => home.headers.get(n) || '';
check('HTTPS is forced for a year', /max-age=3153\d+/.test(h('strict-transport-security')), h('strict-transport-security'));
check('the store cannot be framed by another site', /frame-ancestors 'self'/.test(h('content-security-policy')) && /SAMEORIGIN/i.test(h('x-frame-options')));
check('no sniffing, a tight referrer', /nosniff/.test(h('x-content-type-options')) && /strict-origin/.test(h('referrer-policy')));
const http = await fetch('http://www.suitauragirls.in/', { redirect: 'manual' });
check('plain http is sent to https', [301, 302, 307, 308].includes(http.status) && /^https:/.test(http.headers.get('location') || ''), `${http.status} ${http.headers.get('location')}`);
console.log(out.every(Boolean) ? `ALL ${out.length} DOORS SHUT` : `${out.filter((x) => !x).length} OF ${out.length} NEED A LOOK`);
process.exit(out.every(Boolean) ? 0 : 1);
