// Scenario: the two automatic emails of the hourly scheduled run (api/_lib/reminders.js through the Worker's
// scheduled() entry): one reminder for a checkout that was left, one review request for a delivered order.
// Every assertion is made on the emails Brevo received AND on the stored documents.
// Run: node --test worker/test/scenarios/reminders.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { D1_CALLS_PER_REQUEST, startHarness } from '../harness/harness.mjs';
import { adminPut, signInAdmin } from '../harness/admin.mjs';

const h = await startHarness();
const { getFirestore } = await import('../../src/shims/firebase-admin-firestore.js');
const { runReminders, MAX_EMAILS_PER_RUN, REMINDER_LOG, ABANDONED_SUBJECT } = await import('../../../api/_lib/reminders.js');
const db = getFirestore();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const PHOTO = 'https://media.suitauragirls.in/i/product-images/abcdef123456/w1100.webp';
const REASON = 'You are getting this one email because you started a checkout on suitauragirls.in.';

const storeSettings = await h.setting('storeSettings');
const useSettings = (overrides = {}) => h.putSetting('storeSettings', {
  ...storeSettings, prepaidDiscount: 0, prepaidPercent: 15, prepaidMinPrice: 0, codEnabled: false, codCharge: 99, ...overrides,
});
await useSettings();

const iso = (ms) => new Date(ms).toISOString();
let serial = 0;
const nextSerial = () => { serial += 1; return String(serial).padStart(5, '0'); };

/** A checkout as src/components/CheckoutPage.tsx saves it: started `startedAgo` ago, last touched `updatedAgo` ago. */
const putCheckout = async (email, { updatedAgo = 2 * HOUR, startedAgo = updatedAgo + 10 * MINUTE, items, extra = {} } = {}) => {
  const now = Date.now();
  const id = `chk_${now - startedAgo}_t${nextSerial()}`;
  await h.put('abandoned_checkouts', id, {
    sessionId: id, firstName: 'Asha', lastName: 'Verma', fullName: 'Asha Verma', phone: '9876543210', mobile: '9876543210', email,
    cartItems: items || [{ product: { id: 'p-1', name: 'Rose <Anarkali> Suit', price: 1499, images: [PHOTO] }, selectedSize: 'M', quantity: 2 }],
    totalAmount: 2998, address: { fullName: 'Asha Verma', email, mobile: '9876543210' }, status: 'abandoned', updatedAt: iso(now - updatedAgo), ...extra,
  });
  return id;
};

const orderNumber = (createdAgo) => {
  const date = new Date(Date.now() - createdAgo);
  return `SAG-${String(date.getUTCFullYear()).slice(2)}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}-T${nextSerial().slice(1)}`;
};

/** A paid order, delivered `deliveredAgo` ago (not delivered when null). */
const putOrder = async (email, { createdAgo = 10 * DAY, deliveredAgo = 4 * DAY, status = 'Delivered', paymentStatus = 'Paid', items, extra = {} } = {}) => {
  const now = Date.now();
  const number = orderNumber(createdAgo);
  await h.put('orders', number, {
    orderNumber: number, customerEmail: email, customerName: 'Meera Shah', status, paymentStatus, finalTotal: 1499,
    items: items || [{ product: { id: 'prod-A', name: 'Blue Kurta Set', price: 1499 }, selectedSize: 'M', quantity: 1 }],
    timeline: [
      { status: 'Pending', at: iso(now - createdAgo), note: '' },
      ...(deliveredAgo === null ? [] : [{ status: 'Delivered', at: iso(now - deliveredAgo), note: '' }]),
    ],
    createdAt: iso(now - createdAgo), updatedAt: iso(now - (deliveredAgo ?? createdAgo)), ...extra,
  });
  return number;
};

/** The Worker's scheduled run, with its D1 calls counted (the free plan allows 50 in one run). */
const runCron = async () => {
  const used = { d1Calls: 0 };
  const counted = (statement) => ({
    statement,
    bind: (...params) => counted(statement.bind(...params)),
    first: (...args) => { used.d1Calls += 1; return statement.first(...args); },
    all: () => { used.d1Calls += 1; return statement.all(); },
    run: () => { used.d1Calls += 1; return statement.run(); },
  });
  const DB = {
    prepare: (sql) => counted(h.d1.prepare(sql)),
    batch: (statements) => { used.d1Calls += 1; return h.d1.batch(statements.map((entry) => entry.statement)); },
  };
  const background = [];
  await h.worker.scheduled({ cron: '17 * * * *', scheduledTime: Date.now() }, { ...h.workerEnv, DB }, { waitUntil: (promise) => { background.push(promise); } });
  await Promise.all(background);
  assert.ok(used.d1Calls <= D1_CALLS_PER_REQUEST, `the scheduled run made ${used.d1Calls} D1 calls`);
  return used;
};

