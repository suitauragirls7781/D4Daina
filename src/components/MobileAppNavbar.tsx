import React, { useEffect, useRef, useState } from 'react';
import { Heart, Home, LayoutGrid, ShoppingBag, User, type LucideIcon } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';

type Tab = 'home' | 'shop' | 'wishlist' | 'cart' | 'account';

/**
 * Phone navigation (Midnight glass): a floating dark glass bar with round corners, a little above the bottom
 * edge. Five items with thin icons and small labels: Home, Shop, Wishlist, Bag, Account. The current one is
 * a gold pill with dark text, the others muted. The bag and the wishlist carry their real counts.
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

  // Hidden in the admin panel. The product page, the bag page and checkout have their own bottom bars,
  // and only one fixed bar shows at a time.
  if (routeState.customerRoute === 'admin' || activePage === 'admin' || activePage === 'product-detail' || activePage === 'checkout' || activePage === 'cart') {
    return null;
  }

  const go = (tab: Tab) => {
    if (tab === 'cart') { setIsCartDrawerOpen(true); return; }
    // setActivePage changes the URL inside the page transition
    setActivePage(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const idle = !isSearchOpen && !isCartDrawerOpen;
  const bagActive = !isSearchOpen && isCartDrawerOpen;
  const tabs: Array<{ id: Tab; label: string; icon: LucideIcon; active: boolean; count?: number; dot?: boolean }> = [
    { id: 'home', label: 'Home', icon: Home, active: idle && activePage === 'home' },
    { id: 'shop', label: 'Shop', icon: LayoutGrid, active: idle && activePage === 'shop' },
    { id: 'wishlist', label: 'Wishlist', icon: Heart, active: idle && activePage === 'wishlist', count: wishlist.length },
    { id: 'cart', label: 'Bag', icon: ShoppingBag, active: bagActive, count: cartCount },
    { id: 'account', label: user ? 'Account' : 'Sign in', icon: User, active: idle && (activePage === 'account' || activePage === 'login'), dot: Boolean(user) },
  ];

  return (
    <nav
      id="mobile-app-bottom-navbar"
      aria-label="Mobile navigation"
      className="sag-glass-bar md:hidden fixed bottom-[calc(10px+env(safe-area-inset-bottom))] left-3 right-3 z-[45] mx-auto max-w-md rounded-[26px]! select-none"
    >
      <div className="grid grid-cols-5 gap-0.5 px-1.5 py-[7px]">
        {tabs.map(({ id, label, icon: Icon, active, count, dot }) => (
          <button
            key={id}
            type="button"
            id={`mobile-nav-${id === 'shop' ? 'categories' : id}`}
            onClick={() => go(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={count ? `${label}, ${count} ${count === 1 ? 'item' : 'items'}` : label}
            className={`h-[46px] min-w-0 rounded-[16px] flex flex-col items-center justify-center gap-[3px] cursor-pointer transition-colors ${active ? 'bg-brand text-[color:var(--sag-on-gold)]' : 'text-ink-muted'}`}
          >
            <span className="relative flex">
              <Icon className={`w-5 h-5 ${id === 'cart' && bumped ? 'sag-bump' : ''}`} strokeWidth={1.5} aria-hidden="true" />
              {Boolean(count) && (
                <span className={`sag-num absolute -top-[5px] -right-[8px] min-w-[15px] h-[15px] px-[3px] rounded-full text-[10px] font-semibold leading-none flex items-center justify-center ${active ? 'bg-[color:var(--sag-on-gold)] text-brand' : 'bg-brand text-[color:var(--sag-on-gold)]'}`}>
                  <span key={count} className={id === 'cart' && bumped ? 'sag-settle' : undefined}>{count! > 99 ? '99+' : count}</span>
                </span>
              )}
              {dot && <span className={`absolute -bottom-0.5 -right-1 w-[7px] h-[7px] rounded-full ${active ? 'bg-[color:var(--sag-on-gold)]' : 'bg-brand'}`} />}
            </span>
            <span className={`text-[10.5px] leading-3 tracking-[0.03em] whitespace-nowrap ${active ? 'font-semibold' : 'font-normal'}`}>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
