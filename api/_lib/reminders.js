// Two automatic emails, sent by the Worker's hourly scheduled run (worker/src/index.js):
//   A. one reminder to a shopper who typed their email at checkout and left (abandoned_checkouts),
//   B. one review request for an order that was delivered a few days ago (orders).
//
// Never twice. A document is CLAIMED before its email goes out: a transaction reads it, checks that the mark
// (reminderSentAt / reviewRequestSentAt) is not there, and writes it. Two runs racing for one document cannot
// both commit (the store compares document versions), so only one of them sends. When the email provider
// refuses the email, the mark is taken off again (and a failure is counted), so a later run may try once more.
// When it is not known whether the email left (the run was cut off, the connection dropped), the mark stays:
// a missed reminder is better than a second one.
//
// Small on D1 (free plan: 50 queries per run). Checkout ids (chk_<ms>_…) and order numbers (SAG-<yymmdd>-…)
// start with their date, so the scans are ranges on the primary key with a limit, not whole-collection scans,
// and documents are claimed five at a time in one transaction.
import { FieldValue } from 'firebase-admin/firestore';
import { isValidEmail } from './http.js';
import { mediaVariant } from './media.js';
import { button, escapeHtml, layout, sendEmail } from './email.js';
import { deliveredAt, isReturnOpen, readPricingRules, readSetting } from './orders.js';

const SITE_URL = 'https://www.suitauragirls.in';
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Emails per run, both kinds together: Brevo allows 300 a day and order emails must never be starved. */
export const MAX_EMAILS_PER_RUN = 25;
export const ABANDONED_MIN_AGE_MS = 60 * MINUTE_MS;
export const ABANDONED_MAX_AGE_MS = 24 * HOUR_MS;
/** One reminder per email address in this many days, however many checkouts they start. */
export const REMINDER_GAP_DAYS = 7;
export const REVIEW_MIN_DAYS = 3;
export const REVIEW_MAX_DAYS = 14;
export const REVIEW_MAX_ITEMS = 3;
/** When each address last got a reminder (server only; one small document per address). */
export const REMINDER_LOG = 'reminder_log';

const SCAN_LIMIT = 300;          // documents read per scan, newest first
const CLAIM_CHUNK = 5;           // documents claimed in one transaction
const MAX_CLAIM_ROUNDS = 10;     // transactions per run, both kinds together
const MAX_FAILURES_PER_RUN = 3;  // refused emails after which the run stops (the provider is down or out of quota)
const MAX_FAILURES_PER_DOC = 2;  // refused emails after which a document is left alone
const ORDER_LOOKBACK_DAYS = 60;  // an order delivered in the last 14 days was placed within this many days
const CLOCK_SLACK_MS = 15 * MINUTE_MS; // checkout times come from the shopper's clock, order times from ours

const lower = (value) => String(value || '').trim().toLowerCase();
const timeOf = (value) => {
  const ms = new Date(String(value || '')).getTime();
  return Number.isFinite(ms) ? ms : null;
};
const p = (html) => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${html}</p>`;
const small = (html) => `<p style="font-size:12px;line-height:1.6;color:#55635D;margin:20px 0 0">${html}</p>`;
const firstName = (value) => String(value || '').trim().split(/\s+/)[0].slice(0, 40);
const greeting = (name) => p(firstName(name) ? `Hi ${escapeHtml(firstName(name))},` : 'Hi,');

/** The date part order numbers start with: "SAG-261007" (UTC, as newOrderNumber writes it). */
const orderPrefix = (ms) => {
  const date = new Date(ms);
  return `SAG-${String(date.getUTCFullYear()).slice(2)}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
};

/** The owner's two switches (Admin → Settings). Both are ON when the field is missing. */
export const reminderSwitches = (store) => ({
  abandonedReminders: store?.abandonedReminders !== false,
  reviewRequests: store?.reviewRequests !== false,
});

// ---------------------------------------------------------------------------------------------
// A. Abandoned checkout
// ---------------------------------------------------------------------------------------------

