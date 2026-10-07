import React, { useEffect, useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { ChevronRight, X } from 'lucide-react';
import { WhatsAppIcon } from './BrandIcons';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { ActivePage } from '../types';
import { useBackToClose } from '../utils/backClose';
import { KIDS_TOYS, departmentOf, isKidsToysListing } from '../utils/kids';
import { HeartIcon, LockIcon, PackageIcon, ReturnIcon, SearchIcon, ShopIcon, TagIcon } from './StoreIcons';
import { assuranceFacts } from './Assurance';

/**
 * The phone menu as a clean list (owner's pick 2): a dark block on top with the logo, the name, a greeting and
 * a gold "Sign in" (or "My account"), then one row per destination (round pale icon, label, chevron), the
 * collections as chips with their real counts, and a pale-gold line with two of the store's facts at the bottom.
 * Every number on it is counted from the products the store has right now.
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

  const goPage = (page: ActivePage) => { close(); setActivePage(page); };
  const goCategory = (category: string) => { close(); navigateToCategory(category as any); };
  const isCurrent = (key: string) => activePage === 'shop' && (selectedCategory === key || (key === KIDS_TOYS && isKidsToysListing(selectedCategory)));

  const facts = assuranceFacts();
  const firstName = (user?.displayName || user?.name || '').trim().split(/\s+/)[0];
  const icon = 'w-[18px] h-[18px]';
  // One row per destination. A count is shown only when it is a real, non-zero number.
  const rows: Array<{ key: string; label: string; icon: React.ReactNode; count?: number; current?: boolean; onClick?: () => void; href?: string }> = [
    { key: 'shop-all', label: 'Shop all', icon: <ShopIcon mono className={icon} live={false} />, count: women.length, current: isCurrent('All'), onClick: () => goCategory('All') },
    { key: 'new-arrivals', label: 'New arrivals', icon: <PackageIcon mono className={icon} />, count: newCount, current: isCurrent('New Arrivals'), onClick: () => goCategory('New Arrivals') },
    { key: 'offers', label: 'Offers', icon: <TagIcon mono className={icon} />, count: offerCount, current: isCurrent('Sale'), onClick: () => goCategory('Sale') },
    ...(kidsCount > 0 ? [{ key: 'kids', label: 'Kids & Toys', icon: <ShopIcon mono className={icon} live={false} />, count: kidsCount, current: isCurrent(KIDS_TOYS), onClick: () => goCategory(KIDS_TOYS) }] : []),
    { key: 'wishlist', label: 'Wishlist', icon: <HeartIcon mono className={icon} />, count: wishlist.length, current: activePage === 'wishlist', onClick: () => goPage('wishlist') },
    { key: 'track-order', label: 'Track order', icon: <PackageIcon mono className={icon} />, current: activePage === 'track-order', onClick: () => goPage('track-order') },
    { key: 'returns', label: 'Returns & exchange', icon: <ReturnIcon mono className={icon} />, current: activePage === 'return-policy', onClick: () => goPage('return-policy') },
    { key: 'whatsapp', label: 'Chat on WhatsApp', icon: <WhatsAppIcon className={icon} />, href: createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question.') },
  ];
  const rowClass = 'flex w-full min-h-[50px] items-center gap-3 border-b border-line py-2 text-left last:border-b-0 cursor-pointer';
  const smallLink = 'inline-flex items-center min-h-11 text-sm text-ink-muted underline underline-offset-[3px] hover:text-ink cursor-pointer';
  const round = 'w-9 h-9 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-on-dark cursor-pointer';

  return (
    <div className={`lg:hidden fixed inset-0 z-[60] transition-opacity duration-200 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
      <div className="absolute inset-0 bg-ink/50" onClick={close} />
      <nav
        aria-label="Mobile menu"
        className={`absolute left-0 top-0 h-full w-[86%] max-w-sm bg-surface flex flex-col overflow-hidden shadow-[var(--sag-shadow-pop)] transition-transform duration-[240ms] ease-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* The dark block: logo, name, search and close; under them the greeting and the gold button */}
        <div className="shrink-0 bg-dark px-4 pt-3 pb-4 text-on-dark">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => goPage('home')} aria-current={activePage === 'home' ? 'page' : undefined} className="flex min-w-0 items-center gap-2.5 rounded-full text-left cursor-pointer" aria-label="Suit Aura Girls home">
              <img src="/suit-aura-mark-132.webp" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full bg-white object-cover" />
              <span className="truncate text-[15px] font-extrabold tracking-[0.04em] text-white">SUIT AURA <span className="text-highlight">GIRLS</span></span>
            </button>
            <span className="flex shrink-0 gap-2">
              <button type="button" onClick={() => { close(); setIsSearchOpen(true); }} aria-label="Search styles" className={round}><SearchIcon mono className="w-[18px] h-[18px]" /></button>
              <button type="button" onClick={close} aria-label="Close menu" className={round}><X className="w-5 h-5" /></button>
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-on-dark-muted">
              {user
                ? <><span className="block truncate font-bold text-white">Hello{firstName ? `, ${firstName}` : ''}!</span>Orders, addresses and returns</>
                : 'Hello! Sign in to see your orders'}
            </p>
            <button type="button" onClick={() => goPage('account')} className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-sun px-4 text-[13.5px] font-extrabold text-ink cursor-pointer">
              {user ? 'My account' : 'Sign in'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col">
          <div className="px-4 py-0.5">
            {rows.map((row) => {
              const inner = (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lilac text-lilac-ink">{row.icon}</span>
                  <span className={`min-w-0 flex-1 truncate text-sm leading-5 text-ink ${row.current ? 'font-extrabold' : 'font-bold'}`}>{row.label}</span>
                  {Boolean(row.count) && <span className="sag-num shrink-0 text-[13px] font-semibold text-ink-muted">{row.count}</span>}
                  <ChevronRight className="w-[17px] h-[17px] shrink-0 text-ink-muted" aria-hidden="true" />
                </>
              );
              return row.href
                ? <a key={row.key} href={row.href} target="_blank" rel="noopener noreferrer" className={rowClass}>{inner}</a>
                : <button key={row.key} type="button" onClick={row.onClick} aria-current={row.current ? 'page' : undefined} className={rowClass}>{inner}</button>;
            })}
          </div>

          {collections.length > 0 && (
            <div className="px-4 pt-3">
              <p className="sag-eyebrow mb-2">Collections</p>
              <div className="flex flex-wrap gap-[7px]">
                {collections.map(([name, count]) => {
                  const current = activePage === 'shop' && selectedCategory === name;
                  return (
                    <button key={name} type="button" onClick={() => goCategory(name)} aria-current={current ? 'page' : undefined}
                      className={`h-10 px-3.5 rounded-full text-[13px] font-bold inline-flex items-center gap-1.5 cursor-pointer ${current ? 'bg-dark text-on-dark' : 'bg-surface text-ink border-[1.5px] border-line'}`}>
                      {name} <span className={`sag-num font-semibold ${current ? 'text-on-dark-muted' : 'text-ink-muted'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <span className="flex-1 min-h-3" />

          <p className="px-4 text-center text-xs leading-[18px] text-ink-muted">WhatsApp: Mon–Sat · 10 AM – 7 PM IST</p>
          <div className="px-4 flex flex-wrap justify-center gap-x-5 gap-y-0">
            <button type="button" onClick={() => goPage('about')} className={smallLink}>About</button>
            <button type="button" onClick={() => goPage('contact')} className={smallLink}>Contact</button>
            <button type="button" onClick={() => goPage('size-guide')} className={smallLink}>Size guide</button>
            <button type="button" onClick={() => goPage('shipping-policy')} className={smallLink}>Shipping</button>
          </div>

          {/* The pale-gold line: two of the store's facts, worded in Assurance */}
          <p className="mt-1 flex items-center justify-center gap-1.5 bg-peach px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] text-center text-xs font-bold leading-4 text-peach-ink">
            <LockIcon mono className="w-3.5 h-3.5 shrink-0" />
            <span>{facts.payment} · {facts.returns}</span>
          </p>
        </div>
      </nav>
    </div>
  );
};
