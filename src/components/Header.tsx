import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { VoiceSearchButton } from './VoiceSearchButton';
import { useDiscovery } from '../utils/discovery';
import { KIDS_TOYS, departmentOf, isKidsToysListing } from '../utils/kids';
// Photo search is off by default; its code loads only when the owner switches it on
const FindThisLookButton = lazy(() => import('./FindThisLook').then((m) => ({ default: m.FindThisLookButton })));
import { withPageTransition } from '../utils/pageTransition';
import { useShop } from '../context/ShopContext';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../context/RouterContext';
import { fuzzyMatchProduct } from '../utils/fuzzySearch';
import { getCleanImageUrl } from '../utils/imageHelper';
import { ChevronDown, ChevronRight, Clock, Trash2, X } from 'lucide-react';
import { BagIcon } from './BrandIcons';
import { HeartIcon, SearchIcon, TagIcon, UserIcon } from './StoreIcons';

const RECENT_KEY = 'sag_recent_searches_v1';

export const Header: React.FC = () => {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const {
    products = [],
    cartCount,
    wishlist,
    activePage,
    setActivePage,
    selectedCategory,
    navigateToCategory,
    navigateToProduct,
    setIsCartDrawerOpen,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    isSearchOpen,
    setIsSearchOpen,
    setSearchQuery,
  } = useShop();

  const { features } = useDiscovery();
  const [searchInput, setSearchInput] = useState('');
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Phones: a search bar under the logo that tucks away while scrolling down and returns on scroll up
  const [compact, setCompact] = useState(false);
  // The bar turns clean white once the page moves under it
  const [scrolled, setScrolled] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const collectionsRef = useRef<HTMLDivElement>(null);

  const activeProducts = useMemo(() => products.filter((p) => p.inStock), [products]);

  // Collections = women's categories that actually have products (kids wear and toys have their own page).
  const collections = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => { if (departmentOf(p) === 'women') counts.set(p.category, (counts.get(p.category) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);
  const hasKidsToys = useMemo(() => products.some((p) => departmentOf(p) !== 'women'), [products]);

  useEffect(() => {
    if (!isSearchOpen) return;
    searchInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsSearchOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isSearchOpen]);

  useEffect(() => {
    let last = window.scrollY;
    let lockUntil = 0;
    let isCompact = false;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      const now = performance.now();
      // The header height changes when the bar tucks away; ignore the scroll jump that causes
      if (now < lockUntil) { last = y; return; }
      let next = isCompact;
      if (y < 80) next = false;
      else if (y > last + 8) next = true;
      else if (y < last - 8) next = false;
      last = y;
      if (next !== isCompact) {
        isCompact = next;
        lockUntil = now + 450;
        setCompact(next);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (collectionsRef.current && !collectionsRef.current.contains(event.target as Node)) setCollectionsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setCollectionsOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, []);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileMenuOpen]);

  const saveRecent = (next: string[]) => {
    setRecentSearches(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };

  const executeSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    saveRecent([trimmed, ...recentSearches.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6));
    withPageTransition(() => {
      setSearchQuery(trimmed);
      setActivePage('shop');
      navigate(`/shop?q=${encodeURIComponent(trimmed)}`);
    });
    setIsSearchOpen(false);
    setSearchInput('');
  };

  const showMobileSearch = !['shop', 'checkout', 'cart', 'login', 'order-confirmation', 'product-detail'].includes(activePage);
  // Search hints use real collection names only
  const hints = useMemo(() => ['Search suits, kurtis & more', ...collections.slice(0, 5).map(([name]) => `Search “${name}”`)], [collections]);
  useEffect(() => {
    if (!showMobileSearch || hints.length < 2) return;
    const timer = window.setInterval(() => setHintIndex((i) => i + 1), 3200);
    return () => window.clearInterval(timer);
  }, [showMobileSearch, hints.length]);

  const searchTrimmed = searchInput.trim();
  const matches = searchTrimmed.length >= 2 ? activeProducts.filter((p) => fuzzyMatchProduct(p, searchTrimmed)) : [];
  const results = matches.slice(0, 6);

  const navItems: Array<{ label: string; action: () => void; active: boolean }> = [
    { label: 'Home', action: () => setActivePage('home'), active: activePage === 'home' },
    { label: 'Shop', action: () => navigateToCategory('All'), active: activePage === 'shop' && selectedCategory === 'All' },
    { label: 'New Arrivals', action: () => navigateToCategory('New Arrivals'), active: activePage === 'shop' && selectedCategory === 'New Arrivals' },
    ...(hasKidsToys ? [{ label: KIDS_TOYS, action: () => navigateToCategory(KIDS_TOYS as any), active: activePage === 'shop' && isKidsToysListing(selectedCategory) }] : []),
  ];

  // A solid white surface once the page moves under the bar (or while search is open)
  const surface = scrolled || isSearchOpen;
  const ease = 'ease-[cubic-bezier(0.22,1,0.36,1)]';
  const spring = 'ease-[cubic-bezier(0.34,1.56,0.64,1)]';
  const iconButton = `sag-hbtn group relative w-11 h-11 rounded-full flex items-center justify-center text-[#4B1D3F] cursor-pointer transition-[background-color,transform] duration-300 ${ease} hover:bg-[#F3EEF8] active:scale-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B1D3F]/25 lg:w-auto lg:h-auto lg:min-w-[68px] lg:px-2.5 lg:pt-2 lg:pb-1.5 lg:rounded-2xl lg:flex-col lg:gap-1.5`;
  const iconGlyph = `relative flex transition-transform duration-500 ${spring}`;
  const iconLabel = 'hidden lg:block text-[11px] font-semibold uppercase tracking-[0.16em] leading-none text-[#2A1A26]/55 group-hover:text-[#4B1D3F] transition-colors duration-300';
  const badge = `sag-badge-pop absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#4B1D3F] text-[#FBF7F3] text-[10px] font-bold tabular-nums leading-none flex items-center justify-center ring-2 transition-[box-shadow] duration-300 ${surface ? 'ring-white' : 'ring-[#FBF7F3]'} group-hover:ring-[#F3EEF8]`;
  const menuLine = `absolute left-0 h-[1.75px] rounded-full bg-current transition-all duration-300 ${ease}`;

  return (
    <header className={`sticky top-0 z-50 w-full border-b select-none transition-[background-color,box-shadow,border-color] duration-500 ${ease} ${surface ? 'bg-white border-[#4B1D3F]/[0.08] shadow-[0_14px_32px_-26px_rgba(42,26,38,0.6)]' : 'bg-[#FBF7F3] border-[#4B1D3F]/[0.06] shadow-none'}`}>
      {/* A fine champagne hairline appears under the bar once the page scrolls */}
      <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-[#C5A46D]/50 to-transparent transition-opacity duration-500 ${surface ? 'opacity-100' : 'opacity-0'}`} />

      <div className="max-w-7xl mx-auto pl-1.5 pr-2 sm:px-6 lg:px-8 h-16 sm:h-[72px] lg:h-[78px] flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-0.5 lg:gap-0 min-w-0">
          <button
            id="mobile-menu-trigger"
            onClick={() => { setIsSearchOpen(false); setIsMobileMenuOpen(!isMobileMenuOpen); }}
            className={`${iconButton} sag-hdr-in lg:hidden`}
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
          >
            {/* Three fine lines of different lengths that fold into a cross */}
            <span aria-hidden="true" className="relative block w-[22px] h-[15px]">
              <span className={`${menuLine} w-[22px] ${isMobileMenuOpen ? 'top-[6.6px] rotate-45' : 'top-0'}`} />
              <span className={`${menuLine} top-[6.6px] ${isMobileMenuOpen ? 'w-0 opacity-0' : 'w-[14px] group-hover:w-[22px]'}`} />
              <span className={`${menuLine} ${isMobileMenuOpen ? 'top-[6.6px] w-[22px] -rotate-45' : 'top-[13.2px] w-[18px] group-hover:w-[22px]'}`} />
            </span>
          </button>
          <button
            id="header-brand-logo"
            onClick={() => setActivePage('home')}
            className="sag-hdr-logo group flex items-center shrink-0 rounded-xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4B1D3F]/25"
            aria-label="Suit Aura Girls home"
          >
            <img
              src="/suit-aura-logo-480.webp"
              alt="Suit Aura Girls"
              width="480"
              height="240"
              className={`h-12 sm:h-14 lg:h-[62px] w-auto object-contain origin-left transition-[transform,opacity] duration-500 ${ease} group-hover:opacity-90 ${surface ? 'scale-[0.94]' : 'scale-100'}`}
            />
          </button>
        </div>

        {/* Desktop: a wide search field in the middle of the bar */}
        <div className="sag-hdr-in hidden lg:block relative flex-1 max-w-xl mx-6 xl:mx-12 group/search" style={{ '--i': 1 } as React.CSSProperties}>
          <button
            type="button"
            id="desktop-search-field"
            onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
            className={`w-full h-12 pl-12 pr-14 rounded-full border border-[#4B1D3F]/[0.12] hover:bg-white hover:border-[#4B1D3F]/30 hover:shadow-[0_10px_24px_-18px_rgba(42,26,38,0.55)] focus-visible:outline-none focus-visible:bg-white focus-visible:border-[#4B1D3F]/40 focus-visible:ring-4 focus-visible:ring-[#4B1D3F]/10 text-left text-[14.5px] text-[#2A1A26]/55 truncate cursor-pointer transition-[background-color,border-color,box-shadow] duration-300 ${ease} ${surface ? 'bg-[#FBF7F3]' : 'bg-white'}`}
          >
            <span key={hintIndex % hints.length} className="sag-fade inline-block">{hints[hintIndex % hints.length]}</span>
          </button>
          <span className={`absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none flex transition-transform duration-500 ${spring} group-hover/search:scale-110 group-hover/search:-rotate-6`}>
            <SearchIcon className="w-5 h-5" live={false} />
          </span>
          <VoiceSearchButton onResult={executeSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-0 sm:gap-1 lg:gap-1.5 shrink-0">
          <button id="header-search-btn" onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(!isSearchOpen); }} className={`${iconButton} sag-pop lg:!hidden ${showMobileSearch && !compact && !isSearchOpen ? 'hidden' : ''}`} aria-label="Search">
            <span className={`${iconGlyph} group-hover:-rotate-12 group-hover:scale-110`}>
              <SearchIcon className="w-[22px] h-[22px]" live={false} />
            </span>
          </button>
          <button id="header-wishlist-btn" onClick={() => setActivePage('wishlist')} className={`${iconButton} sag-hdr-in`} style={{ '--i': 2 } as React.CSSProperties} aria-label={`Wishlist, ${wishlist.length} items`}>
            <span className={`${iconGlyph} group-hover:scale-[1.14] group-active:scale-90`}>
              <HeartIcon className="w-[22px] h-[22px]" live={false} />
              {wishlist.length > 0 && <span key={`w${wishlist.length}`} className={badge}>{wishlist.length > 99 ? '99+' : wishlist.length}</span>}
            </span>
            <span className={iconLabel}>Wishlist</span>
          </button>
          <button id="header-account-btn" onClick={() => setActivePage('account')} className={`${iconButton} sag-hdr-in hidden sm:flex`} style={{ '--i': 3 } as React.CSSProperties} aria-label={user ? 'My account' : 'Sign in'}>
            <span className={`${iconGlyph} group-hover:-translate-y-0.5`}>
              <UserIcon className="w-[22px] h-[22px]" live={false} />
              {user && <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ${surface ? 'ring-white' : 'ring-[#FBF7F3]'} group-hover:ring-[#F3EEF8]`} />}
            </span>
            <span className={iconLabel}>{user ? 'Account' : 'Sign in'}</span>
          </button>
          <button
            id="header-cart-btn"
            onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setIsCartDrawerOpen(true); }}
            className={`${iconButton} sag-hdr-in`}
            style={{ '--i': 4 } as React.CSSProperties}
            aria-label={`Bag, ${cartCount} items`}
          >
            <span className={`${iconGlyph} origin-top group-hover:-translate-y-0.5 group-hover:-rotate-6`}>
              <BagIcon className="w-[22px] h-[22px]" live={false} />
              {cartCount > 0 && <span key={`c${cartCount}`} className={badge}>{cartCount > 99 ? '99+' : cartCount}</span>}
            </span>
            <span className={iconLabel}>Bag</span>
          </button>
        </div>
      </div>

      {/* Desktop: the menu on its own row under the logo and search */}
      <div className="hidden lg:block border-t border-[#4B1D3F]/[0.06]">
            <nav className="sag-hdr-in max-w-7xl mx-auto px-8 h-12 flex items-center justify-center gap-9 xl:gap-12" style={{ '--i': 2 } as React.CSSProperties} aria-label="Main">
            {navItems.map((item) => (
              <button
                key={item.label}
                id={`nav-link-${item.label.toLowerCase().replace(/&/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')}`}
                onClick={item.action}
                aria-current={item.active ? 'page' : undefined}
                className={`group relative py-2 text-[12.5px] uppercase tracking-[0.16em] transition-colors duration-300 cursor-pointer focus-visible:outline-none focus-visible:text-[#4B1D3F] ${item.active ? 'text-[#4B1D3F] font-semibold' : 'font-medium text-[#2A1A26]/70 hover:text-[#4B1D3F]'}`}
              >
                {item.label}
                <span aria-hidden="true" className={`absolute left-0 right-0 bottom-0.5 h-px bg-[#C5A46D] origin-center transition-transform duration-500 ${ease} ${item.active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100'}`} />
                {item.active && <span aria-hidden="true" className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-1 h-1 rounded-full bg-[#C5A46D]" />}
              </button>
            ))}
            <div className="relative" ref={collectionsRef}>
              <button
                id="nav-link-collections"
                onClick={() => setCollectionsOpen(!collectionsOpen)}
                aria-expanded={collectionsOpen}
                aria-haspopup="true"
                aria-controls="collections-menu"
                className={`group flex items-center gap-1 py-2 text-[12.5px] uppercase tracking-[0.16em] transition-colors duration-300 cursor-pointer focus-visible:outline-none focus-visible:text-[#4B1D3F] ${collectionsOpen || (activePage === 'shop' && collections.some(([c]) => c === selectedCategory)) ? 'text-[#4B1D3F] font-semibold' : 'font-medium text-[#2A1A26]/70 hover:text-[#4B1D3F]'}`}
              >
                Collections <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-500 ${ease} ${collectionsOpen ? 'rotate-180' : 'group-hover:translate-y-px'}`} />
              </button>
              {collectionsOpen && (
                <div id="collections-menu" className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[440px] bg-white rounded-3xl border border-[#4B1D3F]/10 shadow-[0_24px_48px_-24px_rgba(42,26,38,0.35)] p-3 z-50 sag-pop">
                  <span aria-hidden="true" className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-3.5 h-3.5 rotate-45 bg-white border-l border-t border-[#4B1D3F]/10" />
                  <div className="flex items-center justify-between px-3 pt-2 pb-3">
                    <p className="font-serif text-xl text-[#4B1D3F]">Shop by collection</p>
                    {collections.length > 0 && <span className="text-[12px] text-[#2A1A26]/55">{collections.length} {collections.length === 1 ? 'collection' : 'collections'}</span>}
                  </div>
                  {collections.length === 0 && <p className="px-3 pb-3 text-sm text-[#2A1A26]/70">Collections appear as products are added.</p>}
                  <div className="grid grid-cols-2 gap-1">
                    {collections.map(([name, count]) => {
                      const current = activePage === 'shop' && selectedCategory === name;
                      return (
                        <button
                          key={name}
                          onClick={() => { navigateToCategory(name as any); setCollectionsOpen(false); }}
                          aria-current={current ? 'page' : undefined}
                          className={`group w-full flex items-center justify-between gap-2 px-3.5 py-3 rounded-2xl text-left text-[14px] transition-colors cursor-pointer ${current ? 'bg-[#F3EEF8] text-[#4B1D3F] font-semibold' : 'text-[#2A1A26] hover:bg-[#F3EEF8] hover:text-[#4B1D3F]'}`}
                        >
                          <span className="truncate">{name}</span>
                          <span className="shrink-0 min-w-[26px] h-[22px] px-2 rounded-full bg-[#FBF7F3] group-hover:bg-white text-[11px] font-semibold text-[#2A1A26]/60 flex items-center justify-center">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 pt-3 px-1 pb-1 border-t border-[#4B1D3F]/10 flex items-center gap-2">
                    <button onClick={() => { navigateToCategory('All'); setCollectionsOpen(false); }} className="sag-btn-primary flex-1 h-10 px-4 text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer">
                      View all styles <ChevronRight className="w-4 h-4 text-white" />
                    </button>
                    <button onClick={() => { navigateToCategory('New Arrivals'); setCollectionsOpen(false); }} className="sag-btn-outline flex-1 h-10 px-4 text-[13px] font-semibold cursor-pointer">
                      New arrivals
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              id="nav-link-offers"
              onClick={() => navigateToCategory('Sale')}
              aria-current={activePage === 'shop' && selectedCategory === 'Sale' ? 'page' : undefined}
              className={`group inline-flex items-center gap-1.5 h-8 px-3.5 -mx-1 rounded-full text-[12.5px] uppercase tracking-[0.16em] transition-colors duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A2E55]/25 ${activePage === 'shop' && selectedCategory === 'Sale' ? 'bg-[#F7E4EA] text-[#8A2E55] font-semibold' : 'font-medium text-[#8A2E55] hover:bg-[#F7E4EA]'}`}
            >
              <span className={`flex transition-transform duration-500 ${spring} group-hover:rotate-12`}><TagIcon className="w-4 h-4" live={false} /></span> Offers
            </button>
          </nav>
      </div>

      {showMobileSearch && !isSearchOpen && (
        <div className={`sag-hdr-in lg:hidden overflow-hidden transition-[max-height,opacity,transform] duration-500 ${ease} ${compact ? 'max-h-0 opacity-0 -translate-y-1' : 'max-h-28 opacity-100 translate-y-0'}`} style={{ '--i': 3 } as React.CSSProperties} aria-hidden={compact}>
          <div className="relative mx-3 mb-2.5">
            <button
              type="button"
              id="mobile-search-pill"
              tabIndex={compact ? -1 : 0}
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
              className={`w-full h-11 pl-11 pr-12 rounded-full border border-[#4B1D3F]/[0.12] text-left text-[14px] text-[#2A1A26]/55 truncate cursor-pointer shadow-[0_8px_20px_-18px_rgba(42,26,38,0.6)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#4B1D3F]/10 transition-[background-color,transform] duration-300 ${ease} ${surface ? 'bg-[#FBF7F3]' : 'bg-white'}`}
            >
              <span key={hintIndex % hints.length} className="sag-fade inline-block">{hints[hintIndex % hints.length]}</span>
            </button>
            <SearchIcon className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" live={false} />
            <VoiceSearchButton onResult={executeSearch} className="absolute right-1 top-1/2 -translate-y-1/2" />
          </div>
          {/* Quick collections (only ones that have products), one swipe away */}
          <div className="sag-scroll-x flex gap-2 overflow-x-auto px-3 pb-2.5" aria-label="Quick collections">
            <button type="button" tabIndex={compact ? -1 : 0} onClick={() => navigateToCategory('New Arrivals')} className="shrink-0 h-8 px-3.5 rounded-full bg-[#4B1D3F] text-white text-[13px] font-medium cursor-pointer">New in</button>
            <button type="button" tabIndex={compact ? -1 : 0} onClick={() => navigateToCategory('Sale')} className="shrink-0 h-8 px-3.5 rounded-full bg-[#F7E4EA] text-[#8A2E55] text-[13px] font-semibold inline-flex items-center gap-1 cursor-pointer"><TagIcon className="w-3.5 h-3.5" live={false} /> Offers</button>
            {collections.slice(0, 8).map(([name]) => (
              <button key={name} type="button" tabIndex={compact ? -1 : 0} onClick={() => navigateToCategory(name as any)} className="shrink-0 h-8 px-3.5 rounded-full bg-white border border-[#4B1D3F]/12 text-[13px] text-[#2A1A26]/80 hover:border-[#4B1D3F]/30 active:scale-95 active:bg-[#F3EEF8] transition-[transform,background-color,border-color] cursor-pointer">{name}</button>
            ))}
            {hasKidsToys && <button type="button" tabIndex={compact ? -1 : 0} onClick={() => navigateToCategory(KIDS_TOYS as any)} className="shrink-0 h-8 px-3.5 rounded-full bg-white border border-[#4B1D3F]/12 text-[13px] text-[#2A1A26]/80 hover:border-[#4B1D3F]/30 active:scale-95 active:bg-[#F3EEF8] transition-[transform,background-color,border-color] cursor-pointer">{KIDS_TOYS}</button>}
          </div>
        </div>
      )}

      {isSearchOpen && (
        <div id="search-drawer-overlay" className="sag-drop relative border-t border-[#4B1D3F]/10 bg-white shadow-[0_18px_32px_-20px_rgba(42,26,38,0.35)]">
          {/* Dim the page under the panel; a tap outside closes it */}
          <div className="absolute left-0 right-0 top-full h-screen bg-[#2A1A26]/30 sag-fade" onClick={() => setIsSearchOpen(false)} aria-hidden="true" />
          <div className="relative max-w-3xl mx-auto px-4 sm:px-8 pt-4 pb-6 max-h-[calc(100vh-5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain">
            <form role="search" onSubmit={(e) => { e.preventDefault(); executeSearch(searchInput); }} className="relative">
              <SearchIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" live={false} />
              <input
                ref={searchInputRef}
                id="search-input-field"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Try “red lehenga under 1500”"
                aria-label="Search products"
                enterKeyHint="search"
                autoComplete="off"
                className={`w-full pl-12 ${searchInput ? 'pr-[9.5rem] sm:pr-44' : 'pr-32 sm:pr-36'} h-[52px] bg-[#FBF7F3] border border-[#4B1D3F]/15 rounded-full text-[15px] text-[#2A1A26] placeholder:text-[#2A1A26]/45 focus:outline-none focus:bg-white focus:border-[#4B1D3F]/50 focus:ring-4 focus:ring-[#4B1D3F]/10 [&::-webkit-search-cancel-button]:appearance-none`}
              />
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {searchInput && (
                  <button type="button" onClick={() => { setSearchInput(''); searchInputRef.current?.focus(); }} aria-label="Clear search" className="w-9 h-9 rounded-full flex items-center justify-center text-[#2A1A26]/60 hover:bg-[#F3EEF8] cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                )}
                <VoiceSearchButton onResult={executeSearch} />
                <button type="submit" id="search-submit-btn" className="sag-btn-primary h-10 px-4 sm:px-5 text-xs font-semibold tracking-[0.12em] uppercase cursor-pointer">
                  Search
                </button>
              </span>
            </form>
            {features.visualSearch && <Suspense fallback={null}><FindThisLookButton variant="chip" className="mt-3" /></Suspense>}

            {searchTrimmed.length >= 2 && (
              <div className="mt-5">
                {results.length > 0 ? (
                  <>
                    <p className="sag-eyebrow mb-2 px-1">Styles</p>
                    <div className="grid gap-1">
                      {results.map((prod) => {
                        const mrp = Math.max(prod.price, Number(prod.originalPrice) || prod.price);
                        const off = mrp > prod.price ? Math.round(((mrp - prod.price) / mrp) * 100) : 0;
                        return (
                          <button
                            key={prod.id}
                            id={`search-result-${prod.id}`}
                            onClick={() => { navigateToProduct(prod.id); setIsSearchOpen(false); setSearchInput(''); }}
                            className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-[#F3EEF8] focus-visible:bg-[#F3EEF8] text-left transition-colors cursor-pointer"
                          >
                            <img src={getCleanImageUrl(prod.images?.[0] || prod.image || '', 120)} alt="" className="w-12 h-[60px] shrink-0 object-cover object-top rounded-xl bg-[#F3EEF8]" />
                            <div className="flex-1 min-w-0">
                              <p className="font-serif text-[16px] leading-snug text-[#2A1A26] truncate">{prod.name}</p>
                              <p className="mt-0.5 text-[13px] text-[#2A1A26]/60 truncate">{prod.category}</p>
                              <p className="mt-0.5 flex items-baseline gap-1.5 text-[13px]">
                                <span className="font-semibold text-[#4B1D3F]">₹{prod.price.toLocaleString('en-IN')}</span>
                                {off > 0 && <span className="text-xs text-[#2A1A26]/50 line-through">₹{mrp.toLocaleString('en-IN')}</span>}
                                {off > 0 && <span className="text-xs font-semibold text-[#8A2E55]">{off}% off</span>}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 shrink-0 text-[#4B1D3F]/40" />
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => executeSearch(searchInput)} className="mt-2 w-full h-11 rounded-full border border-[#4B1D3F]/15 text-sm font-medium text-[#4B1D3F] hover:bg-[#F3EEF8] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer">
                      <span className="truncate">See all {matches.length} {matches.length === 1 ? 'result' : 'results'} for “{searchTrimmed}”</span>
                      <ChevronRight className="w-4 h-4 shrink-0" />
                    </button>
                  </>
                ) : (
                  <div className="rounded-2xl bg-[#FBF7F3] border border-[#4B1D3F]/10 px-4 py-5 text-center">
                    <p className="font-serif text-xl text-[#2A1A26] break-words">No styles match “{searchTrimmed}”</p>
                    <p className="mt-1 text-sm text-[#2A1A26]/65">Check the spelling or pick a collection below.</p>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 space-y-5">
              {recentSearches.length > 0 && (
                <div id="recent-searches-container">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="sag-eyebrow flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[#9C7A45]" /> Recent searches</span>
                    <button type="button" id="clear-recent-searches-btn" onClick={() => saveRecent([])} className="h-9 px-2 -mr-2 rounded-full text-[13px] text-[#2A1A26]/65 hover:text-[#4B1D3F] flex items-center gap-1 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" /> Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term) => (
                      <button key={term} onClick={() => executeSearch(term)} className="h-10 max-w-full px-4 rounded-full border border-[#4B1D3F]/15 bg-white text-sm text-[#2A1A26] hover:bg-[#F3EEF8] inline-flex items-center gap-1.5 transition-colors cursor-pointer">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-[#2A1A26]/40" />
                        <span className="truncate">{term}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {collections.length > 0 && (
                <div id="trending-searches-container">
                  <span className="sag-eyebrow block mb-2.5">Shop collections</span>
                  <div className="flex flex-wrap gap-2">
                    {collections.map(([name, count]) => (
                      <button
                        key={name}
                        onClick={() => { navigateToCategory(name as any); setIsSearchOpen(false); }}
                        className="h-10 px-4 rounded-full bg-[#F3EEF8] text-sm text-[#4B1D3F] hover:bg-[#E6DDF0] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {name} <span className="text-xs text-[#4B1D3F]/55 tabular-nums">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