/** What a saved checkout holds (written by src/components/CheckoutPage.tsx), in the shape the reminder needs. */
export const readCheckout = (id, data) => {
  const row = data && typeof data === 'object' ? data : {};
  const address = row.address && typeof row.address === 'object' ? row.address : {};
  const updatedAt = timeOf(row.updatedAt);
  const idTime = Number((String(id).match(/^chk_(\d{13})_/) || [])[1]) || null;
  const items = (Array.isArray(row.cartItems) ? row.cartItems : [])
    .map((item) => ({
      name: String(item?.product?.name || '').trim().slice(0, 160),
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
      image: String(item?.product?.images?.[0] || item?.product?.image || ''),
    }))
    .filter((item) => item.name);
  return {
    id: String(id),
    email: lower(row.email || address.email),
    name: String(row.fullName || `${row.firstName || ''} ${row.lastName || ''}`).trim(),
    items,
    updatedAt,
    // When the shopper opened the checkout: the time in the id, never later than the last update
    startedAt: updatedAt === null ? idTime : Math.min(idTime ?? updatedAt, updatedAt),
    reminderSentAt: String(row.reminderSentAt || ''),
    failures: Number(row.reminderFailures) || 0,
  };
};

/** Left more than an hour and less than a day ago, with an email, something in the bag, and not reminded yet. */
export const isReminderDue = (checkout, now) => {
  if (!checkout || checkout.updatedAt === null || checkout.reminderSentAt) return false;
  if (!isValidEmail(checkout.email) || checkout.email.length > 160 || checkout.items.length === 0) return false;
  if (checkout.failures >= MAX_FAILURES_PER_DOC) return false;
  const age = now - checkout.updatedAt;
  return age > ABANDONED_MIN_AGE_MS && age < ABANDONED_MAX_AGE_MS;
};

/** One honest line about paying, from the store's real settings ('' when there is nothing to say). */
export const paymentOfferLine = (rules) => {
  const parts = [];
  const percent = Number(rules?.prepaidPercent) || 0;
  if (percent > 0) {
    const above = Number(rules?.prepaidMinPrice) || 0;
    parts.push(`You get ${percent}% off when you pay online${above > 0 ? ` (on styles priced above ₹${above.toLocaleString('en-IN')})` : ''}.`);
  }
  if (rules?.codEnabled === true) parts.push('Cash on delivery is available too.');
  return parts.join(' ');
};

export const ABANDONED_SUBJECT = 'Your bag is waiting at Suit Aura Girls';
const ABANDONED_REASON = 'You are getting this one email because you started a checkout on suitauragirls.in.';

export const abandonedEmail = (checkout, rules) => {
  // The bag is kept in the browser's own storage (sag_cart_v1), so the checkout page opens with it
  const link = `${SITE_URL}/checkout`;
  const shown = checkout.items.slice(0, 6);
  const more = checkout.items.length - shown.length;
  const photo = /^https:\/\//.test(shown[0]?.image || '') ? mediaVariant(shown[0].image, 'j480.jpg') : '';
  const rows = shown.map((item) => `<tr><td style="padding:8px 0;border-bottom:1px solid rgba(75,29,63,0.12);font-size:14px">${escapeHtml(item.name)}${item.quantity > 1 ? ` <span style="font-size:12px;color:#55635D">× ${item.quantity}</span>` : ''}</td></tr>`).join('');
  const offer = paymentOfferLine(rules);
  const html = layout('Your bag is waiting', [
    greeting(checkout.name),
    p('You left these in your bag at Suit Aura Girls. They are saved, and you can finish your order whenever you like.'),
    photo ? `<p style="margin:0 0 12px"><img src="${escapeHtml(photo)}" alt="${escapeHtml(shown[0].name)}" width="160" style="border-radius:12px;border:1px solid rgba(75,29,63,0.15)"></p>` : '',
    `<table style="width:100%;border-collapse:collapse;margin:4px 0 16px">${rows}</table>`,
    more > 0 ? p(`and ${more} more.`) : '',
    offer ? p(escapeHtml(offer)) : '',
    button(link, 'GO TO CHECKOUT'),
    small(ABANDONED_REASON),
  ].filter(Boolean).join('\n'));
  const names = shown.map((item) => item.name).join(', ');
  return {
    to: checkout.email,
    name: checkout.name || 'Customer',
    subject: ABANDONED_SUBJECT,
    html,
    text: `Your bag is waiting at Suit Aura Girls: ${names}${more > 0 ? ` and ${more} more` : ''}. Finish your order at ${link}${offer ? ` ${offer}` : ''} ${ABANDONED_REASON}`,
  };
};

const logRef = (db, email) => db.collection(REMINDER_LOG).doc(encodeURIComponent(email));

