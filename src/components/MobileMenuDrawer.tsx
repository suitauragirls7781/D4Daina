import React, { useEffect, useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { Baby, ChevronDown, Heart, Info, LayoutGrid, Mail, MessageCircle, Ruler, Search, Shirt, Sparkles, Tag, Truck, Undo2, User, X, type LucideIcon } from 'lucide-react';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { ActivePage } from '../types';
import { useBackToClose } from '../utils/backClose';
import { KIDS_TOYS, departmentOf, isKidsToysListing } from '../utils/kids';
import { assuranceFacts } from './Assurance';

type Item = { key: string; label: string; icon: LucideIcon; count?: number; current?: boolean; note?: string; onClick?: () => void; href?: string };
type Group = { key: string; title: string; items: Item[] };

/**
 * The phone menu (Emerald Heritage, 2026-10-09): an emerald panel from the left, the full height of the screen.
 * On top a champagne "Menu" label and close; the brand row (home) and a search row; then the menu in groups
 * that fold (Shop, Collections, Your account, Help) as serif rows between thin champagne lines, each with its
 * real count where there is one; the page the shopper is on is in champagne. At the bottom, the shopper:
 * sign in, or their name and account. Rows slide in one after another when the menu opens.
 * Every number is counted from the products the store has right now.
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
  const initials = (firstName || 'You').slice(0, 2).toUpperCase();

  const groups: Group[] = [
    { key: 'shop', title: 'Shop', items: [
      { key: 'shop-all', label: 'Shop all', icon: LayoutGrid, count: women.length, current: isCurrent('All'), onClick: () => goCategory('All') },
      { key: 'new-arrivals', label: 'New arrivals', icon: Sparkles, count: newCount, current: isCurrent('New Arrivals'), onClick: () => goCategory('New Arrivals') },
      { key: 'offers', label: 'Offers', icon: Tag, count: offerCount, current: isCurrent('Sale'), onClick: () => goCategory('Sale') },
      ...(kidsCount > 0 ? [{ key: 'kids', label: 'Kids & Toys', icon: Baby, count: kidsCount, current: isCurrent(KIDS_TOYS), onClick: () => goCategory(KIDS_TOYS) }] : []),
    ] },
    ...(collections.length > 0 ? [{ key: 'collections', title: 'Collections', items: collections.map(([name, count]): Item => ({
      key: `collection-${name}`, label: name, icon: Shirt, count, current: activePage === 'shop' && selectedCategory === name, onClick: () => goCategory(name),
    })) }] : []),
    { key: 'account', title: 'Your account', items: [
      { key: 'wishlist', label: 'Wishlist', icon: Heart, count: wishlist.length, current: activePage === 'wishlist', onClick: () => goPage('wishlist') },
      { key: 'track-order', label: 'Track order', icon: Truck, current: activePage === 'track-order', onClick: () => goPage('track-order') },
      { key: 'my-account', label: user ? 'My account' : 'Sign in', icon: User, current: activePage === 'account' || activePage === 'login', onClick: () => goPage('account') },
    ] },
    { key: 'help', title: 'Help', items: [
      { key: 'returns', label: 'Returns & exchange', icon: Undo2, current: activePage === 'return-policy', onClick: () => goPage('return-policy') },
      { key: 'whatsapp', label: 'Chat on WhatsApp', icon: MessageCircle, note: 'Mon–Sat · 10 AM – 7 PM IST', href: createSupportWhatsAppUrl('Hi Suit Aura Girls! I have a question.') },
      { key: 'contact', label: 'Contact', icon: Mail, current: activePage === 'contact', onClick: () => goPage('contact') },
      { key: 'size-guide', label: 'Size guide', icon: Ruler, current: activePage === 'size-guide', onClick: () => goPage('size-guide') },
      { key: 'shipping', label: 'Shipping', icon: Truck, current: activePage === 'shipping-policy', onClick: () => goPage('shipping-policy') },
      { key: 'about', label: 'About', icon: Info, current: activePage === 'about', onClick: () => goPage('about') },
    ] },
  ];

  // A group folds when its title is tapped; the group that holds the current page never starts folded
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setFolded((state) => ({ ...state, [key]: !state[key] }));

  // Rows slide in one after another each time the menu opens (sag-menu-row reads --i; late rows share one step)
  let rowIndex = 0;
  const renderItem = (item: Item, large: boolean) => {
    const Icon = item.icon;
    const step = Math.min(rowIndex++, 14);
    const rowClass = `${isMobileMenuOpen ? 'sag-menu-row' : ''} flex w-full items-center justify-between gap-3 border-b border-line text-left font-display cursor-pointer transition-colors hover:text-highlight ${large ? 'min-h-[52px] text-[22px] leading-7' : 'min-h-[46px] text-[18px] leading-6'} ${item.current ? 'text-highlight' : ''}`;
    const rowStyle = { '--i': step } as React.CSSProperties;
    const inner = (
      <>
        <span className="min-w-0 flex-1 py-2">
          <span className="block truncate">{item.label}</span>
          {item.note && <span className="block truncate font-sans text-[11.5px] font-normal leading-4 text-on-dark-muted">{item.note}</span>}
        </span>
        {item.count
          ? <span className="sag-num shrink-0 font-sans text-[12px] font-medium leading-none text-on-dark-muted">{item.count}</span>
          : <Icon className="h-[17px] w-[17px] shrink-0 text-highlight" strokeWidth={1.5} aria-hidden="true" />}
      </>
    );
    return item.href
      ? <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className={rowClass} style={rowStyle}>{inner}</a>
      : <button key={item.key} type="button" onClick={item.onClick} aria-current={item.current ? 'page' : undefined} className={rowClass} style={rowStyle}>{inner}</button>;
  };

  return (
    <div className={`lg:hidden fixed inset-0 z-[60] transition-opacity duration-300 motion-reduce:transition-none ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
      <div className="absolute inset-0 bg-[color:var(--sag-scrim)]" onClick={close} />
      <nav
        aria-label="Mobile menu"
        className={`sag-on-emerald absolute inset-y-0 left-0 flex w-[84%] max-w-[340px] flex-col overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Top: the small champagne label and close */}
        <div className="flex h-14 shrink-0 items-center justify-between pl-6 pr-2.5">
          <span className="sag-caps text-[10.5px] font-semibold uppercase leading-none tracking-[0.24em] text-highlight">Menu</span>
          <button type="button" onClick={close} aria-label="Close menu" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg cursor-pointer transition-[color,transform] duration-200 hover:text-highlight active:scale-90">
            <X className="h-[21px] w-[21px]" strokeWidth={1.5} />
          </button>
        </div>

        {/* The brand: the logo mark and the name; it leads home */}
        <button type="button" onClick={() => goPage('home')} aria-current={activePage === 'home' ? 'page' : undefined} aria-label="Suit Aura Girls home" className="flex shrink-0 items-center gap-3 px-6 pb-4 text-left cursor-pointer">
          <img src="/suit-aura-mark-132.webp" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full! border border-line object-cover" />
          <span className="min-w-0">
            <span className="sag-caps block truncate font-display text-[17px] uppercase leading-5 tracking-[0.16em]!">Suit Aura Girls</span>
            <span className="mt-1 block truncate text-[11.5px] leading-4 text-on-dark-muted">Ethnic wear · Delivery across India</span>
          </span>
        </button>

        {/* Search: opens the store's search */}
        <button type="button" onClick={() => { close(); setIsSearchOpen(true); }} aria-label="Search styles" className="mx-6 flex h-11 shrink-0 items-center gap-2.5 rounded-lg border border-line bg-brand-dark px-3.5 text-left text-[13.5px] text-on-dark-muted cursor-pointer">
          <Search className="h-[18px] w-[18px] shrink-0 text-highlight" strokeWidth={1.5} aria-hidden="true" />
          Search suits, dresses…
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
          {groups.map((group, groupIndex) => {
            const holdsCurrent = group.items.some((item) => item.current);
            const shut = Boolean(folded[group.key]) && !holdsCurrent;
            return (
              <div key={group.key}>
                <button type="button" onClick={() => toggle(group.key)} aria-expanded={!shut} className="sag-caps flex min-h-11 w-full items-end border-b border-line pb-2.5 pt-5 text-left text-[10.5px] font-semibold uppercase leading-none tracking-[0.24em] text-highlight cursor-pointer">
                  <span className="flex-1">{group.title}</span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${shut ? '-rotate-90' : ''}`} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${shut ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
                  <div className="min-h-0 overflow-hidden" inert={shut || undefined}>
                    {group.items.map((item) => renderItem(item, groupIndex === 0))}
                  </div>
                </div>
              </div>
            );
          })}
          {/* One small muted line: two of the store's facts, worded in Assurance */}
          <p className="pt-5 text-[13px] leading-5 text-on-dark-muted">{facts.payment} · {facts.returns}</p>
        </div>

        {/* The shopper: sign in, or their account */}
        <button type="button" onClick={() => goPage('account')} className="flex shrink-0 items-center gap-3 border-t border-line px-6 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3.5 text-left cursor-pointer">
          <span className="sag-num flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-xs font-semibold text-highlight" aria-hidden="true">
            {user ? initials : <User className="h-[18px] w-[18px]" strokeWidth={1.5} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[19px] leading-6">{user ? `Hello${firstName ? `, ${firstName}` : ''}` : 'Sign in'}</span>
            <span className="block truncate text-[12px] leading-4 text-on-dark-muted">{user ? 'Orders, addresses and returns' : 'Track orders and keep your wishlist'}</span>
          </span>
          <span className="sag-caps shrink-0 text-[10.5px] font-semibold uppercase leading-none tracking-[0.18em] text-highlight">{user ? 'My account' : 'Sign in'}</span>
        </button>
      </nav>
    </div>
  );
};
