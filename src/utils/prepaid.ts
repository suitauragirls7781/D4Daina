// Online payment discount (Admin → Settings): a flat amount per order and / or a percentage on products
// priced above the owner's minimum. Everything here is a browser preview with the same formula as
// priceCart in api/_lib/orders.js; the server recalculates the order before payment.

export interface PrepaidRules {
  /** Flat ₹ off per order (0 = off). */
  prepaidDiscount: number;
  /** Percent off, whole number 0–50 (0 = off). */
  prepaidPercent: number;
  /** The percent applies only to products whose unit price is strictly above this (0 = every product). */
  prepaidMinPrice: number;
}

export interface PrepaidLine {
  price: number;
  quantity: number;
}

const whole = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`;

/** Reads the three prepaid fields from store settings (missing or invalid = 0). */
export const prepaidRulesFrom = (settings: any): PrepaidRules => ({
  prepaidDiscount: Math.max(0, Number(settings?.prepaidDiscount) || 0),
  prepaidPercent: Math.min(50, whole(settings?.prepaidPercent)),
  prepaidMinPrice: whole(settings?.prepaidMinPrice),
});

/** True when the percent discount applies to a product of this unit price. */
export const prepaidPercentApplies = (rules: PrepaidRules, unitPrice: number): boolean =>
  rules.prepaidPercent > 0 && (Number(unitPrice) || 0) > rules.prepaidMinPrice;

/**
 * The online payment discount for a bag. `afterCoupon` is the bag amount after the combo and coupon
 * discounts, before shipping. Products that qualify for the percent carry their share of those reductions.
 * The discount never takes the amount below ₹1.
 */
export const prepaidDiscountFor = (rules: PrepaidRules, lines: PrepaidLine[], afterCoupon: number): number => {
  const amountOf = (line: PrepaidLine) => (Number(line.price) || 0) * (Number(line.quantity) || 0);
  const subtotal = lines.reduce((sum, line) => sum + amountOf(line), 0);
  if (subtotal <= 0) return 0;
  const eligibleSubtotal = rules.prepaidPercent > 0
    ? lines.reduce((sum, line) => sum + (prepaidPercentApplies(rules, line.price) ? amountOf(line) : 0), 0)
    : 0;
  const eligibleShare = eligibleSubtotal === subtotal ? afterCoupon : Math.round((afterCoupon * eligibleSubtotal) / subtotal);
  const percentPart = Math.round((eligibleShare * rules.prepaidPercent) / 100);
  return Math.min(rules.prepaidDiscount + percentPart, Math.max(0, afterCoupon - 1));
};

/**
 * The percent offer in words, true for whatever the owner has set:
 * "10% off on products above ₹700 with online payment", "10% off with online payment", or '' when it is off.
 */
export const prepaidPercentText = (rules: PrepaidRules): string => {
  if (!(rules.prepaidPercent > 0)) return '';
  return rules.prepaidMinPrice > 0
    ? `${rules.prepaidPercent}% off on products above ${rupees(rules.prepaidMinPrice)} with online payment`
    : `${rules.prepaidPercent}% off with online payment`;
};
