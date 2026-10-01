import React, { useEffect, useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { ChevronRight, X } from 'lucide-react';
import { WhatsAppIcon } from './BrandIcons';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { ActivePage } from '../types';
import { KIDS_TOYS, departmentOf, isKidsToysListing } from '../utils/kids';
import { HeartIcon, HomeIcon, PackageIcon, SearchIcon, ShopIcon, StoreIconProps, TagIcon, TruckIcon, UserIcon } from './StoreIcons';

type Row = { key: string; label: string; icon: React.FC<StoreIconProps>; action: () => void; accent?: boolean };

export const MobileMenuDrawer: React.FC = () => {
  const { isMobileMenuOpen, setIsMobileMenuOpen, products = [], navigateToCategory, setActivePage, setIsSearchOpen, wishlist, activePage, selectedCategory } = useShop();
  const { user } = useAuth();
  const close = () => setIsMobileMenuOpen(false);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobileMenuOpen]);

  const collections = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => { if (departmentOf(p) === 'women') counts.set(p.category, (counts.get(p.category) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);

  const goPage = (page: ActivePage) => { close(); setActivePage(page); };
  const goCategory = (category: string) => { close(); navigateToCategory(category as any); };

  const rows: Row[] = [
    { key: 'home', label: 'Home', icon: HomeIcon, action: () => goPage('home') },
    { key: 'All', label: 'Shop all', icon: ShopIcon, action: () => goCategory('All') },
    { key: 'New Arrivals', label: 'New arrivals', icon: PackageIcon, action: () => goCategory('New Arrivals') },
    { key: 'Sale', label: 'Offers', icon: TagIcon, action: () => goCategory('Sale'), accent: true },
    ...(products.some((p) => departmentOf(p) !== 'women') ? [{ key: KIDS_TOYS, label: 'Kids & Toys', icon: HeartIcon, action: () => goCategory(KIDS_TOYS) }] : []),
  ];
  const isCurrent = (key: string) => (key === 'home' ? activePage === 'home' : activePage === 'shop' && (selectedCategory === key || (key === KIDS_TOYS && isKidsToysListing(selectedCategory))));

  const smallLink = 'h-9 px-3.5 rounded-full bg-white border border-[#4B1D3F]/10 text-[13px] text-[#2A1A26]/75 hover:text-[#4B1D3F] cursor-pointer';

  return (
    <div className={`lg:hidden fixed inset-0 z-[60] transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
      <div className="absolute inset-0 bg-[#2A1A26]/45" onClick={close} />
      <nav
        aria-label="Mobile menu"
        className={`absolute left-0 top-0 h-full w-[88%] max-w-sm bg-[#FBF7F3] flex flex-col rounded-r-3xl overflow-hidden shadow-[0_24px_60px_-20px_rgba(42,26,38,0.55)] transition-transform duration-300 ease-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between pl-5 pr-3 h-16 border-b border-[#4B1D3F]/10 bg-white shrink-0">
          <img src="/suit-aura-logo-480.webp" alt="Suit Aura Girls" className="h-11 w-auto" />
          <button onClick={close} aria-label="Close menu" className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#F3EEF8] cursor-pointer">
            <X className="w-5 h-5 text-[#4B1D3F]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-24">
          <button onClick={() => { close(); setIsSearchOpen(true); }} className="mt-4 w-full h-12 rounded-full border border-[#4B1D3F]/15 bg-white px-4 flex items-center gap-2.5 text-[15px] text-[#2A1A26]/60 cursor-pointer">
            <SearchIcon className="w-5 h-5" /> Search styles
          </button>

          <div className="mt-4 rounded-3xl bg-white border border-[#4B1D3F]/10 p-1.5">
            {rows.map(({ key, label, icon: Icon, action, accent }) => {
              const current = isCurrent(key);
              return (
                <button key={key} onClick={action} aria-current={current ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-2xl text-left text-[15px] cursor-pointer transition-colors ${current ? 'bg-[#F3EEF8] text-[#4B1D3F] font-semibold' : accent ? 'text-[#8A2E55] hover:bg-[#F7E4EA]/60' : 'text-[#2A1A26] hover:bg-[#F3EEF8]/70'}`}>
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${accent ? 'bg-[#F7E4EA]' : 'bg-[#F3EEF8]'}`}><Icon className="w-5 h-5" live={false} /></span>
                  <span className="flex-1 min-w-0 truncate">{label}</span>
                  <ChevronRight className="w-4 h-4 text-[#4B1D3F]/35 shrink-0" />
                </button>
              );
            })}
          </div>

          {collections.length > 0 && (
            <div className="mt-6">
              <p className="sag-eyebrow mb-3 px-1">Collections</p>
              <div className="grid grid-cols-2 gap-2">
                {collections.map(([name, count]) => {
                  const current = activePage === 'shop' && selectedCategory === name;
                  return (
                    <button key={name} onClick={() => goCategory(name)} aria-current={current ? 'page' : undefined}
                      className={`flex items-center justify-between gap-2 h-12 pl-4 pr-2.5 rounded-2xl border text-left text-sm cursor-pointer transition-colors ${current ? 'bg-[#F3EEF8] border-[#4B1D3F]/25 text-[#4B1D3F] font-semibold' : 'bg-white border-[#4B1D3F]/10 text-[#2A1A26] hover:border-[#4B1D3F]/30'}`}>
                      <span className="truncate">{name}</span>
                      <span className="shrink-0 min-w-[24px] h-[22px] px-1.5 rounded-full bg-[#FBF7F3] text-[11px] font-semibold text-[#2A1A26]/60 flex items-center justify-center">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-2">
            {[
              { icon: UserIcon, label: user ? 'Account' : 'Sign in', action: () => goPage('account') },
              { icon: HeartIcon, label: `Wishlist${wishlist.length ? ` (${wishlist.length})` : ''}`, action: () => goPage('wishlist') },
              { icon: TruckIcon, label: 'Track order', action: () => goPage('track-order') },
            ].map(({ icon: Icon, label, action }) => (
              <button key={label} onClick={action} className="sag-card rounded-2xl flex flex-col items-center gap-2 py-4 px-1 text-[13px] font-medium text-[#2A1A26] cursor-pointer hover:border-[#4B1D3F]/30 transition-colors">
                <span className="w-11 h-11 rounded-full bg-[#F3EEF8] flex items-center justify-center"><Icon className="w-6 h-6" /></span>
                {label}
              </button>
            ))}
          </div>

          <a href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question.')} target="_blank" rel="noopener noreferrer"
            className="mt-3 flex items-center gap-3 rounded-2xl bg-white border border-[#4B1D3F]/10 px-4 py-3.5 hover:border-[#4B1D3F]/30 transition-colors">
            <span className="w-10 h-10 rounded-full bg-[#F3EEF8] flex items-center justify-center shrink-0"><WhatsAppIcon className="w-5 h-5" /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium text-[#2A1A26]">Chat with us on WhatsApp</span>
              <span className="block text-[12px] text-[#2A1A26]/60">Mon–Sat · 10 AM – 7 PM IST</span>
            </span>
            <ChevronRight className="w-4 h-4 text-[#4B1D3F]/40 shrink-0" />
          </a>

          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={() => goPage('about')} className={smallLink}>About</button>
            <button onClick={() => goPage('contact')} className={smallLink}>Contact</button>
            <button onClick={() => goPage('size-guide')} className={smallLink}>Size guide</button>
            <button onClick={() => goPage('shipping-policy')} className={smallLink}>Shipping</button>
            <button onClick={() => goPage('return-policy')} className={smallLink}>Returns</button>
          </div>
        </div>
      </nav>
    </div>
  );
};