const mailTo = (email) => h.mailTo(email);

// ---- A. abandoned checkout ----

test('a checkout left 2 hours ago gets exactly one reminder, and a second run sends nothing', async () => {
  const email = 'left-two-hours@example.test';
  const id = await putCheckout(email);
  const before = h.mail.length;
  await runCron();

  assert.equal(h.mail.length, before + 1);
  const [mail] = mailTo(email);
  assert.equal(mail.subject, 'Your bag is waiting at Suit Aura Girls');
  assert.equal(mail.subject, ABANDONED_SUBJECT);
  assert.ok(mail.html.includes('Rose &lt;Anarkali&gt; Suit'), 'the item name is shown, escaped');
  assert.ok(mail.html.includes('https://media.suitauragirls.in/i/product-images/abcdef123456/j480.jpg'), 'the first photo, as the small JPEG');
  assert.ok(mail.html.includes('href="https://www.suitauragirls.in/checkout"'));
  assert.ok(mail.html.includes('You get 15% off when you pay online.'));
  assert.ok(!/cash on delivery/i.test(mail.html), 'cash on delivery is off, so it is not mentioned');
  assert.ok(mail.html.includes(REASON) && mail.text.includes(REASON));
  assert.ok(!/hurry|only \d+ left|selling fast|expires|last chance|limited/i.test(mail.html), 'no invented urgency');

  const stored = await h.doc('abandoned_checkouts', id);
  assert.ok(Date.parse(stored.reminderSentAt) > Date.now() - MINUTE);
  assert.equal(stored.fullName, 'Asha Verma', 'the rest of the document is untouched');
  assert.equal((await h.doc(REMINDER_LOG, encodeURIComponent(email))).checkoutId, id);

  await runCron();
  await runCron();
  assert.equal(h.mail.length, before + 1);
  assert.equal(mailTo(email).length, 1);
});

test('the offer line follows the store settings: cash on delivery only when on, no percent when it is 0', async () => {
  await useSettings({ prepaidPercent: 10, prepaidMinPrice: 999, codEnabled: true });
  await putCheckout('offer-both@example.test');
  await runCron();
  const both = mailTo('offer-both@example.test')[0];
  assert.ok(both.html.includes('You get 10% off when you pay online (on styles priced above ₹999). Cash on delivery is available too.'));

  await useSettings({ prepaidPercent: 0, codEnabled: false });
  await putCheckout('offer-none@example.test');
  await runCron();
  const none = mailTo('offer-none@example.test')[0];
  assert.ok(!/% off|cash on delivery/i.test(none.html));
  await useSettings();
});

test('too fresh, too old, no email, a bad email, an empty bag: nothing is sent', async () => {
  const before = h.mail.length;
  const ids = [
    await putCheckout('too-fresh@example.test', { updatedAgo: 30 * MINUTE }),
    await putCheckout('too-old@example.test', { updatedAgo: 25 * HOUR }),
    await putCheckout('', { extra: { address: { fullName: 'Asha Verma', mobile: '9876543210' } } }),
    await putCheckout('not-an-email', { extra: { address: {} } }),
    await putCheckout('empty-bag@example.test', { items: [] }),
  ];
  await runCron();
  assert.equal(h.mail.length, before);
  for (const id of ids) assert.equal((await h.doc('abandoned_checkouts', id)).reminderSentAt, undefined);
});

test('a shopper who paid for an order after starting the checkout is not reminded; an unpaid order changes nothing', async () => {
  const before = h.mail.length;
  const bought = await putCheckout('already-bought@example.test', { updatedAgo: 2 * HOUR, startedAgo: 3 * HOUR });
  await putOrder('Already-Bought@example.test', { createdAgo: 90 * MINUTE, deliveredAgo: null, status: 'Processing' });
  await putCheckout('only-unpaid@example.test', { updatedAgo: 2 * HOUR, startedAgo: 3 * HOUR });
  await putOrder('only-unpaid@example.test', { createdAgo: 90 * MINUTE, deliveredAgo: null, status: 'Pending', paymentStatus: 'Unpaid' });
  await runCron();
  assert.equal(mailTo('already-bought@example.test').length, 0);
  assert.equal((await h.doc('abandoned_checkouts', bought)).reminderSentAt, undefined);
  assert.equal(mailTo('only-unpaid@example.test').length, 1);
  assert.equal(h.mail.length, before + 1);
});

