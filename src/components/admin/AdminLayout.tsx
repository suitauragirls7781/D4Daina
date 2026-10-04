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
import { RotateCcw, ShoppingCart, XCircle } from 'lucide-react';
import { AdminTab } from '../../types';
import { returnRows } from './AdminReturns';
import { waitingCancelRows } from './AdminCancellations';
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
  // Cancellation requests not answered yet have their own page and badge; the bell counts both kinds
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
      showToast(`New cancellation request · ${r.order.orderNumber} · ${r.order.customerName || 'customer'}. Open Cancellations to cancel or keep the order.`, 'info');
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
    { id: 'returns', label: 'Returns & Exchanges', route: '/admin/returns', icon: RotateCcw, group: 'Sales', badge: waitingReturns.length, alert: waitingReturns.length > 0 },
    { id: 'cancellations', label: 'Cancellations', route: '/admin/cancellations', icon: XCircle, group: 'Sales', badge: waitingCancels.length, alert: waitingCancels.length > 0 },
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
    showToast('Signed out of the admin panel.', 'info');
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

  // The phone menu closes with Escape and does not let the page scroll behind it
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [mobileSidebarOpen]);

  const badgeClass = (active: boolean, alert?: boolean) =>
    active
      ? 'bg-brand text-white'
      : alert
        ? 'bg-sale-tint text-sale'
        : 'bg-sunken text-ink-muted';

  // The jobs done many times a day, one tap away on a phone (the full menu is behind the menu button)
  const quickIds: Array<AdminTab | 'add-product'> = ['dashboard', 'orders', 'returns', 'cancellations', 'products', 'add-product', 'customers'];
  const quickItems = quickIds.map((id) => navItems.find((item) => item.id === id)!).filter(Boolean);

  const Monogram: React.FC<{ size?: string }> = ({ size = 'w-9 h-9 text-sm' }) => (
    <div className={`${size} shrink-0 rounded-[10px] bg-brand text-white flex items-center justify-center font-bold`} aria-hidden="true">
      SA
    </div>
  );

  const renderNav = (collapsed: boolean, withIds: boolean) => (
    <nav className="space-y-4" aria-label="Admin sections">
      {NAV_GROUPS.map((group) => {
        const items = navItems.filter((item) => item.group === group);
        return (
          <div key={group} className="space-y-0.5">
            {collapsed ? (
              <div className="mx-auto my-2 h-px w-6 bg-line first:hidden" />
            ) : (
              <div className="px-3 pb-1 text-xs leading-4 font-semibold text-ink-muted">
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
                  className={`relative w-full flex items-center ${collapsed ? 'justify-center h-11' : `justify-between px-3 ${withIds ? 'h-10' : 'h-12'}`} rounded-[10px] text-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-brand-wash text-brand font-bold'
                      : 'text-ink font-medium hover:bg-sunken'
                  }`}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-brand' : 'text-ink-muted'}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </span>
                  {!collapsed && item.badge !== undefined && (
                    <span className={`ml-2 min-w-[1.5rem] h-[22px] px-1.5 rounded-md text-[11px] font-bold inline-flex items-center justify-center tabular-nums ${badgeClass(isActive, item.alert)}`}>
                      {item.badge}
                    </span>
                  )}
                  {collapsed && item.alert && (
                    <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-sale ring-2 ring-white" />
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
    <div id="admin-layout" className="min-h-screen bg-page flex flex-col font-sans text-ink">

      {/* Top bar: menu, where you are, and the two things checked most (store, alerts) */}
      <header className="bg-white border-b border-line sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto pl-1.5 pr-2 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2">

          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="lg:hidden w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-ink hover:bg-sunken transition-colors cursor-pointer"
              aria-label="Toggle mobile admin sidebar"
              aria-expanded={mobileSidebarOpen}
            >
              {mobileSidebarOpen ? <X className="w-[22px] h-[22px]" /> : <Menu className="w-[22px] h-[22px]" />}
            </button>

            <div
              className="flex items-center gap-2.5 cursor-pointer min-w-0"
              onClick={() => openAdminTab('dashboard')}
            >
              <span className="hidden sm:block"><Monogram /></span>
              <div className="min-w-0">
                <h1 className="font-sans text-base leading-5 font-semibold text-ink truncate">Suit Aura Girls</h1>
                <span className="block text-[11px] leading-4 font-semibold uppercase tracking-[0.06em] text-ink-muted truncate">Admin Studio</span>
              </div>
            </div>

            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden lg:flex w-10 h-10 items-center justify-center rounded-full text-ink-muted hover:text-ink hover:bg-sunken transition-colors ml-1 cursor-pointer"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeft className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
            </button>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">

            <button
              id="admin-view-storefront-btn"
              onClick={handleViewStorefront}
              className="w-11 sm:w-auto h-11 sm:h-10 sm:px-3.5 rounded-full sm:rounded-[10px] sm:border-[1.5px] sm:border-control bg-white hover:bg-sunken text-ink text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              title="Open the store your customers see"
              aria-label="View store"
            >
              <Store className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">View store</span>
              <ExternalLink className="w-3.5 h-3.5 hidden sm:inline text-ink-muted" />
            </button>

            <button
              onClick={() => (waitingRequests
                ? openAdminTab(waitingCancels.length ? 'cancellations' : 'returns')
                : showToast(`${pendingOrdersCount} ${pendingOrdersCount === 1 ? 'order' : 'orders'} to pack and ship · ${lowStockCount} ${lowStockCount === 1 ? 'product' : 'products'} low on stock.`, 'info'))}
              className="w-11 h-11 flex items-center justify-center rounded-full text-ink hover:bg-sunken transition-colors relative cursor-pointer"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {waitingRequests > 0 ? (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white" aria-label={`${waitingRequests} return or cancellation requests waiting`}>{waitingRequests}</span>
              ) : pendingOrdersCount > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-white" />
              )}
            </button>

            <div className="hidden md:flex items-center gap-2.5 pl-3 ml-1 border-l border-line">
              <div className="w-9 h-9 rounded-full bg-sunken text-ink flex items-center justify-center text-sm font-bold" aria-hidden="true">
                {adminEmail ? adminEmail[0].toUpperCase() : 'A'}
              </div>
              <div className="text-left">
                <p className="text-[13px] font-semibold text-ink leading-4">Signed in</p>
                <p className="text-xs text-ink-muted leading-4 max-w-[180px] truncate">{adminEmail || 'Store admin'}</p>
              </div>
            </div>

          </div>

        </div>

        {/* Phone and tablet: the everyday pages, one tap away */}
        <div className="lg:hidden border-t border-line">
          <div className="sag-scroll-x flex gap-1 overflow-x-auto px-2" role="navigation" aria-label="Quick admin pages">
            {quickItems.map((item) => {
              const isActive = isItemActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative shrink-0 h-11 px-3 inline-flex items-center gap-1.5 text-sm whitespace-nowrap cursor-pointer transition-colors ${isActive ? 'text-brand font-bold' : 'text-ink-muted font-medium hover:text-ink'}`}
                >
                  {item.id === 'returns' ? 'Returns' : item.label}
                  {item.alert && item.badge !== undefined && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-bold inline-flex items-center justify-center tabular-nums">{item.badge}</span>
                  )}
                  {isActive && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-brand" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full flex-1 flex gap-6 lg:gap-8">

        {/* Desktop sidebar */}
        <aside className={`hidden lg:block shrink-0 transition-[width] duration-200 ${isSidebarCollapsed ? 'w-[68px]' : 'w-60'}`}>
          <div className="bg-white rounded-2xl border border-line p-2.5 sticky top-[4.5rem] max-h-[calc(100vh-5.5rem)] overflow-y-auto space-y-4">

            {renderNav(isSidebarCollapsed, true)}

            <div className="pt-3 border-t border-line space-y-2">
              {/* Real counts from the live order and product lists */}
              {!isSidebarCollapsed && (
                <dl className="px-3 py-2.5 bg-page rounded-[10px] space-y-1 text-[13px] leading-[18px]">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-ink-muted">To pack and ship</dt>
                    <dd className={`font-bold tabular-nums ${pendingOrdersCount > 0 ? 'text-sale' : 'text-ink'}`}>{pendingOrdersCount}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-ink-muted">Low on stock</dt>
                    <dd className={`font-bold tabular-nums ${lowStockCount > 0 ? 'text-sale' : 'text-ink'}`}>{lowStockCount}</dd>
                  </div>
                </dl>
              )}

              <button
                id="admin-sidebar-logout-btn"
                onClick={handleLogout}
                className={`w-full h-10 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-3'} text-sm font-semibold text-danger hover:bg-danger-tint rounded-[10px] transition-colors cursor-pointer`}
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="w-[18px] h-[18px]" />
                {!isSidebarCollapsed && <span>Logout</span>}
              </button>
            </div>

          </div>
        </aside>

        {/* Phone menu */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden bg-ink/50 flex animate-in fade-in" role="dialog" aria-modal="true" aria-label="Admin menu">
            <div className="w-[86vw] max-w-xs bg-white h-full flex flex-col overflow-hidden animate-in slide-in-from-left">
              <div className="flex items-center justify-between pl-4 pr-1.5 h-14 border-b border-line shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Monogram />
                  <div className="min-w-0">
                    <h3 className="text-base leading-5 font-semibold text-ink truncate">Suit Aura Girls</h3>
                    <p className="text-xs leading-4 text-ink-muted truncate">{adminEmail || 'Admin'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-ink hover:bg-sunken transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-[22px] h-[22px]" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain px-2.5 py-3">
                {renderNav(false, false)}
              </div>

              <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line flex gap-2 shrink-0">
                <button
                  onClick={handleViewStorefront}
                  className="flex-1 h-12 px-3 bg-white text-ink border-[1.5px] border-control rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-sunken transition-colors"
                >
                  <Store className="w-4 h-4" /> View store
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 h-12 px-3 text-danger border-[1.5px] border-danger-line bg-danger-tint rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileSidebarOpen(false)} />
          </div>
        )}

        <main className="flex-1 min-w-0 space-y-5">
          {children}
        </main>

      </div>

    </div>
  );
};
