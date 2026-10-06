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
import { isAvailable, searchQueryMatcher } from '../utils/smartQuery';
import { getCleanImageUrl } from '../utils/imageHelper';
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, Clock, Loader2, Menu, Trash2, X } from 'lucide-react';
import { PIN_KEY, PIN_RE, lookupPincode } from './DeliveryCheck';
import { BagIcon } from './BrandIcons';
import { useBackToClose } from '../utils/backClose';
import { HeartIcon, PinIcon, SearchIcon, TagIcon, UserIcon } from './StoreIcons';

const RECENT_KEY = 'sag_recent_searches_v1';

/** The brand name with each letter rising in once, then a slow wave passing through it (as in the chosen header). */
const WaveName: React.FC = () => {
  const letters = (text: string, from: number) => text.split('').map((letter, index) => (
    <span key={from + index} style={{ ['--i' as any]: from + index }}>{letter === ' ' ? ' ' : letter}</span>
  ));
  return (
    <span className="sag-wave block truncate text-base font-extrabold leading-[17px] tracking-[0.04em] text-ink" aria-hidden="true">
      {letters('SUIT AURA ', 0)}<span className="text-accent">{letters('GIRLS', 10)}</span>
    </span>
  );
};

/**
 * The search field's hint types itself: a suggestion is written letter by letter, rests, is erased, and the
 * next one follows. The suggestions are the store's own collections, so each one finds something.
 * With reduced motion the plain label is shown.
 */
const TypedSearchHint: React.FC<{ words: string[]; fallback: string }> = ({ words, fallback }) => {
  const [text, setText] = useState('');
  const still = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const list = words.join('|');
  useEffect(() => {
    const items = list ? list.split('|') : [];
    if (still || items.length === 0) return;
    let word = 0;
    let shown = 0;
    let direction = 1;
    let timer = 0;
    const tick = () => {
      const current = items[word];
      shown += direction;
      setText(current.slice(0, shown));
      let wait = direction > 0 ? 90 : 40;
      if (direction > 0 && shown >= current.length) { direction = -1; wait = 1500; }
      else if (direction < 0 && shown <= 0) { direction = 1; word = (word + 1) % items.length; wait = 350; }
      timer = window.setTimeout(tick, wait);
    };
    timer = window.setTimeout(tick, 900);
    return () => window.clearTimeout(timer);
  }, [list, still]);
  if (still || !list) return <span className="truncate">{fallback}</span>;
  return <span className="sag-type truncate" aria-hidden="true">Search “{text}</span>;
};

/**
 * "PIN" in the header: the shopper types a PIN code and sees the place it belongs to (India Post directory,
 * the same lookup the product page and the checkout use). The store delivers across India, so a PIN code
 * that exists is one we deliver to. The PIN code is remembered for the product page's delivery check.
 */
