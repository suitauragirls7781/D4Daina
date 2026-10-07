import React from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { BagIcon } from './BrandIcons';
import { HeartIcon, HomeIcon, ShopIcon, UserIcon } from './StoreIcons';

type Tab = 'home' | 'shop' | 'wishlist' | 'cart' | 'account';
type NavIcon = React.FC<{ className?: string; mono?: boolean; live?: boolean }>;

/**
 * Phone navigation (owner's pick 3): a dark bar flush with the bottom edge of the screen. Four tabs
 * (Home, Shop, Wishlist, Account), the current one in gold, and in the middle a raised round gold
 * "Bag" button that carries the real number of items in the bag.
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
  const bagActive = !isSearchOpen && isCartDrawerOpen;
  const tabs: Array<{ id: Exclude<Tab, 'cart'>; label: string; icon: NavIcon; active: boolean; count?: number; dot?: boolean }> = [
    { id: 'home', label: 'Home', icon: HomeIcon, active: idle && activePage === 'home' },
    { id: 'shop', label: 'Shop', icon: ShopIcon, active: idle && activePage === 'shop' },
    { id: 'wishlist', label: 'Wishlist', icon: HeartIcon, active: idle && activePage === 'wishlist', count: wishlist.length },
    { id: 'account', label: user ? 'Account' : 'Sign in', icon: UserIcon, active: idle && (activePage === 'account' || activePage === 'login'), dot: Boolean(user) },
  ];

  const tabButton = ({ id, label, icon: Icon, active, count, dot }: (typeof tabs)[number]) => (
    <button
      key={id}
      type="button"
      id={`mobile-nav-${id === 'shop' ? 'categories' : id}`}
      onClick={() => go(id)}
      aria-current={active ? 'page' : undefined}
      aria-label={count ? `${label}, ${count} ${count === 1 ? 'item' : 'items'}` : label}
      className={`relative h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-2xl cursor-pointer ${active ? 'text-highlight' : 'text-on-dark-muted'}`}
    >
      <span className="relative flex">
        <Icon className="w-[20px] h-[20px]" mono />
        {Boolean(count) && (
          <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-highlight text-ink text-[10.5px] font-extrabold tabular-nums leading-none flex items-center justify-center ring-2 ring-dark">
            {count! > 99 ? '99+' : count}
          </span>
        )}
        {dot && <span className="absolute -bottom-0.5 -right-1 w-2 h-2 rounded-full bg-highlight ring-2 ring-dark" />}
      </span>
      <span className={`text-[10.5px] leading-3 whitespace-nowrap ${active ? 'font-extrabold' : 'font-semibold'}`}>{label}</span>
    </button>
  );

  return (
    <nav
      id="mobile-app-bottom-navbar"
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-[45] bg-dark pb-[env(safe-area-inset-bottom)] select-none"
    >
      <div className="relative max-w-md mx-auto grid grid-cols-[1fr_1fr_66px_1fr_1fr] gap-0.5 px-1.5 py-1">
        {tabs.slice(0, 2).map(tabButton)}
        {/* The middle of the bar: the round gold Bag button, raised above the bar with a ring in the page colour */}
        <span className="relative">
          <button
            type="button"
            id="mobile-nav-cart"
            onClick={() => go('cart')}
            aria-current={bagActive ? 'page' : undefined}
            aria-label={cartCount ? `Bag, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}` : 'Bag'}
            className="absolute left-1/2 -top-[22px] -translate-x-1/2 flex h-[56px] w-[56px] items-center justify-center rounded-full bg-sun text-ink ring-[5px] ring-page cursor-pointer"
          >
            <BagIcon className="w-[23px] h-[23px]" mono />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-dark text-on-dark text-[11px] font-extrabold tabular-nums leading-none flex items-center justify-center ring-2 ring-sun">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </span>
        {tabs.slice(2).map(tabButton)}
      </div>
    </nav>
  );
};
