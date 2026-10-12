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
  Star,
  Film,
  Compass,
  Shirt,
  RotateCcw,
  ShoppingCart,
  XCircle,
  Volume2,
  VolumeX
} from 'lucide-react';
import { AdminSearch } from './AdminSearch';
import { useNewOrderAlerts } from './adminAlerts';
import { AdminTab } from '../../types';
import { returnRows } from './AdminReturns';
import { waitingCancelRows } from './AdminCancellations';
import { isLowStock } from '../../utils/inventory';
import { useLiveCount } from './AdminLive';

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
    ordersLoaded,
    products = [],
    lowStockThreshold,
    categories = [],
    coupons = [],
    reviews = []
  } = useAdmin();
  const { showToast, setActivePage } = useShop();
  const { currentPath, activeAdminTab, openAdminTab, openAdminProductNew, openAdminOrderDetails, navigate } = useRouter();
  // A newly paid order while the panel is open: a toast, the tab title, and the chime when switched on
  const { alerts: orderAlerts, dismissAlert, soundOn, setSoundOn } = useNewOrderAlerts(orders, ordersLoaded);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  // People on the site right now: the dashboard's own live loop shares it while the dashboard is open (null otherwise)
  const liveCount = useLiveCount();

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
  const navItems: { id: AdminTab | 'add-product'; label: string; route: string; icon: LucideIcon; group: NavGroup; badge?: number; alert?: boolean; live?: number | null }[] = [
    { id: 'dashboard', label: 'Dashboard', route: '/admin/dashboard', icon: LayoutDashboard, group: 'Overview', live: liveCount },
    { id: 'reports', label: 'Reports', route: '/admin/reports', icon: BarChart3, group: 'Overview' },

    { id: 'orders', label: 'Orders', route: '/admin/orders', icon: ShoppingBag, group: 'Orders', badge: pendingOrdersCount, alert: pendingOrdersCount > 0 },
    { id: 'returns', label: 'Returns & exchanges', route: '/admin/returns', icon: RotateCcw, group: 'Orders', badge: waitingReturns.length, alert: waitingReturns.length > 0 },
    { id: 'cancellations', label: 'Cancellations', route: '/admin/cancellations', icon: XCircle, group: 'Orders', badge: waitingCancels.length, alert: waitingCancels.length > 0 },
    { id: 'abandoned', label: 'Abandoned checkouts', route: '/admin/abandoned', icon: ShoppingCart, group: 'Orders' },

    { id: 'customers', label: 'Customers', route: '/admin/customers', icon: Users, group: 'Customers' },
    { id: 'leads', label: 'Captured leads', route: '/admin/leads', icon: MessageSquare, group: 'Customers' },
    { id: 'reviews', label: 'Reviews', route: '/admin/reviews', icon: Star, group: 'Customers', badge: reviews.length },

    // Products = outfits only (accessories have their own section)
    { id: 'products', label: 'Products', route: '/admin/products', icon: Package, group: 'Catalogue', badge: products.filter((p) => p.productType !== 'accessory').length },
    { id: 'add-product', label: 'Add product', route: '/admin/products/new', icon: PlusCircle, group: 'Catalogue' },
    { id: 'categories', label: 'Categories', route: '/admin/categories', icon: Layers, group: 'Catalogue', badge: categories.length },

    { id: 'coupons', label: 'Coupons', route: '/admin/coupons', icon: Tag, group: 'Offers', badge: coupons.length },
    { id: 'dealOfTheDay', label: 'Deal of the day', route: '/admin/deal-of-the-day', icon: Flame, group: 'Offers' },
    { id: 'specialDod', label: 'Special DOD', route: '/admin/special-dod', icon: Sparkles, group: 'Offers' },
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

  const Monogram: React.FC<{ size?: string; onInk?: boolean }> = ({ size = 'w-9 h-9 text-[13px]', onInk }) => (
    <div className={`${size} shrink-0 rounded-full flex items-center justify-center font-extrabold tracking-[0.02em] ${onInk ? 'bg-page text-[color:var(--aura-ink)]' : 'bg-brand'}`} aria-hidden="true">
      SA
    </div>
  );

  const iconButton = 'rounded-full flex items-center justify-center text-ink hover:bg-sunken transition-colors cursor-pointer';
  // Quick actions: a white pill with its words on wide screens, the icon alone below that
  const quickPill = 'shrink-0 w-10 h-10 xl:w-auto xl:px-3.5 rounded-full border border-line bg-surface hover:bg-sunken text-ink text-[13px] leading-[18px] font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer';
  const quickActions: Array<{ id: string; label: string; title: string; icon: LucideIcon; run: () => void }> = [
    { id: 'admin-quick-add-product', label: 'Add product', title: 'Add a new product', icon: PlusCircle, run: () => handleNavClick('add-product') },
    { id: 'admin-quick-new-coupon', label: 'New coupon', title: 'Open Coupons to add a coupon', icon: Tag, run: () => handleNavClick('coupons') },
    { id: 'admin-view-storefront-btn', label: 'View store', title: 'Open the store your customers see', icon: Store, run: handleViewStorefront },
  ];
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    showToast(next
      ? 'Sound for new orders is on. You will hear a soft chime while the admin is open in this browser.'
      : 'Sound for new orders is off.', 'info');
  };

  const renderNav = (collapsed: boolean, withIds: boolean) => (
    <nav className={collapsed ? 'space-y-2 px-2' : 'space-y-5 px-2'} aria-label="Admin sections">
      {NAV_GROUPS.map((group, groupIndex) => {
        const items = navItems.filter((item) => item.group === group);
        return (
          <div key={group} role="group" aria-label={group}>
            {collapsed ? (
              groupIndex > 0 && <div className="mx-auto mb-2 h-px w-6 bg-[color:var(--hl)]" />
            ) : (
              <div className="px-3 pb-1.5 text-[11px] leading-4 font-bold uppercase tracking-[0.16em] text-on-dark-muted">
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
                  className={`relative w-full flex items-center ${collapsed ? 'justify-center h-10' : `justify-between pl-3 pr-3 ${withIds ? 'h-9' : 'h-11'}`} rounded-full text-sm transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-page text-[color:var(--aura-ink)] font-bold'
                      : 'text-on-dark font-medium hover:bg-brand-dark'
                  }`}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={THIN} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </span>
                  {!collapsed && typeof item.live === 'number' && (
                    <span className={`ml-2 inline-flex items-center gap-1.5 text-xs leading-4 font-medium tabular-nums ${isActive ? 'text-[color:var(--aura-ink)]' : 'text-highlight'}`} title="People on the site right now" aria-label={`${item.live} on the site right now`}>
                      <span className="relative inline-flex w-1.5 h-1.5" aria-hidden="true">
                        {item.live > 0 && <span className={`absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping ${isActive ? 'bg-accent' : 'bg-highlight'}`} />}
                        <span className={`relative w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent' : 'bg-highlight'}`} />
                      </span>
                      {item.live} live
                    </span>
                  )}
                  {!collapsed && item.badge !== undefined && (
                    <span className={`ml-2 inline-flex items-center gap-1.5 text-xs leading-4 tabular-nums ${isActive ? 'text-[color:var(--aura-ink)] font-semibold' : item.alert ? 'text-highlight font-semibold' : 'text-on-dark-muted font-normal'}`}>
                      {item.alert && <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent' : 'bg-highlight'}`} aria-hidden="true" />}
                      {item.badge}
                    </span>
                  )}
                  {collapsed && item.alert && (
                    <span className={`absolute top-1.5 right-2.5 w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent' : 'bg-highlight'}`} />
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
        <div className="max-w-[1400px] mx-auto pl-2 pr-2.5 sm:px-6 lg:px-8 h-[60px] flex items-center justify-between gap-3">

          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className={`lg:hidden w-11 h-11 shrink-0 ${iconButton}`}
              aria-label="Toggle mobile admin sidebar"
              aria-expanded={mobileSidebarOpen}
            >
              {mobileSidebarOpen ? <X className="w-5 h-5" strokeWidth={THIN} /> : <Menu className="w-5 h-5" strokeWidth={THIN} />}
            </button>

            <div
              className="flex items-center gap-3 cursor-pointer min-w-0"
              onClick={() => openAdminTab('dashboard')}
            >
              <span className="hidden sm:block"><Monogram /></span>
              <div className="min-w-0">
                <h1 className="font-display text-[19px] leading-6 text-ink truncate">Suit Aura Girls</h1>
                <span className="block text-[11px] leading-4 font-bold uppercase tracking-[0.16em] text-ink-muted truncate">Store admin</span>
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

            <AdminSearch
              pages={navItems.map((item) => ({ id: item.id, label: item.label, group: item.group }))}
              onOpenPage={(id) => handleNavClick(id as AdminTab | 'add-product')}
            />

            {/* Quick actions (on phones they sit at the start of the row below) */}
            <div className="hidden sm:flex items-center gap-1 sm:gap-2">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.id} id={action.id} type="button" onClick={action.run} className={quickPill} title={action.title} aria-label={action.label}>
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={THIN} aria-hidden="true" />
                    <span className="hidden xl:inline">{action.label}</span>
                    {action.label === 'View store' && <ExternalLink className="w-3.5 h-3.5 hidden xl:inline text-ink-muted" strokeWidth={THIN} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <button
              id="admin-order-sound-switch"
              type="button"
              role="switch"
              aria-checked={soundOn}
              aria-label="Sound for new orders"
              title={soundOn ? 'Sound for new orders: on. Tap to switch it off.' : 'Sound for new orders: off. Tap to hear a soft chime when an order is paid.'}
              onClick={toggleSound}
              className={`shrink-0 w-10 h-10 sm:w-11 sm:h-11 2xl:w-auto 2xl:px-3.5 rounded-full inline-flex items-center justify-center gap-1.5 text-[13px] leading-[18px] font-medium whitespace-nowrap transition-colors cursor-pointer hover:bg-sunken ${soundOn ? 'text-ink' : 'text-ink-muted'}`}
            >
              {soundOn ? <Volume2 className="w-5 h-5 shrink-0" strokeWidth={THIN} aria-hidden="true" /> : <VolumeX className="w-5 h-5 shrink-0" strokeWidth={THIN} aria-hidden="true" />}
              <span className="hidden 2xl:inline">Sound for new orders: {soundOn ? 'On' : 'Off'}</span>
            </button>

            <button
              onClick={() => (waitingRequests
                ? openAdminTab(waitingCancels.length ? 'cancellations' : 'returns')
                : showToast(`${pendingOrdersCount} ${pendingOrdersCount === 1 ? 'order' : 'orders'} to pack and ship · ${lowStockCount} ${lowStockCount === 1 ? 'product' : 'products'} low on stock.`, 'info'))}
              className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0 relative ${iconButton}`}
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" strokeWidth={THIN} />
              {waitingRequests > 0 ? (
                <span className="absolute top-1 right-0.5 min-w-4 h-4 px-1 rounded-full bg-accent text-ink text-[11px] leading-4 font-bold tabular-nums flex items-center justify-center" aria-label={`${waitingRequests} return or cancellation requests waiting`}>{waitingRequests}</span>
              ) : pendingOrdersCount > 0 && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-accent" />
              )}
            </button>

            <div className="hidden md:block pl-3 ml-1 border-l border-line text-left">
              <p className="text-[11px] leading-4 font-bold uppercase tracking-[0.16em] text-ink-muted">Signed in</p>
              <p className="text-[13px] leading-4 text-ink max-w-[150px] 2xl:max-w-[200px] truncate">{adminEmail || 'Store admin'}</p>
            </div>

          </div>

        </div>

        {/* Phone and tablet: the everyday pages, one tap away */}
        <div className="lg:hidden border-t border-line">
          <div className="sag-scroll-x flex items-center gap-0.5 overflow-x-auto px-2" role="navigation" aria-label="Quick admin pages">
            {/* Phones: the quick actions as icons */}
            <div className="sm:hidden flex items-center gap-1.5 pr-1.5 shrink-0">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.id} type="button" onClick={action.run} className={`${quickPill} !w-9 !h-9`} title={action.title} aria-label={action.label}>
                    <Icon className="w-4 h-4 shrink-0" strokeWidth={THIN} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            {quickItems.map((item) => {
              const isActive = isItemActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`shrink-0 h-11 ${item.id === 'add-product' ? 'hidden sm:inline-flex' : 'inline-flex'} items-center cursor-pointer`}
                >
                  <span className={`h-9 px-3.5 rounded-full inline-flex items-center gap-1.5 text-sm whitespace-nowrap transition-colors ${isActive ? 'bg-brand font-bold' : 'text-ink-muted font-medium hover:bg-sunken'}`}>
                  {item.id === 'returns' ? 'Returns' : item.label}
                  {typeof item.live === 'number' && (
                    <span className={`inline-flex items-center gap-1 text-xs leading-4 font-semibold tabular-nums ${isActive ? '' : 'text-sale'}`} aria-label={`${item.live} on the site right now`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />{item.live} live
                    </span>
                  )}
                  {item.alert && item.badge !== undefined && (
                    <span className={`inline-flex items-center gap-1 text-xs leading-4 font-semibold tabular-nums ${isActive ? '' : 'text-sale'}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />{item.badge}
                    </span>
                  )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full flex-1 flex gap-6 lg:gap-8">

        {/* Desktop sidebar */}
        <aside className={`hidden lg:block shrink-0 transition-[width] duration-200 ${isSidebarCollapsed ? 'w-[68px]' : 'w-60'}`}>
          <div className="bg-dark text-on-dark rounded-[22px] pt-5 pb-2 sticky top-[5rem] max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain space-y-4">

            {renderNav(isSidebarCollapsed, true)}

            <div className="mx-2 pt-2 border-t border-[color:var(--hl)]">
              <button
                id="admin-sidebar-logout-btn"
                onClick={handleLogout}
                className={`w-full h-10 flex items-center rounded-full ${isSidebarCollapsed ? 'justify-center' : 'gap-3 pl-3 pr-3'} text-sm font-medium text-on-dark hover:bg-brand-dark transition-colors cursor-pointer`}
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
            <div className="bg-dark text-on-dark w-[86vw] max-w-xs h-full rounded-r-[28px] flex flex-col overflow-hidden animate-in slide-in-from-left">
              <div className="flex items-center justify-between pl-4 pr-1.5 h-16 border-b border-[color:var(--hl)] shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Monogram onInk />
                  <div className="min-w-0">
                    <h3 className="font-display text-[19px] leading-6 text-on-dark truncate">Suit Aura Girls</h3>
                    <p className="text-xs leading-4 text-on-dark-muted truncate">{adminEmail || 'Admin'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileSidebarOpen(false)}
                  className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-on-dark hover:bg-brand-dark transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" strokeWidth={THIN} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain py-4">
                {renderNav(false, false)}
              </div>

              <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[color:var(--hl)] flex gap-2 shrink-0">
                <button
                  onClick={handleViewStorefront}
                  className="sag-btn-light flex-1 !h-11 !px-3 !text-sm"
                >
                  <Store className="w-4 h-4" strokeWidth={THIN} /> View store
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 h-11 px-3 rounded-full border border-on-dark text-on-dark text-sm font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-brand-dark transition-colors"
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

      {/* A newly paid order, announced once while the panel is open */}
      {orderAlerts.length > 0 && (
        <div className="fixed z-40 top-[116px] lg:top-[72px] right-3 left-3 sm:left-auto sm:w-[380px] space-y-2" role="status" aria-live="polite">
          {orderAlerts.map((alert) => (
            <div key={alert.orderNumber} className="bg-surface border border-brand rounded-[22px] shadow-[var(--sag-shadow-pop)] pl-4 pr-1.5 py-2 flex items-center gap-2 animate-in fade-in">
              <span className="w-2 h-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm leading-5 text-ink break-words sag-num">{alert.text}</p>
              <button
                type="button"
                onClick={() => { dismissAlert(alert.orderNumber); openAdminOrderDetails(alert.orderNumber); window.scrollTo({ top: 0 }); }}
                className="shrink-0 min-h-11 px-2 text-sm font-bold text-brand underline underline-offset-[3px] cursor-pointer"
              >
                View<span className="sr-only"> order {alert.orderNumber}</span>
              </button>
              <button type="button" onClick={() => dismissAlert(alert.orderNumber)} className={`w-10 h-10 shrink-0 ${iconButton}`} aria-label={`Close the alert for order ${alert.orderNumber}`}>
                <X className="w-4 h-4" strokeWidth={THIN} />
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};
