import React from 'react';
import { useAdmin } from '../../context/AdminContext';
import { Activity, Percent, IndianRupee, ShoppingCart, Users, Repeat, CalendarDays } from 'lucide-react';
import { VisitorAnalytics } from '../../utils/visitorTracker';

interface MetricsDashboardProps {
  visitorStats: VisitorAnalytics;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ visitorStats }) => {
  const { orders = [] } = useAdmin();

  // Only orders whose payment the server verified count as sales.
  const paidOrders = orders.filter((o) => o.paymentStatus === 'Paid' && o.status !== 'Cancelled' && o.status !== 'Refunded');
  const totalRevenue = paidOrders.reduce((sum, ord) => sum + ord.finalTotal, 0);
  const totalOrders = paidOrders.length;
  const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = paidOrders.filter((o) => String(o.date).startsWith(todayStr)).length;
  const conversionRate = visitorStats.todayUniqueVisitors > 0
    ? ((todayOrders / visitorStats.todayUniqueVisitors) * 100).toFixed(1)
    : '0.0';

  const metrics = [
    { title: 'Live Traffic', value: visitorStats.liveActiveCount, icon: Activity, note: 'Active in the last 3 minutes', live: true },
    { title: 'Conversion %', value: `${conversionRate}%`, icon: Percent, note: `${todayOrders} paid today`, live: false },
    { title: 'Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: IndianRupee, note: `${totalOrders} paid orders`, live: false },
    { title: 'Avg Order Value', value: `₹${aov.toLocaleString('en-IN')}`, icon: ShoppingCart, note: 'Paid, not cancelled', live: false },
  ];

  const n = (v?: number) => (v === undefined ? '…' : v.toLocaleString('en-IN'));
  const visitorCards = [
    { title: 'Lifetime visits', value: n(visitorStats.lifetimeVisits), note: 'Every visit, repeat visits included · never resets', icon: Repeat },
    { title: 'Lifetime visitors', value: n(visitorStats.lifetimeUniqueVisitors), note: 'Different devices ever seen', icon: Users },
    { title: 'Visits today', value: n(visitorStats.todayVisits), note: `${visitorStats.todayUniqueVisitors.toLocaleString('en-IN')} visitors · ${(visitorStats.returningToday || 0).toLocaleString('en-IN')} came back`, icon: CalendarDays },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {metrics.map((metric) => (
          <div key={metric.title} className="bg-white p-4 sm:p-5 rounded-2xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)]">
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/55 leading-tight">{metric.title}</span>
              <span className="w-9 h-9 shrink-0 rounded-full bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center relative">
                <metric.icon className="w-4 h-4" />
                {metric.live && Number(metric.value) > 0 && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-600 ring-2 ring-white" />}
              </span>
            </div>
            <p className="text-2xl sm:text-[28px] font-serif font-semibold text-[#2A1A26] leading-none tabular-nums truncate">{metric.value}</p>
            <p className="text-[12px] text-[#2A1A26]/55 mt-2 truncate">{metric.note}</p>
          </div>
        ))}
      </div>

      <div id="admin-visitor-totals" className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {visitorCards.map((card) => (
          <div key={card.title} className="bg-white p-4 sm:p-5 rounded-2xl border border-[#4B1D3F]/10 flex items-center gap-4">
            <span className="w-11 h-11 shrink-0 rounded-2xl bg-[#FBF7F3] border border-[#C5A46D]/40 text-[#9C7A45] flex items-center justify-center">
              <card.icon className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2A1A26]/55">{card.title}</p>
              <p className="text-xl font-serif font-semibold text-[#2A1A26] tabular-nums leading-tight">{card.value}</p>
              <p className="text-[12px] text-[#2A1A26]/55 leading-snug">{card.note}</p>
            </div>
          </div>
        ))}
      </div>
      {visitorStats.countingSince && (
        <p className="text-[12px] text-[#2A1A26]/50 leading-relaxed px-1">Every visit is counted since {new Date(visitorStats.countingSince).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}; days before that counted one visit per visitor per day. A visit = time on the site; coming back after 30 minutes counts again.</p>
      )}
    </div>
  );
};