test('the owner\'s switch off: nothing is sent; on again: the reminder goes', async () => {
  await useSettings({ abandonedReminders: false });
  const id = await putCheckout('switch-off@example.test');
  const before = h.mail.length;
  await runCron();
  assert.equal(h.mail.length, before);
  assert.equal((await h.doc('abandoned_checkouts', id)).reminderSentAt, undefined);
  await useSettings();
  await runCron();
  assert.equal(mailTo('switch-off@example.test').length, 1);
});

test('one reminder per address in 7 days, however many checkouts they start', async () => {
  const email = 'comes-back@example.test';
  await putCheckout(email, { updatedAgo: 3 * HOUR });
  const twin = await putCheckout(email, { updatedAgo: 2 * HOUR });
  await runCron();
  assert.equal(mailTo(email).length, 1, 'two open checkouts of one address get one email');
  const later = await putCheckout(email, { updatedAgo: 90 * MINUTE });
  await runCron();
  assert.equal(mailTo(email).length, 1);
  assert.equal((await h.doc('abandoned_checkouts', later)).reminderSentAt, undefined);
  assert.ok((await h.doc('abandoned_checkouts', twin)).reminderSentAt, 'the newest of the two was the one reminded');

  // Eight days later the address may be reminded again (the same run, with the clock moved on)
  const eightDays = Date.now() + 8 * DAY;
  const again = `chk_${eightDays - 3 * HOUR}_t${nextSerial()}`;
  await h.put('abandoned_checkouts', again, { email, fullName: 'Asha Verma', cartItems: [{ product: { id: 'p-1', name: 'Rose Suit' }, quantity: 1 }], updatedAt: iso(eightDays - 2 * HOUR) });
  await runReminders(db, { now: eightDays });
  assert.equal(mailTo(email).length, 2);
  await h.remove('abandoned_checkouts', again);
});

test('two runs at the same moment send one email, not two', async () => {
  const email = 'raced@example.test';
  await putCheckout(email);
  const now = Date.now();
  await Promise.all([runReminders(db, { now }), runReminders(db, { now }), runReminders(db, { now })]);
  assert.equal(mailTo(email).length, 1);
});

test('Brevo refuses the email: the checkout is not marked and a later run sends it once', async () => {
  const email = 'refused-once@example.test';
  const id = await putCheckout(email);
  h.services.brevoStatus = 500;
  await runCron();
  h.services.brevoStatus = 201;
  let stored = await h.doc('abandoned_checkouts', id);
  assert.deepEqual({ reminderSentAt: stored.reminderSentAt, reminderFailures: stored.reminderFailures }, { reminderSentAt: undefined, reminderFailures: 1 });
  assert.equal(await h.doc(REMINDER_LOG, encodeURIComponent(email)), null);
  assert.equal(mailTo(email).length, 0);

  await runCron();
  await runCron();
  stored = await h.doc('abandoned_checkouts', id);
  assert.ok(stored.reminderSentAt);
  assert.equal(mailTo(email).length, 1);
});

test('when it is not known whether the email left, the mark stays and it is never tried again', async () => {
  const email = 'cut-off@example.test';
  const id = await putCheckout(email);
  const attempts = [];
  const send = async (mail) => { attempts.push(mail.to); throw new Error('network connection lost'); };
  const first = await runReminders(db, { send });
  assert.deepEqual({ sent: first.abandoned.sent, unsure: first.abandoned.unsure }, { sent: 0, unsure: 1 });
  assert.ok((await h.doc('abandoned_checkouts', id)).reminderSentAt);
  await runReminders(db, { send });
  await runCron();
  assert.deepEqual(attempts, [email]);
  assert.equal(mailTo(email).length, 0);
});

test('email not configured: the run does nothing and reads nothing', async () => {
  const id = await putCheckout('no-email-service@example.test');
  const before = h.mail.length;
  const key = process.env.BREVO_API_KEY;
  delete process.env.BREVO_API_KEY;
  let used;
  try {
    // The Worker copies its string settings into process.env, so the key is taken out of both
    const env = { ...h.workerEnv };
    delete env.BREVO_API_KEY;
    let calls = 0;
    env.DB = { prepare: () => { calls += 1; throw new Error('the database must not be read'); }, batch: () => { calls += 1; throw new Error('the database must not be read'); } };
    await h.worker.scheduled({ cron: '17 * * * *' }, env, { waitUntil() {} });
    used = calls;
  } finally {
    process.env.BREVO_API_KEY = key;
  }
  assert.equal(used, 0);
  assert.equal(h.mail.length, before);
  assert.deepEqual(await runReminders(db, { configured: false }), { skipped: 'email-not-configured' });
  await h.remove('abandoned_checkouts', id);
});

