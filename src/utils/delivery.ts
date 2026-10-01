/**
 * Delivery estimate from the OWNER's configured processing and delivery days (Admin → Settings → Checkout).
 * Sundays are skipped and days are counted in India time. Returns null when no delivery days are set, so
 * nothing is ever shown that the owner has not configured. Same rule as estimateDelivery in api/_lib/orders.js.
 * Always label the result "Estimated delivery".
 */
export interface DeliverySettings {
  processingDays?: number;
  deliveryMinDays?: number;
  deliveryMaxDays?: number;
}

export interface DeliveryEstimate {
  min: Date;
  max: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** India Standard Time is UTC+5:30 all year. */
const IST_OFFSET_MS = 330 * 60 * 1000;

const whole = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

const addWorkingDays = (istDay: Date, days: number) => {
  const date = new Date(istDay.getTime());
  let left = days;
  while (left > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0) left -= 1;
  }
  return date;
};

export const estimateDelivery = (settings: DeliverySettings | null | undefined, from: Date = new Date()): DeliveryEstimate | null => {
  let minDays = whole(settings?.deliveryMinDays);
  let maxDays = whole(settings?.deliveryMaxDays);
  if (!minDays && !maxDays) return null;
  if (!maxDays) maxDays = minDays;
  if (!minDays || minDays > maxDays) minDays = maxDays;
  const processing = whole(settings?.processingDays);
  if (!Number.isFinite(from.getTime())) return null;
  const shifted = new Date(from.getTime() + IST_OFFSET_MS);
  const istDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  const toNoonIst = (day: Date) => new Date(day.getTime() + DAY_MS / 2 - IST_OFFSET_MS);
  return {
    min: toNoonIst(addWorkingDays(istDay, processing + minDays)),
    max: toNoonIst(addWorkingDays(istDay, processing + maxDays)),
  };
};

/** "Thu, 8 Oct" in India time ('' for a missing or invalid date). */
export const formatDeliveryDate = (value: Date | string | null | undefined): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })
    : '';
};

/** "Estimated delivery by Thu, 8 Oct" (the later end of the window), '' when not configured. */
export const deliveryEstimateText = (settings: DeliverySettings | null | undefined, from: Date = new Date()): string => {
  const estimate = estimateDelivery(settings, from);
  if (!estimate) return '';
  return `Estimated delivery by ${formatDeliveryDate(estimate.max)}`;
};
