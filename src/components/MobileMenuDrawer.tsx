import React, { useEffect, useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { ChevronRight, X } from 'lucide-react';
import { WhatsAppIcon } from './BrandIcons';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { ActivePage } from '../types';
import { useBackToClose } from '../utils/backClose';
import { KIDS_TOYS, departmentOf, isKidsToysListing } from '../utils/kids';
import { HeartIcon, HomeIcon, SearchIcon, TruckIcon, UserIcon } from './StoreIcons';

/**
 * The phone menu as pastel tiles (owner's pick 2): a lilac "Sign in / My account" card, four coloured tiles
 * for the main ways into the catalogue, the collections as chips with their real counts, and WhatsApp and
 * "Track order" at the bottom. Every number on it is counted from the products the store has right now.
 */
export const MobileMenuDrawer: React.FC = () => {
  const { isMobileMenuOpen, setIsMobileMenuOpen, products = [], navigateToCategory, setActivePage, setIsSearchOpen, wishlist, activePage, selectedCategory } = useShop();
  const { user } = useAuth();
  const close = () => setIsMobileMenuOpen(false);
  useBackToClose(isMobileMenuOpen, close);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobileMenuOpen]);

  const women = useMemo(() => products.filter((p) => departmentOf(p) === 'women'), [products]);
  const collections = useMemo(() => {
    const counts = new Map<string, number>();
    women.forEach((p) => counts.set(p.category, (counts.get(p.category) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [women]);
  const kidsCount = products.length - women.length;
  const newCount = women.filter((p) => p.isNewArrival).length;
  const offerCount = women.filter((p) => Number(p.originalPrice) > Number(p.price)).length;
  const styles = (n: number) => `${n} ${n === 1 ? 'style' : 'styles'}`;

  const goPage = (page: ActivePage) => { close(); setActivePage(page); };
  const goCategory = (category: string) => { close(); navigateToCategory(category as any); };
  const isCurrent = (key: string) => activePage === 'shop' && (selectedCategory === key || (key === KIDS_TOYS && isKidsToysListing(selectedCategory)));

  const tiles = [
    { key: 'All', label: 'Shop all', sub: women.length ? styles(women.length) : '', tone: 'bg-peach text-ink' },
    { key: 'New Arrivals', label: 'New arrivals', sub: newCount ? styles(newCount) : '', tone: 'bg-mint text-ink' },
    { key: 'Sale', label: 'Offers', sub: offerCount ? `${styles(offerCount)} on offer` : '', tone: 'bg-butter text-ink' },
    ...(kidsCount > 0 ? [{ key: KIDS_TOYS, label: 'Kids & Toys', sub: styles(kidsCount), tone: 'bg-sky text-ink' }] : []),
  ];
  const smallLink = 'inline-flex items-center min-h-11 text-sm text-ink-muted underline underline-offset-[3px] hover:text-ink cursor-pointer';
  const round = 'w-11 h-11 shrink-0 rounded-full bg-sunken flex items-center justify-center text-ink cursor-pointer';

  return (
    <div className={`lg:hidden fixed inset-0 z-[60] transition-opacity duration-200 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
      <div className="absolute inset-0 bg-ink/50" onClick={close} />
      <nav
        aria-label="Mobile menu"
        className={`absolute left-0 top-0 h-full w-[86%] max-w-sm bg-page flex flex-col overflow-hidden shadow-[var(--sag-shadow-pop)] transition-transform duration-[240ms] ease-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2 px-3.5 pt-3 shrink-0">
          <button type="button" onClick={() => goPage('home')} aria-current={activePage === 'home' ? 'page' : undefined} className="flex min-w-0 items-center gap-2 rounded-full text-left cursor-pointer" aria-label="Suit Aura Girls home">
            <img src="/suit-aura-mark-132.webp" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full bg-white object-cover" />
            <span className="truncate text-[15px] font-extrabold tracking-[0.04em] text-ink">SUIT AURA <span className="text-brand">GIRLS</span></span>
          </button>
          <span className="flex shrink-0 gap-2">
            <button type="button" onClick={() => { close(); setIsSearchOpen(true); }} aria-label="Search styles" className={round}><SearchIcon mono className="w-5 h-5" /></button>
            <button type="button" onClick={close} aria-label="Close menu" className={round}><X className="w-[22px] h-[22px]" /></button>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3.5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col">
          <button type="button" onClick={() => goPage('account')} className="flex w-full items-center gap-2.5 rounded-[20px] bg-lilac p-3 text-left cursor-pointer">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand"><UserIcon mono className="w-5 h-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-5 font-extrabold text-ink">{user ? 'My account' : 'Sign in'}</span>
              <span className="block truncate text-xs leading-[18px] text-lilac-ink">{user ? 'Orders, addresses and returns' : 'Track orders and returns'}</span>
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 text-lilac-ink" aria-hidden="true" />
          </button>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {tiles.map(({ key, label, sub, tone }) => {
              const current = isCurrent(key);
              return (
                <button key={key} type="button" onClick={() => goCategory(key)} aria-current={current ? 'page' : undefined}
                  className={`flex min-h-[84px] flex-col justify-between rounded-[20px] px-3 py-3.5 text-left cursor-pointer ${tone} ${current ? 'ring-2 ring-ink' : ''}`}>
                  <span className="text-[14.5px] leading-5 font-extrabold">{label}</span>
                  {sub && <span className="sag-num text-xs leading-4 font-semibold opacity-85">{sub}</span>}
                </button>
              );
            })}
          </div>

          {collections.length > 0 && (
            <div className="mt-4">
              <p className="sag-eyebrow mb-2">Collections</p>
              <div className="flex flex-wrap gap-[7px]">
                {collections.map(([name, count]) => {
                  const current = activePage === 'shop' && selectedCategory === name;
                  return (
                    <button key={name} type="button" onClick={() => goCategory(name)} aria-current={current ? 'page' : undefined}
                      className={`h-10 px-3.5 rounded-full text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer ${current ? 'bg-ink text-white' : 'bg-white text-ink border-[1.5px] border-line'}`}>
                      {name} <span className={`sag-num font-semibold ${current ? 'text-on-dark-muted' : 'text-ink-muted'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-[7px]">
            <button type="button" onClick={() => goPage('home')} className="h-10 px-3.5 rounded-full bg-white border-[1.5px] border-line text-[13px] font-bold text-ink inline-flex items-center gap-1.5 cursor-pointer"><HomeIcon mono className="w-4 h-4" live={false} /> Home</button>
            <button type="button" onClick={() => goPage('wishlist')} className="h-10 px-3.5 rounded-full bg-white border-[1.5px] border-line text-[13px] font-bold text-ink inline-flex items-center gap-1.5 cursor-pointer"><HeartIcon mono className="w-4 h-4" /> Wishlist{wishlist.length ? <span className="sag-num font-semibold text-ink-muted">{wishlist.length}</span> : null}</button>
          </div>

          <span className="flex-1 min-h-4" />

          <div className="flex gap-2">
            <a href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question.')} target="_blank" rel="noopener noreferrer"
              className="flex h-[46px] flex-1 min-w-0 items-center justify-center gap-1.5 rounded-full bg-ink text-[13.5px] font-bold text-white">
              <WhatsAppIcon className="w-5 h-5" /> WhatsApp
            </a>
            <button type="button" onClick={() => goPage('track-order')} className="flex h-[46px] flex-1 min-w-0 items-center justify-center gap-1.5 rounded-full bg-white border-[1.5px] border-line text-[13.5px] font-bold text-ink cursor-pointer">
              <TruckIcon mono className="w-5 h-5" /> Track order
            </button>
          </div>
          <p className="mt-2 text-center text-xs leading-[18px] text-ink-muted">Mon–Sat · 10 AM – 7 PM IST</p>

          <div className="mt-1 flex flex-wrap justify-center gap-x-5 gap-y-0">
            <button type="button" onClick={() => goPage('about')} className={smallLink}>About</button>
            <button type="button" onClick={() => goPage('contact')} className={smallLink}>Contact</button>
            <button type="button" onClick={() => goPage('size-guide')} className={smallLink}>Size guide</button>
            <button type="button" onClick={() => goPage('shipping-policy')} className={smallLink}>Shipping</button>
            <button type="button" onClick={() => goPage('return-policy')} className={smallLink}>Returns</button>
          </div>
        </div>
      </nav>
    </div>
  );
};