test('the scheduled run never throws, even when the database fails', async () => {
  const env = { ...h.workerEnv, DB: { prepare: () => { throw new Error('D1_ERROR: boom'); }, batch: () => { throw new Error('D1_ERROR: boom'); } } };
  await assert.doesNotReject(h.worker.scheduled({ cron: '17 * * * *' }, env, { waitUntil() {} }));
  await assert.doesNotReject(h.worker.scheduled(undefined, env, undefined));
  assert.ok(h.logs.some((line) => line.level === 'error' && /Scheduled/.test(line.text)));
});

// ---- B. review request ----

test('an order delivered 4 days ago gets one review request and never a second', async () => {
  const email = 'delivered-four-days@example.test';
  const number = await putOrder(email, { items: [
    { product: { id: 'prod-A', name: 'Blue Kurta Set' }, quantity: 1 },
    { product: { id: 'prod-A', name: 'Blue Kurta Set' }, quantity: 1, selectedSize: 'L' },
    { product: { id: 'prod-B', name: 'Green Sharara' }, quantity: 1 },
    { product: { id: 'prod-C', name: 'Red Lehenga' }, quantity: 1 },
    { product: { id: 'prod-D', name: 'Fourth Piece' }, quantity: 1 },
  ] });
  const before = h.mail.length;
  await runCron();
  assert.equal(h.mail.length, before + 1);
  const [mail] = mailTo(email);
  assert.equal(mail.subject, `How was your order ${number}? Share a review`);
  for (const id of ['prod-A', 'prod-B', 'prod-C']) assert.equal(mail.html.split(`href="https://www.suitauragirls.in/product/${id}#pdp-reviews"`).length, 2, `one button for ${id}`);
  assert.ok(!mail.html.includes('prod-D'), 'at most three products');
  assert.ok(!/reward|coupon|discount|% off|cashback|gift|5[- ]star|five[- ]star|positive/i.test(mail.html + mail.text), 'no reward, and no asking for a positive review');
  assert.ok(Date.parse((await h.doc('orders', number)).reviewRequestSentAt) > Date.now() - MINUTE);
  assert.equal((await h.doc('orders', number)).status, 'Delivered');

  await runCron();
  await runCron();
  assert.equal(mailTo(email).length, 1);
  assert.equal(h.mail.length, before + 1);
});

test('no review request: delivered too recently or too long ago, an open return, cancelled, returned, refunded, unpaid', async () => {
  const before = h.mail.length;
  const numbers = [
    await putOrder('review-too-soon@example.test', { deliveredAgo: 2 * DAY }),
    await putOrder('review-too-late@example.test', { createdAgo: 20 * DAY, deliveredAgo: 15 * DAY }),
    await putOrder('review-open-return@example.test', { extra: { returnRequest: { type: 'return', status: 'requested', items: [], reason: 'Other', at: iso(Date.now() - DAY) } } }),
    await putOrder('review-approved-return@example.test', { extra: { returnRequest: { type: 'exchange', status: 'approved', items: [], reason: 'Other', at: iso(Date.now() - DAY) } } }),
    await putOrder('review-legacy-return@example.test', { status: 'Refund Requested' }),
    await putOrder('review-cancelled@example.test', { status: 'Cancelled' }),
    await putOrder('review-returned@example.test', { status: 'Returned' }),
    await putOrder('review-refunded@example.test', { status: 'Refunded', paymentStatus: 'Refunded' }),
    await putOrder('review-not-delivered@example.test', { status: 'Shipped', deliveredAgo: null }),
    await putOrder('review-unpaid@example.test', { paymentStatus: 'Unpaid' }),
    await putOrder('', {}),
  ];
  await runCron();
  assert.equal(h.mail.length, before);
  for (const number of numbers) assert.equal((await h.doc('orders', number)).reviewRequestSentAt, undefined);
});

test('a return that was rejected does not block the request; the switch does', async () => {
  await useSettings({ reviewRequests: false });
  const number = await putOrder('review-switch@example.test', { extra: { returnRequest: { type: 'return', status: 'rejected', items: [], reason: 'Other', at: iso(Date.now() - DAY) } } });
  const before = h.mail.length;
  await runCron();
  assert.equal(h.mail.length, before);
  assert.equal((await h.doc('orders', number)).reviewRequestSentAt, undefined);
  await useSettings();
  await runCron();
  assert.equal(mailTo('review-switch@example.test').length, 1);
});

