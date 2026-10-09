import React from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { nextPageChangePlain } from '../utils/pageTransition';
import { Icon, Odometer, type IconName } from '../aura';

type Tab = 'home' | 'shop' | 'wishlist' | 'cart' | 'account';

/**
 * Phone tab bar (Aura): a solid ink bar across the bottom edge with five items whose names are always
 * shown: Home, Shop, Wishlist, Bag, Account (or Sign in). A paper pill sits behind the current item and
 * slides to the tapped one. The bag and the wishlist carry their real counts in a rose badge; the bag's
 * count rolls when it changes and the bag is where an added product's photo flies to (data-bag-target).
 * On the product page, the bag page and checkout the bar slides away: those pages have their own bottom bar,
 * and only one fixed bar shows at a time. On a page that is none of the five there is no pill.
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

  const idle = !isSearchOpen && !isCartDrawerOpen;
  const bagActive = !isSearchOpen && isCartDrawerOpen;
  const tabs: Array<{ id: Tab; label: string; icon: IconName; active: boolean; count?: number; dot?: boolean }> = [
    { id: 'home', label: 'Home', icon: 'home', active: idle && activePage === 'home' },
    { id: 'shop', label: 'Shop', icon: 'grid', active: idle && activePage === 'shop' },
    { id: 'wishlist', label: 'Wishlist', icon: 'heart', active: idle && activePage === 'wishlist', count: wishlist.length },
    { id: 'cart', label: 'Bag', icon: 'bag', active: bagActive, count: cartCount },
    { id: 'account', label: user ? 'Account' : 'Sign in', icon: 'user', active: idle && (activePage === 'account' || activePage === 'login'), dot: Boolean(user) },
  ];
  const activeIndex = tabs.findIndex((tab) => tab.active);

  // Not in the admin panel at all
  if (routeState.customerRoute === 'admin' || activePage === 'admin') return null;
  // The product page, the bag page and checkout have their own bottom bars: this one slides away there
  const off = activePage === 'product-detail' || activePage === 'checkout' || activePage === 'cart';

  const go = (tab: Tab) => {
    if (tab === 'cart') { setIsCartDrawerOpen(true); return; }
    // setActivePage changes the URL inside the page transition. From this bar the change is a plain one (the
    // new page rises in by itself, no curtain), so the pill is seen sliding to the tapped tab.
    nextPageChangePlain();
    setActivePage(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav
      id="mobile-app-bottom-navbar"
      aria-label="Mobile navigation"
      aria-hidden={off || undefined}
      inert={off || undefined}
      className={`aura-tb select-none ${off ? 'off' : ''}`}
    >
      {/* The paper pill behind the current item */}
      <i aria-hidden="true" style={{ transform: `translate3d(${Math.max(0, activeIndex) * 100}%,0,0)`, opacity: activeIndex < 0 ? 0 : 1 }} />
      {tabs.map(({ id, label, icon, active, count, dot }) => (
        <button
          key={id}
          type="button"
          id={`mobile-nav-${id === 'shop' ? 'categories' : id}`}
          onClick={() => go(id)}
          aria-current={active ? 'page' : undefined}
          aria-label={count ? `${label}, ${count} ${count === 1 ? 'item' : 'items'}` : label}
          {...(id === 'cart' ? { 'data-bag-target': '' } : {})}
        >
          <span className="aura-tb-ic">
            <Icon name={icon} size={21} />
            {Boolean(count) && (
              <span className="aura-cnt">
                {id === 'cart' ? <Odometer value={count! > 99 ? '99+' : count!} roll={false} /> : (count! > 99 ? '99+' : count)}
              </span>
            )}
            {dot && <span className="aura-tb-dot" />}
          </span>
          <span className="aura-tb-lb">{label}</span>
        </button>
      ))}
    </nav>
  );
};
