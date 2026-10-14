import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { Order } from '../../types';

/**
 * The numbers behind Admin → Dashboard and Admin → Reports. Everything is read from the store's own data:
 * the `daily_analytics` documents the server writes (api/track.js) and the live orders list. Nothing is
 * estimated; a day without a counted figure is `null` ("No data"), never 0.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86400000;

/** The India (Asia/Kolkata) calendar day of a moment, as YYYY-MM-DD ('' when the value is not a date). */
export const istDay = (value: string | number | Date | undefined | null): string => {
  if (value === undefined || value === null || value === '') return '';
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time + IST_OFFSET_MS).toISOString().slice(0, 10) : '';
};
export const istToday = () => istDay(Date.now());
export const shiftDay = (day: string, by: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + by * DAY_MS).toISOString().slice(0, 10);
/** Every day from `from` to `to`, both included, oldest first. */
export const dayRange = (from: string, to: string) => {
  const out: string[] = [];
  for (let day = from; day <= to && out.length < 5000; day = shiftDay(day, 1)) out.push(day);
  return out;
};
export const dayLabel = (day: string, withYear = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

/** The Monday of the day's week (weeks run Monday to Sunday, India time). */
export const weekStart = (day: string) => shiftDay(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
/** The first day of the day's calendar month. */
export const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
/** The last day of the day's calendar month. */
export const monthEnd = (day: string) => new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const monthLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });

export const num = (value: number) => Math.round(value).toLocaleString('en-IN');
export const rupees = (value: number) => `₹${num(value)}`;

/** One day of the server's visitor counts. A field the document does not hold is null. */
export interface AnalyticsDay {
  date: string;
  visits: number | null;
  visitors: number | null;
  cartAdds: number | null;
  checkouts: number | null;
  /** Product pages opened (once per visitor per product per day). */
  productViews: number | null;
  searches: number | null;
  /** Of the day's visitors, the ones who came from Instagram (the in-app browser, an Instagram link or a Meta ad) and the rest. */
  instagramVisitors: number | null;
  otherVisitors: number | null;
  /** Visitors whose device had been on the store on an earlier day. */
  returningVisitors: number | null;
  wishlistAdds: number | null;
}

const count = (value: unknown): number | null => (value === undefined || value === null || !Number.isFinite(Number(value)) ? null : Number(value));

const toAnalyticsDay = (id: string, data: Record<string, unknown>): AnalyticsDay | null => {
  const date = String(data.date || id || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const sessions = count(data.visits);
  const visitors = count(data.totalUniqueVisitors);
  // Days before every visit was counted hold only one count per visitor per day; that count is the visits figure then
  const visits = sessions === null && visitors === null ? null : Math.max(sessions ?? 0, visitors ?? 0);
  return {
    date, visits, visitors, cartAdds: count(data.cartAdditions), checkouts: count(data.checkoutsInitiated), productViews: count(data.productViews), searches: count(data.searches),
    instagramVisitors: count(data.instagramVisitors), otherVisitors: count(data.otherVisitors), returningVisitors: count(data.returningVisitors), wishlistAdds: count(data.wishlistAdds),
  };
};

/**
 * The newest `max` daily analytics documents (all of them when `max` is not given), read once and again
 * when the admin comes back to the tab.
 */
export const useDailyAnalytics = (max?: number) => {
  const [days, setDays] = useState<Map<string, AnalyticsDay>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const base = collection(db, 'daily_analytics');
    const q = max ? query(base, orderBy('date', 'desc'), limit(max)) : query(base, orderBy('date', 'desc'));
    return getDocs(q)
      .then((snapshot) => {
        const next = new Map<string, AnalyticsDay>();
        snapshot.docs.forEach((d) => {
          const row = toAnalyticsDay(d.id, d.data() as Record<string, unknown>);
          if (row) next.set(row.date, row);
        });
        setDays(next);
        setError('');
      })
      .catch(() => setError('The visit counts could not be read right now.'))
      .finally(() => setLoaded(true));
  }, [max]);

  useEffect(() => {
    void load();
    let last = Date.now();
    const onFocus = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60000) return;
      last = Date.now();
      void load();
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [load]);

  /** The earliest day that holds a visits figure ('' when there is none). */
  const firstVisitDay = useMemo(() => {
    let first = '';
    days.forEach((d) => { if (d.visits !== null && (!first || d.date < first)) first = d.date; });
    return first;
  }, [days]);

  return { days, loaded, error, reload: load, firstVisitDay };
};

/** One India-time day of orders. */
export interface OrderDay {
  /** Orders with a verified payment (cash on delivery included: its advance was paid online). */
  paid: number;
  /** Of `paid`, the cash-on-delivery ones. */
  cod: number;
  /** Of `paid`, the ones not cancelled: these make up `sales`. */
  sold: number;
  sales: number;
  /** Of `sales`, the part from cash-on-delivery orders. */
  codSales: number;
  cancelled: number;
  refunded: number;
}
const emptyOrderDay = (): OrderDay => ({ paid: 0, cod: 0, sold: 0, sales: 0, codSales: 0, cancelled: 0, refunded: 0 });

/**
 * Orders grouped by India-time day: paid and refunded orders on the day they were paid (`paidAt`, else the
 * order's `date`), cancelled orders on the day they were placed (`date`). Sandbox test payments are left out.
 */
