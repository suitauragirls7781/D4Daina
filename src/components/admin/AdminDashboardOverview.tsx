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

  const card = 'bg-white rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)]';
  const sectionTitle = 'font-serif text-2xl font-semibold text-[#4B1D3F] leading-tight';
  const sectionNote = 'text-[13px] text-[#2A1A26]/55 mt-0.5';
  const linkBtn = 'h-9 px-3.5 rounded-full text-[13px] font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] flex items-center gap-1 cursor-pointer transition-colors shrink-0';
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  const salesTiles = [
    { label: 'Revenue (paid)', value: `₹${Math.round(totalRevenue).toLocaleString('en-IN')}`, note: `Today ₹${Math.round(todayRevenue).toLocaleString('en-IN')} · ${totalOrders} orders`, icon: IndianRupee },
    { label: 'Average order value', value: `₹${totalOrders > 0 ? Math.round(totalRevenue / totalOrders).toLocaleString('en-IN') : 0}`, note: 'Paid, not cancelled', icon: TrendingUp },
    { label: 'To pack & ship', value: String(pendingOrders), note: 'Processing or packed', icon: Truck, highlight: ordersLoaded && pendingOrders > 0 },
    { label: 'Returns & cancellations', value: String(returnRequests + cancelRequests), note: cancelRequests > 0 ? `${cancelRequests} cancellation ${cancelRequests === 1 ? 'request' : 'requests'} waiting` : 'Waiting or in progress', icon: Users, highlight: ordersLoaded && cancelRequests > 0 },
  ];

  return (
    <div id="admin-dashboard-overview" className="space-y-6 sm:space-y-8">

      {/* Welcome Banner */}
      <div className="bg-[#4B1D3F] rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden">
        <div className="absolute inset-y-0 right-0 w-1/2 hidden md:block pointer-events-none opacity-[0.08]" aria-hidden="true">
          <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full border-[28px] border-white" />
          <div className="absolute right-24 bottom-[-6rem] w-56 h-56 rounded-full border-[18px] border-white" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C5A46D]">
              <Sparkles className="w-3.5 h-3.5" />
              Executive Store Overview
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
              {greeting}, welcome back
            </h2>
            <p className="text-sm text-white/75 max-w-xl leading-relaxed">
              Live metrics across product inventory, prepaid order fulfillment, customers, and revenues.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openAdminProductNew}
              className="h-11 px-5 bg-white hover:bg-[#F3EEF8] text-[#4B1D3F] rounded-full text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
            <button
              onClick={() => openAdminTab('orders')}
              className="h-11 px-5 bg-transparent hover:bg-white/10 border border-white/35 text-white rounded-full text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" /> View Orders
            </button>
          </div>
        </div>
      </div>

      {/* Key Metric Cards */}
      <MetricsDashboard visitorStats={visitorStats} />

      {/* Sales Overview Section */}
      <section className={`${card} p-5 sm:p-6 space-y-5`}>
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 shrink-0 rounded-full bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </span>
          <div>
            <h3 className={sectionTitle}>Sales &amp; Financial Overview</h3>
            <p className={sectionNote}>From orders with verified payments only (unpaid checkout attempts are excluded)</p>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {salesTiles.map((tile) => (
            <div key={tile.label} className={`p-4 rounded-2xl border ${tile.highlight ? 'bg-[#F7E4EA]/60 border-[#8A2E55]/15' : 'bg-[#FBF7F3] border-[#4B1D3F]/[0.08]'}`}>
              <div className="flex items-start gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#2A1A26]/55">
                <tile.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="leading-tight">{tile.label}</span>
              </div>
              <p className={`text-2xl font-serif font-semibold mt-2 tabular-nums leading-none ${tile.highlight ? 'text-[#8A2E55]' : 'text-[#2A1A26]'}`}>{ordersLoaded ? tile.value : '…'}</p>
              <p className="text-[12px] text-[#2A1A26]/55 mt-2 leading-snug">{ordersLoaded ? tile.note : 'Loading orders…'}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Grid: Recent Orders & Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Recent Orders (7 cols) */}
        <section className={`lg:col-span-7 ${card} overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 p-5 sm:p-6 pb-4">
            <div className="min-w-0">
              <h3 className={sectionTitle}>Recent Orders</h3>
              <p className={sectionNote}>Live order stream with real-time status management</p>
            </div>
            <button onClick={() => openAdminTab('orders')} className={linkBtn}>
              <span>View All</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {paidOrders.length === 0 ? (
            <div className="mx-5 sm:mx-6 mb-6 py-10 rounded-2xl bg-[#FBF7F3] border border-dashed border-[#4B1D3F]/15 text-center">
              <span className="mx-auto w-12 h-12 rounded-full bg-white border border-[#4B1D3F]/10 text-[#4B1D3F] flex items-center justify-center mb-3"><ShoppingBag className="w-5 h-5" /></span>
              <p className="text-sm font-semibold text-[#2A1A26]">No paid orders yet.</p>
              <p className="text-[13px] text-[#2A1A26]/55 mt-1">Paid orders will appear here the moment they arrive.</p>
            </div>
          ) : (
            <>
              {/* Phone: cards */}
              <ul className="sm:hidden divide-y divide-[#4B1D3F]/[0.08] border-t border-[#4B1D3F]/[0.08]">
                {paidOrders.slice(0, 5).map((order) => (
                  <li key={order.orderNumber}>
                    <button onClick={() => openAdminOrderDetails(order.orderNumber)} className="w-full text-left px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-[#FBF7F3] cursor-pointer">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[#2A1A26] truncate">{order.customerName}</span>
                        <span className="block text-[12px] text-[#2A1A26]/55 font-mono truncate">{order.orderNumber}{order.deliveryAddress?.city ? ` · ${order.deliveryAddress.city}` : ''}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-sm font-semibold text-[#2A1A26] tabular-nums">₹{order.finalTotal.toLocaleString('en-IN')}</span>
                        <OrderStatusBadge status={order.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {/* Tablet / desktop: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-[13px] border-collapse">
                  <thead>
                    <tr className="bg-[#FBF7F3] border-y border-[#4B1D3F]/[0.08] text-[11px] text-[#2A1A26]/55 font-semibold uppercase tracking-[0.12em]">
                      <th className="py-3 pl-6 pr-3 font-semibold">Order #</th>
                      <th className="py-3 px-3 font-semibold">Customer</th>
                      <th className="py-3 px-3 font-semibold">Amount</th>
                      <th className="py-3 px-3 font-semibold">Status</th>
                      <th className="py-3 pl-3 pr-6 text-right font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#4B1D3F]/[0.06]">
                    {paidOrders.slice(0, 5).map((order) => (
                      <tr key={order.orderNumber} className="hover:bg-[#FBF7F3] transition-colors">
                        <td className="py-3.5 pl-6 pr-3 font-mono font-semibold text-[#4B1D3F] whitespace-nowrap">
                          <button
                            onClick={() => openAdminOrderDetails(order.orderNumber)}
                            className="hover:underline underline-offset-2 cursor-pointer text-left"
                          >
                            {order.orderNumber}
                          </button>
                        </td>
                        <td className="py-3.5 px-3">
                          <p className="font-semibold text-[#2A1A26]">{order.customerName}</p>
                          <p className="text-[12px] text-[#2A1A26]/55">{order.deliveryAddress?.city}</p>
                        </td>
                        <td className="py-3.5 px-3 font-semibold text-[#2A1A26] tabular-nums">
                          ₹{order.finalTotal.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5 px-3">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="py-3.5 pl-3 pr-6 text-right">
                          <button
                            onClick={() => openAdminOrderDetails(order.orderNumber)}
                            className="h-8 px-3.5 bg-white hover:bg-[#F3EEF8] text-[#4B1D3F] border border-[#4B1D3F]/20 rounded-full text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
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

        {/* Top Products (5 cols) */}
        <section className={`lg:col-span-5 ${card} p-5 sm:p-6 space-y-3`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className={sectionTitle}>Top Products</h3>
              <p className={sectionNote}>Units sold in paid orders</p>
            </div>
            <button onClick={() => openAdminTab('products')} className={linkBtn}>
              <span>Catalog</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="divide-y divide-[#4B1D3F]/[0.08]">
            {topProducts.length === 0 && (
              <div className="py-8 text-center">
                <span className="mx-auto w-12 h-12 rounded-full bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center mb-3"><Star className="w-5 h-5" /></span>
                <p className="text-[13px] text-[#2A1A26]/60">Best sellers appear here after the first paid orders.</p>
              </div>
            )}
            {topProducts.map(({ product: prod, units }, idx) => (
              <div key={prod.id} className="py-3 flex items-center justify-between gap-3 group">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[12px] font-semibold ${idx === 0 ? 'bg-[#4B1D3F] text-white' : 'bg-[#F3EEF8] text-[#4B1D3F]'}`}>
                    {idx + 1}
                  </span>
                  {prod.images[0] && prod.images[0].trim() !== "" && (
                    <img
                      src={prod.images[0]}
                      alt={prod.name}
                      className="w-10 h-[50px] object-cover object-top rounded-xl border border-[#4B1D3F]/10 bg-[#FBF7F3]"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#2A1A26] truncate">
                      {prod.name}
                    </p>
                    <p className="text-[12px] text-[#2A1A26]/55 truncate">
                      {prod.category} • <span className="text-[#4B1D3F] font-semibold">₹{prod.price.toLocaleString('en-IN')}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[12px] font-semibold text-[#4B1D3F] bg-[#F3EEF8] px-2.5 py-1 rounded-full tabular-nums">{units} sold</span>
                  <button
                    onClick={() => openAdminProductEdit(prod.id)}
                    className="w-8 h-8 flex items-center justify-center hover:bg-[#F3EEF8] text-[#4B1D3F]/60 hover:text-[#4B1D3F] rounded-full transition-colors cursor-pointer"
                    title="Edit Product"
                    aria-label={`Edit ${prod.name}`}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      <AdminInsights />

      {/* Low Stock Products Warning Section */}
      <section className={`${card} p-5 sm:p-6 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 shrink-0 rounded-full bg-[#F7E4EA] text-[#8A2E55] flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <h3 className={sectionTitle}>
                Low Stock Products <span className="text-[#2A1A26]/40 font-sans text-base align-middle">({lowStockProducts.length})</span>
              </h3>
              <p className={sectionNote}>Sold out or at / below the low-stock level ({lowStockThreshold} pieces unless set on the product)</p>
            </div>
          </div>
          <button onClick={() => openAdminTab('products')} className={`${linkBtn} self-start sm:self-auto border border-[#4B1D3F]/20`}>
            <span>Manage Inventory</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {lowStockProducts.length === 0 ? (
          <div className="px-4 py-3.5 bg-emerald-50 rounded-2xl text-emerald-800 text-[13px] flex items-center gap-2.5 border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>All catalog items have healthy inventory levels above threshold.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStockProducts.map((prod) => (
              <div key={prod.id} className="p-3 bg-[#FBF7F3] rounded-2xl border border-[#4B1D3F]/[0.08] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {prod.images[0] && prod.images[0].trim() !== "" && (
                    <img
                      src={prod.images[0]}
                      alt={prod.name}
                      className="w-10 h-[50px] object-cover object-top rounded-xl border border-[#4B1D3F]/10"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#2A1A26] truncate">{prod.name}</p>
                    <p className="text-[12px] text-[#2A1A26]/55 truncate">{prod.category} • SKU: {prod.sku || prod.id}</p>
                  </div>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${prod.inStock && Number(prod.stockQuantity ?? 0) > 0 ? 'bg-[#F7E4EA] text-[#8A2E55]' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    {prod.inStock && Number(prod.stockQuantity ?? 0) > 0 ? `${prod.stockQuantity} left` : 'Out of stock'}
                  </span>
                  <button
                    onClick={() => openAdminProductEdit(prod.id)}
                    className="text-[12px] text-[#4B1D3F] font-semibold hover:underline underline-offset-2 cursor-pointer"
                  >
                    Restock
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
};
