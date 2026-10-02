import React, { useEffect, useRef, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import {
  LayoutDashboard,
  Package,
  PlusCircle,
  Layers,
  ShoppingBag,
  Users,
  Tag,
  LayoutTemplate,
  Image as ImageIcon,
  MessageSquare,
  Instagram,
  Settings, CreditCard, Gauge,
  LogOut,
  Store,
  Menu,
  X,
  Sparkles,
  Flame,
  Bell,
  ExternalLink,
  ShieldCheck,
  PanelLeftClose,
  PanelLeft,
  Baby,
  ToyBrick,
  Star,
  Film,
  Compass,
  Shirt
} from 'lucide-react';
import { RotateCcw, ShoppingCart } from 'lucide-react';
import { AdminTab } from '../../types';
import { returnRows, waitingCancelRows } from './AdminReturns';
import { departmentOf } from '../../utils/kids';
import { isLowStock } from '../../utils/inventory';

interface AdminLayoutProps {
  children: React.ReactNode;
}

type NavGroup = 'Overview' | 'Catalogue' | 'Sales' | 'Storefront' | 'System';
const NAV_GROUPS: NavGroup[] = ['Overview', 'Catalogue', 'Sales', 'Storefront', 'System'];

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const {
    logoutAdmin,
    adminEmail,
    orders = [],
    products = [],
    lowStockThreshold,
    categories = [],
    coupons = [],
    reviews = []
  } = useAdmin();
  const { showToast, setActivePage } = useShop();
  const { currentPath, activeAdminTab, openAdminTab, openAdminProductNew, navigate } = useRouter();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const pendingOrdersCount = orders.filter((o) => o.paymentStatus === 'Paid' && (o.status === 'Processing' || o.status === 'Packed')).length;
  const lowStockCount = products.filter((p) => isLowStock(p, lowStockThreshold)).length;
  // Return / exchange requests waiting for the admin's decision (orders are a live listener, so this is live)
  const rows = returnRows(orders);
  const waitingReturns = rows.filter((r) => r.state === 'requested');
  // Cancellation requests not answered yet are shown on the same page, so they count on the same badge
  const waitingCancels = waitingCancelRows(orders);
  const waitingRequests = waitingReturns.length + waitingCancels.length;

  // Live alert: a request that arrives while the admin panel is open pops up once. Requests that were
  // already there when the panel opened are only counted on the badge, never announced again.
  const knownReturns = useRef<Set<string> | null>(null);
  useEffect(() => {
    const cancelKey = (r: { order: { orderNumber: string }; at: string }) => `cancel|${r.order.orderNumber}|${r.at}`;
    const keys = [...waitingReturns.map((r) => `${r.order.orderNumber}|${r.at}`), ...waitingCancels.map(cancelKey)];
    if (knownReturns.current === null) {
      if (orders.length) knownReturns.current = new Set(keys);
      return;
    }
    const fresh = waitingReturns.filter((r) => !knownReturns.current!.has(`${r.order.orderNumber}|${r.at}`));
    const freshCancels = waitingCancels.filter((r) => !knownReturns.current!.has(cancelKey(r)));
    keys.forEach((k) => knownReturns.current!.add(k));
    fresh.forEach((r) => {
      showToast(`New ${r.kind === 'exchange' ? 'exchange' : 'return'} request · ${r.order.orderNumber} · ${r.order.customerName || 'customer'}. Open Returns to approve or deny.`, 'info');
    });
    freshCancels.forEach((r) => {
      showToast(`New cancellation request · ${r.order.orderNumber} · ${r.order.customerName || 'customer'}. Open Returns to cancel or keep the order.`, 'info');
    });
  }, [orders]);

  const navItems: { id: AdminTab | 'add-product'; label: string; route: string; icon: React.FC<{ className?: string }>; group: NavGroup; badge?: number; alert?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', route: '/admin/dashboard', icon: LayoutDashboard, group: 'Overview' },
    // Products = women's outfits only (accessories, kids wear and toys have their own sections)
    { id: 'products', label: 'Products', route: '/admin/products', icon: Package, group: 'Catalogue', badge: products.filter((p) => p.productType !== 'accessory' && departmentOf(p) === 'women').length },
    { id: 'add-product', label: 'Add Product', route: '/admin/products/new', icon: PlusCircle, group: 'Catalogue' },
    { id: 'kids', label: 'Kids Wear', route: '/admin/kids', icon: Baby, group: 'Catalogue', badge: products.filter((p) => departmentOf(p) === 'kids').length },
    { id: 'toys', label: 'Toys', route: '/admin/toys', icon: ToyBrick, group: 'Catalogue', badge: products.filter((p) => departmentOf(p) === 'toys').length },
    { id: 'categories', label: 'Categories', route: '/admin/categories', icon: Layers, group: 'Catalogue', badge: categories.length },
    { id: 'orders', label: 'Orders', route: '/admin/orders', icon: ShoppingBag, group: 'Sales', badge: pendingOrdersCount, alert: pendingOrdersCount > 0 },
    { id: 'returns', label: 'Returns & Exchanges', route: '/admin/returns', icon: RotateCcw, group: 'Sales', badge: waitingRequests, alert: waitingRequests > 0 },
    { id: 'customers', label: 'Customers', route: '/admin/customers', icon: Users, group: 'Sales' },
    { id: 'abandoned', label: 'Abandoned checkouts', route: '/admin/abandoned', icon: ShoppingCart, group: 'Sales' },
    { id: 'leads', label: 'Captured Leads', route: '/admin/leads', icon: MessageSquare, group: 'Sales' },
    { id: 'coupons', label: 'Coupons', route: '/admin/coupons', icon: Tag, group: 'Sales', badge: coupons.length },
    { id: 'dealOfTheDay', label: 'Deal of the Day', route: '/admin/deal-of-the-day', icon: Flame, group: 'Sales' },
    { id: 'comboOffers', label: 'Combo Offer', route: '/admin/combo-offers', icon: Flame, group: 'Sales' },
    { id: 'reviews', label: 'Reviews', route: '/admin/reviews', icon: Star, group: 'Sales', badge: reviews.length },
    { id: 'homepage', label: 'Homepage', route: '/admin/homepage', icon: LayoutTemplate, group: 'Storefront' },
    { id: 'hero', label: 'Hero Slides', route: '/admin/hero', icon: Sparkles, group: 'Storefront' },
    { id: 'discovery', label: 'Discovery features', route: '/admin/discovery', icon: Compass, group: 'Storefront' },
    { id: 'reels', label: 'Aura Reels', route: '/admin/reels', icon: Film, group: 'Storefront' },
    { id: 'looks', label: 'Complete the Look', route: '/admin/looks', icon: Shirt, group: 'Storefront' },
    { id: 'banners', label: 'Banners', route: '/admin/banners', icon: ImageIcon, group: 'Storefront' },
    { id: 'instagram', label: 'Instagram Reels', route: '/admin/instagram', icon: Instagram, group: 'Storefront' },
    { id: 'payments', label: 'Payment Gateways', route: '/admin/payments', icon: CreditCard, group: 'System' },
    { id: 'usage', label: 'Usage & limits', route: '/admin/usage', icon: Gauge, group: 'System' },
    { id: 'settings', label: 'Settings', route: '/admin/settings', icon: Settings, group: 'System' },
  ];

  const handleNavClick = (tabId: AdminTab | 'add-product') => {
    if (tabId === 'add-product') {
      openAdminProductNew();
    } else {
      openAdminTab(tabId as AdminTab);
    }
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    logoutAdmin();
    showToast('Signed out securely from Suit Aura Girls Vault.', 'info');
    setActivePage('home');
    navigate('/');
  };

  const handleViewStorefront = () => {
    setActivePage('home');
    navigate('/');
  };

  const isItemActive = (id: AdminTab | 'add-product') =>
    id === 'add-product'
      ? currentPath === '/admin/products/new'
      : id === 'products'
        ? (activeAdminTab === 'products' || currentPath.startsWith('/admin/products')) && currentPath !== '/admin/products/new'
        : activeAdminTab === id || (id === 'orders' && currentPath.startsWith('/admin/orders'));

  const badgeClass = (active: boolean, alert?: boolean) =>
    active
      ? 'bg-white/20 text-white'
      : alert
        ? 'bg-[#F7E4EA] text-[#8A2E55]'
        : 'bg-[#F3EEF8] text-[#4B1D3F]/80';

  const Monogram: React.FC<{ size?: string }> = ({ size = 'w-10 h-10 text-base' }) => (
    <div className={`${size} shrink-0 rounded-2xl bg-[#4B1D3F] text-white flex items-center justify-center font-serif font-semibold tracking-wide shadow-[0_6px_16px_-8px_rgba(75,29,63,0.7)] ring-1 ring-[#C5A46D]/40`}>
      SA
    </div>
  );

  const renderNav = (collapsed: boolean, withIds: boolean) => (
    <nav className="space-y-5" aria-label="Admin sections">
      {NAV_GROUPS.map((group) => {
        const items = navItems.filter((item) => item.group === group);
        return (
          <div key={group} className="space-y-1">
            {collapsed ? (
              <div className="mx-auto my-2 h-px w-6 bg-[#4B1D3F]/10 first:hidden" />
            ) : (
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9C7A45]">
                {group}
              </div>
            )}
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = isItemActive(item.id);
              return (
                <button
                  key={item.id}
                  id={withIds ? `admin-nav-${item.id}` : undefined}
                  onClick={() => handleNavClick(item.id)}
                  className={`relative w-full flex items-center ${collapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2'} rounded-full text-[13px] font-semibold transition-colors group cursor-pointer ${
                    isActive
                      ? 'bg-[#4B1D3F] text-white shadow-[0_6px_16px_-10px_rgba(75,29,63,0.8)]'
                      : 'text-[#2A1A26]/75 hover:bg-[#F3EEF8] hover:text-[#4B1D3F]'
                  }`}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#4B1D3F]/55 group-hover:text-[#4B1D3F]'}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </span>
                  {!collapsed && item.badge !== undefined && (
                    <span className={`ml-2 min-w-[1.5rem] px-2 py-0.5 rounded-full text-[11px] font-bold text-center tabular-nums ${badgeClass(isActive, item.alert)}`}>
                      {item.badge}
                    </span>
                  )}
                  {collapsed && item.alert && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#8A2E55] ring-2 ring-white" />
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div id="admin-layout" className="min-h-screen bg-[#FBF7F3] flex flex-col font-sans text-[#2A1A26]">

      {/* Top Admin Header Bar */}
      <header className="bg-white/90 backdrop-blur-md border-b border-[#4B1D3F]/10 sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">

          {/* Mobile menu trigger + Logo */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="lg:hidden w-10 h-10 flex items-center justify-center rounded-full text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors cursor-pointer"
              aria-label="Toggle mobile admin sidebar"
            >
              {mobileSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div
              className="flex items-center gap-3 cursor-pointer min-w-0"
              onClick={() => openAdminTab('dashboard')}
            >
              <Monogram />
              <div className="min-w-0">
                <h1 className="font-serif font-semibold text-lg sm:text-xl text-[#4B1D3F] tracking-wide leading-none truncate">
                  Suit Aura Girls
                </h1>
                <span className="block mt-1 text-[11px] uppercase font-semibold tracking-[0.2em] text-[#9C7A45]">
                  Admin Studio
                </span>
              </div>
            </div>

            {/* Desktop toggle collapse sidebar button */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden lg:flex w-9 h-9 items-center justify-center rounded-full text-[#4B1D3F]/60 hover:text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors ml-2 cursor-pointer"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          {/* Quick Actions & Profile */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">

            {/* View Live Storefront Button */}
            <button
              id="admin-view-storefront-btn"
              onClick={handleViewStorefront}
              className="h-10 px-3 sm:px-4 bg-white hover:bg-[#F3EEF8] text-[#4B1D3F] border border-[#4B1D3F]/20 hover:border-[#4B1D3F]/40 rounded-full text-[13px] font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              title="Return to customer-facing shop"
            >
              <Store className="w-4 h-4" />
              <span className="hidden sm:inline">View Storefront</span>
              <ExternalLink className="w-3.5 h-3.5 hidden sm:inline opacity-60" />
            </button>

            {/* Quick Notification Bell */}
            <div className="relative">
              <button
                onClick={() => (waitingRequests
                  ? openAdminTab('returns')
                  : showToast(`Store Operational: ${pendingOrdersCount} pending orders, ${lowStockCount} low stock alerts.`, 'info'))}
                className="w-10 h-10 flex items-center justify-center rounded-full text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors relative cursor-pointer"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="w-[18px] h-[18px]" />
                {waitingRequests > 0 ? (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#8A2E55] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white" aria-label={`${waitingRequests} return or cancellation requests waiting`}>{waitingRequests}</span>
                ) : pendingOrdersCount > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#8A2E55] ring-2 ring-white" />
                )}
              </button>
            </div>

            {/* Admin Profile Pill */}
            <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-[#4B1D3F]/10">
              <div className="w-9 h-9 rounded-full bg-[#F3EEF8] text-[#4B1D3F] ring-1 ring-[#4B1D3F]/15 flex items-center justify-center text-sm font-bold font-serif">
                {adminEmail ? adminEmail[0].toUpperCase() : 'A'}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-[13px] font-semibold text-[#2A1A26] leading-none">
                  Admin User
                </p>
                <p className="mt-1 text-[11px] text-[#2A1A26]/55 leading-tight max-w-[180px] truncate">
                  {adminEmail || 'admin@suitauragirls.com'}
                </p>
              </div>
            </div>

          </div>

        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 w-full flex-1 flex gap-6 lg:gap-8">

        {/* Desktop Sticky Sidebar */}
        <aside className={`hidden lg:block shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'w-[72px]' : 'w-64'}`}>
          <div className="bg-white rounded-3xl border border-[#4B1D3F]/10 p-3 shadow-[var(--sag-shadow)] sticky top-[5.5rem] max-h-[calc(100vh-7rem)] overflow-y-auto space-y-5">

            {renderNav(isSidebarCollapsed, true)}

            {/* System Status Summary & Logout */}
            <div className="pt-4 border-t border-[#4B1D3F]/10 space-y-2">
              {!isSidebarCollapsed && (
                <div className="p-3.5 bg-[#F3EEF8] rounded-2xl">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-[#4B1D3F]">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Store Operational</span>
                  </div>
                  <p className="text-[11px] text-[#2A1A26]/60 mt-1 leading-relaxed">
                    100% Prepaid Only • Secure Card & UPI
                  </p>
                </div>
              )}

              {/* Logout Button */}
              <button
                id="admin-sidebar-logout-btn"
                onClick={handleLogout}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'} text-[13px] font-semibold text-rose-700 hover:bg-rose-50 rounded-full transition-colors cursor-pointer`}
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
                {!isSidebarCollapsed && <span>Logout</span>}
              </button>
            </div>

          </div>
        </aside>

        {/* Mobile Slide-over Sidebar Drawer */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden bg-[#2A1A26]/40 backdrop-blur-sm flex animate-in fade-in">
            <div className="w-[84vw] max-w-xs bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-left">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#4B1D3F]/10">
                <div className="flex items-center gap-3">
                  <Monogram size="w-9 h-9 text-sm" />
                  <div>
                    <h3 className="font-serif font-semibold text-lg leading-none text-[#4B1D3F]">Suit Aura Girls</h3>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.2em] font-semibold text-[#9C7A45]">Admin Studio</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-[#4B1D3F] hover:bg-[#F3EEF8] transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4">
                {renderNav(false, false)}
              </div>

              <div className="p-4 border-t border-[#4B1D3F]/10 space-y-2 bg-[#FBF7F3]">
                <button
                  onClick={handleViewStorefront}
                  className="w-full h-11 px-3 bg-white text-[#4B1D3F] border border-[#4B1D3F]/20 rounded-full text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-[#F3EEF8] transition-colors"
                >
                  <Store className="w-4 h-4" /> View Storefront
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full h-11 px-3 text-rose-700 hover:bg-rose-50 rounded-full text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileSidebarOpen(false)} />
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 min-w-0 space-y-6">
          {children}
        </main>

      </div>

    </div>
  );
};