export const ordersByDay = (orders: Order[]) => {
  const map = new Map<string, OrderDay>();
  const at = (day: string) => {
    let row = map.get(day);
    if (!row) { row = emptyOrderDay(); map.set(day, row); }
    return row;
  };
  orders.forEach((o) => {
    if (o.testPayment) return;
    const paidDay = istDay(o.paidAt || o.date);
    if (o.paymentStatus === 'Paid' && paidDay) {
      const row = at(paidDay);
      row.paid += 1;
      if (o.payMode === 'cod') row.cod += 1;
      if (o.status !== 'Cancelled' && o.status !== 'Refunded') {
        row.sold += 1;
        row.sales += Number(o.finalTotal) || 0;
        if (o.payMode === 'cod') row.codSales += Number(o.finalTotal) || 0;
      }
    }
    if (o.status === 'Cancelled') {
      const day = istDay(o.date) || paidDay;
      if (day) at(day).cancelled += 1;
    }
    if ((o.status === 'Refunded' || o.paymentStatus === 'Refunded') && paidDay) at(paidDay).refunded += 1;
  });
  return map;
};

/** The earliest India-time day any order in the list belongs to ('' when there are none). */
export const firstOrderDay = (byDay: Map<string, OrderDay>) => {
  let first = '';
  byDay.forEach((_, day) => { if (!first || day < first) first = day; });
  return first;
};

export interface PeriodTotals extends OrderDay {
  days: number;
  /** Sum of the counted visits; null when no day in the period has a visits figure. */
  visits: number | null;
  /** How many of the period's days have a visits figure. */
  visitDays: number;
  cartAdds: number | null;
  checkouts: number | null;
  productViews: number | null;
  instagramVisitors: number | null;
  otherVisitors: number | null;
  returningVisitors: number | null;
  /** Unique visitors (one per device per day, added up over the days). */
  visitors: number | null;
  /** sales ÷ sold; null when nothing was sold. */
  averageOrder: number | null;
  /** Paid orders ÷ visits, over the days that have a visits figure; null when those visits are 0 or unknown. */
  conversion: number | null;
}

export const totalsFor = (days: string[], analytics: Map<string, AnalyticsDay>, orders: Map<string, OrderDay>): PeriodTotals => {
  const total: PeriodTotals = {
    ...emptyOrderDay(), days: days.length, visits: null, visitDays: 0, cartAdds: null, checkouts: null, productViews: null,
    instagramVisitors: null, otherVisitors: null, returningVisitors: null, visitors: null, averageOrder: null, conversion: null,
  };
  const add = (key: 'cartAdds' | 'checkouts' | 'productViews' | 'instagramVisitors' | 'otherVisitors' | 'returningVisitors' | 'visitors', value: number | null) => {
    if (value !== null) total[key] = (total[key] ?? 0) + value;
  };
  let paidOnCountedDays = 0;
  days.forEach((day) => {
    const o = orders.get(day);
    if (o) {
      total.paid += o.paid; total.cod += o.cod; total.sold += o.sold; total.sales += o.sales;
      total.codSales += o.codSales; total.cancelled += o.cancelled; total.refunded += o.refunded;
    }
    const a = analytics.get(day);
    if (!a) return;
    if (a.visits !== null) {
      total.visits = (total.visits ?? 0) + a.visits;
      total.visitDays += 1;
      paidOnCountedDays += o?.paid || 0;
    }
    add('cartAdds', a.cartAdds);
    add('checkouts', a.checkouts);
    add('productViews', a.productViews);
    add('instagramVisitors', a.instagramVisitors);
    add('otherVisitors', a.otherVisitors);
    add('returningVisitors', a.returningVisitors);
    add('visitors', a.visitors);
  });
  total.averageOrder = total.sold > 0 ? total.sales / total.sold : null;
  total.conversion = total.visits !== null && total.visits > 0 ? paidOnCountedDays / total.visits : null;
  return total;
};

/** The same number of days just before `days` (for "compared with the period before"). */
export const previousDays = (days: string[]) => (days.length ? dayRange(shiftDay(days[0], -days.length), shiftDay(days[0], -1)) : []);

/** The India-time hour (0-23) and weekday (0 = Monday) of a moment; null when it is not a date. */
export const istHourAndWeekday = (value: string | undefined | null): { hour: number; weekday: number } | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  const local = new Date(time + IST_OFFSET_MS);
  return { hour: local.getUTCHours(), weekday: (local.getUTCDay() + 6) % 7 };
};

/** Orders with a verified payment (also the ones later cancelled or refunded) paid on one of `days`, India time. Sandbox payments are left out. */
export const paidOrdersIn = (orders: Order[], days: string[]) => {
  const set = new Set(days);
  return orders.filter((o) => !o.testPayment && (o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded') && set.has(istDay(o.paidAt || o.date)));
};
/** A paid order that still counts as a sale (not cancelled, not refunded): the same rule as `ordersByDay`. */
export const isSale = (o: Order) => o.paymentStatus === 'Paid' && o.status !== 'Cancelled' && o.status !== 'Refunded';

/** A share as a percent: one decimal under 10%, none above. */
export const shareText = (ratio: number) => `${(ratio * 100).toFixed(Math.abs(ratio * 100) >= 10 ? 0 : 1)}%`;
