import React from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { BagIcon } from './BrandIcons';
import { HeartIcon, HomeIcon, ShopIcon, UserIcon } from './StoreIcons';

type Tab = 'home' | 'shop' | 'wishlist' | 'cart' | 'account';
type NavIcon = React.FC<{ className?: string; mono?: boolean; live?: boolean }>;

/**
 * Phone navigation: a white bar fixed to the bottom edge that matches the header. The current tab sits in a lavender pill
 * with its full-colour icon; the others are plum outlines. Counts show as plum badges, like the header.
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

  // Hidden in the admin panel; the product page and checkout have their own bottom bars
  if (routeState.customerRoute === 'admin' || activePage === 'admin' || activePage === 'product-detail' || activePage === 'checkout') {
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
    { id: 'cart', label: 'Bag', icon: BagIcon as NavIcon, active: !isSearchOpen && (isCartDrawerOpen || activePage === 'cart'), count: cartCount },
    { id: 'account', label: user ? 'Account' : 'Sign in', icon: UserIcon, active: idle && (activePage === 'account' || activePage === 'login'), dot: Boolean(user) },
  ];

  return (
    <nav
      id="mobile-app-bottom-navbar"
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-[45] bg-white border-t border-[#4B1D3F]/10 shadow-[0_-10px_28px_-20px_rgba(42,26,38,0.45)] pb-[env(safe-area-inset-bottom)] select-none"
    >
      <div className="max-w-md mx-auto h-16 grid grid-cols-5 items-center px-1">
        {tabs.map(({ id, label, icon: Icon, active, count, dot }) => (
          <button
            key={id}
            type="button"
            id={`mobile-nav-${id === 'shop' ? 'categories' : id}`}
            onClick={() => go(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={count ? `${label}, ${count} ${count === 1 ? 'item' : 'items'}` : label}
            className="h-full flex items-center justify-center cursor-pointer"
          >
            <span
              className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl transition-all duration-300 ${active ? 'bg-[#F3EEF8] px-3 py-1.5 -translate-y-0.5' : 'px-2 py-1.5 text-[#4B1D3F]/80'}`}
            >
              <span className="relative flex">
                <Icon className={`w-[22px] h-[22px] ${active ? 'scale-105' : ''} transition-transform`} mono={!active} live={active} />
                {Boolean(count) && (
                  <span key={`${id}-${count}`} className={`absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#4B1D3F] text-[#FBF7F3] text-[10px] font-bold flex items-center justify-center ring-2 sag-pop ${active ? 'ring-[#F3EEF8]' : 'ring-white'}`}>
                    {count! > 99 ? '99+' : count}
                  </span>
                )}
                {dot && <span className={`absolute -bottom-0.5 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ${active ? 'ring-[#F3EEF8]' : 'ring-white'}`} />}
              </span>
              <span className={`text-[11px] leading-none tracking-tight whitespace-nowrap ${active ? 'font-semibold text-[#4B1D3F]' : 'font-medium text-[#2A1A26]/65'}`}>{label}</span>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
};
