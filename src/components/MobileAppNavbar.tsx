import React from 'react';
import { Home, LayoutGrid, Heart, ShoppingBag } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useRouter } from '../context/RouterContext';

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

  const { navigate, routeState } = useRouter();

  // If on admin route or invoice, hide customer mobile navigation bar
  if (routeState.customerRoute === 'admin' || activePage === 'admin') {
    return null;
  }

  const handleNav = (tab: 'home' | 'categories' | 'wishlist' | 'cart') => {
    switch (tab) {
      case 'home':
        setActivePage('home');
        navigate('/');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;

      case 'categories':
        setActivePage('shop');
        navigate('/shop');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;

      case 'wishlist':
        setActivePage('wishlist');
        navigate('/wishlist');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        break;

      case 'cart':
        setIsCartDrawerOpen(true);
        break;
    }
  };

  return (
    <nav
      id="mobile-app-bottom-navbar"
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-[45] bg-[#120205] border-t border-[#D7B77A]/35 px-2 py-1.5 h-16 transition-colors duration-300 select-none pb-safe"
    >
      <div className="flex items-center justify-around max-w-md mx-auto pb-safe">
        {/* 1. HOME */}
        <button
          type="button"
          id="mobile-nav-home"
          onClick={() => handleNav('home')}
            className={`relative flex flex-col items-center justify-center py-1 px-3 transition-colors duration-200 cursor-pointer ${
            activePage === 'home' && !isSearchOpen && !isCartDrawerOpen
              ? 'text-[#E8D2A4]'
              : 'text-[#E8D2A4]/60 hover:text-[#E8D2A4]'
          }`}
        >
          <div className="relative">
            <Home className={`w-5 h-5 transition-transform duration-200 ${
              activePage === 'home' && !isSearchOpen && !isCartDrawerOpen ? 'scale-110 text-[#E8D2A4]' : ''
            }`} />
          </div>
          <span className={`text-[10px] tracking-tight mt-0.5 ${
            activePage === 'home' && !isSearchOpen && !isCartDrawerOpen ? 'font-semibold text-[#E8D2A4]' : 'font-medium'
          }`}>
            Home
          </span>
          {activePage === 'home' && !isSearchOpen && !isCartDrawerOpen && (
            <span className="absolute -bottom-1 w-5 h-px bg-[#D7B77A]" />
          )}
        </button>

        {/* 2. CATEGORIES */}
        <button
          type="button"
          id="mobile-nav-categories"
          onClick={() => handleNav('categories')}
            className={`relative flex flex-col items-center justify-center py-1 px-3 transition-colors duration-200 cursor-pointer ${
            activePage === 'shop' && !isSearchOpen && !isCartDrawerOpen
              ? 'text-[#E8D2A4]'
              : 'text-[#E8D2A4]/60 hover:text-[#E8D2A4]'
          }`}
        >
          <div className="relative">
            <LayoutGrid className={`w-5 h-5 transition-transform duration-200 ${
              activePage === 'shop' && !isSearchOpen && !isCartDrawerOpen ? 'scale-110 text-[#E8D2A4]' : ''
            }`} />
          </div>
          <span className={`text-[10px] tracking-tight mt-0.5 ${
            activePage === 'shop' && !isSearchOpen && !isCartDrawerOpen ? 'font-semibold text-[#E8D2A4]' : 'font-medium'
          }`}>
            Categories
          </span>
          {activePage === 'shop' && !isSearchOpen && !isCartDrawerOpen && (
            <span className="absolute -bottom-1 w-5 h-px bg-[#D7B77A]" />
          )}
        </button>

        {/* 3. WISHLIST */}
        <button
          type="button"
          id="mobile-nav-wishlist"
          onClick={() => handleNav('wishlist')}
            className={`relative flex flex-col items-center justify-center py-1 px-3 transition-colors duration-200 cursor-pointer ${
            activePage === 'wishlist' && !isSearchOpen && !isCartDrawerOpen
              ? 'text-[#E8D2A4]'
              : 'text-[#E8D2A4]/60 hover:text-[#E8D2A4]'
          }`}
        >
          <div className="relative">
            <Heart className={`w-5 h-5 transition-transform duration-200 ${
              activePage === 'wishlist' && !isSearchOpen && !isCartDrawerOpen ? 'scale-110 text-[#E8D2A4] fill-[#D7B77A]' : ''
            }`} />
            {wishlist.length > 0 && (
              <span key={`mobile-wishlist-badge-${wishlist.length}`} className="absolute -top-1.5 -right-2 flex h-4.5 w-4.5 items-center justify-center">
                <span className="relative inline-flex rounded-full h-4.5 w-4.5 bg-[#D7B77A] text-[#F7F0E5] font-semibold text-[9px] items-center justify-center border border-[#FDFBF7]">
                  {wishlist.length > 99 ? '99+' : wishlist.length}
                </span>
              </span>
            )}
          </div>
          <span className={`text-[10px] tracking-tight mt-0.5 ${
            activePage === 'wishlist' && !isSearchOpen && !isCartDrawerOpen ? 'font-semibold text-[#E8D2A4]' : 'font-medium'
          }`}>
            Wishlist
          </span>
          {activePage === 'wishlist' && !isSearchOpen && !isCartDrawerOpen && (
            <span className="absolute -bottom-1 w-5 h-px bg-[#D7B77A]" />
          )}
        </button>

        {/* 4. CART */}
        <button
          type="button"
          id="mobile-nav-cart"
          onClick={() => handleNav('cart')}
            className={`relative flex flex-col items-center justify-center py-1 px-3 transition-colors duration-200 cursor-pointer ${
            (isCartDrawerOpen || activePage === 'cart') && !isSearchOpen
              ? 'text-[#E8D2A4]'
              : 'text-[#E8D2A4]/60 hover:text-[#E8D2A4]'
          }`}
        >
          <div className="relative">
            <ShoppingBag className={`w-5 h-5 transition-transform duration-200 ${
              (isCartDrawerOpen || activePage === 'cart') && !isSearchOpen ? 'scale-110 text-[#E8D2A4]' : ''
            }`} />
            {cartCount > 0 && (
              <span key={`mobile-cart-badge-${cartCount}`} className="absolute -top-1.5 -right-2 flex h-4.5 w-4.5 items-center justify-center">
                <span className="relative inline-flex rounded-full h-4.5 w-4.5 bg-[#D7B77A] text-[#F7F0E5] font-semibold text-[9px] items-center justify-center border border-[#FDFBF7]">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              </span>
            )}
          </div>
          <span className={`text-[10px] tracking-tight mt-0.5 ${
            (isCartDrawerOpen || activePage === 'cart') && !isSearchOpen ? 'font-semibold text-[#E8D2A4]' : 'font-medium'
          }`}>
            Cart
          </span>
          {(isCartDrawerOpen || activePage === 'cart') && !isSearchOpen && (
            <span className="absolute -bottom-1 w-5 h-px bg-[#D7B77A]" />
          )}
        </button>
      </div>
    </nav>
  );
};