/** Checkouts due for a reminder, newest first, one per email address, without the shoppers who bought since. */
const findAbandoned = async (db, now) => {
  const snapshot = await db.collection('abandoned_checkouts')
    .where('__name__', '>=', `chk_${now - (REMINDER_GAP_DAYS + 1) * DAY_MS}`)
    .where('__name__', '<', `chk_${now - ABANDONED_MIN_AGE_MS}`)
    .orderBy('__name__', 'desc')
    .limit(SCAN_LIMIT)
    .get();
  const rows = snapshot.docs.map((doc) => readCheckout(doc.id, doc.data()));
  // Addresses reminded in the last 7 days (the transaction checks this again in reminder_log)
  const recent = new Set(rows.filter((row) => (timeOf(row.reminderSentAt) ?? 0) > now - REMINDER_GAP_DAYS * DAY_MS).map((row) => row.email));
  const byEmail = new Map();
  for (const row of rows.filter((entry) => isReminderDue(entry, now) && !recent.has(entry.email)).sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (!byEmail.has(row.email)) byEmail.set(row.email, row);
  }
  const due = [...byEmail.values()];
  if (due.length === 0) return due;

  // Paid orders placed since the oldest of these checkouts was started: one range read, newest first
  const since = Math.min(...due.map((row) => row.startedAt)) - CLOCK_SLACK_MS;
  const orders = await db.collection('orders')
    .where('__name__', '>=', orderPrefix(since))
    .orderBy('__name__', 'desc')
    .limit(SCAN_LIMIT)
    .get();
  const paid = orders.docs.map((doc) => doc.data()).filter((order) => order.paymentStatus === 'Paid')
    .map((order) => ({ email: lower(order.customerEmail), at: timeOf(order.createdAt) ?? timeOf(order.paidAt) ?? now }));
  return due.filter((row) => !paid.some((order) => order.email === row.email && order.at >= row.startedAt - CLOCK_SLACK_MS));
};

// ---------------------------------------------------------------------------------------------
// B. Review request
// ---------------------------------------------------------------------------------------------

/** Delivered 3 to 14 days ago, paid, still simply 'Delivered' (not cancelled, returned or refunded), no open return. */
export const isReviewDue = (order, now) => {
  if (!order || order.status !== 'Delivered' || order.paymentStatus !== 'Paid' || order.testPayment) return false;
  if (order.reviewRequestSentAt || (Number(order.reviewRequestFailures) || 0) >= MAX_FAILURES_PER_DOC) return false;
  if (!isValidEmail(lower(order.customerEmail)) || isReturnOpen(order)) return false;
  const delivered = deliveredAt(order);
  if (delivered === null) return false;
  const age = now - delivered;
  return age >= REVIEW_MIN_DAYS * DAY_MS && age <= REVIEW_MAX_DAYS * DAY_MS && reviewItems(order).length > 0;
};

/** The order's products (each once, at most three) that have a product page to review on. */
export const reviewItems = (order) => {
  const seen = new Map();
  for (const item of Array.isArray(order?.items) ? order.items : []) {
    const id = String(item?.product?.id || '').trim();
    if (id && !seen.has(id)) seen.set(id, { id, name: String(item.product.name || 'your purchase').trim().slice(0, 60) });
  }
  return [...seen.values()].slice(0, REVIEW_MAX_ITEMS);
};

export const reviewSubject = (order) => `How was your order ${order.orderNumber}? Share a review`;

export const reviewEmail = (order) => {
  // The reviews section of the product page (src/components/ProductReviews.tsx, id "pdp-reviews")
  const items = reviewItems(order).map((item) => ({ ...item, link: `${SITE_URL}/product/${encodeURIComponent(item.id)}#pdp-reviews` }));
  const html = layout('How was your order?', [
    greeting(order.customerName),
    p(`Your order <strong>${escapeHtml(order.orderNumber)}</strong> has been with you for a few days. If you have a minute, tell other shoppers what you honestly think of it: the fit, the fabric, the colour, good or bad.`),
    ...items.map((item) => button(item.link, `Review: ${item.name}`)),
    p(`<br>Something not right with the order? <a href="${SITE_URL}/contact" style="color:#0E4A36">Contact us</a> with your order number.`),
    small('You are getting this one email because your order from suitauragirls.in was delivered.'),
  ].join('\n'));
  return {
    to: lower(order.customerEmail),
    name: order.customerName || 'Customer',
    subject: reviewSubject(order),
    html,
    text: `How was your order ${order.orderNumber}? Tell other shoppers what you honestly think, good or bad: ${items.map((item) => `${item.name}: ${item.link}`).join(' , ')}`,
  };
};