test('Brevo refuses a review request: the order is not marked, and it goes once later', async () => {
  const email = 'review-refused@example.test';
  const number = await putOrder(email);
  h.services.brevoStatus = 400;
  await runCron();
  h.services.brevoStatus = 201;
  const stored = await h.doc('orders', number);
  assert.deepEqual({ sentAt: stored.reviewRequestSentAt, failures: stored.reviewRequestFailures }, { sentAt: undefined, failures: 1 });
  await runCron();
  await runCron();
  assert.equal(mailTo(email).length, 1);
});

// ---- both ----

test('a run sends at most 25 emails in all, within the D1 calls of one run; the rest go in the next run', async () => {
  assert.equal(MAX_EMAILS_PER_RUN, 25);
  const checkouts = [];
  for (let index = 0; index < 22; index += 1) checkouts.push(`cap-checkout-${index}@example.test`);
  const reviews = [];
  for (let index = 0; index < 8; index += 1) reviews.push(`cap-review-${index}@example.test`);
  for (const email of checkouts) await putCheckout(email);
  for (const email of reviews) await putOrder(email);

  const before = h.mail.length;
  const used = await runCron();
  assert.equal(h.mail.length - before, 25);
  const sent = h.mail.slice(before).map((mail) => mail.to);
  assert.equal(new Set(sent).size, 25, 'nobody got two');
  assert.equal(sent.filter((to) => to.startsWith('cap-checkout-')).length, 22);
  assert.equal(sent.filter((to) => to.startsWith('cap-review-')).length, 3);
  assert.ok(used.d1Calls <= D1_CALLS_PER_REQUEST);

  await runCron();
  assert.equal(h.mail.length - before, 30);
  assert.equal(new Set(h.mail.slice(before).map((mail) => mail.to)).size, 30);
  await runCron();
  assert.equal(h.mail.length - before, 30);
});

test('Brevo down: the run stops after three refusals and leaves the rest unmarked for a later run', async () => {
  const emails = [];
  for (let index = 0; index < 7; index += 1) emails.push(`outage-${index}@example.test`);
  const ids = [];
  for (const email of emails) ids.push(await putCheckout(email));
  const review = await putOrder('outage-review@example.test');
  h.services.brevoStatus = 503;
  const used = await runCron();
  h.services.brevoStatus = 201;
  assert.ok(used.d1Calls <= D1_CALLS_PER_REQUEST);
  const stored = await Promise.all(ids.map((id) => h.doc('abandoned_checkouts', id)));
  assert.equal(stored.filter((row) => row.reminderSentAt).length, 0, 'nothing stays marked as sent');
  assert.equal(stored.filter((row) => row.reminderFailures === 1).length, 3);
  assert.equal((await h.doc('orders', review)).reviewRequestSentAt, undefined);

  await runCron();
  for (const email of [...emails, 'outage-review@example.test']) assert.equal(mailTo(email).length, 1, email);
});

// ---- the owner's switches and the browser ----

test('store settings: the two switches are on unless saved as false, and saved as real booleans', async () => {
  const { cookie } = await signInAdmin(h);
  const current = (await h.call('/api/admin-config')).body.settings.storeSettings;
  const { abandonedReminders: _a, reviewRequests: _r, ...withoutSwitches } = current;
  assert.equal((await adminPut(h, cookie, { settings: { storeSettings: withoutSwitches } })).status, 200);
  let stored = await h.setting('storeSettings');
  assert.deepEqual({ abandonedReminders: stored.abandonedReminders, reviewRequests: stored.reviewRequests }, { abandonedReminders: true, reviewRequests: true });

  assert.equal((await adminPut(h, cookie, { settings: { storeSettings: { ...withoutSwitches, abandonedReminders: false, reviewRequests: 'no' } } })).status, 200);
  stored = await h.setting('storeSettings');
  assert.deepEqual({ abandonedReminders: stored.abandonedReminders, reviewRequests: stored.reviewRequests }, { abandonedReminders: false, reviewRequests: true });
  await useSettings();
});

test('a browser can neither read nor write the reminder log', async () => {
  const id = encodeURIComponent('left-two-hours@example.test');
  assert.ok(await h.doc(REMINDER_LOG, id));
  const read = await h.post('/api/db', { ops: [{ op: 'get', path: `${REMINDER_LOG}/${id}` }] });
  assert.ok(!JSON.stringify(read.body).includes('lastSentAt'), read.text);
  const write = await h.post('/api/db', { ops: [{ op: 'set', path: `${REMINDER_LOG}/x`, data: { lastSentAt: iso(Date.now()) } }] });
  assert.ok(write.status >= 400 || !JSON.stringify(write.body).includes('"ok":true'), write.text);
  assert.equal(await h.doc(REMINDER_LOG, 'x'), null);
});
