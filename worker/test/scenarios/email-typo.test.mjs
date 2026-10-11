// A shopper types "gamil.com" for "gmail.com" at checkout as a guest, then signs in with her real address.
// New orders are saved with the corrected address; orders already saved with the mistyped one are still hers.
// Run: node --test worker/test/scenarios/email-typo.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { startHarness } from '../harness/harness.mjs';
import { lineOf, pickOutfit, placePaidOrder } from '../harness/checkout.mjs';
import { emailVariants, fixEmailTypo, sameEmail } from '../../../api/_lib/emailFix.js';

const h = await startHarness();
const outfit = pickOutfit(h.exported('products'));
await h.putSetting('storeSettings', { ...(await h.setting('storeSettings')), minOrderAmount: 0, maxOrderAmount: 0 });
await h.putSetting('comboOffer', { enabled: false, percent: 0, minItems: 2 });
await h.update('products', outfit.id, { stockQuantity: 40, inStock: true });

const RIGHT = 'riya.sharma21@gmail.com';
const WRONG = 'riya.sharma21@gamil.com';
const orders = (body, options) => h.post('/api/orders', body, options);
const numbersFor = async (email) => {
  const response = await orders({ action: 'my-orders' }, { token: await h.customerToken(email) });
  assert.equal(response.status, 200, response.text);
  return response.body.orders.map((order) => order.orderNumber);
};

test('the list of mistyped domains: corrected, compared and expanded', () => {
  assert.equal(fixEmailTypo(' Riya@GAMIL.com '), 'riya@gmail.com');
  assert.equal(fixEmailTypo('riya@gmail.con'), 'riya@gmail.com');
  assert.equal(fixEmailTypo('riya@yaho.com'), 'riya@yahoo.com');
  // Anything that is not a known slip is left alone
  assert.equal(fixEmailTypo('riya@company.in'), 'riya@company.in');
  assert.equal(fixEmailTypo('riya@email.com'), 'riya@email.com');
  assert.equal(fixEmailTypo('not-an-email'), 'not-an-email');
  assert.equal(sameEmail('riya@gamil.com', 'RIYA@gmail.com'), true);
  assert.equal(sameEmail('riya@gmail.com', 'riya2@gmail.com'), false);
  assert.equal(sameEmail('riya@gmail.com', 'riya@yahoo.com'), false);
  assert.equal(sameEmail('', ''), false);
  const variants = emailVariants('riya@gmail.com');
  assert.equal(variants[0], 'riya@gmail.com');
  assert.ok(variants.includes('riya@gamil.com') && variants.includes('riya@gmain.com') && variants.includes('riya@gemil.com'));
  assert.ok(variants.length <= 30 && variants.every((value) => value.startsWith('riya@')));
  assert.deepEqual(emailVariants('riya@company.in'), ['riya@company.in']);
});

test('a guest order typed with gamil.com is saved with gmail.com and is in her account', async () => {
  const orderNumber = await placePaidOrder(h, { email: WRONG, items: [lineOf(outfit, 1)] });
  const saved = await h.doc('orders', orderNumber);
  assert.equal(saved.customerEmail, RIGHT);
  assert.equal(saved.deliveryAddress.email, RIGHT);
  assert.ok((await numbersFor(RIGHT)).includes(orderNumber));
  // The receipt went to the address that exists
  assert.ok(h.mailTo(RIGHT).length > 0, 'a mail was sent to the corrected address');
  assert.equal(h.mailTo(WRONG).length, 0);
});

test('an order already saved with the mistyped address still belongs to her, and to nobody else', async () => {
  const orderNumber = await placePaidOrder(h, { email: RIGHT, items: [lineOf(outfit, 1)], address: { mobile: '9000000042' } });
  // As it was saved before this fix: the mistyped address on the order
  await h.update('orders', orderNumber, { customerEmail: WRONG });
  assert.ok((await numbersFor(RIGHT)).includes(orderNumber), 'her account lists it');
  assert.equal((await numbersFor('riya.sharma22@gmail.com')).includes(orderNumber), false, 'another gmail account does not');
  assert.equal((await numbersFor('riya.sharma21@yahoo.com')).includes(orderNumber), false, 'the same name at another provider does not');

  const rightToken = await h.customerToken(RIGHT);
  // Signed in, the Track page gives her the owner's view (it has the full address)
  const own = await orders({ action: 'track', orderNumber, contact: '' }, { token: rightToken });
  assert.equal(own.status, 200, own.text);
  assert.ok(own.body.order.deliveryAddress?.houseFlat, 'the owner sees the full address');
  // As a guest, the number plus either spelling of the address finds it
  for (const contact of [RIGHT, WRONG]) {
    const guest = await orders({ action: 'track', orderNumber, contact });
    assert.equal(guest.status, 200, `${contact}: ${guest.text}`);
  }
  const stranger = await orders({ action: 'track', orderNumber, contact: 'someone.else@gmail.com' });
  assert.equal(stranger.status, 404);
  const strangerToken = await orders({ action: 'track', orderNumber, contact: '' }, { token: await h.customerToken('someone.else@gmail.com') });
  assert.equal(strangerToken.status, 404);
});
