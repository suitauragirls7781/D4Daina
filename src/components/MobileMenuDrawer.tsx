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
    { key: 'Sale', label: 'Offers', icon: TagIcon, action: () => goCategory('Sale') },
    ...(products.some((p) => departmentOf(p) !== 'women') ? [{ key: KIDS_TOYS, label: 'Kids & Toys', icon: HeartIcon, action: () => goCategory(KIDS_TOYS) }] : []),
  ];
  const isCurrent = (key: string) => (key === 'home' ? activePage === 'home' : activePage === 'shop' && (selectedCategory === key || (key === KIDS_TOYS && isKidsToysListing(selectedCategory))));

  const row = 'relative w-full flex items-center gap-3 min-h-[52px] px-4 text-left text-[15px] leading-[22px] cursor-pointer transition-colors hover:bg-sunken';
  const currentBar = <span aria-hidden="true" className="absolute left-0 inset-y-2 w-[3px] rounded-r-full bg-brand" />;
  const smallLink = 'inline-flex items-center min-h-11 text-sm text-ink-muted underline underline-offset-[3px] hover:text-ink cursor-pointer';

  return (
    <div className={`lg:hidden fixed inset-0 z-[60] transition-opacity duration-200 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
      <div className="absolute inset-0 bg-ink/50" onClick={close} />
      <nav
        aria-label="Mobile menu"
        className={`absolute left-0 top-0 h-full w-[86%] max-w-sm bg-surface flex flex-col overflow-hidden shadow-[var(--sag-shadow-pop)] transition-transform duration-[240ms] ease-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between pl-4 pr-1 h-[52px] border-b border-line bg-surface shrink-0">
          <img src="/suit-aura-logo-480.webp" alt="Suit Aura Girls" width={480} height={240} className="h-8 w-auto" />
          <button type="button" onClick={close} aria-label="Close menu" className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
            <X className="w-[22px] h-[22px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <div className="px-4 pt-4 pb-3">
            <button type="button" onClick={() => { close(); setIsSearchOpen(true); }} className="w-full h-12 rounded-control border-[1.5px] border-control bg-surface px-3.5 flex items-center gap-2.5 text-[15px] text-ink-muted cursor-pointer hover:bg-sunken transition-colors">
              <SearchIcon mono className="w-5 h-5" /> Search styles
            </button>
          </div>

          <div className="border-t border-line py-1">
            {rows.map(({ key, label, icon: Icon, action }) => {
              const current = isCurrent(key);
              return (
                <button key={key} type="button" onClick={action} aria-current={current ? 'page' : undefined}
                  className={`${row} ${current ? 'text-brand font-semibold' : 'text-ink font-medium'}`}>
                  {current && currentBar}
                  <span className="shrink-0 flex"><Icon mono className="w-5 h-5" live={false} /></span>
                  <span className="flex-1 min-w-0 truncate">{label}</span>
                  <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          {collections.length > 0 && (
            <div className="border-t border-line pt-4 pb-1">
              <p className="sag-eyebrow px-4 mb-1">Collections</p>
              {collections.map(([name, count]) => {
                const current = activePage === 'shop' && selectedCategory === name;
                return (
                  <button key={name} type="button" onClick={() => goCategory(name)} aria-current={current ? 'page' : undefined}
                    className={`${row} min-h-12 ${current ? 'text-brand font-semibold' : 'text-ink'}`}>
                    {current && currentBar}
                    <span className="flex-1 min-w-0 truncate">{name}</span>
                    <span className="shrink-0 text-[13px] leading-[18px] font-normal text-ink-muted sag-num">{count}</span>
                    <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-line py-1">
            {[
              { icon: UserIcon, label: user ? 'Account' : 'Sign in', action: () => goPage('account') },
              { icon: HeartIcon, label: `Wishlist${wishlist.length ? ` (${wishlist.length})` : ''}`, action: () => goPage('wishlist') },
              { icon: TruckIcon, label: 'Track order', action: () => goPage('track-order') },
            ].map(({ icon: Icon, label, action }) => (
              <button key={label} type="button" onClick={action} className={`${row} text-ink font-medium`}>
                <span className="shrink-0 flex"><Icon mono className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0 truncate">{label}</span>
                <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>

          <div className="border-t border-line px-4 pt-4">
            <a href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question.')} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 h-12 rounded-control bg-surface border-[1.5px] border-control text-[15px] font-semibold text-ink hover:bg-sunken transition-colors">
              <WhatsAppIcon className="w-5 h-5" /> Chat with us on WhatsApp
            </a>
            <p className="mt-2 text-center text-[13px] leading-[18px] text-ink-muted">Mon–Sat · 10 AM – 7 PM IST</p>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-0">
              <button type="button" onClick={() => goPage('about')} className={smallLink}>About</button>
              <button type="button" onClick={() => goPage('contact')} className={smallLink}>Contact</button>
              <button type="button" onClick={() => goPage('size-guide')} className={smallLink}>Size guide</button>
              <button type="button" onClick={() => goPage('shipping-policy')} className={smallLink}>Shipping</button>
              <button type="button" onClick={() => goPage('return-policy')} className={smallLink}>Returns</button>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
};
