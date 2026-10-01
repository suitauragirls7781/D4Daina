// Stand-in for the outside world. The handlers call Razorpay, PayU, Brevo, Cloudinary, Gemini and Google with
// the global fetch; here every such call is answered locally and recorded. A request nobody registered an
// answer for is refused and remembered in `unexpected`, and the harness fails the test that made it:
// nothing may leave the machine.
import { createHash } from 'node:crypto';

export const jsonResponse = (status, body, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', ...headers },
});

export const createFetchMock = () => {
  const routes = [];
  const calls = [];
  const unexpected = [];

  // `target` is origin + path (the query string is in call.query), or a RegExp tested against the same.
  const matches = (route, call) => route.method === call.method
    && (typeof route.target === 'string' ? route.target === call.target : route.target.test(call.target));

  return {
    calls,
    unexpected,
    /** Registers an answer. The newest registration wins, so a test can override a default. */
    on(method, target, respond) {
      routes.unshift({ method, target, respond });
    },
    callsTo(target) {
      return calls.filter((call) => (typeof target === 'string' ? call.target === target : target.test(call.target)));
    },
    async fetch(input, init) {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const call = {
        method: request.method,
        target: `${url.origin}${url.pathname}`,
        query: Object.fromEntries(url.searchParams),
        headers: Object.fromEntries(request.headers),
        body: await request.text(),
      };
      calls.push(call);
      const route = routes.find((candidate) => matches(candidate, call));
      if (!route) {
        unexpected.push(`${call.method} ${call.target}`);
        throw new TypeError(`fetch failed: unmocked outbound request ${call.method} ${call.target}`);
      }
      return route.respond(call);
    },
  };
};

const basicAuth = (call) => Buffer.from(String(call.headers.authorization || '').replace(/^Basic\s+/i, ''), 'base64').toString('utf8');

/**
 * Default answers for every service the store talks to. The returned object is the services' state: tests
 * read what was sent (mail, razorpayOrders, ...) and change how a service behaves (brevoStatus,
 * razorpayPayments, payuTransactions, ...).
 */
export const mockServices = (net, env) => {
  const state = {
    mail: [],                      // { to, name, subject, html, text, from } for every email Brevo accepted
    brevoStatus: 201,              // anything else makes Brevo refuse the email
    razorpayOrders: [],            // orders created at Razorpay: { id, amount, currency, receipt, notes }
    razorpayOrderStatus: 200,      // anything else makes order creation fail
    razorpayPayments: {},          // Razorpay order id -> payments Razorpay reports for it
    razorpayKeys: new Set([`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`]), // key pairs Razorpay accepts
    payu: { key: '', salt: '' },   // the merchant account PayU knows (set by the PayU tests)
    payuTransactions: {},          // txnid -> what PayU's verify API says about it
    cloudinaryDestroyed: [],       // public ids deleted at Cloudinary
    googleKeys: [],                // JWKs served as Google's signing keys
    geminiModels: ['models/gemini-3.1-flash-lite', 'models/gemini-flash-latest'],
  };

  // ---- Brevo ----
  net.on('POST', 'https://api.brevo.com/v3/smtp/email', (call) => {
    if (call.headers['api-key'] !== env.BREVO_API_KEY) return jsonResponse(401, { code: 'unauthorized', message: 'Key not found' });
    if (state.brevoStatus !== 201) return jsonResponse(state.brevoStatus, { code: 'invalid_parameter', message: 'refused by the test' });
    const mail = JSON.parse(call.body);
    state.mail.push({ to: mail.to[0].email, name: mail.to[0].name, subject: mail.subject, html: mail.htmlContent, text: mail.textContent, from: mail.sender.email });
    return jsonResponse(201, { messageId: `<test-${state.mail.length}@brevo>` });
  });

  // ---- Razorpay ----
  const razorpay = (respond) => (call) => (state.razorpayKeys.has(basicAuth(call))
    ? respond(call)
    : jsonResponse(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } }));
  net.on('POST', 'https://api.razorpay.com/v1/orders', razorpay((call) => {
    if (state.razorpayOrderStatus !== 200) return jsonResponse(state.razorpayOrderStatus, { error: { code: 'SERVER_ERROR', description: 'down for the test' } });
    const sent = JSON.parse(call.body);
    const order = { id: `order_Test${String(state.razorpayOrders.length + 1).padStart(6, '0')}`, amount: sent.amount, currency: sent.currency, receipt: sent.receipt, notes: sent.notes, status: 'created' };
    state.razorpayOrders.push(order);
    return jsonResponse(200, order);
  }));
  // The key check made before the admin's Razorpay keys are saved
  net.on('GET', 'https://api.razorpay.com/v1/orders', razorpay(() => jsonResponse(200, { entity: 'collection', count: 0, items: [] })));
  net.on('GET', /^https:\/\/api\.razorpay\.com\/v1\/orders\/[^/]+\/payments$/, razorpay((call) => {
    const id = decodeURIComponent(call.target.split('/').at(-2));
    return jsonResponse(200, { entity: 'collection', items: state.razorpayPayments[id] || [] });
  }));

  // ---- PayU verify API (test and live hosts) ----
  const payuVerify = (call) => {
    const form = Object.fromEntries(new URLSearchParams(call.body));
    const expected = createHash('sha512').update(`${state.payu.key}|verify_payment|${form.var1}|${state.payu.salt}`).digest('hex');
    if (form.key !== state.payu.key || form.command !== 'verify_payment' || form.hash !== expected) return jsonResponse(200, { status: 0, msg: 'Invalid Hash.' });
    const details = state.payuTransactions[form.var1];
    return jsonResponse(200, { status: 1, msg: 'Transaction Fetched Successfully', transaction_details: details ? { [form.var1]: details } : {} });
  };
  net.on('POST', 'https://test.payu.in/merchant/postservice.php', payuVerify);
  net.on('POST', 'https://info.payu.in/merchant/postservice', payuVerify);

  // ---- Cloudinary delete ----
  net.on('POST', /^https:\/\/api\.cloudinary\.com\/v1_1\/[^/]+\/(image|video)\/destroy$/, (call) => {
    const form = Object.fromEntries(new URLSearchParams(call.body));
    const signed = Object.keys(form).filter((name) => !['api_key', 'signature'].includes(name)).sort().map((name) => `${name}=${form[name]}`).join('&');
    const expected = createHash('sha1').update(signed + env.CLOUDINARY_API_SECRET).digest('hex');
    if (form.api_key !== env.CLOUDINARY_API_KEY || form.signature !== expected) return jsonResponse(401, { error: { message: 'Invalid Signature' } });
    state.cloudinaryDestroyed.push(form.public_id);
    return jsonResponse(200, { result: 'ok' });
  });

  // ---- Google: sign-in keys and the Gemini model list ----
  net.on('GET', 'https://www.googleapis.com/oauth2/v3/certs', () => jsonResponse(200, { keys: state.googleKeys }, { 'cache-control': 'public, max-age=3600' }));
  net.on('GET', 'https://generativelanguage.googleapis.com/v1beta/models', () => jsonResponse(200, {
    models: state.geminiModels.map((name) => ({ name, supportedGenerationMethods: ['generateContent'] })),
  }));

  return state;
};
