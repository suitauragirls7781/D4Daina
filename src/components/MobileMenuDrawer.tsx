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
 * The phone menu (owner's pick 2 of the "sleek sidebar" previews, 2026-10-08): a floating dark glass sidebar.
 * On top the logo mark, the name and close; a search pill; then the menu in groups that fold (Shop,
 * Collections, Your account, Help), each line an icon, its name and a real count where there is one; the
 * page the shopper is on is a gold pill. At the bottom, the shopper: sign in, or their name and account.
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

  const itemClass = (current?: boolean) => `flex w-full min-h-[42px] items-center gap-[11px] rounded-full px-3 py-1.5 text-left text-sm cursor-pointer transition-colors ${current ? 'bg-brand font-semibold text-[color:var(--sag-on-gold)]' : 'text-ink-muted hover:bg-white/5 hover:text-ink'}`;
  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const inner = (
      <>
        <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{item.label}</span>
          {item.note && <span className={`block truncate text-[11px] leading-4 ${item.current ? '' : 'text-ink-faint'}`}>{item.note}</span>}
        </span>
        {Boolean(item.count) && (
          <span className={`sag-num flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none ${item.current ? 'bg-black/15 text-[color:var(--sag-on-gold)]' : 'bg-brand-wash text-brand'}`}>{item.count}</span>
        )}
      </>
    );
    return item.href
      ? <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className={itemClass(false)}>{inner}</a>
      : <button key={item.key} type="button" onClick={item.onClick} aria-current={item.current ? 'page' : undefined} className={itemClass(item.current)}>{inner}</button>;
  };

  return (
    <div className={`lg:hidden fixed inset-0 z-[60] transition-opacity duration-200 ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} aria-hidden={!isMobileMenuOpen}>
      <div className="absolute inset-0 bg-[color:var(--sag-scrim)]" onClick={close} />
      <nav
        aria-label="Mobile menu"
        className={`sag-glass-bar absolute bottom-3 left-3 top-3 flex w-[84%] max-w-[320px] flex-col overflow-hidden rounded-[24px]! transition-transform duration-[320ms] ease-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-[110%]'}`}
      >
        {/* Head: the logo mark, the name and close */}
        <div className="flex shrink-0 items-center gap-2.5 px-3.5 pb-3 pt-3.5">
          <button type="button" onClick={() => goPage('home')} aria-current={activePage === 'home' ? 'page' : undefined} aria-label="Suit Aura Girls home" className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer">
            <img src="/suit-aura-mark-132.webp" alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full! bg-white object-cover" />
            <span className="min-w-0">
              <span className="sag-caps block truncate font-display text-[13.5px] font-medium uppercase leading-5 tracking-[0.1em] text-ink">Suit Aura Girls</span>
              <span className="sag-caps block truncate text-[10px] uppercase leading-4 tracking-[0.08em] text-ink-muted">Ethnic wear · Delivery across India</span>
            </span>
          </button>
          <button type="button" onClick={close} aria-label="Close menu" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white/10 text-ink cursor-pointer hover:bg-white/15">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Search: opens the store's search */}
        <button type="button" onClick={() => { close(); setIsSearchOpen(true); }} aria-label="Search styles" className="mx-3 mb-1.5 flex h-[38px] shrink-0 items-center gap-2 rounded-full border border-line bg-white/5 px-3 text-left text-[13px] text-ink-muted cursor-pointer hover:bg-white/10">
          <Search className="h-[17px] w-[17px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
          Search suits, dresses…
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {groups.map((group) => {
            const holdsCurrent = group.items.some((item) => item.current);
            const shut = Boolean(folded[group.key]) && !holdsCurrent;
            return (
              <div key={group.key}>
                <button type="button" onClick={() => toggle(group.key)} aria-expanded={!shut} className="sag-caps flex w-full items-center px-2.5 pb-1.5 pt-3 text-left text-[10px] font-bold uppercase leading-4 tracking-[0.16em] text-ink-muted cursor-pointer">
                  <span className="flex-1">{group.title}</span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${shut ? '-rotate-90' : ''}`} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${shut ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
                  <div className={`min-h-0 overflow-hidden ${isMobileMenuOpen && !shut ? 'sag-stagger' : ''}`} inert={shut || undefined}>
                    {group.items.map(renderItem)}
                  </div>
                </div>
              </div>
            );
          })}
          {/* One small muted line: two of the store's facts, worded in Assurance */}
          <p className="px-2.5 pb-1 pt-4 text-[11px] leading-4 tracking-[0.03em] text-ink-faint">{facts.payment} · {facts.returns}</p>
        </div>

        {/* The shopper: sign in, or their account */}
        <button type="button" onClick={() => goPage('account')} className="flex shrink-0 items-center gap-2.5 border-t border-line px-3.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-left cursor-pointer hover:bg-white/5">
          <span className="sag-num flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-line bg-white/10 text-xs font-bold text-ink" aria-hidden="true">
            {user ? initials : <User className="h-[17px] w-[17px]" strokeWidth={1.6} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-5 text-ink">{user ? `Hello${firstName ? `, ${firstName}` : ''}` : 'Sign in'}</span>
            <span className="block truncate text-[11px] leading-4 text-ink-muted">{user ? 'Orders, addresses and returns' : 'Track orders and keep your wishlist'}</span>
          </span>
          <span className="shrink-0 text-[12.5px] font-semibold text-brand">{user ? 'My account' : 'Sign in'}</span>
        </button>
      </nav>
    </div>
  );
};
