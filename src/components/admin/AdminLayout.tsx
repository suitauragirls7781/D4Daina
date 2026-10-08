import React, { useEffect, useRef, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import {
  type LucideIcon,
  BarChart3,
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
  PanelLeftClose,
  PanelLeft,
  Baby,
  ToyBrick,
  Star,
  Film,
  Compass,
  Shirt,
  RotateCcw,
  ShoppingCart,
  XCircle
} from 'lucide-react';
import { AdminTab } from '../../types';
import { returnRows } from './AdminReturns';
import { waitingCancelRows } from './AdminCancellations';
import { departmentOf } from '../../utils/kids';
import { isLowStock } from '../../utils/inventory';

interface AdminLayoutProps {
  children: React.ReactNode;
}

type NavGroup = 'Overview' | 'Orders' | 'Customers' | 'Catalogue' | 'Offers' | 'Storefront' | 'System';
const NAV_GROUPS: NavGroup[] = ['Overview', 'Orders', 'Customers', 'Catalogue', 'Offers', 'Storefront', 'System'];

// Thin outline icons everywhere in the admin shell
const THIN = 1.5;

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

  // The order of this list is the order in the menu, group by group (NAV_GROUPS)
  const navItems: { id: AdminTab | 'add-product'; label: string; route: string; icon: LucideIcon; group: NavGroup; badge?: number; alert?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', route: '/admin/dashboard', icon: LayoutDashboard, group: 'Overview' },
    { id: 'reports', label: 'Reports', route: '/admin/reports', icon: BarChart3, group: 'Overview' },

    { id: 'orders', label: 'Orders', route: '/admin/orders', icon: ShoppingBag, group: 'Orders', badge: pendingOrdersCount, alert: pendingOrdersCount > 0 },
    { id: 'returns', label: 'Returns & exchanges', route: '/admin/returns', icon: RotateCcw, group: 'Orders', badge: waitingReturns.length, alert: waitingReturns.length > 0 },
    { id: 'cancellations', label: 'Cancellations', route: '/admin/cancellations', icon: XCircle, group: 'Orders', badge: waitingCancels.length, alert: waitingCancels.length > 0 },
    { id: 'abandoned', label: 'Abandoned checkouts', route: '/admin/abandoned', icon: ShoppingCart, group: 'Orders' },

    { id: 'customers', label: 'Customers', route: '/admin/customers', icon: Users, group: 'Customers' },
    { id: 'leads', label: 'Captured leads', route: '/admin/leads', icon: MessageSquare, group: 'Customers' },
    { id: 'reviews', label: 'Reviews', route: '/admin/reviews', icon: Star, group: 'Customers', badge: reviews.length },

    // Products = women's outfits only (accessories, kids wear and toys have their own sections)
    { id: 'products', label: 'Products', route: '/admin/products', icon: Package, group: 'Catalogue', badge: products.filter((p) => p.productType !== 'accessory' && departmentOf(p) === 'women').length },
    { id: 'add-product', label: 'Add product', route: '/admin/products/new', icon: PlusCircle, group: 'Catalogue' },
    { id: 'kids', label: 'Kids wear', route: '/admin/kids', icon: Baby, group: 'Catalogue', badge: products.filter((p) => departmentOf(p) === 'kids').length },
    { id: 'toys', label: 'Toys', route: '/admin/toys', icon: ToyBrick, group: 'Catalogue', badge: products.filter((p) => departmentOf(p) === 'toys').length },
    { id: 'categories', label: 'Categories', route: '/admin/categories', icon: Layers, group: 'Catalogue', badge: categories.length },

    { id: 'coupons', label: 'Coupons', route: '/admin/coupons', icon: Tag, group: 'Offers', badge: coupons.length },
    { id: 'dealOfTheDay', label: 'Deal of the day', route: '/admin/deal-of-the-day', icon: Flame, group: 'Offers' },
    { id: 'comboOffers', label: 'Combo offer', route: '/admin/combo-offers', icon: Flame, group: 'Offers' },

    { id: 'homepage', label: 'Homepage', route: '/admin/homepage', icon: LayoutTemplate, group: 'Storefront' },
    { id: 'hero', label: 'Hero slides', route: '/admin/hero', icon: Sparkles, group: 'Storefront' },
    { id: 'banners', label: 'Banners', route: '/admin/banners', icon: ImageIcon, group: 'Storefront' },
    { id: 'reels', label: 'Aura reels', route: '/admin/reels', icon: Film, group: 'Storefront' },
    { id: 'instagram', label: 'Instagram reels', route: '/admin/instagram', icon: Instagram, group: 'Storefront' },
    { id: 'looks', label: 'Complete the look', route: '/admin/looks', icon: Shirt, group: 'Storefront' },
    { id: 'discovery', label: 'Discovery features', route: '/admin/discovery', icon: Compass, group: 'Storefront' },

    { id: 'payments', label: 'Payment gateways', route: '/admin/payments', icon: CreditCard, group: 'System' },
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

  // The jobs done many times a day, one tap away on a phone (the full menu is behind the menu button)
  const quickIds: Array<AdminTab | 'add-product'> = ['dashboard', 'reports', 'orders', 'returns', 'cancellations', 'products', 'add-product', 'customers'];
  const quickItems = quickIds.map((id) => navItems.find((item) => item.id === id)!).filter(Boolean);

  const Monogram: React.FC<{ size?: string }> = ({ size = 'w-9 h-9 text-[13px]' }) => (
    <div className={`${size} shrink-0 rounded-full border border-brand-line text-sale flex items-center justify-center font-medium tracking-[0.06em]`} aria-hidden="true">
      SA
    </div>
  );

  const iconButton = 'rounded-full flex items-center justify-center text-ink hover:bg-sunken transition-colors cursor-pointer';

  const renderNav = (collapsed: boolean, withIds: boolean) => (
    <nav className={collapsed ? 'space-y-2' : 'space-y-5'} aria-label="Admin sections">
      {NAV_GROUPS.map((group, groupIndex) => {
        const items = navItems.filter((item) => item.group === group);
        return (
          <div key={group} role="group" aria-label={group}>
            {collapsed ? (
              groupIndex > 0 && <div className="mx-auto mb-2 h-px w-6 bg-line" />
            ) : (
              <div className="px-4 pb-1.5 text-[11px] leading-4 font-medium uppercase tracking-[0.14em] text-ink-muted">
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
                  className={`relative w-full flex items-center ${collapsed ? 'justify-center h-10' : `justify-between pl-3.5 pr-3 ${withIds ? 'h-9' : 'h-11'}`} border-l-2 text-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'border-brand bg-brand-wash text-sale font-medium'
                      : 'border-transparent text-ink-muted font-normal hover:text-ink hover:bg-sunken'
                  }`}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={THIN} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </span>
                  {!collapsed && item.badge !== undefined && (
                    <span className={`ml-2 inline-flex items-center gap-1.5 text-xs leading-4 tabular-nums ${item.alert ? 'text-sale font-medium' : 'text-ink-muted font-normal'}`}>
                      {item.alert && <span className="w-1.5 h-1.5 rounded-full bg-sale" aria-hidden="true" />}
                      {item.badge}
                    </span>
                  )}
                  {collapsed && item.alert && (
                    <span className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-sale" />
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
    <div id="admin-layout" className="min-h-screen flex flex-col font-sans text-ink">

      {/* Top bar: menu, where you are, and the two things checked most (store, alerts) */}
      <header className="bg-surface border-b border-line sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto pl-1.5 pr-2 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2">

          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className={`lg:hidden w-11 h-11 shrink-0 ${iconButton}`}
              aria-label="Toggle mobile admin sidebar"
              aria-expanded={mobileSidebarOpen}
            >
              {mobileSidebarOpen ? <X className="w-5 h-5" strokeWidth={THIN} /> : <Menu className="w-5 h-5" strokeWidth={THIN} />}
            </button>

            <div
              className="flex items-center gap-2.5 cursor-pointer min-w-0"
              onClick={() => openAdminTab('dashboard')}
            >
              <span className="hidden sm:block"><Monogram /></span>
              <div className="min-w-0">
                <h1 className="font-sans text-[15px] leading-5 font-medium text-ink truncate">Suit Aura Girls</h1>
                <span className="block text-[11px] leading-4 font-medium uppercase tracking-[0.14em] text-ink-muted truncate">Admin</span>
              </div>
            </div>

            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden lg:flex w-10 h-10 items-center justify-center rounded-full text-ink-muted hover:text-ink hover:bg-sunken transition-colors ml-1 cursor-pointer"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeft className="w-[18px] h-[18px]" strokeWidth={THIN} /> : <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={THIN} />}
            </button>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">

            <button
              id="admin-view-storefront-btn"
              onClick={handleViewStorefront}
              className="w-11 sm:w-auto h-11 sm:h-10 sm:px-4 rounded-full sm:border sm:border-line bg-surface hover:bg-sunken text-ink text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              title="Open the store your customers see"
              aria-label="View store"
            >
              <Store className="w-5 h-5 sm:w-4 sm:h-4" strokeWidth={THIN} />
              <span className="hidden sm:inline">View store</span>
              <ExternalLink className="w-3.5 h-3.5 hidden sm:inline text-ink-muted" strokeWidth={THIN} />
            </button>

            <button
              onClick={() => (waitingRequests
                ? openAdminTab(waitingCancels.length ? 'cancellations' : 'returns')
                : showToast(`${pendingOrdersCount} ${pendingOrdersCount === 1 ? 'order' : 'orders'} to pack and ship · ${lowStockCount} ${lowStockCount === 1 ? 'product' : 'products'} low on stock.`, 'info'))}
              className={`w-11 h-11 relative ${iconButton}`}
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" strokeWidth={THIN} />
              {waitingRequests > 0 ? (
                <span className="absolute top-1 right-0.5 min-w-4 h-4 px-1 rounded-full bg-brand text-[color:var(--sag-on-gold)] text-[11px] leading-4 font-semibold tabular-nums flex items-center justify-center" aria-label={`${waitingRequests} return or cancellation requests waiting`}>{waitingRequests}</span>
              ) : pendingOrdersCount > 0 && (
                <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-sale" />
              )}
            </button>

            <div className="hidden md:block pl-3 ml-1 border-l border-line text-left">
              <p className="text-[11px] leading-4 font-medium uppercase tracking-[0.14em] text-ink-muted">Signed in</p>
              <p className="text-[13px] leading-4 text-ink max-w-[200px] truncate">{adminEmail || 'Store admin'}</p>
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
                  className={`relative shrink-0 h-11 px-3 inline-flex items-center gap-1.5 text-sm whitespace-nowrap cursor-pointer transition-colors ${isActive ? 'text-sale font-medium' : 'text-ink-muted font-normal hover:text-ink'}`}
                >
                  {item.id === 'returns' ? 'Returns' : item.label}
                  {item.alert && item.badge !== undefined && (
                    <span className="inline-flex items-center gap-1 text-xs leading-4 font-medium text-sale tabular-nums">
                      <span className="w-1.5 h-1.5 rounded-full bg-sale" aria-hidden="true" />{item.badge}
                    </span>
                  )}
                  {isActive && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full flex-1 flex gap-6 lg:gap-8">

        {/* Desktop sidebar */}
        <aside className={`hidden lg:block shrink-0 transition-[width] duration-200 ${isSidebarCollapsed ? 'w-[68px]' : 'w-60'}`}>
          <div className="bg-surface border border-line rounded-[22px] pt-4 pb-2 sticky top-[4.5rem] max-h-[calc(100vh-5.5rem)] overflow-y-auto space-y-4">

            {renderNav(isSidebarCollapsed, true)}

            <div className="pt-2 border-t border-line">
              <button
                id="admin-sidebar-logout-btn"
                onClick={handleLogout}
                className={`w-full h-10 flex items-center border-l-2 border-transparent ${isSidebarCollapsed ? 'justify-center' : 'gap-3 pl-3.5 pr-3'} text-sm font-normal text-ink-muted hover:text-ink hover:bg-sunken transition-colors cursor-pointer`}
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="w-[17px] h-[17px]" strokeWidth={THIN} />
                {!isSidebarCollapsed && <span>Logout</span>}
              </button>
            </div>

          </div>
        </aside>

        {/* Phone menu */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden bg-[color:var(--sag-scrim)] flex animate-in fade-in" role="dialog" aria-modal="true" aria-label="Admin menu">
            <div className="w-[86vw] max-w-xs bg-surface border-r border-line h-full flex flex-col overflow-hidden animate-in slide-in-from-left">
              <div className="flex items-center justify-between pl-4 pr-1.5 h-14 border-b border-line shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Monogram />
                  <div className="min-w-0">
                    <h3 className="font-sans text-[15px] leading-5 font-medium text-ink truncate">Suit Aura Girls</h3>
                    <p className="text-xs leading-4 text-ink-muted truncate">{adminEmail || 'Admin'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className={`w-11 h-11 shrink-0 ${iconButton}`}
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" strokeWidth={THIN} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain py-4">
                {renderNav(false, false)}
              </div>

              <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line flex gap-2 shrink-0">
                <button
                  onClick={handleViewStorefront}
                  className="flex-1 h-11 px-3 rounded-full bg-surface text-sale border border-brand-line text-sm font-medium flex items-center justify-center gap-2 cursor-pointer hover:bg-sunken transition-colors"
                >
                  <Store className="w-4 h-4" strokeWidth={THIN} /> View store
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 h-11 px-3 rounded-full bg-surface text-ink-muted border border-line text-sm font-medium flex items-center justify-center gap-2 cursor-pointer hover:text-ink hover:bg-sunken transition-colors"
                >
                  <LogOut className="w-4 h-4" strokeWidth={THIN} /> Logout
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
