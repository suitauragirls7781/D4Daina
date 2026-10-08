import React from 'react';
import { PeriodTotals, num, rupees } from './adminStats';

interface MetricsDashboardProps {
  /** The chosen period and the one of the same length just before it. */
  current: PeriodTotals;
  previous: PeriodTotals;
  /** How the earlier period is named in the comparison line, e.g. "yesterday" or "the 7 days before". */
  previousLabel: string;
  ordersLoaded: boolean;
  visitsLoaded: boolean;
}

/** "Up 12%" / "Down 5%" / "Same" against an earlier figure; null when the earlier figure is 0 (no honest percentage). */
const change = (now: number, before: number): string | null => {
  if (!(before > 0)) return null;
  const pct = ((now - before) / before) * 100;
  if (Math.abs(pct) < 0.5) return 'Same';
  const shown = Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)).toLocaleString('en-IN') : Math.abs(pct).toFixed(1);
  return `${pct > 0 ? 'Up' : 'Down'} ${shown}%`;
};

const percent = (ratio: number) => `${(ratio * 100).toFixed(ratio * 100 >= 10 ? 1 : 2)}%`;

/** The key numbers of the chosen period, each with its change against the period before. */
export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ current, previous, previousLabel, ordersLoaded, visitsLoaded }) => {
  const fullyCounted = (t: PeriodTotals) => t.visits !== null && t.visitDays === t.days;
  const versus = (text: string | null, before: string) => (text ? `${text} vs ${previousLabel} (${before})` : `${previousLabel[0].toUpperCase()}${previousLabel.slice(1)}: ${before}`);

  const visitsNote = () => {
    if (current.visits === null) return 'No visits were counted for this period';
    if (current.visitDays < current.days) return `Counted on ${current.visitDays} of ${current.days} days`;
    if (!fullyCounted(previous)) return `No full count for ${previousLabel}`;
    return versus(change(current.visits, previous.visits as number), num(previous.visits as number));
  };

  const conversionNote = () => {
    if (current.conversion === null) return current.visits === null ? 'Needs a visits count' : 'No visits in this period';
    if (previous.conversion === null || !fullyCounted(current) || !fullyCounted(previous)) return 'Paid orders ÷ visits';
    const points = (current.conversion - previous.conversion) * 100;
    const moved = Math.abs(points) < 0.005 ? 'Same' : `${points > 0 ? 'Up' : 'Down'} ${Math.abs(points).toFixed(2)} points`;
    return `${moved} vs ${previousLabel} (${percent(previous.conversion)})`;
  };

  const waitOrders = (value: string) => (ordersLoaded ? value : '…');
  const tiles: Array<{ label: string; value: string; note: string; noData?: boolean }> = [
    {
      label: 'Visits',
      value: !visitsLoaded ? '…' : current.visits === null ? 'No data' : num(current.visits),
      note: visitsLoaded ? visitsNote() : 'Loading visits…',
      noData: visitsLoaded && current.visits === null,
    },
    {
      label: 'Orders placed',
      value: waitOrders(num(current.paid)),
      note: ordersLoaded ? `${versus(change(current.paid, previous.paid), num(previous.paid))}${current.cod > 0 ? ` · ${current.cod} cash on delivery` : ''}` : 'Loading orders…',
    },
    {
      label: 'Sales',
      value: waitOrders(rupees(current.sales)),
      note: ordersLoaded ? versus(change(current.sales, previous.sales), rupees(previous.sales)) : 'Loading orders…',
    },
    {
      label: 'Average order value',
      value: waitOrders(current.averageOrder === null ? 'No data' : rupees(current.averageOrder)),
      note: !ordersLoaded ? 'Loading orders…'
        : current.averageOrder === null ? 'No paid order in this period'
        : previous.averageOrder === null ? `No paid order ${previousLabel}`
        : versus(change(current.averageOrder, previous.averageOrder), rupees(previous.averageOrder)),
      noData: ordersLoaded && current.averageOrder === null,
    },
    {
      label: 'Conversion',
      value: !visitsLoaded || !ordersLoaded ? '…' : current.conversion === null ? 'No data' : percent(current.conversion),
      note: visitsLoaded && ordersLoaded ? conversionNote() : 'Loading…',
      noData: visitsLoaded && ordersLoaded && current.conversion === null,
    },
  ];

  return (
    <dl id="admin-key-numbers" className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-line border border-line">
      {tiles.map((tile, i) => (
        <div key={tile.label} className={`min-w-0 bg-surface px-4 py-4 ${i === tiles.length - 1 ? 'col-span-2 lg:col-span-1' : ''}`}>
          <dt className="text-[11px] leading-4 font-medium uppercase tracking-[0.12em] text-ink-muted">{tile.label}</dt>
          <dd className={`mt-2 sag-num truncate ${tile.noData ? 'text-lg leading-8 font-normal text-ink-muted' : 'text-2xl leading-8 font-medium text-ink'}`}>{tile.value}</dd>
          <dd className="mt-1 text-xs leading-4 text-ink-muted">{tile.note}</dd>
        </div>
      ))}
    </dl>
  );
};
