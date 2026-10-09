import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Heart, Home, LayoutGrid, ShoppingBag, User, type LucideIcon } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { nextPageChangePlain } from '../utils/pageTransition';

type Tab = 'home' | 'shop' | 'wishlist' | 'cart' | 'account';

// The bar's outline: a round-cornered bar whose top edge swells up by `rise` around `x` (the current tab)
const BAR_TOP = 26;
const BAR_RADIUS = 26;
const BUMP_HALF = 50;
const BUMP_RISE = 24;
const barPath = (width: number, height: number, x: number, rise: number) => {
  const r = BAR_RADIUS;
  const top = BAR_TOP;
  const a = Math.max(r, x - BUMP_HALF);
  const b = Math.min(width - r, x + BUMP_HALF);
  return `M${r},${top} L${a},${top} C${a + 22},${top} ${x - 30},${top - rise} ${x},${top - rise} C${x + 30},${top - rise} ${b - 22},${top} ${b},${top} L${width - r},${top} Q${width},${top} ${width},${top + r} L${width},${height - r} Q${width},${height} ${width - r},${height} L${r},${height} Q0,${height} 0,${height - r} L0,${top + r} Q0,${top} ${r},${top} Z`;
};

/**
 * Phone navigation (owner's pick 2, 2026-10-08, "rising bump"): a floating white bar with a thin warm line, a
 * little above the bottom edge. The bar itself swells up around the current tab and an emerald bubble with that tab's ivory icon sits in the
 * swell; when the tab changes, the swell and the bubble glide across together. Five items with their names
 * always shown: Home, Shop, Wishlist, Bag, Account. The bag and the wishlist carry their real counts.
 * On a page that is none of the five (a policy page, say) the bar is flat and no bubble shows.
 */
