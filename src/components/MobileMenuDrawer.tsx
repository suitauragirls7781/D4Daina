import React, { useEffect, useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { ChevronRight, MessageCircle, Search, Truck, Undo2, User, X } from 'lucide-react';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { ActivePage } from '../types';
import { useBackToClose } from '../utils/backClose';
import { KIDS_TOYS, departmentOf, isKidsToysListing } from '../utils/kids';
import { assuranceFacts } from './Assurance';

/**
 * The phone menu (Midnight glass): a dark blurred glass sheet. The wordmark and close on top; a glass box to
 * sign in (or open the account) with a gold pill; the main destinations as large serif rows with hairlines and
 * their real counts; the collections as glass chips; then the help rows with thin gold icons and one
 * small line of the store's facts. Every number on it is counted from the products the store has right now.
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

  // The main destinations, as large serif rows. A count is shown only when it is a real, non-zero number.
  const mainRows: Array<{ key: string; label: string; count?: number; current: boolean; onClick: () => void }> = [
    { key: 'shop-all', label: 'Shop all', count: women.length, current: isCurrent('All'), onClick: () => goCategory('All') },
    { key: 'new-arrivals', label: 'New arrivals', count: newCount, current: isCurrent('New Arrivals'), onClick: () => goCategory('New Arrivals') },
    { key: 'offers', label: 'Offers', count: offerCount, current: isCurrent('Sale'), onClick: () => goCategory('Sale') },
    ...(kidsCount > 0 ? [{ key: 'kids', label: 'Kids & Toys', count: kidsCount, current: isCurrent(KIDS_TOYS), onClick: () => goCategory(KIDS_TOYS) }] : []),
    { key: 'wishlist', label: 'Wishlist', count: wishlist.length, current: activePage === 'wishlist', onClick: () => goPage('wishlist') },
  ];
  const helpIcon = 'w-5 h-5 shrink-0 text-sale';
  const helpRow = 'flex w-full min-h-[50px] items-center gap-3 border-b border-line py-2.5 text-left text-sm text-ink cursor-pointer';
  const smallLink = 'inline-flex items-center min-h-10 text-[12.5px] text-ink-muted underline underline-offset-4 decoration-1 hover:text-ink cursor-pointer';
  const topIcon = 'w-[38px] h-[38px] shrink-0 flex items-center justify-center rounded-full border border-line bg-white/10 text-ink hover:bg-white/15 cursor-pointer';
  const chevron = <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />;

  return (
    <div className={`lg:hidden fixed inset-0 z-[60] transition-opacity duration-200 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
      <div className="absolute inset-0 bg-[color:var(--sag-scrim)]" onClick={close} />
      <nav
        aria-label="Mobile menu"
        className={`absolute left-0 top-0 h-full w-[88%] max-w-sm bg-surface flex flex-col overflow-hidden rounded-r-[26px] border-r border-line transition-transform duration-[240ms] ease-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Top line: the wordmark, search and close */}
        <div className="shrink-0 flex h-[58px] items-center justify-between gap-2 border-b border-line pl-4 pr-3">
          <button type="button" onClick={() => goPage('home')} aria-current={activePage === 'home' ? 'page' : undefined} className="sag-caps min-w-0 truncate font-display text-[17px] font-medium uppercase leading-6 tracking-[0.14em] text-ink cursor-pointer" aria-label="Suit Aura Girls home">
            Suit Aura Girls
          </button>
          <span className="flex shrink-0 gap-1.5">
            <button type="button" onClick={() => { close(); setIsSearchOpen(true); }} aria-label="Search styles" className={topIcon}><Search className="w-5 h-5" strokeWidth={1.5} /></button>
            <button type="button" onClick={close} aria-label="Close menu" className={topIcon}><X className="w-[22px] h-[22px]" strokeWidth={1.5} /></button>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col">
          {/* Sign in (or the account), in a glass box with the gold pill */}
          <div className="sag-glass sag-glass-strong mx-4 mt-4 flex items-center gap-3 p-3 shadow-none!">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white/10 text-ink">
              <User className="w-[19px] h-[19px]" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 text-[11.5px] leading-4 text-ink-muted">
              <span className="block truncate text-sm font-semibold leading-5 text-ink">{user ? `Hello${firstName ? `, ${firstName}` : ''}` : 'Sign in'}</span>
              {user ? 'Orders, addresses and returns' : 'Track orders and keep your wishlist'}
            </p>
            <button type="button" onClick={() => goPage('account')} className="sag-btn-primary h-[38px] shrink-0 px-4 text-sm">
              {user ? 'My account' : 'Sign in'}
            </button>
          </div>

          {/* The rows enter one after another each time the menu opens */}
          <div className={`mt-1.5 px-4 ${isMobileMenuOpen ? 'sag-stagger' : ''}`}>
            {mainRows.map((row) => (
              <button key={row.key} type="button" onClick={row.onClick} aria-current={row.current ? 'page' : undefined} className="flex w-full min-h-[54px] items-center gap-3 border-b border-line py-3 text-left cursor-pointer">
                <span className={`min-w-0 flex-1 truncate font-display text-[19px] font-medium leading-7 ${row.current ? 'text-brand' : 'text-ink'}`}>{row.label}</span>
                {Boolean(row.count) && <span className="sag-num shrink-0 text-[11.5px] text-ink-muted">{row.count}</span>}
                {chevron}
              </button>
            ))}
          </div>

          {collections.length > 0 && (
            <div className="px-4 pt-[18px]">
              <p className="sag-caps text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale">Collections</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {collections.map(([name, count]) => {
                  const current = activePage === 'shop' && selectedCategory === name;
                  return (
                    <button key={name} type="button" onClick={() => goCategory(name)} aria-current={current ? 'page' : undefined}
                      className={`sag-chip h-[36px] px-3.5 text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer ${current ? 'is-selected' : 'font-normal'}`}>
                      {name} <span className={`sag-num font-normal ${current ? '' : 'text-ink-muted'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-[18px] border-t border-line px-4">
            <button type="button" onClick={() => goPage('track-order')} aria-current={activePage === 'track-order' ? 'page' : undefined} className={helpRow}>
              <Truck className={helpIcon} strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">Track order</span>
              {chevron}
            </button>
            <button type="button" onClick={() => goPage('return-policy')} aria-current={activePage === 'return-policy' ? 'page' : undefined} className={helpRow}>
              <Undo2 className={helpIcon} strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">Returns &amp; exchange</span>
              {chevron}
            </button>
            <a href={createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question.')} target="_blank" rel="noopener noreferrer" className={helpRow}>
              <MessageCircle className={helpIcon} strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">Chat on WhatsApp</span>
                <span className="block text-[11.5px] leading-4 text-ink-muted">Mon–Sat · 10 AM – 7 PM IST</span>
              </span>
              {chevron}
            </a>
          </div>

          <span className="flex-1 min-h-3" />

          <div className="px-4 flex flex-wrap justify-center gap-x-5 gap-y-0">
            <button type="button" onClick={() => goPage('about')} className={smallLink}>About</button>
            <button type="button" onClick={() => goPage('contact')} className={smallLink}>Contact</button>
            <button type="button" onClick={() => goPage('size-guide')} className={smallLink}>Size guide</button>
            <button type="button" onClick={() => goPage('shipping-policy')} className={smallLink}>Shipping</button>
          </div>

          {/* One small muted line: two of the store's facts, worded in Assurance */}
          <p className="px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-[11.5px] leading-4 tracking-[0.04em] text-ink-muted">
            {facts.payment} · {facts.returns}
          </p>
        </div>
      </nav>
    </div>
  );
};
