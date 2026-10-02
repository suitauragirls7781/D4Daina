// Browser preview of the online payment discount (src/utils/prepaid.ts). The numbers here are the same
// cases as the server tests in api/_lib/orders.test.mjs, so the bag and the server agree.
// Run: node --test src/utils/__tests__/prepaid.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const { prepaidDiscountFor, prepaidPercentApplies, prepaidPercentText, prepaidRulesFrom } = await import('../prepaid.ts');

const line = (price, quantity = 1) => ({ price, quantity });

test('rules: missing or junk settings mean off; the percent is a whole number capped at 50', () => {
  assert.deepEqual(prepaidRulesFrom(undefined), { prepaidDiscount: 0, prepaidPercent: 0, prepaidMinPrice: 0 });
  assert.deepEqual(prepaidRulesFrom({ prepaidDiscount: 100 }), { prepaidDiscount: 100, prepaidPercent: 0, prepaidMinPrice: 0 });
  assert.deepEqual(prepaidRulesFrom({ prepaidDiscount: -5, prepaidPercent: 95.5, prepaidMinPrice: '700' }), { prepaidDiscount: 0, prepaidPercent: 50, prepaidMinPrice: 700 });
  assert.deepEqual(prepaidRulesFrom({ prepaidPercent: 'abc', prepaidMinPrice: -1 }), { prepaidDiscount: 0, prepaidPercent: 0, prepaidMinPrice: 0 });
});

test('the minimum price is strict', () => {
  const rules = prepaidRulesFrom({ prepaidPercent: 10, prepaidMinPrice: 700 });
  assert.equal(prepaidPercentApplies(rules, 700), false);
  assert.equal(prepaidPercentApplies(rules, 701), true);
  assert.equal(prepaidPercentApplies(prepaidRulesFrom({ prepaidMinPrice: 700 }), 5000), false, 'percent off = never');
  assert.equal(prepaidDiscountFor(rules, [line(700)], 700), 0);
  assert.equal(prepaidDiscountFor(rules, [line(701)], 701), 70);
  assert.equal(prepaidDiscountFor(rules, [line(500, 2)], 1000), 0);
});

test('same amounts as the server: percent only, mixed bag, coupon, combo, flat + percent, cap, old behaviour', () => {
  const percent = prepaidRulesFrom({ prepaidPercent: 10, prepaidMinPrice: 700 });
  assert.equal(prepaidDiscountFor(percent, [line(1500)], 1500), 150);
  assert.equal(prepaidDiscountFor(percent, [line(1500, 2)], 3000), 300);
  assert.equal(prepaidDiscountFor(percent, [line(1500), line(500), line(700)], 2700), 150);
  // 10% coupon: whole bag eligible, then a mixed bag
  assert.equal(prepaidDiscountFor(percent, [line(1500)], 1350), 135);
  assert.equal(prepaidDiscountFor(percent, [line(1500), line(500)], 1800), 135);
  // 20% combo on the mixed bag
  assert.equal(prepaidDiscountFor(percent, [line(1500), line(500)], 1600), 120);
  const both = prepaidRulesFrom({ prepaidDiscount: 100, prepaidPercent: 10, prepaidMinPrice: 700 });
  assert.equal(prepaidDiscountFor(both, [line(1500)], 1500), 250);
  assert.equal(prepaidDiscountFor(both, [line(500)], 500), 100);
  assert.equal(prepaidDiscountFor(prepaidRulesFrom({ prepaidDiscount: 100, prepaidPercent: 50 }), [line(50)], 50), 49);
  const flat = prepaidRulesFrom({ prepaidDiscount: 100 });
  assert.equal(prepaidDiscountFor(flat, [line(1500), line(500)], 1800), 100);
  assert.equal(prepaidDiscountFor(flat, [], 0), 0);
  assert.equal(prepaidDiscountFor(prepaidRulesFrom({}), [line(1500)], 1500), 0);
});

test('offer wording follows the settings', () => {
  assert.equal(prepaidPercentText(prepaidRulesFrom({ prepaidPercent: 10, prepaidMinPrice: 700 })), '10% off on products above ₹700 with online payment');
  assert.equal(prepaidPercentText(prepaidRulesFrom({ prepaidPercent: 15, prepaidMinPrice: 1500 })), '15% off on products above ₹1,500 with online payment');
  assert.equal(prepaidPercentText(prepaidRulesFrom({ prepaidPercent: 10 })), '10% off with online payment');
  assert.equal(prepaidPercentText(prepaidRulesFrom({ prepaidDiscount: 100, prepaidMinPrice: 700 })), '');
});
