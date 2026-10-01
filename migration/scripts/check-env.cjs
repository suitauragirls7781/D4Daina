// Checks .env.migration without ever printing a value: which keys are filled, whether they look right, and
// (read-only API calls) whether Cloudinary, Razorpay and Brevo accept them.
const fs = require('fs');
const path = require('path');

const env = {};
for (const line of fs.readFileSync(path.resolve(__dirname, '..', '..', '.env.migration'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const shape = {
  CLOUDINARY_CLOUD_NAME: /^[a-z0-9_-]{3,40}$/i,
  CLOUDINARY_API_KEY: /^\d{10,20}$/,
  CLOUDINARY_API_SECRET: /^[A-Za-z0-9_-]{20,40}$/,
  RAZORPAY_KEY_ID: /^rzp_(live|test)_[A-Za-z0-9]{6,40}$/,
  RAZORPAY_KEY_SECRET: /^[A-Za-z0-9]{10,80}$/,
  RAZORPAY_WEBHOOK_SECRET: /^.{8,200}$/,
  BREVO_API_KEY: /^xkeysib-[A-Za-z0-9-]{20,}$/,
  BREVO_SENDER_EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
};
for (const [key, re] of Object.entries(shape)) {
  const v = env[key] || '';
  console.log(key.padEnd(26), !v ? 'EMPTY' : re.test(v) ? `filled, looks right (${v.length} chars)` : `filled but the FORMAT LOOKS WRONG (${v.length} chars${/\s/.test(v) ? ', contains a space' : ''})`);
}
for (const key of ['ADMIN_INITIAL_USERNAME', 'ADMIN_INITIAL_PASSWORD', 'ADMIN_INITIAL_PIN', 'ADMIN_SESSION_SECRET', 'AUTH_TOKEN_SECRET', 'GEMINI_API_KEY']) console.log(key.padEnd(26), env[key] ? 'filled' : 'EMPTY');

const basic = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const call = async (label, url, headers) => {
  try {
    const r = await fetch(url, { headers });
    const data = await r.json().catch(() => ({}));
    return { label, status: r.status, data };
  } catch (e) {
    return { label, status: 0, data: { error: String(e.message) } };
  }
};

(async () => {
  console.log('\nLive checks (read-only):');
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    const r = await call('cloudinary', `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/usage`, { authorization: basic(env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET) });
    console.log('Cloudinary:', r.status === 200 ? `OK (plan ${r.data.plan || '?'}, storage used ${Math.round((r.data.storage?.usage || 0) / 1048576)} MB, credits ${r.data.credits?.usage ?? '?'}/${r.data.credits?.limit ?? '?'})` : `REJECTED (${r.status}) ${String(r.data?.error?.message || '').slice(0, 100)}`);
  } else console.log('Cloudinary: not filled');
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    const r = await call('razorpay', 'https://api.razorpay.com/v1/payments?count=1', { authorization: basic(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET) });
    console.log('Razorpay:', r.status === 200 ? `OK (${env.RAZORPAY_KEY_ID.startsWith('rzp_live') ? 'LIVE' : 'TEST'} key accepted)` : `REJECTED (${r.status}) ${String(r.data?.error?.description || '').slice(0, 100)}`);
  } else console.log('Razorpay: not filled');
  if (env.BREVO_API_KEY) {
    const r = await call('brevo', 'https://api.brevo.com/v3/account', { 'api-key': env.BREVO_API_KEY });
    if (r.status !== 200) console.log('Brevo:', `REJECTED (${r.status}) ${String(r.data?.message || '').slice(0, 120)}`);
    else {
      const s = await call('senders', 'https://api.brevo.com/v3/senders', { 'api-key': env.BREVO_API_KEY });
      const senders = (s.data.senders || []).map((x) => `${x.email}${x.active ? '' : ' (NOT verified)'}`);
      const plan = (r.data.plan || []).map((p) => `${p.type}:${p.credits ?? ''}`).join(', ');
      console.log('Brevo: OK | plan', plan, '| senders:', senders.join(', ') || 'none');
      console.log('  sender in file is verified there:', senders.some((x) => x === env.BREVO_SENDER_EMAIL));
    }
  } else console.log('Brevo: not filled');
})();
