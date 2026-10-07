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
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, Clock, Heart, Loader2, Menu, Search, ShoppingBag, Trash2, User, X } from 'lucide-react';
import { PIN_KEY, PIN_RE, lookupPincode } from './DeliveryCheck';
import { useBackToClose } from '../utils/backClose';
import { useFestiveRound } from './FestiveBanner';

const RECENT_KEY = 'sag_recent_searches_v1';

// The small champagne label above a group (sag-caps keeps the capitals inside the storefront's main area)
const EYEBROW = 'sag-caps text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale';
// The wordmark: the brand name in the display face, capitals, letter-spaced
const WORDMARK = 'sag-caps font-display font-medium uppercase whitespace-nowrap text-ink';

/**
 * The one thin dark line above the header. It shows the festive round that is live right now (a real coupon
 * inside its dates, read by useFestiveRound) and nothing at all when no round is live. It scrolls away with the page.
 */
const AnnouncementLine: React.FC = () => {
  const round = useFestiveRound();
  if (!round) return null;
  const ends = round.daysLeft <= 0 ? 'Ends today' : `Till ${round.lastDay}`;
  return (
    <div id="festive-announcement" role="region" aria-label="Store announcement" className="w-full bg-dark text-on-dark">
      <p className="sag-num mx-auto max-w-7xl px-3 py-2 text-center text-[11.5px] leading-4 tracking-[0.06em]">
        {round.title} · {round.offer} with code {round.code} · {ends}
      </p>
    </div>
  );
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
      <div className="relative border-b border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-medium leading-6 text-ink">Check delivery to your PIN code</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-11 h-11 -mt-2 -mr-2 shrink-0 flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer"><X className="w-5 h-5" strokeWidth={1.5} /></button>
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
          {state.status === 'ok' && <p className="flex items-start gap-1.5 font-medium text-ok"><CircleCheck className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} /> We deliver to {state.place} ({pin}).</p>}
          {state.status === 'invalid' && <p className="flex items-start gap-1.5 font-medium text-danger"><CircleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} /> Enter a 6-digit PIN code.</p>}
          {state.status === 'not-found' && <p className="flex items-start gap-1.5 font-medium text-danger"><CircleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} /> We could not find this PIN code. Please check it.</p>}
          {state.status === 'error' && <p className="flex items-start gap-1.5 font-medium text-danger"><CircleAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} /> The PIN code could not be checked right now. Please try again.</p>}
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
  // The phone header is one line, so it simply stays at the top of the screen (nothing slides away on scroll).
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
  // The empty search panel leads with photos: the styles the owner marked trending or best seller. When none
  // is marked, the newest arrivals are shown under their own name, so the title is always true.
  const suggested = useMemo(() => {
    const live = products.filter((p) => departmentOf(p) === 'women' && isAvailable(p));
    const marked = live.filter((p) => p.isTrending || p.isBestSeller);
    if (marked.length > 0) return { title: 'Trending now', items: marked.slice(0, 8) };
    return { title: 'New arrivals', items: live.filter((p) => p.isNewArrival).slice(0, 8) };
  }, [products]);

  const navItems: Array<{ label: string; action: () => void; active: boolean }> = [
    { label: 'Home', action: () => setActivePage('home'), active: activePage === 'home' },
    { label: 'Shop', action: () => navigateToCategory('All'), active: activePage === 'shop' && selectedCategory === 'All' },
    { label: 'New Arrivals', action: () => navigateToCategory('New Arrivals'), active: activePage === 'shop' && selectedCategory === 'New Arrivals' },
    ...(hasKidsToys ? [{ label: KIDS_TOYS, action: () => navigateToCategory(KIDS_TOYS as any), active: activePage === 'shop' && isKidsToysListing(selectedCategory) }] : []),
  ];

  // One look for every header control: a bare thin icon in the text colour, no fill behind it
  const iconButton = 'relative shrink-0 items-center justify-center text-ink hover:text-ink-muted cursor-pointer transition-colors';
  const phoneIcon = `${iconButton} h-10 w-9`;
  const deskIcon = `${iconButton} h-11 w-11`;
  // The real count as a small black dot with white figures
  const badge = 'sag-num absolute min-w-[15px] h-[15px] px-[3px] rounded-full bg-ink text-white text-[10px] font-semibold leading-none flex items-center justify-center';
  const navLink = (active: boolean) => `sag-caps relative h-11 inline-flex items-center text-[12px] uppercase tracking-[0.12em] cursor-pointer transition-colors ${active ? 'text-ink font-medium' : 'text-ink-muted hover:text-ink'}`;
  const navUnderline = (active: boolean) => `absolute left-0 right-0 bottom-0 h-px bg-ink ${active ? '' : 'hidden'}`;
  const collectionActive = collectionsOpen || (activePage === 'shop' && collections.some(([c]) => c === selectedCategory));
  const offersActive = activePage === 'shop' && selectedCategory === 'Sale';
  // A collection in the search panel: one plain row with its real count and a chevron
  const listRow = 'flex min-h-[46px] w-full min-w-0 items-center gap-3 border-b border-line py-2.5 text-left text-sm text-ink cursor-pointer hover:text-ink-muted';
  const searchLabel = 'Search suits, kurtis & more';
  const closeSearch = () => setIsSearchOpen(false);
  const count = (value: number) => (value > 99 ? '99+' : value);

  return (
    <>
      {/* The thin dark line sits above the header and scrolls away; checkout stays free of offers */}
      {activePage !== 'checkout' && <AnnouncementLine />}
      <header className="sticky top-0 z-50 w-full bg-surface border-b border-line select-none">
        {/* Phones and tablets: one white line. Menu on the left, the wordmark in the middle, search and bag on the right. */}
        <div className="lg:hidden mx-auto grid h-[52px] max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-1 px-2.5">
          <div className="flex items-center justify-self-start">
            <button
              id="mobile-menu-trigger"
              onClick={() => { setIsSearchOpen(false); setIsMobileMenuOpen(!isMobileMenuOpen); }}
              className={`${phoneIcon} flex`}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-[22px] h-[22px]" strokeWidth={1.5} /> : <Menu className="w-[22px] h-[22px]" strokeWidth={1.5} />}
            </button>
          </div>
          <button id="header-brand-logo-mobile" onClick={() => setActivePage('home')} className={`${WORDMARK} min-w-0 text-[16px] leading-6 tracking-[0.12em] min-[380px]:text-[18px] min-[380px]:tracking-[0.14em] cursor-pointer`} aria-label="Suit Aura Girls home">
            Suit Aura Girls
          </button>
          <div className="flex items-center justify-self-end">
            {/* Phones reach the wishlist from the bottom bar; tablets have no bottom bar, so it shows here */}
            <button id="header-wishlist-btn-mobile" onClick={() => setActivePage('wishlist')} className={`${phoneIcon} hidden md:flex`} aria-label={`Wishlist, ${wishlist.length} items`}>
              <Heart className="w-[21px] h-[21px]" strokeWidth={1.5} />
              {wishlist.length > 0 && <span className={`${badge} top-1 right-0`}>{count(wishlist.length)}</span>}
            </button>
            {/* The accessible name starts with "Search suits" (the storefront check looks for it) */}
            <button
              id="header-search-btn"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(!isSearchOpen); }}
              className={`${phoneIcon} flex`}
              aria-label={searchLabel}
              aria-expanded={isSearchOpen}
            >
              <Search className="w-[21px] h-[21px]" strokeWidth={1.5} />
            </button>
            <button
              id="header-cart-btn-mobile"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setIsCartDrawerOpen(true); }}
              className={`${phoneIcon} flex`}
              aria-label={`Bag, ${cartCount} items`}
            >
              <ShoppingBag className="w-[21px] h-[21px]" strokeWidth={1.5} />
              {cartCount > 0 && <span className={`${badge} top-1 right-0`}>{count(cartCount)}</span>}
            </button>
          </div>
        </div>

        {/* Desktop: the wordmark, a square search field with a hairline, and the icons */}
        <div className="hidden lg:flex max-w-7xl mx-auto px-8 h-[68px] items-center justify-between gap-3">
          <div className="flex items-center min-w-0">
            <button
              id="header-brand-logo"
              onClick={() => setActivePage('home')}
              className={`${WORDMARK} shrink-0 text-[22px] leading-7 tracking-[0.14em] cursor-pointer`}
              aria-label="Suit Aura Girls home"
            >
              Suit Aura Girls
            </button>
          </div>

          <div className="hidden lg:block relative flex-1 max-w-xl mx-6 xl:mx-12">
            <button
              type="button"
              id="desktop-search-field"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
              className="w-full h-11 pl-11 pr-12 border border-line bg-surface hover:border-control text-left text-sm text-ink-muted truncate cursor-pointer transition-colors"
            >
              {searchLabel}
            </button>
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex text-ink-muted">
              <Search className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <VoiceSearchButton onResult={executeSearch} className="absolute right-1 top-1/2 -translate-y-1/2" />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button id="header-wishlist-btn" onClick={() => setActivePage('wishlist')} className={`${deskIcon} hidden md:flex`} aria-label={`Wishlist, ${wishlist.length} items`}>
              <Heart className="w-[22px] h-[22px]" strokeWidth={1.5} />
              {wishlist.length > 0 && <span className={`${badge} top-1.5 right-1`}>{count(wishlist.length)}</span>}
            </button>
            <button id="header-account-btn" onClick={() => setActivePage('account')} className={`${deskIcon} hidden md:flex`} aria-label={user ? 'My account' : 'Sign in'}>
              <User className="w-[22px] h-[22px]" strokeWidth={1.5} />
              {user && <span className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-ink ring-2 ring-white" />}
            </button>
            <button
              id="header-cart-btn"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setIsCartDrawerOpen(true); }}
              className={`${deskIcon} flex`}
              aria-label={`Bag, ${cartCount} items`}
            >
              <ShoppingBag className="w-[22px] h-[22px]" strokeWidth={1.5} />
              {cartCount > 0 && <span className={`${badge} top-1.5 right-1`}>{count(cartCount)}</span>}
            </button>
          </div>
        </div>

        {/* Desktop: the menu on its own row, in small letter-spaced capitals */}
        <div className="hidden lg:block border-t border-line">
          <nav className="max-w-7xl mx-auto px-8 h-11 flex items-center justify-center gap-9 xl:gap-11" aria-label="Main">
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
                Collections <ChevronDown className={`w-3.5 h-3.5 ${collectionsOpen ? 'rotate-180' : ''}`} strokeWidth={1.5} />
                <span aria-hidden="true" className={navUnderline(collectionActive)} />
              </button>
              {collectionsOpen && (
                <div id="collections-menu" className="absolute left-1/2 -translate-x-1/2 top-full w-[460px] bg-surface border border-line p-5 z-50 sag-pop">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={EYEBROW}>Shop by collection</p>
                    {collections.length > 0 && <span className="sag-num text-[12px] text-ink-muted">{collections.length} {collections.length === 1 ? 'collection' : 'collections'}</span>}
                  </div>
                  {collections.length === 0 && <p className="mt-3 text-sm text-ink-muted">Collections appear as products are added.</p>}
                  <div className="mt-2 grid grid-cols-2 gap-x-6">
                    {collections.map(([name, count]) => {
                      const current = activePage === 'shop' && selectedCategory === name;
                      return (
                        <button
                          key={name}
                          onClick={() => { navigateToCategory(name as any); setCollectionsOpen(false); }}
                          aria-current={current ? 'page' : undefined}
                          className={`w-full min-h-11 flex items-center justify-between gap-2 border-b border-line py-2 text-left text-sm transition-colors cursor-pointer ${current ? 'text-ink font-medium' : 'text-ink hover:text-ink-muted'}`}
                        >
                          <span className="truncate">{name}</span>
                          <span className="sag-num shrink-0 text-[12px] text-ink-muted">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button onClick={() => { navigateToCategory('All'); setCollectionsOpen(false); }} className="sag-btn-primary flex-1 h-11 px-4 text-sm">
                      View all styles
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
              className={`sag-caps relative h-11 inline-flex items-center text-[12px] uppercase tracking-[0.12em] text-sale cursor-pointer ${offersActive ? 'font-semibold' : 'font-medium'}`}
            >
              Offers
              <span aria-hidden="true" className={`absolute left-0 right-0 bottom-0 h-px bg-sale ${offersActive ? '' : 'hidden'}`} />
            </button>
          </nav>
        </div>

        {isSearchOpen && (
          <div id="search-drawer-overlay" className="sag-drop relative border-t border-line bg-surface">
            {/* Dim the page under the panel; a tap outside closes it */}
            <div className="absolute left-0 right-0 top-full h-screen bg-ink/50 sag-fade" onClick={closeSearch} aria-hidden="true" />
            <div className="relative max-w-3xl mx-auto px-4 sm:px-8 pb-6 max-h-[calc(100vh-5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain">
              {/* The field: a bare line of text over a hairline that turns ink while typing */}
              <form role="search" onSubmit={(e) => { e.preventDefault(); executeSearch(searchInput); }} className="-mx-4 flex items-center gap-2 border-b border-line px-4 focus-within:border-ink sm:-mx-8 sm:px-8">
                <Search className="w-5 h-5 shrink-0 text-ink" strokeWidth={1.5} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  id="search-input-field"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search suits, dresses…"
                  aria-label="Search products"
                  enterKeyHint="search"
                  autoComplete="off"
                  className="h-[52px] min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none focus:outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
                />
                {searchInput && (
                  <button type="button" onClick={() => { setSearchInput(''); searchInputRef.current?.focus(); }} aria-label="Clear search" className="w-9 h-10 shrink-0 flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer">
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}
                <VoiceSearchButton onResult={executeSearch} />
                {/* Phones show "Search" once something is typed, and "Cancel" before that */}
                <button type="submit" id="search-submit-btn" className={`sag-btn-primary h-10 shrink-0 px-4 text-sm ${searchInput ? '' : 'hidden sm:inline-flex'}`}>
                  Search
                </button>
                <button type="button" onClick={closeSearch} className={`h-10 shrink-0 text-[12.5px] font-medium text-ink underline underline-offset-4 decoration-1 cursor-pointer ${searchInput ? 'hidden sm:inline-flex sm:items-center' : 'inline-flex items-center'}`}>
                  Cancel
                </button>
              </form>
              {features.visualSearch && <Suspense fallback={null}><FindThisLookButton variant="chip" className="mt-3" /></Suspense>}

              {searchTrimmed.length >= 2 && (
                <div className="mt-5">
                  {results.length > 0 ? (
                    <>
                      <p className={EYEBROW}>Styles</p>
                      <div className="mt-1 grid grid-cols-[minmax(0,1fr)]">
                        {results.map((prod) => {
                          const mrp = Math.max(prod.price, Number(prod.originalPrice) || prod.price);
                          const off = mrp > prod.price ? Math.round(((mrp - prod.price) / mrp) * 100) : 0;
                          return (
                            <button
                              key={prod.id}
                              id={`search-result-${prod.id}`}
                              onClick={() => { navigateToProduct(prod.id); setIsSearchOpen(false); setSearchInput(''); }}
                              className="w-full min-w-0 flex items-center gap-3 border-b border-line py-2.5 text-left cursor-pointer"
                            >
                              <img src={getCleanImageUrl(prod.images?.[0] || prod.image || '', 120)} alt="" className="w-12 h-[60px] shrink-0 object-cover object-top bg-sunken" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm leading-5 text-ink truncate">{prod.name}</p>
                                <p className="text-[12px] text-ink-muted truncate">{prod.category}</p>
                                <p className="mt-0.5 flex items-baseline gap-1.5 text-[12.5px] sag-num">
                                  <span className="text-sm font-semibold text-ink">₹{prod.price.toLocaleString('en-IN')}</span>
                                  {off > 0 && <span className="text-ink-muted line-through">₹{mrp.toLocaleString('en-IN')}</span>}
                                  {off > 0 && <span className="font-semibold text-sale">{off}% off</span>}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 shrink-0 text-ink" strokeWidth={1.5} />
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => executeSearch(searchInput)} className="sag-btn-outline mt-4 w-full h-11 px-4 text-sm gap-1.5">
                        <span className="truncate">See all results for “{searchTrimmed}”</span>
                      </button>
                    </>
                  ) : (
                    <div className="border border-line px-4 py-6 text-center">
                      <p className="font-display text-[19px] font-medium leading-7 text-ink break-words">No styles match “{searchTrimmed}”</p>
                      <p className="mt-1 text-[13px] text-ink-muted">Check the spelling or pick a collection below.</p>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 space-y-6">
                {recentSearches.length > 0 && (
                  <div id="recent-searches-container">
                    <div className="flex items-center justify-between">
                      <span className={EYEBROW}>Recent searches</span>
                      <button type="button" id="clear-recent-searches-btn" onClick={() => saveRecent([])} className="h-10 px-2 -mr-2 text-[12.5px] text-ink-muted hover:text-ink flex items-center gap-1 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Clear
                      </button>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {recentSearches.map((term) => (
                        <button key={term} onClick={() => executeSearch(term)} className="h-[38px] max-w-full px-3 border border-line bg-surface text-[13px] text-ink hover:border-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer">
                          <Clock className="w-3.5 h-3.5 shrink-0 text-ink-muted" strokeWidth={1.5} />
                          <span className="truncate">{term}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Empty field: real product photos with their price, in one swipeable row */}
                {searchTrimmed.length < 2 && suggested.items.length > 0 && (
                  <div id="search-trending-container">
                    <p className={EYEBROW}>{suggested.title}</p>
                    <div className="sag-scroll-x -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 sm:-mx-8 sm:px-8">
                      {suggested.items.map((prod) => (
                        <button
                          key={prod.id}
                          type="button"
                          id={`search-trending-${prod.id}`}
                          onClick={() => { navigateToProduct(prod.id); setIsSearchOpen(false); setSearchInput(''); }}
                          aria-label={`${prod.name}, ₹${prod.price.toLocaleString('en-IN')}`}
                          className="flex w-[112px] shrink-0 flex-col gap-[7px] text-left cursor-pointer"
                        >
                          <img src={getCleanImageUrl(prod.images?.[0] || prod.image || '', 320)} alt="" loading="lazy" className="aspect-[4/5] w-full bg-sunken object-cover object-top" />
                          <span className="sag-num text-[13px] font-semibold leading-4 text-ink">₹{prod.price.toLocaleString('en-IN')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Quick ways in: only collections that have products, each with its real count */}
                {(collections.length > 0 || hasKidsToys) && (
                  <div id="trending-searches-container">
                    <p className={EYEBROW}>Collections</p>
                    <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
                      {collections.map(([name, count]) => (
                        <button key={name} type="button" onClick={() => { navigateToCategory(name as any); setIsSearchOpen(false); }} className={listRow}>
                          <span className="min-w-0 flex-1 break-words">{name}</span>
                          <span className="sag-num shrink-0 text-[11.5px] text-ink-muted">{count}</span>
                          <ChevronRight className="w-[15px] h-[15px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      ))}
                      {hasKidsToys && (
                        <button type="button" onClick={() => { navigateToCategory(KIDS_TOYS as any); setIsSearchOpen(false); }} className={listRow}>
                          <span className="min-w-0 flex-1 break-words">{KIDS_TOYS}</span>
                          <ChevronRight className="w-[15px] h-[15px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      )}
                      <button type="button" onClick={() => { navigateToCategory('New Arrivals'); setIsSearchOpen(false); }} className={listRow}>
                        <span className="min-w-0 flex-1 break-words">New arrivals</span>
                        <ChevronRight className="w-[15px] h-[15px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => { navigateToCategory('Sale'); setIsSearchOpen(false); }} className={listRow}>
                        <span className="min-w-0 flex-1 break-words text-sale">Offers</span>
                        <ChevronRight className="w-[15px] h-[15px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
                      </button>
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