/** Orders due for a review request, the longest-delivered first (they leave the 14-day window soonest). */
const findReviewOrders = async (db, now) => {
  const snapshot = await db.collection('orders')
    .where('__name__', '>=', orderPrefix(now - ORDER_LOOKBACK_DAYS * DAY_MS))
    .where('__name__', '<', orderPrefix(now - (REVIEW_MIN_DAYS - 1) * DAY_MS))
    .orderBy('__name__', 'desc')
    .limit(SCAN_LIMIT)
    .get();
  return snapshot.docs
    .map((doc) => ({ ...doc.data(), orderNumber: doc.id }))
    .filter((order) => isReviewDue(order, now))
    .sort((a, b) => deliveredAt(a) - deliveredAt(b));
};

// ---------------------------------------------------------------------------------------------
// Claim, then send
// ---------------------------------------------------------------------------------------------

/** The provider answered "no": the email certainly did not go, so the claim can be given back. */
const certainlyNotSent = (error) => error?.message === 'EMAIL_DELIVERY_FAILED' || error?.message === 'EMAIL_NOT_CONFIGURED';

/**
 * Claims the candidates five at a time and sends each claimed one. `kind` says how:
 *   ref(candidate)                 the document that carries the mark
 *   extraRefs(candidate)           other documents the claim reads (the address's reminder_log entry)
 *   claim(tx, candidate, snaps, stamp)  checks the fresh documents and writes the mark; false = leave it
 *   release(batch, candidate, failed)   takes the mark off again
 *   mail(candidate)                the email
 */
const claimAndSend = async (db, candidates, kind, run) => {
  const result = { sent: 0, failed: 0, unsure: 0 };
  const queue = [...candidates];
  while (queue.length && run.left > 0 && run.rounds > 0 && !run.stopped) {
    const chunk = queue.splice(0, Math.min(CLAIM_CHUNK, run.left));
    run.rounds -= 1;
    const stamp = new Date(run.now).toISOString();
    const claimed = await db.runTransaction(async (tx) => {
      const refs = chunk.map((candidate) => kind.ref(candidate));
      const extras = new Map();
      for (const candidate of chunk) for (const ref of kind.extraRefs?.(candidate) || []) extras.set(ref.path, ref);
      const snaps = await tx.getAll(...refs, ...extras.values());
      const byPath = new Map(snaps.map((snap) => [snap.ref.path, snap]));
      const taken = [];
      const state = { seen: new Set() };
      for (const candidate of chunk) {
        if (kind.claim(tx, candidate, byPath, stamp, state)) taken.push(candidate);
      }
      return taken;
    });
    run.left -= claimed.length;

    for (let index = 0; index < claimed.length; index += 1) {
      const candidate = claimed[index];
      try {
        await run.send(kind.mail(candidate));
        result.sent += 1;
      } catch (error) {
        if (!certainlyNotSent(error)) {
          // Not known whether it left: the mark stays, so it can never go a second time
          result.unsure += 1;
          console.error(`${kind.label} for ${kind.ref(candidate).path}: the send did not finish (${error?.message}); it will not be retried.`);
          continue;
        }
        result.failed += 1;
        run.failures += 1;
        const stop = run.failures >= MAX_FAILURES_PER_RUN;
        // The refused one, and (when the run stops here) the claimed ones that were not tried
        const giveBack = stop ? claimed.slice(index) : [candidate];
        try {
          const batch = db.batch();
          giveBack.forEach((entry) => kind.release(batch, entry, entry === candidate));
          await batch.commit();
        } catch (releaseError) {
          console.error(`${kind.label}: could not take the mark off ${giveBack.map((entry) => kind.ref(entry).path).join(', ')}: ${releaseError?.message}`);
        }
        if (stop) {
          run.stopped = true;
          break;
        }
      }
    }
  }
  return result;
};

