import React, { useState, useEffect } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import { VisitorAnalytics, calculateStayDuration, markFirestoreQuotaExhausted, isQuotaExhausted } from '../../utils/visitorTracker';
import { adminDb as db } from '../../lib/firebase';
import { collection, doc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import {
  Package,
  ShoppingBag,
  Clock,
  Users,
  IndianRupee,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  Plus,
  Tag,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Layers,
  Truck,
  Eye,
  Edit3,
  BarChart3,
  CreditCard,
  Percent,
  Activity,
  Globe,
  Smartphone,
  Calendar,
  ListFilter,
  MousePointerClick,
  Star
} from 'lucide-react';
import { MetricsDashboard } from './MetricsDashboard';
import { isLowStock } from '../../utils/inventory';
import { AdminInsights } from './AdminInsights';
import { AdminOrderStatus } from '../../types';
import { OrderStatusBadge } from './PaymentBadge';
import { RotateCcw } from 'lucide-react';
import { tone, ui } from './kidsToysShared';

export const AdminDashboardOverview: React.FC = () => {
  const {
    products = [],
    orders = [],
    ordersLoaded,
    setAdminTab,
    updateOrderStatus,
    lowStockThreshold,
  } = useAdmin();
  const { showToast } = useShop();
  const { openAdminTab, openAdminProductNew, openAdminProductEdit, openAdminOrderDetails } = useRouter();

  const todayStr = new Date().toISOString().split('T')[0];

  // Real-time Firestore analytics collections
  const [dailyAnalyticsList, setDailyAnalyticsList] = useState<any[]>([]);
  const [visitorSessions, setVisitorSessions] = useState<any[]>([]);
  // Lifetime visitor totals kept by the server (api/track.js); they only ever go up
  const [lifetime, setLifetime] = useState<any>(null);
  useEffect(() => onSnapshot(doc(db, 'analytics_totals', 'lifetime'), (snap) => setLifetime(snap.exists() ? snap.data() : {}), () => setLifetime({})), []);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(todayStr);
  const [activeAnalyticsSubTab, setActiveAnalyticsSubTab] = useState<'daily' | 'timeline'>('daily');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    // If quota was already exhausted, skip Firestore listener setup.
    if (isQuotaExhausted()) {
      setVisitorSessions([]);
      setDailyAnalyticsList([]);
      return;
    }

    // 1. Subscribe to Daily Analytics
    let unsubDaily: () => void = () => {};
    try {
      const qDaily = query(collection(db, 'daily_analytics'), orderBy('date', 'desc'), limit(15));
      unsubDaily = onSnapshot(qDaily, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        setDailyAnalyticsList(list);
      }, (err) => {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
          markFirestoreQuotaExhausted();
        }
      });
    } catch {
      // Ignore listener setup failure
    }

    // 2. Subscribe to Visitor Sessions (Last 100 active sessions)
    let unsubSessions: () => void = () => {};
    try {
      const qSessions = query(collection(db, 'visitor_sessions'), orderBy('lastActive', 'desc'), limit(100));
      unsubSessions = onSnapshot(qSessions, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });

        setVisitorSessions(list);
      }, (err) => {
        if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota')) {
          markFirestoreQuotaExhausted();
        }
      });
    } catch {
      // Ignore listener setup failure
    }

    return () => {
      unsubDaily();
      unsubSessions();
    };
  }, [todayStr]);

  // Compute live active count (active within last 3 minutes)
  const getLiveActiveCount = () => {
    // console.log("Trace: visitorSessions length", visitorSessions?.length);
    if (!visitorSessions || visitorSessions.length === 0) return 0;
    const threeMinAgo = Date.now() - 3 * 60 * 1000;
    return visitorSessions.filter(s => {
      const lastAct = s?.lastActive ? new Date(s.lastActive).getTime() : 0;
      return lastAct >= threeMinAgo;
    }).length;
  };

  // Compile real-time VisitorAnalytics statistics from active dataset
  // Added console logging for debugging the "white screen" issue
  useEffect(() => {
    // console.log("Trace: dailyAnalyticsList", dailyAnalyticsList);
    // console.log("Trace: visitorSessions", visitorSessions);
  }, [dailyAnalyticsList, visitorSessions]);

  const todayStats = (dailyAnalyticsList || []).find(d => d.date === todayStr) || {
    totalUniqueVisitors: 0,
    instagramVisitors: 0,
    otherVisitors: 0,
    cartAdditions: 0,
    checkoutsInitiated: 0,
    purchases: 0
  };

  const cumulativeUniqueCount = Math.max((visitorSessions || []).length, todayStats.totalUniqueVisitors || 0);

  const visitorLogs = (visitorSessions || []).slice(0, 15).map(s => ({
    id: s?.id,
    firstSeen: s?.firstSeen ? new Date(s.firstSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending',
    lastActive: s?.lastActive ? new Date(s.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now',
    deviceType: s?.deviceType === 'instagram_webview' ? 'Instagram Ad View' : s?.deviceType === 'mobile' ? 'Mobile Web' : s?.deviceType === 'tablet' ? 'Tablet' : 'Desktop',
    deviceModel: s?.deviceModel || undefined,
    userAgent: s?.userAgent || undefined,
    page: s?.page || '/',
    utm_source: s?.utm_source,
    actions: s?.actions || []
  }));

  const visitorStats: VisitorAnalytics = {
    totalUniqueVisitors: cumulativeUniqueCount,
    todayUniqueVisitors: Math.max(todayStats.totalUniqueVisitors || 0, (visitorSessions || []).filter(s => s.date === todayStr).length),
    liveActiveCount: getLiveActiveCount(),
    cartAddCount: todayStats.cartAdditions || (visitorSessions || []).filter(s => s.date === todayStr && s.actions?.some((a: any) => a.type === 'add_to_cart')).length,
    checkoutCount: todayStats.checkoutsInitiated || (visitorSessions || []).filter(s => s.date === todayStr && s.actions?.some((a: any) => a.type === 'checkout_initiated')).length,
    visitorLogs: visitorLogs,
    lifetimeVisits: lifetime ? (Number(lifetime.visits) || 0) + (Number(lifetime.baselineVisits) || 0) : undefined,
    lifetimeUniqueVisitors: lifetime ? (Number(lifetime.uniqueVisitors) || 0) + (Number(lifetime.baselineUniqueVisitors) || 0) : undefined,
    todayVisits: Math.max(Number(todayStats.visits) || 0, todayStats.totalUniqueVisitors || 0),
    returningToday: Number(todayStats.returningVisitors) || 0,
    countingSince: lifetime?.countingSince,
  };

  // Filtered sessions for the grid
  const filteredSessions = (visitorSessions || []).filter(s => selectedDateFilter === 'all' || s.date === selectedDateFilter || (!s.date && selectedDateFilter === todayStr));


  // Metrics come only from orders whose payment was verified by the server.
  const paidOrders = orders
    .filter((o) => o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const revenueOrders = paidOrders.filter((o) => o.status !== 'Cancelled' && o.status !== 'Refunded' && o.paymentStatus === 'Paid');
  // Outfits only: Complete the Look accessories are counted on their own page
  const totalProducts = products.filter((p) => p.productType !== 'accessory').length;
  const totalOrders = revenueOrders.length;
  const pendingOrders = paidOrders.filter((o) => o.status === 'Processing' || o.status === 'Packed').length;
  const returnRequests = paidOrders.filter((o) => (o.returnRequest?.status ? ['requested', 'approved', 'received'].includes(o.returnRequest.status) : o.status === 'Refund Requested')).length;
  // Cancellation requests the owner has not answered yet (answered on the Returns page)
  const cancelRequests = orders.filter((o) => o.cancelRequest && !o.cancelRequest.handledAt).length;
  const totalRevenue = revenueOrders.reduce((sum, ord) => sum + ord.finalTotal, 0);
  const todayRevenue = revenueOrders.filter((o) => String(o.date).startsWith(todayStr)).reduce((sum, ord) => sum + ord.finalTotal, 0);

  const lowStockProducts = products.filter(
    (p) => p.productType !== 'accessory' && isLowStock(p, lowStockThreshold)
  );

  // Best sellers by units in paid, non-cancelled orders
  const unitsSold = new Map<string, number>();
  revenueOrders.forEach((order) => order.items.forEach((item) => {
    const id = String(item.product?.id || '');
    if (id) unitsSold.set(id, (unitsSold.get(id) || 0) + (Number(item.quantity) || 0));
  }));
  const topProducts = products
    .map((p) => ({ product: p, units: unitsSold.get(String(p.id)) || 0 }))
    .filter((row) => row.units > 0)
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  const card = ui.panel;
  const sectionTitle = ui.h2;
  const sectionNote = 'text-[13px] leading-[18px] text-ink-muted mt-0.5';
  const linkBtn = 'sag-link shrink-0 gap-0.5';
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();
  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const salesTiles: Array<{ label: string; value: string; note: string; icon: React.FC<{ className?: string }>; highlight?: boolean; open?: () => void }> = [
    { label: 'To pack & ship', value: String(pendingOrders), note: 'Processing or packed', icon: Truck, highlight: ordersLoaded && pendingOrders > 0, open: () => openAdminTab('orders') },
    { label: 'Returns & cancellations', value: String(returnRequests + cancelRequests), note: cancelRequests > 0 ? `${cancelRequests} cancellation ${cancelRequests === 1 ? 'request' : 'requests'} waiting` : 'Waiting or in progress', icon: RotateCcw, highlight: ordersLoaded && cancelRequests > 0, open: () => openAdminTab('returns') },
    { label: 'Revenue (paid)', value: `₹${Math.round(totalRevenue).toLocaleString('en-IN')}`, note: `Today ₹${Math.round(todayRevenue).toLocaleString('en-IN')} · ${totalOrders} orders`, icon: IndianRupee },
    { label: 'Average order value', value: `₹${totalOrders > 0 ? Math.round(totalRevenue / totalOrders).toLocaleString('en-IN') : 0}`, note: 'Paid, not cancelled', icon: TrendingUp },
  ];

  return (
    <div id="admin-dashboard-overview" className="space-y-5 sm:space-y-6">

      {/* Greeting and the two everyday actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-4 border-b border-line">
        <div className="min-w-0">
          <p className={ui.eyebrow}>Executive Store Overview · {todayLabel}</p>
          <h2 className={`mt-0.5 ${ui.h1}`}>{greeting}</h2>
          <p className="mt-1 text-sm leading-5 text-ink-muted max-w-xl">
            Orders to send, requests waiting for you, and how the store is doing. Sales count only orders with a verified payment.
          </p>
        </div>

        <div className="grid grid-cols-2 md:flex items-center gap-2 shrink-0">
          <button onClick={openAdminProductNew} className={ui.outline}>
            <Plus className="w-4 h-4" /> Add product
          </button>
          <button onClick={() => openAdminTab('orders')} className={ui.primary}>
            <ShoppingBag className="w-4 h-4" /> View orders
          </button>
        </div>
      </div>

      {/* What needs doing, then the money */}
      <section aria-label="Orders and sales" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {salesTiles.map((tile) => {
          const body = (
            <>
              <span className={`text-xs leading-4 font-semibold flex items-start gap-1.5 ${tile.highlight ? 'text-sale' : 'text-ink-muted'}`}>
                <tile.icon className="w-4 h-4 shrink-0" />
                <span className="min-w-0">{tile.label}</span>
              </span>
              <span className={`block mt-1.5 text-2xl leading-8 font-bold tabular-nums truncate ${tile.highlight ? 'text-sale' : 'text-ink'}`}>{ordersLoaded ? tile.value : '…'}</span>
              <span className="block text-xs leading-4 text-ink-muted">{ordersLoaded ? tile.note : 'Loading orders…'}</span>
              {tile.open && <span className="mt-1.5 inline-flex items-center gap-0.5 text-[13px] leading-[18px] font-semibold text-brand">Open <ChevronRight className="w-3.5 h-3.5" /></span>}
            </>
          );
          const shell = `min-w-0 p-3.5 sm:p-4 rounded-2xl border text-left ${tile.highlight ? 'bg-sale-tint border-sale-line' : 'bg-white border-line'}`;
          return tile.open
            ? <button key={tile.label} type="button" onClick={tile.open} className={`${shell} cursor-pointer hover:border-control transition-colors`}>{body}</button>
            : <div key={tile.label} className={shell}>{body}</div>;
        })}
      </section>

      {/* Visitors and conversion */}
      <MetricsDashboard visitorStats={visitorStats} />

      {/* Recent orders and top products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        <section className={`lg:col-span-7 ${card}`}>
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-3 pb-2">
            <div className="min-w-0">
              <h3 className={sectionTitle}>Recent orders</h3>
              <p className={sectionNote}>The five newest paid orders</p>
            </div>
            <button onClick={() => openAdminTab('orders')} className={linkBtn}>
              <span>View all</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {paidOrders.length === 0 ? (
            <div className="mx-4 sm:mx-5 mb-5 py-8 px-4 rounded-xl bg-page text-center">
              <ShoppingBag className="mx-auto w-6 h-6 text-ink-muted mb-2" aria-hidden="true" />
              <p className="text-sm font-semibold text-ink">No paid orders yet</p>
              <p className="text-[13px] leading-[18px] text-ink-muted mt-0.5">Paid orders appear here the moment they arrive.</p>
            </div>
          ) : (
            <>
              {/* Phone: rows */}
              <ul className="sm:hidden divide-y divide-line border-t border-line">
                {paidOrders.slice(0, 5).map((order) => (
                  <li key={order.orderNumber}>
                    <button onClick={() => openAdminOrderDetails(order.orderNumber)} className="w-full min-h-[60px] text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-page cursor-pointer">
                      <span className="min-w-0">
                        <span className="block text-sm leading-5 font-semibold text-ink truncate">{order.customerName}</span>
                        <span className="block text-xs leading-4 text-ink-muted font-mono truncate">{order.orderNumber}{order.deliveryAddress?.city ? ` · ${order.deliveryAddress.city}` : ''}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-sm font-bold text-ink tabular-nums">₹{order.finalTotal.toLocaleString('en-IN')}</span>
                        <OrderStatusBadge status={order.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Tablet / desktop: table */}
              <div className="hidden sm:block overflow-x-auto border-t border-line">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className={ui.thead}>
                      <th className="py-2.5 pl-5 pr-3 font-semibold">Order</th>
                      <th className="py-2.5 px-3 font-semibold">Customer</th>
                      <th className="py-2.5 px-3 font-semibold">Amount</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 pl-3 pr-5 text-right font-semibold"><span className="sr-only">Details</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {paidOrders.slice(0, 5).map((order) => (
                      <tr key={order.orderNumber} className="hover:bg-page transition-colors">
                        <td className="py-3 pl-5 pr-3 font-mono whitespace-nowrap">
                          <button
                            onClick={() => openAdminOrderDetails(order.orderNumber)}
                            className={`${ui.link} text-left`}
                          >
                            {order.orderNumber}
                          </button>
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-ink">{order.customerName}</p>
                          <p className="text-xs text-ink-muted">{order.deliveryAddress?.city}</p>
                        </td>
                        <td className="py-3 px-3 font-bold text-ink tabular-nums">
                          ₹{order.finalTotal.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="py-3 pl-3 pr-5 text-right">
                          <button
                            onClick={() => openAdminOrderDetails(order.orderNumber)}
                            className={ui.small}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className={`lg:col-span-5 ${card}`}>
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-3 pb-2">
            <div className="min-w-0">
              <h3 className={sectionTitle}>Top products</h3>
              <p className={sectionNote}>Units sold in paid orders</p>
            </div>
            <button onClick={() => openAdminTab('products')} className={linkBtn}>
              <span>All products</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="divide-y divide-line border-t border-line">
            {topProducts.length === 0 && (
              <div className="py-8 px-4 text-center">
                <Star className="mx-auto w-6 h-6 text-ink-muted mb-2" aria-hidden="true" />
                <p className="text-[13px] leading-[18px] text-ink-muted">Best sellers appear here after the first paid orders.</p>
              </div>
            )}
            {topProducts.map(({ product: prod, units }, idx) => (
              <div key={prod.id} className="pl-4 sm:pl-5 pr-2 sm:pr-3 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-5 shrink-0 text-center text-[13px] font-bold text-ink-muted tabular-nums">
                    {idx + 1}
                  </span>
                  {prod.images[0] && prod.images[0].trim() !== "" && (
                    <img
                      src={prod.images[0]}
                      alt=""
                      loading="lazy"
                      className="w-10 aspect-[4/5] shrink-0 object-cover object-top rounded-lg bg-sunken"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm leading-5 font-semibold text-ink truncate">
                      {prod.name}
                    </p>
                    <p className="text-xs leading-4 text-ink-muted truncate">
                      {prod.category} · <span className="text-ink font-semibold tabular-nums">₹{prod.price.toLocaleString('en-IN')}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <span className={`${ui.badge} ${tone.neutral} tabular-nums`}>{units} sold</span>
                  <button
                    onClick={() => openAdminProductEdit(prod.id)}
                    className="w-11 h-11 flex items-center justify-center hover:bg-sunken text-ink-muted hover:text-ink rounded-full transition-colors cursor-pointer"
                    title="Edit product"
                    aria-label={`Edit ${prod.name}`}
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      <AdminInsights />

      {/* Low stock */}
      <section className={`${ui.card} space-y-3`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={`${sectionTitle} flex items-center gap-2`}>
              <AlertTriangle className="w-[18px] h-[18px] shrink-0 text-sale" aria-hidden="true" />
              <span>Low stock <span className="text-ink-muted font-normal tabular-nums">({lowStockProducts.length})</span></span>
            </h3>
            <p className={sectionNote}>Sold out, or at or below the low-stock level ({lowStockThreshold} pieces unless set on the product)</p>
          </div>
          <button onClick={() => openAdminTab('products')} className={linkBtn}>
            <span>Products</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {lowStockProducts.length === 0 ? (
          <div className="px-3.5 py-3 bg-ok-tint rounded-xl text-ok text-sm leading-5 font-medium flex items-center gap-2.5 border border-ok-line">
            <CheckCircle2 className="w-[18px] h-[18px] shrink-0" />
            <span>Every product is above its low-stock level.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {lowStockProducts.map((prod) => {
              const left = prod.inStock && Number(prod.stockQuantity ?? 0) > 0;
              return (
                <div key={prod.id} className="pl-2.5 pr-1 py-1.5 bg-page rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {prod.images[0] && prod.images[0].trim() !== "" && (
                      <img
                        src={prod.images[0]}
                        alt=""
                        loading="lazy"
                        className="w-10 aspect-[4/5] shrink-0 object-cover object-top rounded-lg bg-sunken"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm leading-5 font-semibold text-ink truncate">{prod.name}</p>
                      <p className="text-xs leading-4 text-ink-muted truncate">{prod.category} · SKU {prod.sku || prod.id}</p>
                      <span className={`mt-1 ${ui.badge} ${left ? tone.warn : tone.danger} tabular-nums`}>
                        {left ? `${prod.stockQuantity} left` : 'Out of stock'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => openAdminProductEdit(prod.id)}
                    className="sag-link shrink-0 px-2"
                    aria-label={`Restock ${prod.name}`}
                  >
                    Restock
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
};
