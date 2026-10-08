import React, { useMemo } from 'react';
import { AnalyticsDay, OrderDay, PeriodTotals, dayLabel, dayRange, monthEnd, monthLabel, monthStart, num, rupees, shiftDay, totalsFor, weekStart } from './adminStats';

interface MetricsDashboardProps {
  /** Today's India-time day (YYYY-MM-DD). */
  today: string;
  analytics: Map<string, AnalyticsDay>;
  orders: Map<string, OrderDay>;
  ordersLoaded: boolean;
  visitsLoaded: boolean;
}

interface Period {
  id: 'today' | 'week' | 'month';
  title: string;
  dates: string;
  current: PeriodTotals;
  previous: PeriodTotals;
  /** How the earlier period is named after "more than" / "less than". */
  than: string;
}

export const percent = (ratio: number) => `${(ratio * 100).toFixed(ratio * 100 >= 10 ? 1 : 2)}%`;

type Change = { text: string; up: boolean } | null;
/** "12 more than yesterday" / "₹2,300 less than last week": plain words, gold when up. */
const change = (now: number, before: number, than: string, show: (value: number) => string): Change => {
  const gap = Math.round(now) - Math.round(before);
  if (gap === 0) return { text: `Same as ${than}`, up: false };
  return { text: `${show(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than ${than}`, up: gap > 0 };
};

const fullyCounted = (t: PeriodTotals) => t.visits !== null && t.visitDays === t.days;

/** Today, this week (Monday to Sunday) and this month, each against the same stretch of the one before. */
export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ today, analytics, orders, ordersLoaded, visitsLoaded }) => {
  const periods: Period[] = useMemo(() => {
    const totals = (from: string, to: string) => totalsFor(dayRange(from, to), analytics, orders);
    const yesterday = shiftDay(today, -1);

    const monday = weekStart(today);
    const weekDays = dayRange(monday, today).length;
    const lastMonday = shiftDay(monday, -7);

    const first = monthStart(today);
    const monthDays = dayRange(first, today).length;
    const lastFirst = monthStart(shiftDay(first, -1));
    const lastMonthTo = [shiftDay(lastFirst, monthDays - 1), monthEnd(lastFirst)].sort()[0];

    return [
      { id: 'today', title: 'Today', dates: dayLabel(today), current: totals(today, today), previous: totals(yesterday, yesterday), than: 'yesterday' },
      {
        id: 'week', title: 'This week', dates: weekDays === 1 ? `${dayLabel(monday)} (the week starts Monday)` : `${dayLabel(monday)} to ${dayLabel(today)}`,
        current: totals(monday, today), previous: totals(lastMonday, shiftDay(lastMonday, weekDays - 1)), than: weekDays === 7 ? 'last week' : 'last week at this point',
      },
      {
        id: 'month', title: 'This month', dates: `${monthLabel(today)}, day 1 to ${Number(today.slice(8))}`,
        current: totals(first, today), previous: totals(lastFirst, lastMonthTo), than: 'last month at this point',
      },
    ];
  }, [today, analytics, orders]);

  return (
    <div id="admin-key-numbers" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {periods.map((p) => {
        const { current: c, previous: b } = p;
        const wait = (ready: boolean, value: string) => (ready ? value : '…');

        const visits: { value: string; note: Change | string } = !visitsLoaded
          ? { value: '…', note: 'Loading…' }
          : c.visits === null
            ? { value: 'No data', note: p.id === 'today' ? 'Not counted yet today' : 'No visits were counted' }
            : {
              value: num(c.visits),
              note: c.visitDays < c.days ? `Counted on ${c.visitDays} of ${c.days} days`
                : !fullyCounted(b) ? `No full count for ${p.than.replace(' at this point', '')}`
                : change(c.visits, b.visits as number, p.than, num),
            };

        const average: { value: string; note: Change | string } = !ordersLoaded
          ? { value: '…', note: 'Loading…' }
          : c.averageOrder === null
            ? { value: 'No data', note: 'No paid order yet' }
            : { value: rupees(c.averageOrder), note: b.averageOrder === null ? `No paid order ${p.than.replace(' at this point', '')}` : change(c.averageOrder, b.averageOrder, p.than, rupees) };

        const conversion: { value: string; note: Change | string } = !ordersLoaded || !visitsLoaded
          ? { value: '…', note: 'Loading…' }
          : c.conversion === null
            ? { value: 'No data', note: c.visits === null ? 'Needs a visitor count' : 'No visitors yet' }
            : {
              value: percent(c.conversion),
              note: b.conversion === null || !fullyCounted(c) || !fullyCounted(b)
                ? `${num(c.paid)} ${c.paid === 1 ? 'order' : 'orders'} from ${num(c.visits as number)} visits`
                : Math.abs(c.conversion - b.conversion) < 0.00005
                  ? { text: `Same as ${p.than}`, up: false }
                  : { text: `${c.conversion > b.conversion ? 'Higher' : 'Lower'} than ${p.than} (${percent(b.conversion)})`, up: c.conversion > b.conversion },
            };

        const tiles: Array<{ label: string; value: string; note: Change | string; wide?: boolean; hint?: string }> = [
          { label: 'Visitors', ...visits },
          { label: 'Orders', value: wait(ordersLoaded, num(c.paid)), note: ordersLoaded ? change(c.paid, b.paid, p.than, num) : 'Loading…', hint: ordersLoaded && c.cod > 0 ? `${num(c.cod)} cash on delivery` : undefined },
          { label: 'Sales', value: wait(ordersLoaded, rupees(c.sales)), note: ordersLoaded ? change(c.sales, b.sales, p.than, rupees) : 'Loading…', wide: true },
          { label: 'Average order', ...average },
          { label: 'Conversion', ...conversion, hint: 'Orders out of every 100 visits' },
        ];

        return (
          <section key={p.id} aria-label={p.title} className={`sag-glass ${p.id === 'today' ? 'sag-glass-strong' : ''} min-w-0 p-4 sm:p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h3 className="text-[17px] leading-6 font-semibold text-ink">{p.title}</h3>
              <p className="text-xs leading-4 text-ink-muted">{p.dates}</p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
              {tiles.map((tile) => {
                const noData = tile.value === 'No data';
                const note = typeof tile.note === 'string' ? { text: tile.note, up: false } : tile.note;
                return (
                  <div key={tile.label} className={`min-w-0 ${tile.wide ? 'col-span-2 py-3 border-y border-line rounded-none' : ''}`}>
                    <dt className="text-xs leading-4 text-ink-muted">{tile.label}</dt>
                    <dd className={`mt-1 sag-num truncate ${noData ? 'text-base leading-8 text-ink-muted' : tile.wide ? 'text-[28px] leading-9 font-semibold text-ink' : 'text-2xl leading-8 font-semibold text-ink'}`}>{tile.value}</dd>
                    {note && <dd className={`mt-0.5 text-xs leading-4 ${note.up ? 'text-sale font-medium' : 'text-ink-muted'}`}>{note.up ? '▲ ' : ''}{note.text}</dd>}
                    {tile.hint && <dd className="text-xs leading-4 text-ink-muted">{tile.hint}</dd>}
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
};
