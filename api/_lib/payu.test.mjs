import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkResultToken, normalizeGateways, payuAmount, payuReady, payuRequestHash, payuResponseHash, publicGateways, razorpayCreds, resultToken, sameHex } from './payu.js';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
};
const sha512 = (value) => createHash('sha512').update(value).digest('hex');

process.env.ADMIN_SESSION_SECRET = 'test-secret-for-payu';

test('request hash follows PayU order key|txnid|amount|productinfo|firstname|email|udf1..5||||||salt', () => {
  const fields = { key: 'KEY1', txnid: 'SAG-1-1', amount: '1299.00', productinfo: 'Order SAG-1', firstname: 'Asha', email: 'a@b.in', udf1: 'SAG-1' };
  assert.equal(payuRequestHash(fields, 'SALT'), sha512('KEY1|SAG-1-1|1299.00|Order SAG-1|Asha|a@b.in|SAG-1||||||||||SALT'));
});

test('response hash is the reverse sequence and accepts additionalCharges', () => {
  const f = { key: 'KEY1', txnid: 'T1', amount: '10.00', productinfo: 'P', firstname: 'A', email: 'e@x.in', udf1: 'SAG-1', status: 'success' };
  assert.equal(payuResponseHash(f, 'SALT'), sha512('SALT|success||||||||||SAG-1|e@x.in|A|P|10.00|T1|KEY1'));
  assert.equal(payuResponseHash({ ...f, additionalCharges: '5.00' }, 'SALT'), sha512('5.00|SALT|success||||||||||SAG-1|e@x.in|A|P|10.00|T1|KEY1'));
});

test('a tampered amount changes the response hash', () => {
  const f = { key: 'K', txnid: 'T', amount: '10.00', productinfo: 'P', firstname: 'A', email: 'e', udf1: 'O', status: 'success' };
  assert.equal(sameHex(payuResponseHash(f, 'S'), payuResponseHash({ ...f, amount: '1.00' }, 'S')), false);
});

test('amount is sent with two decimals', () => {
  assert.equal(payuAmount(1299), '1299.00');
  assert.equal(payuAmount(99.5), '99.50');
});

test('PayU counts as available only when switched on with key and salt', () => {
  assert.equal(payuReady(normalizeGateways({ payu: { enabled: true, merchantKey: 'K' } })), false);
  assert.equal(payuReady(normalizeGateways({ payu: { enabled: false, merchantKey: 'K', salt: 'S' } })), false);
  assert.equal(payuReady(normalizeGateways({ payu: { enabled: true, merchantKey: 'K', salt: 'S' } })), true);
  // Sandbox mode: only the admin sees PayU; shoppers never get test payments
  assert.equal(publicGateways(normalizeGateways({ payu: { enabled: true, merchantKey: 'K', salt: 'S' } })).payu, false);
  assert.equal(publicGateways(normalizeGateways({ payu: { enabled: true, merchantKey: 'K', salt: 'S' } }), { admin: true }).payu, true);
  assert.equal(publicGateways(normalizeGateways({ payu: { enabled: true, mode: 'live', merchantKey: 'K', salt: 'S' } })).payu, true);
});

test('Razorpay stays on unless switched off', () => {
  assert.equal(normalizeGateways({}).razorpay.enabled, true);
  assert.equal(normalizeGateways({ razorpay: { enabled: false } }).razorpay.enabled, false);
});

test('Razorpay keys: admin keys win, env is the fallback, test keys only for the admin', () => {
  process.env.RAZORPAY_KEY_ID = 'rzp_live_ENVKEY123';
  process.env.RAZORPAY_KEY_SECRET = 'envsecret1234567';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'envhook';
  const envOnly = razorpayCreds(normalizeGateways({}));
  assert.equal(envOnly.source, 'env');
  assert.equal(envOnly.mode, 'live');
  assert.equal(publicGateways(normalizeGateways({})).razorpay, true);
  const saved = normalizeGateways({ razorpay: { keyId: 'rzp_test_ADMIN12345', keySecret: 'adminsecret12345', webhookSecret: 'adminhook' } });
  const admin = razorpayCreds(saved);
  assert.equal(admin.source, 'admin');
  assert.equal(admin.keyId, 'rzp_test_ADMIN12345');
  assert.deepEqual(admin.webhookSecrets, ['adminhook', 'envhook']);
  assert.equal(publicGateways(saved).razorpay, false);
  assert.equal(publicGateways(saved, { admin: true }).razorpay, true);
  assert.equal(publicGateways(normalizeGateways({ razorpay: { enabled: false } })).razorpay, false);
});

test('result token opens only its own order and expires', () => {
  const token = resultToken('SAG-260930-ABCDE');
  assert.equal(checkResultToken('SAG-260930-ABCDE', token), true);
  assert.equal(checkResultToken('SAG-260930-ZZZZZ', token), false);
  assert.equal(checkResultToken('SAG-260930-ABCDE', resultToken('SAG-260930-ABCDE', Date.now() - 3 * 24 * 3600 * 1000)), false);
  assert.equal(checkResultToken('SAG-260930-ABCDE', 'garbage'), false);
});

console.log(`payu tests: ${passed}/8 passed`);