const abandonedKind = (db, rules) => ({
  label: 'Abandoned checkout reminder',
  ref: (checkout) => db.collection('abandoned_checkouts').doc(checkout.id),
  extraRefs: (checkout) => [logRef(db, checkout.email)],
  claim: (tx, checkout, snaps, stamp, state) => {
    const ref = db.collection('abandoned_checkouts').doc(checkout.id);
    const snap = snaps.get(ref.path);
    if (!snap?.exists || state.seen.has(checkout.email)) return false;
    const fresh = readCheckout(checkout.id, snap.data());
    const now = new Date(stamp).getTime();
    // Read again inside the transaction: the shopper may have come back, or another run may have got here first
    if (fresh.email !== checkout.email || !isReminderDue(fresh, now)) return false;
    const log = snaps.get(logRef(db, checkout.email).path);
    const last = log?.exists ? timeOf(log.data().lastSentAt) : null;
    if (last !== null && last > now - REMINDER_GAP_DAYS * DAY_MS) return false;
    state.seen.add(checkout.email);
    tx.update(ref, { reminderSentAt: stamp });
    tx.set(logRef(db, checkout.email), { email: checkout.email, lastSentAt: stamp, checkoutId: checkout.id });
    return true;
  },
  release: (batch, checkout, failed) => {
    batch.update(db.collection('abandoned_checkouts').doc(checkout.id), { reminderSentAt: FieldValue.delete(), ...(failed ? { reminderFailures: FieldValue.increment(1) } : {}) });
    // The entry was written by this claim (an older one was more than 7 days old), so removing it loses nothing
    batch.delete(logRef(db, checkout.email));
  },
  mail: (checkout) => abandonedEmail(checkout, rules),
});

const reviewKind = (db) => ({
  label: 'Review request',
  ref: (order) => db.collection('orders').doc(order.orderNumber),
  claim: (tx, order, snaps, stamp) => {
    const ref = db.collection('orders').doc(order.orderNumber);
    const snap = snaps.get(ref.path);
    if (!snap?.exists || !isReviewDue(snap.data(), new Date(stamp).getTime())) return false;
    tx.update(ref, { reviewRequestSentAt: stamp });
    return true;
  },
  release: (batch, order, failed) => {
    batch.update(db.collection('orders').doc(order.orderNumber), { reviewRequestSentAt: FieldValue.delete(), ...(failed ? { reviewRequestFailures: FieldValue.increment(1) } : {}) });
  },
  mail: (order) => reviewEmail(order),
});

const newRun = ({ now, send, cap }) => ({ now, send, left: Math.max(0, Math.floor(cap)), rounds: MAX_CLAIM_ROUNDS, failures: 0, stopped: false });

/** A. Sends the abandoned-checkout reminders that are due. `run` is shared when both kinds go in one run. */
export const sendAbandonedReminders = async (db, { now = Date.now(), send = sendEmail, cap = MAX_EMAILS_PER_RUN, run = newRun({ now, send, cap }) } = {}) => {
  const due = await findAbandoned(db, now);
  if (due.length === 0 || run.left <= 0) return { due: due.length, sent: 0, failed: 0, unsure: 0 };
  const rules = await readPricingRules(db);
  return { due: due.length, ...await claimAndSend(db, due, abandonedKind(db, rules), run) };
};

/** B. Sends the review requests that are due. */
export const sendReviewRequests = async (db, { now = Date.now(), send = sendEmail, cap = MAX_EMAILS_PER_RUN, run = newRun({ now, send, cap }) } = {}) => {
  const due = await findReviewOrders(db, now);
  if (due.length === 0 || run.left <= 0) return { due: due.length, sent: 0, failed: 0, unsure: 0 };
  return { due: due.length, ...await claimAndSend(db, due, reviewKind(db), run) };
};

/**
 * One hourly run: reminders first, then review requests, at most `cap` emails together.
 * Does nothing when email is not configured or when the owner has switched a kind off.
 */
export const runReminders = async (db, { now = Date.now(), send = sendEmail, cap = MAX_EMAILS_PER_RUN, configured = Boolean(process.env.BREVO_API_KEY) } = {}) => {
  if (!configured) return { skipped: 'email-not-configured' };
  const switches = reminderSwitches(await readSetting(db, 'storeSettings'));
  const run = newRun({ now, send, cap });
  const result = { abandoned: null, reviews: null };
  // One kind failing (a bad document, a database hiccup) must not keep the other from running
  const attempt = async (name, work) => {
    try {
      return await work();
    } catch (error) {
      console.error(`Scheduled emails (${name}) failed: ${error?.message || error}`);
      return { error: String(error?.message || error) };
    }
  };
  if (switches.abandonedReminders) result.abandoned = await attempt('abandoned checkout', () => sendAbandonedReminders(db, { now, run }));
  if (switches.reviewRequests && !run.stopped) result.reviews = await attempt('review request', () => sendReviewRequests(db, { now, run }));
  return { ...result, emails: Math.max(0, Math.floor(cap)) - run.left };
};