export const MobileAppNavbar: React.FC = () => {
  const {
    activePage,
    setActivePage,
    isSearchOpen,
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    cartCount,
    wishlist,
  } = useShop();
  const { user } = useAuth();
  const { routeState } = useRouter();

  // When the bag count goes up, the bag icon jumps once and the new count rises in
  const [bumped, setBumped] = useState(false);
  const lastCount = useRef(cartCount);
  useEffect(() => {
    const before = lastCount.current;
    lastCount.current = cartCount;
    if (!(cartCount > before)) return;
    setBumped(true);
    const timer = setTimeout(() => setBumped(false), 520);
    return () => clearTimeout(timer);
  }, [cartCount]);

  const idle = !isSearchOpen && !isCartDrawerOpen;
  const bagActive = !isSearchOpen && isCartDrawerOpen;
  const tabs: Array<{ id: Tab; label: string; icon: LucideIcon; active: boolean; count?: number; dot?: boolean }> = [
    { id: 'home', label: 'Home', icon: Home, active: idle && activePage === 'home' },
    { id: 'shop', label: 'Shop', icon: LayoutGrid, active: idle && activePage === 'shop' },
    { id: 'wishlist', label: 'Wishlist', icon: Heart, active: idle && activePage === 'wishlist', count: wishlist.length },
    { id: 'cart', label: 'Bag', icon: ShoppingBag, active: bagActive, count: cartCount },
    { id: 'account', label: user ? 'Account' : 'Sign in', icon: User, active: idle && (activePage === 'account' || activePage === 'login'), dot: Boolean(user) },
  ];
  const activeIndex = tabs.findIndex((tab) => tab.active);
  // Hidden in the admin panel. The product page, the bag page and checkout have their own bottom bars,
  // and only one fixed bar shows at a time.
  const hidden = routeState.customerRoute === 'admin' || activePage === 'admin' || activePage === 'product-detail' || activePage === 'checkout' || activePage === 'cart';

  // The swell and the bubble follow the current tab: x is where they are now, rise how far the swell stands up
  const navRef = useRef<HTMLElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const motion = useRef({ x: -1, rise: 0, frame: 0 });
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (hidden || !nav) return undefined;
    const state = motion.current;
    const target = () => {
      const width = nav.clientWidth;
      return { x: activeIndex < 0 ? (state.x < 0 ? width / 2 : state.x) : (width / tabs.length) * (activeIndex + 0.5), rise: activeIndex < 0 ? 0 : BUMP_RISE };
    };
    const draw = () => {
      pathRef.current?.setAttribute('d', barPath(nav.clientWidth, nav.clientHeight, state.x, state.rise));
      if (bubbleRef.current) {
        bubbleRef.current.style.transform = `translate3d(${state.x}px, ${(BUMP_RISE - state.rise) * 0.6}px, 0)`;
        bubbleRef.current.style.opacity = String(Math.min(1, state.rise / (BUMP_RISE * 0.6)));
      }
    };
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const jump = () => { const to = target(); state.x = to.x; state.rise = to.rise; draw(); };
    const step = () => {
      const to = target();
      state.x += (to.x - state.x) * 0.18;
      state.rise += (to.rise - state.rise) * 0.2;
      if (Math.abs(to.x - state.x) < 0.3 && Math.abs(to.rise - state.rise) < 0.3) { state.x = to.x; state.rise = to.rise; state.frame = 0; draw(); return; }
      draw();
      state.frame = requestAnimationFrame(step);
    };
    if (state.x < 0 || still) jump();
    else if (!state.frame) state.frame = requestAnimationFrame(step);
    // Only a real change of the bar's width redraws at once. (An observer also reports once when it starts
    // watching: that first report must not cut the glide short.)
    let seenWidth = nav.clientWidth;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      if (nav.clientWidth === seenWidth) return;
      seenWidth = nav.clientWidth;
      if (state.frame) { cancelAnimationFrame(state.frame); state.frame = 0; }
      jump();
    }) : null;
    observer?.observe(nav);
    return () => { observer?.disconnect(); if (state.frame) { cancelAnimationFrame(state.frame); state.frame = 0; } };
  }, [activeIndex, hidden, tabs.length]);

  if (hidden) return null;

  const go = (tab: Tab) => {
    if (tab === 'cart') { setIsCartDrawerOpen(true); return; }
    // setActivePage changes the URL inside the page transition. From this bar the change is a plain one (the
    // new page rises in by itself), so the bubble is seen gliding to the tapped tab while the page changes.
    nextPageChangePlain();
    setActivePage(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const current = activeIndex >= 0 ? tabs[activeIndex] : null;
  const CurrentIcon = current?.icon;

  return (
    <nav
      ref={navRef}
      id="mobile-app-bottom-navbar"
      aria-label="Mobile navigation"
      className="sag-blobnav md:hidden fixed bottom-[calc(10px+env(safe-area-inset-bottom))] left-3 right-3 z-[45] mx-auto h-[92px] max-w-md select-none pointer-events-none"
    >
      <div className="sag-blobnav-blur absolute inset-x-0 bottom-0 top-[26px]" aria-hidden="true" />
      <svg className="sag-blobnav-shape absolute inset-0 h-full w-full overflow-visible" aria-hidden="true" focusable="false">
        <path ref={pathRef} />
      </svg>

      {/* The emerald bubble that rides in the swell, with the current tab's icon and its real count */}
      <div ref={bubbleRef} aria-hidden="true" className="absolute left-0 top-[2px] -ml-[25px] flex h-[50px] w-[50px] items-center justify-center rounded-full bg-brand text-[color:var(--sag-on-gold)] opacity-0 will-change-transform">
        {CurrentIcon && (
          <span className="relative flex">
            <CurrentIcon className={`h-[22px] w-[22px] ${current?.id === 'cart' && bumped ? 'sag-bump' : ''}`} strokeWidth={1.6} />
            {Boolean(current?.count) && (
              <span className="sag-num absolute -top-[6px] -right-[9px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[color:var(--sag-on-gold)] px-[3px] text-[10px] font-semibold leading-none text-brand">
                {current!.count! > 99 ? '99+' : current!.count}
              </span>
            )}
          </span>
        )}
      </div>

      <div className="pointer-events-auto absolute inset-x-0 bottom-0 grid h-[66px] grid-cols-5 px-1">
        {tabs.map(({ id, label, icon: Icon, active, count, dot }) => (
          <button
            key={id}
            type="button"
            id={`mobile-nav-${id === 'shop' ? 'categories' : id}`}
            onClick={() => go(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={count ? `${label}, ${count} ${count === 1 ? 'item' : 'items'}` : label}
            className={`flex min-w-0 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-lg transition-colors ${active ? 'text-brand' : 'text-ink-muted'}`}
          >
            {/* The current tab's icon has moved up into the bubble; its place is kept so the name does not jump */}
            <span className={`relative flex transition-[opacity,transform] duration-300 ${active ? '-translate-y-3 opacity-0' : ''}`}>
              <Icon className={`h-5 w-5 ${id === 'cart' && bumped && !active ? 'sag-bump' : ''}`} strokeWidth={1.5} aria-hidden="true" />
              {Boolean(count) && (
                <span className="sag-num absolute -top-[5px] -right-[8px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-brand px-[3px] text-[10px] font-semibold leading-none text-[color:var(--sag-on-gold)]">
                  <span key={count} className={id === 'cart' && bumped ? 'sag-settle' : undefined}>{count! > 99 ? '99+' : count}</span>
                </span>
              )}
              {dot && <span className="absolute -bottom-0.5 -right-1 h-[7px] w-[7px] rounded-full bg-brand" />}
            </span>
            <span className={`whitespace-nowrap text-[10.5px] leading-3 tracking-[0.03em] transition-transform duration-300 ${active ? 'translate-y-[7px] font-semibold' : 'font-normal'}`}>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