const HeaderPinCheck: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [pin, setPin] = useState(() => {
    try { const saved = localStorage.getItem(PIN_KEY) || ''; return PIN_RE.test(saved) ? saved : ''; } catch { return ''; }
  });
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ok' | 'invalid' | 'not-found' | 'error'; place?: string }>({ status: 'idle' });
  const field = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  useEffect(() => { field.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const check = (event: React.FormEvent) => {
    event.preventDefault();
    if (!PIN_RE.test(pin)) { setState({ status: 'invalid' }); return; }
    const id = ++request.current;
    setState({ status: 'loading' });
    lookupPincode(pin)
      .then((place) => {
        if (id !== request.current) return;
        if (!place) { setState({ status: 'not-found' }); return; }
        try { localStorage.setItem(PIN_KEY, pin); } catch {}
        setState({ status: 'ok', place: [place.district, place.state].filter(Boolean).join(', ') });
      })
      .catch(() => { if (id === request.current) setState({ status: 'error' }); });
  };

  return (
    <div id="header-pin-panel" className="sag-drop relative">
      <div className="absolute left-0 right-0 top-full h-screen bg-ink/50 sag-fade" onClick={onClose} aria-hidden="true" />
      <div className="relative mx-2.5 mb-2.5 rounded-card bg-white p-4 shadow-[var(--sag-shadow-pop)]">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-bold leading-6 text-ink">Check delivery to your PIN code</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mt-2 -mr-2 shrink-0 rounded-full flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={check} className="mt-2 flex gap-2">
          <input
            ref={field}
            id="header-pin-input"
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setState({ status: 'idle' }); }}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="6-digit PIN code"
            aria-label="PIN code"
            aria-invalid={state.status === 'invalid' || state.status === 'not-found'}
            className="sag-input h-12 flex-1 min-w-0 sag-num"
          />
          <button type="submit" disabled={state.status === 'loading'} className="sag-btn-primary h-12 px-5 text-sm shrink-0 gap-1.5">
            {state.status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />} Check
          </button>
        </form>
        <div className="mt-2 min-h-5 text-sm leading-5" role="status" aria-live="polite">
          {state.status === 'ok' && <p className="flex items-start gap-1.5 font-semibold text-ok"><CircleCheck className="w-4 h-4 mt-0.5 shrink-0" /> We deliver to {state.place} ({pin}).</p>}
          {state.status === 'invalid' && <p className="flex items-start gap-1.5 font-semibold text-danger"><CircleAlert className="w-4 h-4 mt-0.5 shrink-0" /> Enter a 6-digit PIN code.</p>}
          {state.status === 'not-found' && <p className="flex items-start gap-1.5 font-semibold text-danger"><CircleAlert className="w-4 h-4 mt-0.5 shrink-0" /> We could not find this PIN code. Please check it.</p>}
          {state.status === 'error' && <p className="flex items-start gap-1.5 font-semibold text-danger"><CircleAlert className="w-4 h-4 mt-0.5 shrink-0" /> The PIN code could not be checked right now. Please try again.</p>}
        </div>
      </div>
    </div>
  );
};

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
  const [pinOpen, setPinOpen] = useState(false);
  // The phone's Back button closes the search panel or the PIN check instead of leaving the page
  useBackToClose(isSearchOpen, () => setIsSearchOpen(false));
  useBackToClose(pinOpen, () => setPinOpen(false));
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const collectionsRef = useRef<HTMLDivElement>(null);

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

  const searchTrimmed = searchInput.trim();
  // Same matching and pool as the results page (/shop?q=): every published style, sold-out ones last.
  const matches = useMemo(() => {
    if (searchTrimmed.length < 2) return [];
    const found = products.filter(searchQueryMatcher(searchTrimmed));
    return [...found.filter(isAvailable), ...found.filter((p) => !isAvailable(p))];
  }, [products, searchTrimmed]);
  const results = matches.slice(0, 6);

  const navItems: Array<{ label: string; action: () => void; active: boolean }> = [
    { label: 'Home', action: () => setActivePage('home'), active: activePage === 'home' },
    { label: 'Shop', action: () => navigateToCategory('All'), active: activePage === 'shop' && selectedCategory === 'All' },
    { label: 'New Arrivals', action: () => navigateToCategory('New Arrivals'), active: activePage === 'shop' && selectedCategory === 'New Arrivals' },
    ...(hasKidsToys ? [{ label: KIDS_TOYS, action: () => navigateToCategory(KIDS_TOYS as any), active: activePage === 'shop' && isKidsToysListing(selectedCategory) }] : []),
  ];

  // One look for every header control: a 44px round button, ink icon, grey fill on hover
  const iconButton = 'relative w-11 h-11 shrink-0 rounded-full items-center justify-center text-ink hover:bg-sunken cursor-pointer transition-colors';
  const badge = 'absolute top-0.5 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-bold tabular-nums leading-none flex items-center justify-center';
  const navLink = (active: boolean) => `relative h-12 inline-flex items-center text-sm cursor-pointer transition-colors ${active ? 'text-ink font-semibold' : 'font-medium text-ink-muted hover:text-ink'}`;
  const navUnderline = (active: boolean) => `absolute left-0 right-0 bottom-0 h-0.5 bg-brand ${active ? '' : 'hidden'}`;
  const collectionActive = collectionsOpen || (activePage === 'shop' && collections.some(([c]) => c === selectedCategory));
  const offersActive = activePage === 'shop' && selectedCategory === 'Sale';
  const chip = 'h-11 px-3.5 rounded-chip bg-sunken text-sm font-medium text-ink hover:bg-sunken-deep inline-flex items-center gap-1.5 transition-colors cursor-pointer';
  const searchLabel = 'Search suits, kurtis & more';
  // What the search hint types: the store's biggest collections, in the words a shopper would use
  const searchHints = collections.slice(0, 5).map(([name]) => name.toLowerCase());

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-dark lg:bg-white lg:border-b lg:border-line select-none">
        {/* Phones and tablets: the "floating pill". A white pill with the logo, name, wishlist and bag;
            under it the menu, the search field and the PIN code check. */}
        <div className="lg:hidden max-w-2xl mx-auto p-2.5">
          <div className="flex items-center gap-2 rounded-full bg-white py-[5px] pl-[5px] pr-1.5 shadow-[0_4px_14px_rgba(11,31,63,0.10)]">
            <button id="header-brand-logo-mobile" onClick={() => setActivePage('home')} className="flex min-w-0 flex-1 items-center gap-2 rounded-full text-left cursor-pointer" aria-label="Suit Aura Girls home">
              <img src="/suit-aura-mark-132.webp" alt="" width="44" height="44" className="sag-float h-11 w-11 shrink-0 rounded-full bg-white object-cover" />
              <span className="min-w-0">
                <WaveName />
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold leading-[14px] text-mint-ink">
                  <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-sun" />
                  <span className="truncate">Delivery across India</span>
                </span>
              </span>
            </button>
            <button id="header-wishlist-btn-mobile" onClick={() => setActivePage('wishlist')} className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-sunken text-ink cursor-pointer" aria-label={`Wishlist, ${wishlist.length} items`}>
              <HeartIcon className="w-[22px] h-[22px]" mono />
              {wishlist.length > 0 && <span className={badge}>{wishlist.length > 99 ? '99+' : wishlist.length}</span>}
            </button>
            <button
              id="header-cart-btn-mobile"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setPinOpen(false); setIsCartDrawerOpen(true); }}
              className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-sunken text-ink cursor-pointer"
              aria-label={`Bag, ${cartCount} items`}
            >
              <BagIcon className="w-[22px] h-[22px]" mono />
              {cartCount > 0 && <span className={badge}>{cartCount > 99 ? '99+' : cartCount}</span>}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              id="mobile-menu-trigger"
              onClick={() => { setIsSearchOpen(false); setPinOpen(false); setIsMobileMenuOpen(!isMobileMenuOpen); }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ink cursor-pointer"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-[22px] h-[22px]" strokeWidth={1.9} /> : <Menu className="w-[22px] h-[22px]" strokeWidth={1.9} />}
            </button>
            {/* The accessible name starts with "Search suits" (the storefront check looks for it) */}
            <button
              id="header-search-btn"
              onClick={() => { setIsMobileMenuOpen(false); setPinOpen(false); setIsSearchOpen(!isSearchOpen); }}
              className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white px-3.5 text-left text-sm text-ink-muted cursor-pointer"
              aria-label={searchLabel}
              aria-expanded={isSearchOpen}
            >
              <span className="flex shrink-0 text-brand"><SearchIcon className="w-[19px] h-[19px]" mono /></span>
              <TypedSearchHint words={searchHints} fallback={searchLabel} />
            </button>
            <button
              id="header-pin-btn"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setPinOpen(!pinOpen); }}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-sun px-3.5 text-[13px] font-extrabold text-ink cursor-pointer"
              aria-label="Check delivery to your PIN code"
              aria-expanded={pinOpen}
            >
              <span className="flex text-ink"><PinIcon className="w-4 h-4" mono /></span> PIN
            </button>
          </div>
        </div>
        {pinOpen && <div className="lg:hidden"><HeaderPinCheck onClose={() => setPinOpen(false)} /></div>}

        <div className="hidden lg:flex max-w-7xl mx-auto px-8 h-[68px] items-center justify-between gap-3">
          <div className="flex items-center min-w-0">
            <button
              id="header-brand-logo"
              onClick={() => setActivePage('home')}
              className="flex items-center shrink-0 rounded-control cursor-pointer"
              aria-label="Suit Aura Girls home"
            >
              <img
                src="/suit-aura-logo-480.webp"
                alt="Suit Aura Girls"
                width="480"
                height="240"
                className="h-11 lg:h-14 w-auto object-contain"
              />
            </button>
          </div>

          {/* Desktop: a wide search field in the middle of the bar */}
          <div className="hidden lg:block relative flex-1 max-w-xl mx-6 xl:mx-12">
            <button
              type="button"
              id="desktop-search-field"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
              className="w-full h-11 pl-11 pr-12 rounded-full bg-sunken hover:bg-sunken-deep text-left text-sm text-ink-muted truncate cursor-pointer transition-colors"
            >
              {searchLabel}
            </button>
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex text-ink-muted">
              <SearchIcon className="w-5 h-5" mono />
            </span>
            <VoiceSearchButton onResult={executeSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2" />
          </div>

          <div className="flex items-center gap-0 lg:gap-1 shrink-0">
            {/* Phones reach the wishlist and account from the bottom bar, so these two show from tablet width up */}
            <button id="header-wishlist-btn" onClick={() => setActivePage('wishlist')} className={`${iconButton} hidden md:flex`} aria-label={`Wishlist, ${wishlist.length} items`}>
              <HeartIcon className="w-[22px] h-[22px]" mono />
              {wishlist.length > 0 && <span className={badge}>{wishlist.length > 99 ? '99+' : wishlist.length}</span>}
            </button>
            <button id="header-account-btn" onClick={() => setActivePage('account')} className={`${iconButton} hidden md:flex`} aria-label={user ? 'My account' : 'Sign in'}>
              <UserIcon className="w-[22px] h-[22px]" mono />
              {user && <span className="absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full bg-ok ring-2 ring-white" />}
            </button>
            <button
              id="header-cart-btn"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setIsCartDrawerOpen(true); }}
              className={`${iconButton} flex`}
              aria-label={`Bag, ${cartCount} items`}
            >
              <BagIcon className="w-[22px] h-[22px]" mono />
              {cartCount > 0 && <span className={badge}>{cartCount > 99 ? '99+' : cartCount}</span>}
            </button>
          </div>
        </div>

        {/* Desktop: the menu on its own row under the logo and search */}
        <div className="hidden lg:block border-t border-line">
          <nav className="max-w-7xl mx-auto px-8 h-12 flex items-center justify-center gap-8 xl:gap-10" aria-label="Main">
            {navItems.map((item) => (
              <button
                key={item.label}
                id={`nav-link-${item.label.toLowerCase().replace(/&/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')}`}
                onClick={item.action}
                aria-current={item.active ? 'page' : undefined}
                className={navLink(item.active)}
              >
                {item.label}
                <span aria-hidden="true" className={navUnderline(item.active)} />
              </button>
            ))}
            <div className="relative" ref={collectionsRef}>
              <button
                id="nav-link-collections"
                onClick={() => setCollectionsOpen(!collectionsOpen)}
                aria-expanded={collectionsOpen}
                aria-haspopup="true"
                aria-controls="collections-menu"
                className={`${navLink(collectionActive)} gap-1`}
              >
                Collections <ChevronDown className={`w-4 h-4 ${collectionsOpen ? 'rotate-180' : ''}`} />
                <span aria-hidden="true" className={navUnderline(collectionActive)} />
              </button>
              {collectionsOpen && (
                <div id="collections-menu" className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-[440px] bg-white rounded-card border border-line shadow-[var(--sag-shadow-pop)] p-3 z-50 sag-pop">
                  <div className="flex items-center justify-between px-2 pt-1 pb-2">
                    <p className="text-base font-semibold text-ink">Shop by collection</p>
                    {collections.length > 0 && <span className="text-[13px] text-ink-muted">{collections.length} {collections.length === 1 ? 'collection' : 'collections'}</span>}
                  </div>
                  {collections.length === 0 && <p className="px-2 pb-3 text-sm text-ink-muted">Collections appear as products are added.</p>}
                  <div className="grid grid-cols-2 gap-1">
                    {collections.map(([name, count]) => {
                      const current = activePage === 'shop' && selectedCategory === name;
                      return (
                        <button
                          key={name}
                          onClick={() => { navigateToCategory(name as any); setCollectionsOpen(false); }}
                          aria-current={current ? 'page' : undefined}
                          className={`w-full min-h-11 flex items-center justify-between gap-2 px-3 py-2 rounded-chip text-left text-sm transition-colors cursor-pointer ${current ? 'bg-sunken text-ink font-semibold' : 'text-ink hover:bg-sunken'}`}
                        >
                          <span className="truncate">{name}</span>
                          <span className="shrink-0 text-[13px] text-ink-muted tabular-nums">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 pt-3 border-t border-line flex items-center gap-2">
                    <button onClick={() => { navigateToCategory('All'); setCollectionsOpen(false); }} className="sag-btn-primary flex-1 h-11 px-4 text-sm gap-1.5">
                      View all styles <ChevronRight className="w-4 h-4" />
                    </button>
                    <button onClick={() => { navigateToCategory('New Arrivals'); setCollectionsOpen(false); }} className="sag-btn-outline flex-1 h-11 px-4 text-sm">
                      New arrivals
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              id="nav-link-offers"
              onClick={() => navigateToCategory('Sale')}
              aria-current={offersActive ? 'page' : undefined}
              className={`relative h-12 inline-flex items-center gap-1.5 text-sm text-sale cursor-pointer ${offersActive ? 'font-bold' : 'font-semibold'}`}
            >
              <TagIcon className="w-4 h-4" mono /> Offers
              <span aria-hidden="true" className={`absolute left-0 right-0 bottom-0 h-0.5 bg-sale ${offersActive ? '' : 'hidden'}`} />
            </button>
          </nav>
        </div>

        {isSearchOpen && (
          <div id="search-drawer-overlay" className="sag-drop relative lg:border-t lg:border-line bg-white">
            {/* Dim the page under the panel; a tap outside closes it */}
            <div className="absolute left-0 right-0 top-full h-screen bg-ink/50 sag-fade" onClick={() => setIsSearchOpen(false)} aria-hidden="true" />
            <div className="relative max-w-3xl mx-auto px-4 sm:px-8 pt-3 pb-6 max-h-[calc(100vh-5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain">
              <form role="search" onSubmit={(e) => { e.preventDefault(); executeSearch(searchInput); }} className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex text-ink-muted"><SearchIcon className="w-5 h-5" mono /></span>
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
                  className={`sag-input pl-11 ${searchInput ? 'pr-[10.5rem]' : 'pr-32'} [&::-webkit-search-cancel-button]:appearance-none`}
                />
                <span className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  {searchInput && (
                    <button type="button" onClick={() => { setSearchInput(''); searchInputRef.current?.focus(); }} aria-label="Clear search" className="w-11 h-11 rounded-full flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <VoiceSearchButton onResult={executeSearch} />
                  <button type="submit" id="search-submit-btn" className="sag-btn-primary h-11 px-4 text-sm">
                    Search
                  </button>
                </span>
              </form>
              {features.visualSearch && <Suspense fallback={null}><FindThisLookButton variant="chip" className="mt-3" /></Suspense>}

              {searchTrimmed.length >= 2 && (
                <div className="mt-4">
                  {results.length > 0 ? (
                    <>
                      <p className="sag-eyebrow mb-1 px-1">Styles</p>
                      <div className="grid grid-cols-[minmax(0,1fr)]">
                        {results.map((prod) => {
                          const mrp = Math.max(prod.price, Number(prod.originalPrice) || prod.price);
                          const off = mrp > prod.price ? Math.round(((mrp - prod.price) / mrp) * 100) : 0;
                          return (
                            <button
                              key={prod.id}
                              id={`search-result-${prod.id}`}
                              onClick={() => { navigateToProduct(prod.id); setIsSearchOpen(false); setSearchInput(''); }}
                              className="w-full min-w-0 flex items-center gap-3 p-2 rounded-control hover:bg-sunken focus-visible:bg-sunken text-left transition-colors cursor-pointer"
                            >
                              <img src={getCleanImageUrl(prod.images?.[0] || prod.image || '', 120)} alt="" className="w-12 h-[60px] shrink-0 object-cover object-top rounded-chip bg-sunken" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-5 text-ink truncate">{prod.name}</p>
                                <p className="text-[13px] text-ink-muted truncate">{prod.category}</p>
                                <p className="mt-0.5 flex items-baseline gap-1.5 text-[13px] sag-num">
                                  <span className="text-sm font-bold text-ink">₹{prod.price.toLocaleString('en-IN')}</span>
                                  {off > 0 && <span className="text-ink-faint line-through">₹{mrp.toLocaleString('en-IN')}</span>}
                                  {off > 0 && <span className="font-bold text-sale">{off}% off</span>}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" />
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => executeSearch(searchInput)} className="sag-btn-outline mt-2 w-full h-11 px-4 text-sm gap-1.5">
                        <span className="truncate">See all results for “{searchTrimmed}”</span>
                        <ChevronRight className="w-4 h-4 shrink-0" />
                      </button>
                    </>
                  ) : (
                    <div className="rounded-card bg-page border border-line px-4 py-5 text-center">
                      <p className="text-base font-semibold text-ink break-words">No styles match “{searchTrimmed}”</p>
                      <p className="mt-1 text-sm text-ink-muted">Check the spelling or pick a collection below.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 space-y-5">
                {recentSearches.length > 0 && (
                  <div id="recent-searches-container">
                    <div className="flex items-center justify-between mb-1">
                      <span className="sag-eyebrow flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Recent searches</span>
                      <button type="button" id="clear-recent-searches-btn" onClick={() => saveRecent([])} className="h-11 px-2 -mr-2 text-[13px] font-semibold text-ink-muted hover:text-ink flex items-center gap-1 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" /> Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((term) => (
                        <button key={term} onClick={() => executeSearch(term)} className="h-11 max-w-full px-3.5 rounded-chip border-[1.5px] border-control bg-white text-sm text-ink hover:bg-sunken inline-flex items-center gap-1.5 transition-colors cursor-pointer">
                          <Clock className="w-3.5 h-3.5 shrink-0 text-ink-muted" />
                          <span className="truncate">{term}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Quick ways in: only collections that have products */}
                {(collections.length > 0 || hasKidsToys) && (
                  <div id="trending-searches-container">
                    <span className="sag-eyebrow block mb-2">Shop collections</span>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { navigateToCategory('New Arrivals'); setIsSearchOpen(false); }} className={chip}>New arrivals</button>
                      <button onClick={() => { navigateToCategory('Sale'); setIsSearchOpen(false); }} className="h-11 px-3.5 rounded-chip bg-sale-tint text-sm font-semibold text-sale inline-flex items-center gap-1.5 cursor-pointer"><TagIcon className="w-4 h-4" mono /> Offers</button>
                      {collections.map(([name, count]) => (
                        <button key={name} onClick={() => { navigateToCategory(name as any); setIsSearchOpen(false); }} className={chip}>
                          {name} <span className="text-[13px] font-normal text-ink-muted tabular-nums">{count}</span>
                        </button>
                      ))}
                      {hasKidsToys && <button onClick={() => { navigateToCategory(KIDS_TOYS as any); setIsSearchOpen(false); }} className={chip}>{KIDS_TOYS}</button>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
};
