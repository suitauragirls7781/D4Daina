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

// The small emerald label above a group (sag-caps keeps the capitals inside the storefront's main area)
const EYEBROW = 'sag-caps text-[10.5px] leading-4 font-semibold uppercase tracking-[0.2em] text-sale';
// The wordmark: the brand name in the display face, capitals, letter-spaced; it takes the colour of its bar
const WORDMARK = 'sag-caps font-display font-semibold uppercase whitespace-nowrap leading-none';

/**
 * The announcement strip above the header. It shows the festive round that is live right now (a real coupon
 * inside its dates, read by useFestiveRound), the online payment percent and cash on delivery when on, and
 * nothing at all when no round is live. The messages move slowly in champagne capitals; the track holds the
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

  // Header controls sit on the emerald bar: a thin ivory icon that turns champagne under the pointer
  const iconButton = 'relative shrink-0 items-center justify-center rounded-lg cursor-pointer transition-[color,transform] duration-200 hover:text-highlight active:scale-90';
  const phoneIcon = `${iconButton} h-11 w-9 min-[360px]:w-10`;
  const deskIcon = `${iconButton} h-11 w-11`;
  // The real count as a small ivory badge with emerald figures
  const badge = 'sag-num absolute top-1 right-0 min-w-[17px] h-[17px] px-1 rounded-full bg-page text-dark text-[10px] font-bold leading-none flex items-center justify-center overflow-hidden';
  const navLink = 'sag-caps relative h-[42px] inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.2em] cursor-pointer transition-colors hover:text-highlight';
  const navUnderline = (active: boolean) => `absolute left-0 right-0 bottom-2 h-px bg-highlight ${active ? '' : 'hidden'}`;
  // The small champagne ornament under the wordmark
  const ornament = <span className="sag-orn sag-hdr-orn" aria-hidden="true"><i /></span>;
  const collectionActive = collectionsOpen || (activePage === 'shop' && collections.some(([c]) => c === selectedCategory));
  const offersActive = activePage === 'shop' && selectedCategory === 'Sale';
  // A collection in the search panel: one plain row with its real count and a chevron
  const listRow = 'flex min-h-[46px] w-full min-w-0 items-center gap-3 border-b border-line py-2.5 text-left text-sm text-ink cursor-pointer hover:text-brand';
  const searchLabel = 'Search suits, kurtis & more';
  const closeSearch = () => setIsSearchOpen(false);
  const showAnnouncement = activePage !== 'checkout';
  const count = (value: number) => (value > 99 ? '99+' : value);

  return (
    <>
      {/* The announcement strip sits above the header on every width and scrolls away with the page; checkout stays free of offers */}
      {showAnnouncement && <AnnouncementLine />}
      <header className="sticky top-0 z-50 w-full select-none">
        {/* Phones and tablets: one emerald bar, edge to edge, always the same height. Menu and search on the left,
            the wordmark with its ornament in the centre, wishlist and bag with their real counts on the right. */}
        <div className="sag-on-emerald lg:hidden grid h-[60px] grid-cols-[1fr_auto_1fr] items-center px-1.5 sm:px-3.5">
          <div className="flex items-center">
            <button
              id="mobile-menu-trigger"
              onClick={() => { setIsSearchOpen(false); setIsMobileMenuOpen(!isMobileMenuOpen); }}
              className={`${phoneIcon} flex`}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-[21px] h-[21px]" strokeWidth={1.5} /> : <Menu className="w-[21px] h-[21px]" strokeWidth={1.5} />}
            </button>
            {/* The accessible name starts with "Search suits" (the storefront check looks for it) */}
            <button
              type="button"
              id="header-search-btn"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
              className={`${phoneIcon} flex`}
              aria-label={searchLabel}
              aria-expanded={isSearchOpen}
            >
              <Search className="w-[21px] h-[21px]" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
          <button id="header-brand-logo-mobile" onClick={() => setActivePage('home')} className="sag-hdr-wm flex flex-col items-center gap-1.5 cursor-pointer" aria-label="Suit Aura Girls home">
            <span className={`${WORDMARK} pl-[0.08em] text-[14px] tracking-[0.08em]! min-[360px]:pl-[0.14em] min-[360px]:text-[15px] min-[360px]:tracking-[0.14em]! min-[380px]:pl-[0.17em] min-[380px]:text-[17px] min-[380px]:tracking-[0.17em]! sm:pl-[0.22em] sm:text-[21px] sm:tracking-[0.22em]!`}>Suit Aura Girls</span>
            {ornament}
          </button>
          <div className="flex items-center justify-end">
            <button id="header-wishlist-btn-mobile" onClick={() => setActivePage('wishlist')} className={`${phoneIcon} flex`} aria-label={`Wishlist, ${wishlist.length} items`}>
              <Heart className="w-[21px] h-[21px]" strokeWidth={1.5} />
              {wishlist.length > 0 && <span className={badge}>{count(wishlist.length)}</span>}
            </button>
            <button
              id="header-cart-btn-mobile"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setIsCartDrawerOpen(true); }}
              className={`${phoneIcon} flex`}
              aria-label={`Bag, ${cartCount} items`}
            >
              <ShoppingBag className="w-[21px] h-[21px]" strokeWidth={1.5} />
              {cartCount > 0 && <span className={badge}><span key={cartCount} className="sag-settle">{count(cartCount)}</span></span>}
            </button>
          </div>
        </div>

        {/* Desktop: the emerald bar: the search field, the mark and wordmark in the centre, the icons; then the menu row */}
        <div className="hidden lg:block bg-dark text-on-dark">
        <div className="sag-on-emerald">
        <div className="mx-auto grid h-[76px] max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-6 px-6">
          <div className="relative w-full max-w-[340px]">
            <button
              type="button"
              id="desktop-search-field"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
              className="w-full h-11 pl-11 pr-12 rounded-lg border border-line bg-brand-dark text-left text-sm text-ink-muted truncate cursor-pointer"
            >
              {searchLabel}
            </button>
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex text-highlight">
              <Search className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <VoiceSearchButton onResult={executeSearch} className="absolute right-1 top-1/2 -translate-y-1/2" />
          </div>

          <button
            id="header-brand-logo"
            onClick={() => setActivePage('home')}
            className="sag-hdr-wm flex shrink-0 items-center gap-3.5 cursor-pointer"
            aria-label="Suit Aura Girls home"
          >
            <img src="/suit-aura-mark-132.webp" width={40} height={40} alt="" className="h-10 w-10 shrink-0 rounded-full! border border-line object-cover" />
            <span className="flex flex-col items-center gap-2">
              <span className={`${WORDMARK} pl-[0.22em] text-[24px] tracking-[0.22em]!`}>Suit Aura Girls</span>
              {ornament}
            </span>
          </button>

          <div className="flex items-center justify-end gap-1 shrink-0">
            <button id="header-wishlist-btn" onClick={() => setActivePage('wishlist')} className={`${deskIcon} hidden md:flex`} aria-label={`Wishlist, ${wishlist.length} items`}>
              <Heart className="w-[22px] h-[22px]" strokeWidth={1.5} />
              {wishlist.length > 0 && <span className={badge}>{count(wishlist.length)}</span>}
            </button>
            <button id="header-account-btn" onClick={() => setActivePage('account')} className={`${deskIcon} hidden md:flex`} aria-label={user ? 'My account' : 'Sign in'}>
              <User className="w-[22px] h-[22px]" strokeWidth={1.5} />
              {user && <span className="absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full bg-highlight" />}
            </button>
            <button
              id="header-cart-btn"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setIsCartDrawerOpen(true); }}
              className={`${deskIcon} flex`}
              aria-label={`Bag, ${cartCount} items`}
            >
              <ShoppingBag className="w-[22px] h-[22px]" strokeWidth={1.5} />
              {cartCount > 0 && <span className={badge}><span key={cartCount} className="sag-settle">{count(cartCount)}</span></span>}
            </button>
          </div>
        </div>
        </div>

        {/* Desktop: the menu on its own row under a thin champagne line, in small letter-spaced capitals;
            the current page carries a thin champagne underline */}
        <div className="border-t border-highlight/30">
          <nav className="px-6 h-[42px] flex items-center justify-center gap-9 xl:gap-11" aria-label="Main">
            {navItems.map((item) => (
              <button
                key={item.label}
                id={`nav-link-${item.label.toLowerCase().replace(/&/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')}`}
                onClick={item.action}
                aria-current={item.active ? 'page' : undefined}
                className={navLink}
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
                className={`${navLink} gap-1`}
              >
                Collections <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${collectionsOpen ? 'rotate-180' : ''}`} strokeWidth={1.5} />
                <span aria-hidden="true" className={navUnderline(collectionActive)} />
              </button>
              {collectionsOpen && (
                <div id="collections-menu" className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)] w-[460px] rounded-[10px] border border-line bg-surface p-5 text-ink shadow-[var(--sag-shadow-pop)] z-50 sag-pop">
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
                          className={`w-full min-h-11 flex items-center justify-between gap-2 border-b border-line py-2 text-left font-display text-[19px] leading-6 transition-colors cursor-pointer ${current ? 'text-brand font-semibold' : 'text-ink hover:text-brand'}`}
                        >
                          <span className="truncate">{name}</span>
                          <span className="sag-num shrink-0 font-sans text-[12px] font-normal text-ink-muted">{count}</span>
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
              className={`${navLink} text-highlight`}
            >
              Offers
              <span aria-hidden="true" className={navUnderline(offersActive)} />
            </button>
          </nav>
        </div>
        </div>

        {isSearchOpen && (
          <div id="search-drawer-overlay" className="sag-drop absolute left-2.5 right-2.5 top-full mt-2 text-ink lg:left-6 lg:right-6">
            {/* Dim the page under the panel; a tap outside closes it */}
            <div className="absolute -left-2.5 -right-2.5 top-0 h-screen bg-[color:var(--sag-scrim)] sag-fade lg:-left-6 lg:-right-6" onClick={closeSearch} aria-hidden="true" />
            <div className="relative max-w-3xl mx-auto rounded-[10px] border border-line bg-surface shadow-[var(--sag-shadow-pop)] px-4 sm:px-8 pt-4 pb-6 max-h-[calc(100vh-6.5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-6.5rem)] overflow-y-auto overscroll-contain">
              {/* The field: a white box whose edge turns emerald while typing */}
              <form role="search" onSubmit={(e) => { e.preventDefault(); executeSearch(searchInput); }} className="flex items-center gap-2 rounded-lg border border-control bg-surface pl-4 pr-2 focus-within:border-brand">
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
                <button type="button" onClick={closeSearch} className={`sag-caps h-10 shrink-0 px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand cursor-pointer ${searchInput ? 'hidden sm:inline-flex sm:items-center' : 'inline-flex items-center'}`}>
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
                              <img src={getCleanImageUrl(prod.images?.[0] || prod.image || '', 120)} alt="" className="w-12 h-[60px] shrink-0 rounded-lg! object-cover object-top bg-sunken" />
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
                      <p className="font-display text-[22px] font-semibold leading-7 text-ink break-words">No styles match “{searchTrimmed}”</p>
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
                          <img src={getCleanImageUrl(prod.images?.[0] || prod.image || '', 320)} alt="" loading="lazy" className="aspect-[4/5] w-full rounded-lg! bg-sunken object-cover object-top" />
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
