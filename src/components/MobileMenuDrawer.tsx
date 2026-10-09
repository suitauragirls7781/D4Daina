import React, { useEffect, useMemo, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { Baby, ChevronDown, Heart, Info, LayoutGrid, Mail, MessageCircle, Ruler, Search, Shirt, Sparkles, Tag, Truck, Undo2, User, type LucideIcon } from 'lucide-react';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { ActivePage } from '../types';
import { useBackToClose } from '../utils/backClose';
import { KIDS_TOYS, departmentOf, isKidsToysListing } from '../utils/kids';
import { assuranceFacts } from './Assurance';

type Item = { key: string; id?: string; ariaLabel?: string; label: string; icon: LucideIcon; count?: number; current?: boolean; note?: string; onClick?: () => void; href?: string };
type Group = { key: string; title: string; items: Item[] };

/**
 * The phone menu (Aura): a full-screen rose panel that wipes down from under the header. "Home" and the shop
 * links are very large bold lines that rise in one after another, each with its real count small beside it;
 * a search row; then Collections, Your account and Help as smaller rows in groups that fold; at the bottom
 * the shopper: sign in, or their name and account. The header stays on top of it (its menu button closes it).
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
      { key: 'wishlist', id: 'header-wishlist-btn-mobile', ariaLabel: `Wishlist, ${wishlist.length} items`, label: 'Wishlist', icon: Heart, count: wishlist.length, current: activePage === 'wishlist', onClick: () => goPage('wishlist') },
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

  // The very large lines rise in one after another each time the menu opens (--i is the line's place)
  let lineIndex = 1;
  const bigLine = (item: Item) => {
    const style = { '--i': Math.min(lineIndex++, 8) } as React.CSSProperties;
    return (
      <button key={item.key} type="button" onClick={item.onClick} aria-current={item.current ? 'page' : undefined} className="aura-menu-big" style={style}>
        <span className="l"><span>{item.label}</span></span>
        {Boolean(item.count) && <small className="aura-num">{item.count}</small>}
      </button>
    );
  };
  // The smaller rows follow the large lines (sag-menu-row reads --i; late rows share one step)
  let rowIndex = 6;
  const smallRow = (item: Item) => {
    const RowIcon = item.icon;
    const className = `${isMobileMenuOpen ? 'sag-menu-row ' : ''}aura-menu-row`;
    const style = { '--i': Math.min(rowIndex++, 16) } as React.CSSProperties;
    const inner = (
      <>
        <span className="min-w-0 flex-1 py-2">
          <span className="block truncate">{item.label}</span>
          {item.note && <span className="aura-mu block truncate text-[13px] font-normal leading-4">{item.note}</span>}
        </span>
        {item.count
          ? <span className="aura-num aura-mu shrink-0 text-[13px] font-bold leading-none">{item.count}</span>
          : <RowIcon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} aria-hidden="true" />}
      </>
    );
    return item.href
      ? <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className={className} style={style}>{inner}</a>
      : <button key={item.key} id={item.id} type="button" onClick={item.onClick} aria-label={item.ariaLabel} aria-current={item.current ? 'page' : undefined} className={className} style={style}>{inner}</button>;
  };

  return (
    <div id="mobile-menu-panel" className={`aura-menu aura-on-rose ${isMobileMenuOpen ? 'on' : ''}`} aria-hidden={!isMobileMenuOpen} inert={!isMobileMenuOpen || undefined}>
      <nav aria-label="Mobile menu" className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {/* Home first; it leads to the homepage */}
          <button type="button" onClick={() => goPage('home')} aria-current={activePage === 'home' ? 'page' : undefined} aria-label="Suit Aura Girls home" className="aura-menu-big" style={{ '--i': 0 } as React.CSSProperties}>
            <span className="l"><span>Home</span></span>
          </button>

          {groups.map((group, groupIndex) => {
            const holdsCurrent = group.items.some((item) => item.current);
            const shut = Boolean(folded[group.key]) && !holdsCurrent;
            return (
              <div key={group.key}>
                {/* Search sits between the large lines and the smaller groups: it opens the store's search */}
                {groupIndex === 1 && (
                  <button type="button" onClick={() => { close(); setIsSearchOpen(true); }} aria-label="Search styles" className="aura-menu-search mt-5">
                    <Search className="h-[19px] w-[19px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
                    Search suits, dresses…
                  </button>
                )}
                <button type="button" onClick={() => toggle(group.key)} aria-expanded={!shut} className={`aura-lbl flex min-h-11 w-full items-end pb-2 text-left cursor-pointer ${groupIndex === 0 ? 'pt-2' : 'pt-6'}`}>
                  <span className="flex-1">{group.title}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-300 ${shut ? '-rotate-90' : ''}`} strokeWidth={1.6} aria-hidden="true" />
                </button>
                <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${shut ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
                  <div className="min-h-0 overflow-hidden" inert={shut || undefined}>
                    {group.items.map((item) => (groupIndex === 0 ? bigLine(item) : smallRow(item)))}
                  </div>
                </div>
              </div>
            );
          })}
          {/* One small line: two of the store's facts, worded in Assurance */}
          <p className="aura-mu pt-6 text-[13.5px] leading-5">{facts.payment} · {facts.returns}</p>
        </div>

        {/* The shopper: sign in, or their account */}
        <button type="button" onClick={() => goPage('account')} className="aura-hl flex shrink-0 items-center gap-3 border-t px-6 pb-[calc(14px+env(safe-area-inset-bottom))] pt-3.5 text-left cursor-pointer">
          <span className="aura-num flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-on-dark" aria-hidden="true">
            {user ? initials : <User className="h-[19px] w-[19px]" strokeWidth={1.6} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[18px] font-extrabold leading-6 tracking-[-0.02em]">{user ? `Hello${firstName ? `, ${firstName}` : ''}` : 'Sign in'}</span>
            <span className="aura-mu block truncate text-[13px] leading-4">{user ? 'Orders, addresses and returns' : 'Track orders and keep your wishlist'}</span>
          </span>
          <span className="shrink-0 text-[14px] font-bold underline underline-offset-4">{user ? 'My account' : 'Sign in'}</span>
        </button>
      </nav>
    </div>
  );
};
