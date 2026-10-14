import { WOMEN_CATEGORY_NAMES } from '../../data/womenCategories';
import { refundsToDo } from './orderMoney';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import {
  type LucideIcon,
  LayoutDashboard,
  Package,
  PlusCircle,
  ShoppingBag,
  Tag,
  LogOut,
  Store,
  Menu,
  X,
  Bell,
  ExternalLink,
  PanelLeftClose,
  PanelLeft,
  Volume2,
  VolumeX,
  Search,
  Keyboard,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { AdminSearch, type AdminCommand } from './AdminSearch';
import { useNewOrderAlerts } from './adminAlerts';
import { AdminTab } from '../../types';
import { returnRows } from './AdminReturns';
import { waitingCancelRows } from './AdminCancellations';
import { isLowStock } from '../../utils/inventory';
import { useLiveCount } from './AdminLive';
import { NAV_GROUPS, NAV_SPECS, type NavGroup, type NavId, crumbsFor, navIdForPath, navSpec, rememberPage, useRecentPages, useStoredFlag, isTypingTarget } from './adminNav';
import { NotificationCentre, useAdminNotes } from './AdminNotifications';
import { ShortcutSheet, useAdminShortcuts } from './AdminShortcuts';
import { AdminToastHost } from './adminToast';

/**
 * The admin's frame: an ink sidebar with live counts (folds to icons, remembered), a top bar with where you are
 * (breadcrumbs), search and actions (Ctrl K), the sound switch and the notification centre, and on a phone a bottom
 * bar with big targets (Home, Orders, the round "+", Products, Menu) and a full menu drawer. Keyboard shortcuts
 * and their "?" sheet live here too. Every count is from the live orders and catalogue.
 */

interface AdminLayoutProps {
  children: React.ReactNode;
}

// Thin outline icons everywhere in the admin shell
const THIN = 1.75;

interface NavItem {
  id: NavId;
  label: string;
  route: string;
  icon: LucideIcon;
  group: NavGroup;
  badge?: number;
  alert?: boolean;
  live?: number | null;
}

// Pages with their own bar fixed at the bottom of a phone screen: the bottom bar steps aside there
const OWN_BOTTOM_BAR = (path: string) => path === '/admin/products/new' || (path.startsWith('/admin/products/') && path.endsWith('/edit')) || path === '/admin/payments';

const Monogram: React.FC<{ size?: string; onInk?: boolean }> = ({ size = 'w-9 h-9 text-[13px]', onInk }) => (
  <div className={`${size} shrink-0 rounded-full flex items-center justify-center font-extrabold tracking-[0.02em] ${onInk ? 'bg-page text-[color:var(--aura-ink)]' : 'bg-brand'}`} aria-hidden="true">
    SA
  </div>
);

/** A number that bumps once when it changes (the key re-mounts it). */
const Count: React.FC<{ n: number; className: string; label?: string }> = ({ n, className, label }) => (
  <span key={n} className={`adm-count adm-bump ${className}`} aria-label={label}>{n > 99 ? '99+' : n}</span>
);

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
  const { currentPath, activeAdminTab, openAdminTab, openAdminProductNew, openAdminProductEdit, openAdminOrderDetails, navigate } = useRouter();
  // A newly paid order while the panel is open: a toast, the tab title, and the chime when switched on
  const { alerts: orderAlerts, dismissAlert, soundOn, setSoundOn } = useNewOrderAlerts(orders, ordersLoaded);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useStoredFlag('sag_admin_side_folded', false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  // People on the site right now: the dashboard's own live loop shares it while the dashboard is open (null otherwise)
  const liveCount = useLiveCount();
  const recent = useRecentPages();

  const pendingOrdersCount = orders.filter((o) => o.paymentStatus === 'Paid' && (o.status === 'Processing' || o.status === 'Packed')).length;
  const lowStockCount = products.filter((p) => isLowStock(p, lowStockThreshold)).length;
  // Return / exchange requests waiting for the admin's decision (orders are a live listener, so this is live)
  const rows = returnRows(orders);
  const waitingReturns = rows.filter((r) => r.state === 'requested');
  // Cancellation requests not answered yet have their own page and badge
  const waitingCancels = waitingCancelRows(orders);
  const refunds = refundsToDo(orders);
  const waitingRequests = waitingReturns.length + waitingCancels.length;
  const { notes, unread, seen, markRead } = useAdminNotes(orders, products, lowStockThreshold);

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

  // The menu, built from the one map of the admin (adminNav.ts) with the live counts added
  const counts: Partial<Record<NavId, { badge?: number; alert?: boolean; live?: number | null }>> = {
    dashboard: { live: liveCount },
    orders: { badge: pendingOrdersCount, alert: pendingOrdersCount > 0 },
    returns: { badge: waitingReturns.length, alert: waitingReturns.length > 0 },
    cancellations: { badge: waitingCancels.length + refunds.length, alert: waitingCancels.length + refunds.length > 0 },
    reviews: { badge: reviews.length },
    // Products = outfits only (accessories have their own section)
    products: { badge: products.filter((p) => p.productType !== 'accessory').length },
    categories: { badge: new Set([...WOMEN_CATEGORY_NAMES, ...categories.map((c) => String(c.name))]).size },
    coupons: { badge: coupons.length },
  };
  const navItems: NavItem[] = NAV_SPECS.map((spec) => ({ id: spec.id, label: spec.label, route: spec.route, icon: spec.icon, group: spec.group, ...(counts[spec.id] || {}) }));

  const handleNavClick = useCallback((tabId: NavId | string) => {
    if (tabId === 'add-product') {
      openAdminProductNew();
    } else {
      openAdminTab(tabId as AdminTab);
    }
    setMobileSidebarOpen(false);
    setPlusOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [openAdminProductNew, openAdminTab]);

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

  const currentNav = navIdForPath(currentPath, activeAdminTab);
  const isItemActive = (id: NavId) => id === currentNav;

  // Where you are: Group › Page › the order or product that is open
  const detailName = useMemo(() => {
    if (currentPath.startsWith('/admin/orders/') && currentPath !== '/admin/orders') return `Order ${decodeURIComponent(currentPath.replace('/admin/orders/', ''))}`;
    if (currentPath.startsWith('/admin/products/') && currentPath.endsWith('/edit')) {
      const id = currentPath.split('/')[3];
      return products.find((p) => p.id === id)?.name || 'Edit product';
    }
    return undefined;
  }, [currentPath, products]);
  const crumbs = crumbsFor(currentPath, activeAdminTab, detailName);
  const pageLabel = crumbs[crumbs.length - 1]?.label || 'Dashboard';

  // Recent pages (for the command palette), this browser only
  useEffect(() => {
    if (!currentPath.startsWith('/admin')) return;
    const spec = navSpec(currentNav);
    if (detailName && currentPath.startsWith('/admin/orders/')) {
      const number = decodeURIComponent(currentPath.replace('/admin/orders/', ''));
      const order = orders.find((o) => o.orderNumber === number);
      rememberPage({ path: currentPath, label: detailName, note: order?.customerName ? `Order · ${order.customerName}` : 'Order' });
    } else if (detailName) {
      rememberPage({ path: currentPath, label: detailName, note: 'Edit product' });
    } else if (spec) {
      rememberPage({ path: spec.route, label: spec.label, note: spec.group });
    }
    // Names may arrive after the page: remember again once they do
  }, [currentPath, detailName]);

  // The phone menu closes with Escape and does not let the page scroll behind it
  useEffect(() => {
    if (!mobileSidebarOpen && !plusOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMobileSidebarOpen(false); setPlusOpen(false); } };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    if (mobileSidebarOpen) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [mobileSidebarOpen, plusOpen]);

  // Menus and panels close when the page changes
  useEffect(() => { setMobileSidebarOpen(false); setPlusOpen(false); setNotesOpen(false); }, [currentPath]);

  // On a phone the bottom bar steps aside while the keyboard is up (a field has the focus)
  useEffect(() => {
    const onIn = (e: FocusEvent) => setTyping(isTypingTarget(e.target) && (e.target as HTMLElement).closest?.('main') !== null);
    const onOut = () => setTyping(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); };
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    showToast(next
      ? 'Sound for new orders is on. You will hear a soft chime while the admin is open in this browser.'
      : 'Sound for new orders is off.', 'info');
  };
  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);

  useAdminShortcuts({
    goTo: (id) => handleNavClick(id),
    newProduct: () => handleNavClick('add-product'),
    newCoupon: () => handleNavClick('coupons'),
    notifications: () => setNotesOpen(true),
    toggleSidebar,
    help: () => setKeysOpen(true),
  });

  const goToNote = (target: { tab?: string; order?: string; product?: string }) => {
    if (target.order) openAdminOrderDetails(target.order);
    else if (target.product) openAdminProductEdit(target.product);
    else if (target.tab) openAdminTab(target.tab);
    window.scrollTo({ top: 0 });
  };

  // What the command palette can do besides searching
  const commands: AdminCommand[] = [
    { id: 'add-product', label: 'Add a product', note: 'Opens the new product form', icon: PlusCircle, keys: 'N P', words: 'new upload', run: () => handleNavClick('add-product') },
    { id: 'new-coupon', label: 'New coupon', note: 'Opens Coupons', icon: Tag, keys: 'N C', words: 'discount code offer', run: () => handleNavClick('coupons') },
    { id: 'to-pack', label: `Orders to pack and ship (${pendingOrdersCount})`, note: 'Opens Orders', icon: ShoppingBag, keys: 'G O', words: 'pack ship pending', run: () => handleNavClick('orders') },
    { id: 'notes', label: `Notifications (${unread.length} unread)`, note: `${notes.length} things waiting`, icon: Bell, keys: 'I', words: 'alerts inbox requests', run: () => setNotesOpen(true) },
    { id: 'store', label: 'View the store', note: 'What customers see', icon: Store, words: 'storefront website shop', run: handleViewStorefront },
    { id: 'sound', label: soundOn ? 'Switch off the sound for new orders' : 'Switch on the sound for new orders', icon: soundOn ? VolumeX : Volume2, words: 'chime alert audio', run: toggleSound },
    { id: 'keys', label: 'Keyboard shortcuts', icon: Keyboard, keys: '?', words: 'keys help', run: () => setKeysOpen(true) },
    { id: 'fold', label: isSidebarCollapsed ? 'Unfold the sidebar' : 'Fold the sidebar', icon: isSidebarCollapsed ? PanelLeft : PanelLeftClose, keys: '[', words: 'menu collapse expand', run: toggleSidebar },
    { id: 'logout', label: 'Sign out of the admin', icon: LogOut, words: 'logout exit', run: handleLogout },
  ];
  const searchPages = NAV_SPECS.map((s) => ({ id: s.id, label: s.label, group: s.group, words: s.words, icon: s.icon, keyHint: s.key }));

  const iconButton = 'rounded-full flex items-center justify-center text-ink hover:bg-[color:var(--adm-hover)] transition-colors cursor-pointer';
  // Quick actions: a white pill with its words on wide screens, the icon alone below that
  const quickPill = 'shrink-0 w-10 h-10 2xl:w-auto 2xl:px-3.5 rounded-full bg-surface shadow-[var(--adm-lift)] hover:bg-[color:var(--adm-hover)] text-ink text-[13px] leading-[18px] font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer';
  const quickActions: Array<{ id: string; label: string; title: string; icon: LucideIcon; run: () => void }> = [
    { id: 'admin-quick-add-product', label: 'Add product', title: 'Add a new product (N then P)', icon: PlusCircle, run: () => handleNavClick('add-product') },
    { id: 'admin-quick-new-coupon', label: 'New coupon', title: 'Open Coupons to add a coupon (N then C)', icon: Tag, run: () => handleNavClick('coupons') },
    { id: 'admin-view-storefront-btn', label: 'View store', title: 'Open the store your customers see', icon: Store, run: handleViewStorefront },
  ];

  // The folded sidebar names each entry in a tip beside it (fixed, so the scrolling list never cuts it off)
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const tipHandlers = (label: string) => {
    const show = (e: React.SyntheticEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ label, top: r.top + r.height / 2 });
    };
    return { onMouseEnter: show, onFocus: show, onMouseLeave: () => setTip(null), onBlur: () => setTip(null) };
  };
  useEffect(() => { setTip(null); }, [isSidebarCollapsed, currentPath]);

  const renderNav = (collapsed: boolean, withIds: boolean) => (
    <nav className={collapsed ? 'space-y-2 px-3' : 'space-y-4 px-3'} aria-label="Admin sections">
      {NAV_GROUPS.map((group, groupIndex) => {
        const items = navItems.filter((item) => item.group === group);
        return (
          <div key={group} role="group" aria-label={group}>
            {collapsed ? (
              groupIndex > 0 && <div className="mx-auto mb-2 h-px w-6 bg-[#2E2B31]" />
            ) : (
              <div className="px-3 pb-1 text-[10.5px] leading-4 font-bold uppercase tracking-[0.16em] text-[#8E877F]">
                {group}
              </div>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = isItemActive(item.id);
                return (
                  <button
                    key={item.id}
                    id={withIds ? `admin-nav-${item.id}` : undefined}
                    onClick={() => handleNavClick(item.id)}
                    {...(collapsed ? tipHandlers(`${item.label}${item.badge !== undefined && item.alert ? ` · ${item.badge} waiting` : ''}${typeof item.live === 'number' ? ` · ${item.live} live` : ''}`) : {})}
                    className={`adm-nav-btn w-full flex items-center ${collapsed ? 'justify-center h-10' : `justify-between pl-3 pr-2 ${withIds ? 'h-9' : 'h-12'}`} rounded-full text-sm transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-page text-[color:var(--aura-ink)] font-bold'
                        : 'text-on-dark font-medium hover:bg-[#25232A]'
                    }`}
                    aria-label={collapsed ? `${item.label}${item.alert && item.badge ? `, ${item.badge} waiting` : ''}` : undefined}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className="w-[17px] h-[17px] shrink-0" strokeWidth={THIN} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </span>
                    {!collapsed && typeof item.live === 'number' && (
                      <span className={`ml-2 inline-flex items-center gap-1.5 text-xs leading-4 font-semibold tabular-nums ${isActive ? 'text-[color:var(--aura-ink)]' : 'text-highlight'}`} title="People on the site right now" aria-label={`${item.live} on the site right now`}>
                        <span className={`adm-dot-live ${isActive ? 'text-accent' : 'text-highlight'}`} aria-hidden="true"><i />{item.live > 0 && <i />}</span>
                        {item.live} live
                      </span>
                    )}
                    {!collapsed && item.badge !== undefined && (
                      item.alert
                        ? <Count n={item.badge} className={isActive ? 'bg-accent text-ink' : 'bg-accent text-ink'} label={`${item.badge} waiting`} />
                        : <span className={`ml-2 text-xs leading-4 tabular-nums ${isActive ? 'text-ink-muted font-semibold' : 'text-[#8E877F]'}`}>{item.badge}</span>
                    )}
                    {collapsed && item.alert && (
                      <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-accent ring-2 ring-[#111013]" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const hideTabbar = OWN_BOTTOM_BAR(currentPath);
  const tabs: Array<{ id: string; label: string; icon: LucideIcon; current: boolean; badge?: number; live?: number | null; run: () => void; plus?: boolean; aria?: string }> = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard, current: currentNav === 'dashboard', live: liveCount, run: () => handleNavClick('dashboard') },
    { id: 'orders', label: 'Orders', icon: ShoppingBag, current: currentNav === 'orders', badge: pendingOrdersCount, run: () => handleNavClick('orders') },
    { id: 'plus', label: 'Add', icon: Plus, current: false, plus: true, run: () => setPlusOpen((v) => !v), aria: 'Quick actions: add a product, a coupon and more' },
    { id: 'products', label: 'Products', icon: Package, current: currentNav === 'products' || currentNav === 'add-product', run: () => handleNavClick('products') },
    { id: 'menu', label: 'Menu', icon: Menu, current: mobileSidebarOpen, badge: waitingRequests + refunds.length, run: () => setMobileSidebarOpen(true), aria: 'Open the full admin menu' },
  ];

  return (
    <div id="admin-layout" className={`min-h-screen lg:flex font-sans text-ink ${hideTabbar ? 'adm-no-tabbar' : ''}`}>

      {/* Desktop sidebar: the whole height, ink, folds to icons (remembered in this browser) */}
      <aside className={`adm-side hidden lg:flex flex-col shrink-0 sticky top-0 h-screen z-30 transition-[width] duration-200 ${isSidebarCollapsed ? 'w-[76px]' : 'w-[252px]'}`}>
        <div className={`flex items-center gap-2.5 h-[64px] shrink-0 ${isSidebarCollapsed ? 'justify-center px-2' : 'px-5'}`}>
          <button type="button" onClick={() => handleNavClick('dashboard')} className="shrink-0 cursor-pointer rounded-full" aria-label="Open the dashboard">
            <Monogram onInk />
          </button>
          {!isSidebarCollapsed && (
            <div className="min-w-0 text-left">
              <h1 className="font-display text-[17px] leading-5 text-on-dark truncate">Suit Aura Girls</h1>
              <span className="block text-[10.5px] leading-4 font-bold uppercase tracking-[0.16em] text-[#8E877F] truncate">Store admin</span>
            </div>
          )}
        </div>

        <div className={`shrink-0 pb-3 ${isSidebarCollapsed ? 'px-3' : 'px-4'}`}>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={`adm-nav-btn w-full h-10 rounded-full bg-[#1E1C22] hover:bg-[#25232A] text-[#BDB6AD] text-[13px] inline-flex items-center gap-2 cursor-pointer transition-colors ${isSidebarCollapsed ? 'justify-center' : 'pl-3 pr-2'}`}
            aria-label="Search everything and run actions"
          >
            <Search className="w-4 h-4 shrink-0" strokeWidth={THIN} aria-hidden="true" />
            {!isSidebarCollapsed && <><span className="flex-1 text-left truncate">Search & actions</span><kbd className="adm-kbd">/</kbd></>}
            {isSidebarCollapsed && <span className="adm-tip" aria-hidden="true">Search & actions · /</span>}
          </button>
        </div>

        <div className="adm-side-scroll flex-1 min-h-0 pb-3 overflow-y-auto overscroll-contain" onScroll={() => setTip(null)}>
          {renderNav(isSidebarCollapsed, true)}
        </div>
        {isSidebarCollapsed && tip && (
          <span className="adm-tip !opacity-100 !fixed !left-[86px]" style={{ top: tip.top, transform: 'translate3d(0, -50%, 0)' }} aria-hidden="true">{tip.label}</span>
        )}

        <div className={`shrink-0 border-t border-[#2E2B31] py-2.5 ${isSidebarCollapsed ? 'px-3 space-y-1' : 'px-3'}`}>
          {!isSidebarCollapsed && (
            <div className="px-3 pb-2">
              <p className="text-[10.5px] leading-4 font-bold uppercase tracking-[0.16em] text-[#8E877F]">Signed in</p>
              <p className="text-[13px] leading-[18px] text-on-dark truncate" title={adminEmail || 'Store admin'}>{adminEmail || 'Store admin'}</p>
            </div>
          )}
          <div className={isSidebarCollapsed ? 'space-y-1' : 'flex items-center gap-1'}>
            <button
              id="admin-sidebar-logout-btn"
              onClick={handleLogout}
              className={`adm-nav-btn h-10 flex items-center rounded-full ${isSidebarCollapsed ? 'w-full justify-center' : 'flex-1 gap-3 pl-3 pr-3'} text-sm font-medium text-on-dark hover:bg-[#25232A] transition-colors cursor-pointer`}
              title={isSidebarCollapsed ? undefined : 'Logout'}
              aria-label="Logout"
            >
              <LogOut className="w-[17px] h-[17px]" strokeWidth={THIN} />
              {!isSidebarCollapsed && <span>Logout</span>}
              {isSidebarCollapsed && <span className="adm-tip" aria-hidden="true">Logout</span>}
            </button>
            <button
              onClick={toggleSidebar}
              className={`adm-nav-btn h-10 ${isSidebarCollapsed ? 'w-full' : 'w-10'} flex items-center justify-center rounded-full text-[#BDB6AD] hover:text-on-dark hover:bg-[#25232A] transition-colors cursor-pointer`}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeft className="w-[18px] h-[18px]" strokeWidth={THIN} /> : <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={THIN} />}
              <span className="adm-tip" aria-hidden="true">{isSidebarCollapsed ? 'Unfold the sidebar' : 'Fold the sidebar'} · [</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top bar: where you are, search and actions, sound, shortcuts and notifications */}
        <header className="adm-top sticky top-0 z-30">
          <div className="max-w-[1400px] mx-auto pl-1.5 pr-1.5 sm:px-6 lg:px-8 h-[60px] lg:h-[64px] flex items-center justify-between gap-2 sm:gap-3">

            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              <button
                onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                className={`lg:hidden w-11 h-11 shrink-0 ${iconButton}`}
                aria-label="Toggle mobile admin sidebar"
                aria-expanded={mobileSidebarOpen}
              >
                {mobileSidebarOpen ? <X className="w-5 h-5" strokeWidth={THIN} /> : <Menu className="w-5 h-5" strokeWidth={THIN} />}
              </button>

              {/* Phones and tablets: the store's name over the page you are on */}
              <div className="lg:hidden min-w-0 pl-0.5">
                <h1 className="text-[10.5px] leading-[14px] font-bold uppercase tracking-[0.16em] text-ink-muted truncate">Suit Aura Girls</h1>
                <p className="text-[17px] leading-[22px] font-extrabold tracking-[-0.02em] text-ink truncate">{pageLabel}</p>
              </div>

              {/* Computers: the breadcrumbs */}
              <nav aria-label="You are here" className="hidden lg:block min-w-0">
                <ol className="flex items-center gap-1.5 text-[13.5px] leading-5 min-w-0">
                  {crumbs.map((crumb, i) => {
                    const last = i === crumbs.length - 1;
                    return (
                      <li key={`${crumb.label}-${i}`} className={`flex items-center gap-1.5 min-w-0 ${last ? '' : 'shrink-0'}`}>
                        {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-ink-faint shrink-0" strokeWidth={THIN} aria-hidden="true" />}
                        {crumb.path && !last ? (
                          <button type="button" onClick={() => navigate(crumb.path!)} className="text-ink-muted hover:text-ink underline-offset-[3px] hover:underline cursor-pointer whitespace-nowrap">{crumb.label}</button>
                        ) : (
                          <span className={last ? 'font-bold text-ink truncate' : 'text-ink-muted whitespace-nowrap'} aria-current={last ? 'page' : undefined}>{crumb.label}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </div>

            <div className="flex items-center gap-0.5 sm:gap-2 shrink-0">

              <AdminSearch
                pages={searchPages}
                onOpenPage={(id) => handleNavClick(id as NavId)}
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                commands={commands}
                recent={recent}
                onOpenPath={(path) => navigate(path)}
              />

              {/* Quick actions (on phones they are behind the round "+" of the bottom bar) */}
              <div className="hidden sm:flex items-center gap-1.5">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button key={action.id} id={action.id} type="button" onClick={action.run} className={quickPill} title={action.title} aria-label={action.label}>
                      <Icon className="w-4 h-4 shrink-0" strokeWidth={THIN} aria-hidden="true" />
                      <span className="hidden 2xl:inline">{action.label}</span>
                      {action.label === 'View store' && <ExternalLink className="w-3.5 h-3.5 hidden 2xl:inline text-ink-muted" strokeWidth={THIN} aria-hidden="true" />}
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
                className={`shrink-0 w-11 h-11 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer hover:bg-[color:var(--adm-hover)] ${soundOn ? 'text-ink' : 'text-ink-muted'}`}
              >
                {soundOn ? <Volume2 className="w-5 h-5 shrink-0" strokeWidth={THIN} aria-hidden="true" /> : <VolumeX className="w-5 h-5 shrink-0" strokeWidth={THIN} aria-hidden="true" />}
              </button>

              <button
                type="button"
                onClick={() => setKeysOpen(true)}
                className={`hidden lg:flex w-11 h-11 shrink-0 ${iconButton}`}
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts ( ? )"
              >
                <Keyboard className="w-5 h-5" strokeWidth={THIN} aria-hidden="true" />
              </button>

              <button
                id="admin-notifications-btn"
                onClick={() => setNotesOpen((v) => !v)}
                className={`w-11 h-11 shrink-0 relative ${iconButton} ${notesOpen ? 'bg-[color:var(--adm-hover)]' : ''}`}
                title={`Notifications: ${unread.length} unread · ${pendingOrdersCount} to pack and ship · ${waitingRequests} requests · ${refunds.length} refunds · ${lowStockCount} low on stock`}
                aria-label="Notifications"
                aria-haspopup="dialog"
                aria-expanded={notesOpen}
              >
                <Bell className="w-5 h-5" strokeWidth={THIN} />
                {unread.length > 0 ? (
                  <span key={unread.length} className="adm-bump absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-ink text-[11px] leading-[18px] font-bold tabular-nums text-center ring-2 ring-[#F5F2EC]" aria-label={`${unread.length} unread notifications`}>{unread.length > 99 ? '99+' : unread.length}</span>
                ) : (pendingOrdersCount > 0 || waitingRequests > 0) && (
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
                )}
              </button>

            </div>
          </div>
        </header>

        <main className={`flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 ${hideTabbar ? 'pb-6' : 'pb-[calc(88px+env(safe-area-inset-bottom))]'} lg:pb-10`}>
          {/* A page arrives with a short fade (the key starts it again on every page change) */}
          <div key={currentPath} className="adm-enter space-y-5">
            {children}
          </div>
        </main>
      </div>

      {/* Phone and tablet: the bottom bar, five big targets */}
      {!hideTabbar && (
        <nav className={`adm-tabbar lg:hidden ${typing ? 'is-away' : ''}`} aria-label="Quick admin pages">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            if (tab.plus) {
              return (
                <div key={tab.id} className="flex justify-center">
                  <button type="button" onClick={tab.run} aria-expanded={plusOpen} aria-haspopup="menu" aria-label={tab.aria} className="adm-tab-plus cursor-pointer">
                    <Icon className="w-6 h-6" strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              );
            }
            return (
              <button key={tab.id} type="button" onClick={tab.run} aria-current={tab.current && tab.id !== 'menu' ? 'page' : undefined} aria-label={tab.aria} className="adm-tab">
                <span className="adm-tab-ic">
                  <Icon className="w-[21px] h-[21px]" strokeWidth={tab.current ? 2 : THIN} aria-hidden="true" />
                  {tab.badge ? <span key={tab.badge} className="adm-tab-n adm-bump" aria-label={`${tab.badge} waiting`}>{tab.badge > 99 ? '99+' : tab.badge}</span> : null}
                  {typeof tab.live === 'number' && tab.live > 0 && <span className="absolute top-0.5 right-3 inline-flex text-accent" aria-label={`${tab.live} on the site right now`}><span className="adm-dot-live" aria-hidden="true"><i /><i /></span></span>}
                </span>
                <span className="truncate max-w-full px-0.5">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* The round "+": the jobs done most, one tap away */}
      {plusOpen && (
        <div className="fixed inset-0 z-[45] lg:hidden bg-[color:var(--sag-scrim)] adm-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) setPlusOpen(false); }}>
          <div role="menu" aria-label="Quick actions" className="adm-dialog adm-sheet-in absolute left-3 right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] rounded-[24px] p-2">
            {[
              { label: 'Add a product', note: 'Photos, price, sizes', icon: PlusCircle, run: () => handleNavClick('add-product') },
              { label: 'New coupon', note: 'Opens Coupons', icon: Tag, run: () => handleNavClick('coupons') },
              { label: 'Search everything', note: 'Orders, customers, products, coupons', icon: Search, run: () => { setPlusOpen(false); setPaletteOpen(true); } },
              { label: 'Notifications', note: `${unread.length} unread · ${notes.length} waiting`, icon: Bell, run: () => { setPlusOpen(false); setNotesOpen(true); } },
              { label: 'View the store', note: 'What customers see', icon: Store, run: handleViewStorefront },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.label} role="menuitem" type="button" onClick={item.run} className="w-full min-h-[58px] px-3 py-2 rounded-[16px] flex items-center gap-3 text-left hover:bg-[color:var(--adm-hover)] active:bg-[color:var(--adm-hover)] cursor-pointer">
                  <span className="w-10 h-10 shrink-0 rounded-full bg-[color:var(--adm-hover)] text-ink flex items-center justify-center" aria-hidden="true"><Icon className="w-5 h-5" strokeWidth={THIN} /></span>
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-5 font-bold text-ink">{item.label}</span>
                    <span className="block text-[13px] leading-[18px] text-ink-muted truncate">{item.note}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Phone menu: the full list of pages with their counts */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden bg-[color:var(--sag-scrim)] flex adm-fade-in" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="adm-side adm-drawer-in w-[88vw] max-w-[340px] h-full rounded-r-[28px] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pl-4 pr-1.5 h-16 border-b border-[#2E2B31] shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Monogram onInk />
                <div className="min-w-0">
                  <h3 className="font-display text-[18px] leading-6 text-on-dark truncate">Suit Aura Girls</h3>
                  <p className="text-xs leading-4 text-on-dark-muted truncate">{adminEmail || 'Admin'}</p>
                </div>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-on-dark hover:bg-[#25232A] transition-colors cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" strokeWidth={THIN} />
              </button>
            </div>

            <div className="px-4 pt-3 shrink-0">
              <button type="button" onClick={() => { setMobileSidebarOpen(false); setPaletteOpen(true); }} className="w-full h-12 rounded-full bg-[#1E1C22] text-[#BDB6AD] text-[15px] inline-flex items-center gap-2.5 pl-4 pr-3 cursor-pointer">
                <Search className="w-[18px] h-[18px] shrink-0" strokeWidth={THIN} aria-hidden="true" />
                <span className="flex-1 text-left">Search everything</span>
              </button>
            </div>

            <div className="adm-side-scroll flex-1 overflow-y-auto overscroll-contain py-4">
              {renderNav(false, false)}
            </div>

            <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#2E2B31] flex gap-2 shrink-0">
              <button
                onClick={handleViewStorefront}
                className="flex-1 h-12 px-3 rounded-full bg-page text-[color:var(--aura-ink)] text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Store className="w-4 h-4" strokeWidth={THIN} /> View store
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 h-12 px-3 rounded-full border border-[#4A464E] text-on-dark text-sm font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-[#25232A] transition-colors"
              >
                <LogOut className="w-4 h-4" strokeWidth={THIN} /> Logout
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileSidebarOpen(false)} />
        </div>
      )}

      <NotificationCentre open={notesOpen} onClose={() => setNotesOpen(false)} notes={notes} seen={seen} markRead={markRead} onGo={goToNote} loaded={ordersLoaded} />
      <ShortcutSheet open={keysOpen} onClose={() => setKeysOpen(false)} />
      <AdminToastHost />

      {/* A newly paid order, announced once while the panel is open */}
      {orderAlerts.length > 0 && (
        <div className="fixed z-40 top-[68px] lg:top-[74px] right-3 left-3 sm:left-auto sm:w-[400px] space-y-2" role="status" aria-live="polite">
          {orderAlerts.map((alert) => (
            <div key={alert.orderNumber} className="adm-dialog adm-pop-in rounded-[20px] pl-4 pr-1.5 py-2 flex items-center gap-2.5">
              <span className="w-9 h-9 shrink-0 rounded-full bg-ok-tint text-ok flex items-center justify-center" aria-hidden="true"><ShoppingBag className="w-[17px] h-[17px]" strokeWidth={THIN} /></span>
              <p className="min-w-0 flex-1 text-sm leading-5 font-semibold text-ink break-words sag-num">{alert.text}</p>
              <button
                type="button"
                onClick={() => { dismissAlert(alert.orderNumber); openAdminOrderDetails(alert.orderNumber); window.scrollTo({ top: 0 }); }}
                className="shrink-0 h-10 px-3.5 rounded-full bg-brand text-sm font-bold cursor-pointer"
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
