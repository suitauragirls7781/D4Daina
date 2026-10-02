import React from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { BagIcon } from './BrandIcons';
import { HeartIcon, HomeIcon, ShopIcon, UserIcon } from './StoreIcons';

type Tab = 'home' | 'shop' | 'wishlist' | 'cart' | 'account';
type NavIcon = React.FC<{ className?: string; mono?: boolean; live?: boolean }>;

/**
 * Phone navigation: a white bar flush to the bottom edge of the screen, with a hairline on top.
 * Inactive tabs are grey outline icons; the current tab is teal with a short teal bar at the top edge.
 * No pill, no lift, nothing moves. Counts are small rani badges.
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
  const tabs: Array<{ id: Tab; label: string; icon: NavIcon; active: boolean; count?: number; dot?: boolean }> = [
    { id: 'home', label: 'Home', icon: HomeIcon, active: idle && activePage === 'home' },
    { id: 'shop', label: 'Shop', icon: ShopIcon, active: idle && activePage === 'shop' },
    { id: 'wishlist', label: 'Wishlist', icon: HeartIcon, active: idle && activePage === 'wishlist', count: wishlist.length },
    { id: 'cart', label: 'Bag', icon: BagIcon as NavIcon, active: !isSearchOpen && isCartDrawerOpen, count: cartCount },
    { id: 'account', label: user ? 'Account' : 'Sign in', icon: UserIcon, active: idle && (activePage === 'account' || activePage === 'login'), dot: Boolean(user) },
  ];

  return (
    <nav
      id="mobile-app-bottom-navbar"
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-[45] bg-white border-t border-line pb-[env(safe-area-inset-bottom)] select-none"
    >
      <div className="max-w-md mx-auto h-14 grid grid-cols-5">
        {tabs.map(({ id, label, icon: Icon, active, count, dot }) => (
          <button
            key={id}
            type="button"
            id={`mobile-nav-${id === 'shop' ? 'categories' : id}`}
            onClick={() => go(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={count ? `${label}, ${count} ${count === 1 ? 'item' : 'items'}` : label}
            className={`relative h-full flex flex-col items-center justify-center gap-1 cursor-pointer ${active ? 'text-brand' : 'text-ink-muted'}`}
          >
            {active && <span aria-hidden="true" className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-sm bg-brand" />}
            <span className="relative flex">
              <Icon className="w-6 h-6" mono={!active} />
              {Boolean(count) && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-bold tabular-nums leading-none flex items-center justify-center ring-2 ring-white">
                  {count! > 99 ? '99+' : count}
                </span>
              )}
              {dot && <span className="absolute -bottom-0.5 -right-1 w-2 h-2 rounded-full bg-ok ring-2 ring-white" />}
            </span>
            <span className={`text-[11px] leading-3 whitespace-nowrap ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};
