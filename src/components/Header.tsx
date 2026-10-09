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
import { ChevronDown, ChevronRight, CircleAlert, CircleCheck, Clock, Loader2, Search, Trash2, X } from 'lucide-react';
import { Icon, Odometer, addScrollFx, clamp, prefersReducedMotion, setVar } from '../aura';
import { PIN_KEY, PIN_RE, lookupPincode } from './DeliveryCheck';
import { useBackToClose } from '../utils/backClose';
import { useFestiveRound } from './FestiveBanner';

const RECENT_KEY = 'sag_recent_searches_v1';

// The small capitals label above a group
const EYEBROW = 'aura-lbl';

/**
 * The announcement band. It shows the festive round that is live right now (a real coupon
 * inside its dates, read by useFestiveRound), the online payment percent and cash on delivery when on, and
 * nothing at all when no round is live. It is one slim ink band of bold capitals on the homepage only, right under the header; the track holds the
 * list twice, so the loop has no seam. It is part of the page (it scrolls away) and stands still with
 * reduced motion.
 */
const AnnouncementLine: React.FC = () => {
  const round = useFestiveRound();
  const { storeOffers } = useShop();

  // Up to three real messages: the round itself, the online payment percent and cash on delivery (both from settings)
  const messages: string[] = [];
  if (round) {
    const ends = round.daysLeft <= 0 ? 'Ends today' : `Till ${round.lastDay}`;
    messages.push(`${round.title} · ${round.offer} with code ${round.code} · ${ends}`);
    if (round.prepaidPercent > 0) messages.push(`${round.prepaidPercent}% off when you pay online`);
    if (storeOffers.codEnabled) messages.push('Cash on delivery available');
  }
  const count = messages.length;

  if (!round || count === 0) return null;
  // One half of the track must be wider than any screen, so a short list is repeated inside each half
  const repeats = Math.max(1, Math.ceil(6 / count));
  const half = Array.from({ length: repeats }, () => messages).flat();
  return (
    <div id="festive-announcement" role="region" aria-label="Store announcement" className="sag-marquee sag-num w-full">
      <div className="sag-marquee-track">
        {[...half, ...half].map((message, index) => (
          <span key={index} aria-hidden={index >= count ? true : undefined}>{message}</span>
        ))}
      </div>
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
    <div id="header-pin-panel" className="sag-drop relative mt-2">
      <div className="absolute -left-2.5 -right-2.5 top-0 h-screen bg-[color:var(--sag-scrim)] sag-fade lg:-left-6 lg:-right-6" onClick={onClose} aria-hidden="true" />
      <div className="relative mx-auto max-w-2xl rounded-[10px] border border-line bg-surface p-4 text-ink">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-medium leading-6 text-ink">Check delivery to your PIN code</p>
          <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 -mt-1.5 -mr-1.5 shrink-0 flex items-center justify-center rounded-full text-ink-muted hover:text-ink cursor-pointer"><X className="w-5 h-5" strokeWidth={1.5} /></button>
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

  // Header controls: round 46px icon buttons in the bar's own text colour
  const count = (value: number) => (value > 99 ? '99+' : value);
  const badge = (value: number) => (value > 0 ? <span className="aura-cnt"><Odometer value={count(value)} roll={false} /></span> : null);
  const navLink = 'aura-hd-lk';
  const wordmark = <span className="aura-wm">Suit <em>Aura</em> Girls</span>;
  const collectionActive = collectionsOpen || (activePage === 'shop' && collections.some(([c]) => c === selectedCategory));
  const offersActive = activePage === 'shop' && selectedCategory === 'Sale';
  // A collection in the search panel: one plain row with its real count and a chevron
  const listRow = 'flex min-h-[48px] w-full min-w-0 items-center gap-3 border-b border-line py-2.5 text-left text-[15px] font-semibold text-ink cursor-pointer';
  const searchLabel = 'Search suits, kurtis & more';
  const closeSearch = () => setIsSearchOpen(false);
  // The store's messages are one slim moving band at the top of the homepage only
  const showAnnouncement = activePage === 'home';

  // The bar and the scroll. The <header> box itself never changes size (pages measure it and keep a constant
  // top padding of the same height), so nothing on the page moves: only the bar inside it gets a little lower
  // (56 -> 48px) and the whole box slides away with a transform while the shopper scrolls down the homepage or
  // a product page, and comes back as soon as they scroll up. The thin line at the bar's bottom edge shows how
  // far the page is scrolled. Classes are written from the scroll engine's frame, never through React state.
  const headerRef = useRef<HTMLElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const scrollRange = useRef(1);
  const canHide = useRef(false);
  const somethingOpen = isMobileMenuOpen || isSearchOpen || collectionsOpen || pinOpen;
  canHide.current = (activePage === 'home' || activePage === 'product-detail') && !somethingOpen;
  useEffect(() => addScrollFx(document.body, ({ rawY, velocity }) => {
    const bar = headerRef.current;
    if (!bar) return;
    setVar(progressRef.current, 'transform', `scaleX(${clamp(rawY / scrollRange.current).toFixed(4)})`);
    if (!canHide.current || prefersReducedMotion()) { bar.classList.remove('hide', 'sm'); return; }
    bar.classList.toggle('sm', rawY > 40);
    if (velocity > 11 && rawY > 500) bar.classList.add('hide');
    else if (velocity < -1.5 || rawY < 200) bar.classList.remove('hide');
  }, { measure: (_el, { vh }) => { scrollRange.current = Math.max(1, document.documentElement.scrollHeight - vh); } }), []);
  // Anything opening, a page change, the bag count going up (a photo may be flying to the bag) and keyboard
  // focus inside the bar all bring it back
  useEffect(() => { headerRef.current?.classList.remove('hide'); }, [somethingOpen, activePage, cartCount]);

  return (
    <>
      <header
        ref={headerRef}
        id="site-header"
        data-menu={isMobileMenuOpen ? 'open' : undefined}
        onFocus={() => headerRef.current?.classList.remove('hide')}
        className="aura-hd fixed inset-x-0 top-0 z-50 select-none"
      >
        <div className="aura-hd-bar">
          {/* Phones and tablets: menu, the wordmark in the centre, search and the bag with its real count */}
          <div className="aura-hd-row lg:hidden flex items-center px-1 sm:px-3">
            <button
              id="mobile-menu-trigger"
              onClick={() => { setIsSearchOpen(false); setIsMobileMenuOpen(!isMobileMenuOpen); }}
              className="aura-hb"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
            >
              <Icon name={isMobileMenuOpen ? 'close' : 'menu'} />
            </button>
            <button id="header-brand-logo-mobile" onClick={() => { setIsMobileMenuOpen(false); setActivePage('home'); }} className="min-w-0 flex-1 cursor-pointer text-center" aria-label="Suit Aura Girls home">
              {wordmark}
            </button>
            {/* The accessible name starts with "Search suits" (the storefront check looks for it) */}
            <button
              type="button"
              id="header-search-btn"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
              className="aura-hb"
              aria-label={searchLabel}
              aria-expanded={isSearchOpen}
            >
              <Icon name="search" />
            </button>
            {/* Tablets have no tab bar: the wishlist stays one tap away (on phones it is in the tab bar and the menu) */}
            <button id="header-wishlist-btn-tablet" onClick={() => setActivePage('wishlist')} className="aura-hb" aria-label={`Wishlist, ${wishlist.length} items`}>
              <Icon name="heart" />
              {badge(wishlist.length)}
            </button>
            <button
              id="header-cart-btn-mobile"
              data-bag-target=""
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setIsCartDrawerOpen(true); }}
              className="aura-hb"
              aria-label={`Bag, ${cartCount} items`}
            >
              <Icon name="bag" />
              {badge(cartCount)}
            </button>
          </div>

          {/* Desktop: the search field, the wordmark in the centre, the account buttons; then the menu row */}
          <div className="hidden lg:block">
            <div className="aura-hd-row mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-7">
              <div className="relative w-full max-w-[320px]">
                <button
                  type="button"
                  id="desktop-search-field"
                  onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
                  className="aura-hd-search"
                >
                  {searchLabel}
                </button>
                <span className="pointer-events-none absolute left-4 top-1/2 flex -translate-y-1/2">
                  <Icon name="search" size={19} />
                </span>
                <VoiceSearchButton onResult={executeSearch} className="absolute right-0.5 top-1/2 -translate-y-1/2" />
              </div>

              <button id="header-brand-logo" onClick={() => setActivePage('home')} className="shrink-0 cursor-pointer" aria-label="Suit Aura Girls home">
                {wordmark}
              </button>

              <div className="flex shrink-0 items-center justify-end gap-1">
                <button id="header-wishlist-btn" onClick={() => setActivePage('wishlist')} className="aura-hb" aria-label={`Wishlist, ${wishlist.length} items`}>
                  <Icon name="heart" />
                  {badge(wishlist.length)}
                </button>
                <button id="header-account-btn" onClick={() => setActivePage('account')} className="aura-hb" aria-label={user ? 'My account' : 'Sign in'}>
                  <Icon name="user" />
                  {user && <span className="absolute bottom-2 right-2 h-2 w-2 rounded-full bg-accent" />}
                </button>
                <button
                  id="header-cart-btn"
                  data-bag-target=""
                  onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setIsCartDrawerOpen(true); }}
                  className="aura-hb"
                  aria-label={`Bag, ${cartCount} items`}
                >
                  <Icon name="bag" />
                  {badge(cartCount)}
                </button>
              </div>
            </div>

            {/* The menu on its own row under a hairline; the current page carries a short line */}
            <nav className="aura-hd-nav" aria-label="Main">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  id={`nav-link-${item.label.toLowerCase().replace(/&/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')}`}
                  onClick={item.action}
                  aria-current={item.active ? 'page' : undefined}
                  className={navLink}
                >
                  {item.label}
                </button>
              ))}
              <div className="relative" ref={collectionsRef}>
                <button
                  id="nav-link-collections"
                  onClick={() => setCollectionsOpen(!collectionsOpen)}
                  aria-expanded={collectionsOpen}
                  aria-haspopup="true"
                  aria-controls="collections-menu"
                  data-on={collectionActive ? '' : undefined}
                  className={`${navLink} gap-1`}
                >
                  Collections <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${collectionsOpen ? 'rotate-180' : ''}`} strokeWidth={1.6} />
                </button>
                {collectionsOpen && (
                  <div id="collections-menu" className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)] w-[460px] rounded-[22px] bg-surface p-5 text-ink shadow-[var(--sag-shadow-pop)] z-50 sag-pop">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className={EYEBROW}>Shop by collection</p>
                      {collections.length > 0 && <span className="sag-num text-[13px] text-ink-muted">{collections.length} {collections.length === 1 ? 'collection' : 'collections'}</span>}
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
                            className={`w-full min-h-11 flex items-center justify-between gap-2 border-b border-line py-2 text-left text-[17px] leading-6 transition-colors cursor-pointer ${current ? 'text-sale font-extrabold' : 'text-ink font-bold hover:text-sale'}`}
                          >
                            <span className="truncate">{name}</span>
                            <span className="sag-num shrink-0 text-[13px] font-normal text-ink-muted">{count}</span>
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
                className={`${navLink} aura-sa`}
              >
                Offers
              </button>
            </nav>
          </div>
          {/* How far the page is scrolled */}
          <i ref={progressRef} id="header-progress" className="aura-hd-p" aria-hidden="true" />
        </div>

        {isSearchOpen && (
          <div id="search-drawer-overlay" className="sag-drop pointer-events-auto absolute left-2.5 right-2.5 top-full mt-2 text-ink lg:left-6 lg:right-6">
            {/* Dim the page under the sheet; a tap outside closes it */}
            <div className="absolute -left-2.5 -right-2.5 top-0 h-screen bg-[color:var(--sag-scrim)] sag-fade lg:-left-6 lg:-right-6" onClick={closeSearch} aria-hidden="true" />
            <div className="relative max-w-3xl mx-auto rounded-[28px] bg-surface shadow-[var(--sag-shadow-pop)] px-4 sm:px-8 pt-4 pb-6 max-h-[calc(100vh-6.5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-6.5rem)] overflow-y-auto overscroll-contain">
              {/* The field: a paper pill whose edge turns ink while typing */}
              <form role="search" onSubmit={(e) => { e.preventDefault(); executeSearch(searchInput); }} className="flex items-center gap-2 rounded-full border border-line bg-page pl-4 pr-2 focus-within:border-ink">
                <Search className="w-5 h-5 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
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
                  <button type="button" onClick={() => { setSearchInput(''); searchInputRef.current?.focus(); }} aria-label="Clear search" className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-ink-muted hover:bg-sunken hover:text-ink cursor-pointer">
                    <X className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}
                <VoiceSearchButton onResult={executeSearch} />
                {/* Phones show "Search" once something is typed, and "Cancel" before that */}
                <button type="submit" id="search-submit-btn" className={`sag-btn-primary h-10 shrink-0 px-4 text-sm ${searchInput ? '' : 'hidden sm:inline-flex'}`}>
                  Search
                </button>
                <button type="button" onClick={closeSearch} className={`h-10 shrink-0 px-2.5 text-[14px] font-bold text-ink cursor-pointer ${searchInput ? 'hidden sm:inline-flex sm:items-center' : 'inline-flex items-center'}`}>
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
                              <img src={getCleanImageUrl(prod.images?.[0] || prod.image || '', 120)} alt="" className="w-12 h-[60px] shrink-0 rounded-[12px]! object-cover object-top bg-sunken" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm leading-5 text-ink truncate">{prod.name}</p>
                                <p className="text-[12px] text-ink-muted truncate">{prod.category}</p>
                                <p className="mt-0.5 flex items-baseline gap-1.5 text-[12.5px] sag-num">
                                  <span className="text-sm font-semibold text-ink">₹{prod.price.toLocaleString('en-IN')}</span>
                                  {off > 0 && <span className="text-ink-muted line-through">₹{mrp.toLocaleString('en-IN')}</span>}
                                  {off > 0 && <span className="font-semibold text-accent">{off}% off</span>}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" strokeWidth={1.5} />
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => executeSearch(searchInput)} className="sag-btn-outline mt-4 w-full h-11 px-4 text-sm gap-1.5">
                        <span className="truncate">See all results for “{searchTrimmed}”</span>
                      </button>
                    </>
                  ) : (
                    <div className="sag-glass sag-glass-strong px-4 py-6 text-center">
                      <p className="text-[22px] font-extrabold leading-7 tracking-[-0.02em] text-ink break-words">No styles match “{searchTrimmed}”</p>
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
                        <button key={term} onClick={() => executeSearch(term)} className="sag-chip h-[38px] max-w-full px-3.5 text-[13px] font-normal inline-flex items-center gap-1.5 transition-colors cursor-pointer">
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
                          <img src={getCleanImageUrl(prod.images?.[0] || prod.image || '', 320)} alt="" loading="lazy" className="aspect-[4/5] w-full rounded-[17px]! bg-sunken object-cover object-top" />
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
      {/* The store's real messages: one slim moving band, the first thing of the homepage under the header */}
      {showAnnouncement && <AnnouncementLine />}
    </>
  );
};
