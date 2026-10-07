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
import { HeartIcon, LockIcon, PinIcon, ReturnIcon, SearchIcon, TagIcon, TruckIcon, UserIcon } from './StoreIcons';
import { assuranceFacts } from './Assurance';

const RECENT_KEY = 'sag_recent_searches_v1';

/** The brand name with each letter rising in once, then a slow wave passing through it (as in the chosen header). */
const WaveName: React.FC<{ onDark?: boolean }> = ({ onDark = false }) => {
  const letters = (text: string, from: number) => text.split('').map((letter, index) => (
    <span key={from + index} style={{ ['--i' as any]: from + index }}>{letter === ' ' ? ' ' : letter}</span>
  ));
  return (
    <span className={`sag-wave block truncate text-[14.5px] font-black leading-[16px] tracking-[0.08em] ${onDark ? 'text-white' : 'text-ink'}`} aria-hidden="true">
      {letters('SUIT AURA ', 0)}<span className={onDark ? 'text-highlight' : 'text-accent'}>{letters('GIRLS', 10)}</span>
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
  // Phones: the row with the menu and the search field slides away while the shopper scrolls down, and comes
  // back as soon as they scroll up (or are near the top), so the header takes one line while reading.
  const [searchRowHidden, setSearchRowHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    let quietUntil = 0; // the header changing height moves the page a little: ignore that for a moment
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        if (Date.now() < quietUntil) { lastY = y; return; }
        const delta = y - lastY;
        if (y < 80) {
          setSearchRowHidden((hidden) => { if (hidden) quietUntil = Date.now() + 350; return false; });
        } else if (delta > 8 && y > 200) {
          setSearchRowHidden((hidden) => { if (!hidden) quietUntil = Date.now() + 350; return true; });
        } else if (delta < -12) {
          setSearchRowHidden((hidden) => { if (hidden) quietUntil = Date.now() + 350; return false; });
        }
        if (Math.abs(delta) > 4) lastY = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);
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

  // One look for every header control: a 44px round button, ink icon, grey fill on hover
  const iconButton = 'relative w-11 h-11 shrink-0 rounded-full items-center justify-center text-ink hover:bg-sunken cursor-pointer transition-colors';
  const badge = 'absolute top-0.5 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-bold tabular-nums leading-none flex items-center justify-center';
  // On the black phone header the count sits on amber with dark figures
  const badgeOnDark = 'absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-highlight text-ink text-[11px] font-extrabold tabular-nums leading-none flex items-center justify-center';
  const navLink = (active: boolean) => `relative h-12 inline-flex items-center text-sm cursor-pointer transition-colors ${active ? 'text-ink font-semibold' : 'font-medium text-ink-muted hover:text-ink'}`;
  const navUnderline = (active: boolean) => `absolute left-0 right-0 bottom-0 h-0.5 bg-brand ${active ? '' : 'hidden'}`;
  const collectionActive = collectionsOpen || (activePage === 'shop' && collections.some(([c]) => c === selectedCategory));
  const offersActive = activePage === 'shop' && selectedCategory === 'Sale';
  // Three of the store's facts as small chips under the phone header (worded in Assurance, shortened to fit)
  const facts = assuranceFacts();
  const chipsHidden = searchRowHidden || isSearchOpen || isMobileMenuOpen;
  const trustChip = 'inline-flex h-[28px] shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2.5 text-[11.5px] font-bold leading-none text-ink';
  const tile = 'flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-chip bg-lilac px-3 py-2.5 text-left text-[13px] font-bold text-lilac-ink cursor-pointer';
  const searchLabel = 'Search suits, kurtis & more';
  const rowHidden = searchRowHidden && !isSearchOpen && !isMobileMenuOpen;
  // What the search hint types: the store's biggest collections, in the words a shopper would use
  const searchHints = collections.slice(0, 5).map(([name]) => name.toLowerCase());

  return (
    <>
      <header className="sticky top-0 z-50 w-full lg:bg-white lg:border-b lg:border-line select-none">
        {/* Phones and tablets: the all-dark header. Logo in a turning gold ring, the name, wishlist and bag;
            under them the menu, the dark search field and the gold search button. */}
        <div className="lg:hidden rounded-b-[18px] bg-dark">
        <div className={`max-w-2xl mx-auto px-2.5 pt-2 transition-[padding] duration-200 ${rowHidden ? 'pb-2' : 'pb-2.5'}`}>
          <div className="flex items-center gap-2">
            <button id="header-brand-logo-mobile" onClick={() => setActivePage('home')} className="flex min-w-0 flex-1 items-center gap-2 rounded-full text-left cursor-pointer" aria-label="Suit Aura Girls home">
              <span className="sag-ring-amber flex h-[40px] w-[40px] shrink-0 items-center justify-center">
                <img src="/suit-aura-mark-132.webp" alt="" width="32" height="32" className="h-[32px] w-[32px] rounded-full bg-white object-cover" />
              </span>
              <span className="min-w-0">
                <WaveName onDark />
                <span className="mt-px block truncate text-[10.5px] font-semibold leading-[13px] text-on-dark-muted">Ethnic wear · Delivery across India</span>
              </span>
            </button>
            <button id="header-wishlist-btn-mobile" onClick={() => setActivePage('wishlist')} className="relative flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-white/10 text-white cursor-pointer" aria-label={`Wishlist, ${wishlist.length} items`}>
              <HeartIcon className="w-[19px] h-[19px]" mono />
              {wishlist.length > 0 && <span className={badgeOnDark}>{wishlist.length > 99 ? '99+' : wishlist.length}</span>}
            </button>
            <button
              id="header-cart-btn-mobile"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(false); setIsCartDrawerOpen(true); }}
              className="relative flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-white/10 text-white cursor-pointer"
              aria-label={`Bag, ${cartCount} items`}
            >
              <BagIcon className="w-[19px] h-[19px]" mono />
              {cartCount > 0 && <span className={badgeOnDark}>{cartCount > 99 ? '99+' : cartCount}</span>}
            </button>
          </div>
          {/* Slides away on the way down the page, back on the way up; always shown while the menu or search is open */}
          <div
            className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${rowHidden ? 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100 mt-2'}`}
            {...(rowHidden ? { inert: true } : {})}
          >
          <div className="min-h-0 overflow-hidden -m-1.5 p-1.5 flex items-center gap-2">
            <button
              id="mobile-menu-trigger"
              onClick={() => { setIsSearchOpen(false); setIsMobileMenuOpen(!isMobileMenuOpen); }}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white/10 text-white cursor-pointer"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-[19px] h-[19px]" strokeWidth={1.9} /> : <Menu className="w-[19px] h-[19px]" strokeWidth={1.9} />}
            </button>
            {/* The accessible name starts with "Search suits" (the storefront check looks for it) */}
            <button
              id="header-search-btn"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(!isSearchOpen); }}
              className="flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 text-left text-[13px] text-white cursor-pointer"
              aria-label={searchLabel}
              aria-expanded={isSearchOpen}
            >
              <span className="flex shrink-0 text-highlight"><SearchIcon className="w-[17px] h-[17px]" mono /></span>
              <TypedSearchHint words={searchHints} fallback={searchLabel} />
            </button>
            <button
              type="button"
              onClick={() => { setIsMobileMenuOpen(false); setIsSearchOpen(true); }}
              className="sag-glow flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-sun text-ink cursor-pointer"
              aria-label="Open search"
            >
              <SearchIcon className="w-[17px] h-[17px]" mono />
            </button>
          </div>
          </div>
        </div>
        </div>

        {/* Under the header, on the page: three store facts as chips. They slide away with the search row. */}
        <div
          className={`lg:hidden grid transition-[grid-template-rows,opacity] duration-200 ease-out ${chipsHidden ? 'grid-rows-[0fr] opacity-0 pointer-events-none' : 'grid-rows-[1fr] opacity-100'}`}
          {...(chipsHidden ? { inert: true } : {})}
        >
          <div className="min-h-0 overflow-hidden">
            <ul id="header-trust-chips" aria-label="Why shop with us" className="mx-auto flex max-w-2xl items-center justify-center gap-1.5 overflow-x-auto bg-page px-2.5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <li className="flex shrink-0">
                <span className={trustChip}><LockIcon className="w-[13px] h-[13px]" mono /><span aria-hidden="true">Secure UPI</span><span className="sr-only">{facts.payment}</span></span>
              </li>
              <li className="flex shrink-0">
                <button type="button" onClick={() => setActivePage('return-policy')} aria-label={facts.returns} className={`${trustChip} cursor-pointer`}><ReturnIcon className="w-[13px] h-[13px]" mono />7-day returns</button>
              </li>
              <li className="flex shrink-0">
                <button type="button" onClick={() => setActivePage('shipping-policy')} aria-label={facts.delivery} className={`${trustChip} cursor-pointer`}><TruckIcon className="w-[13px] h-[13px]" mono />All India</button>
              </li>
            </ul>
          </div>
        </div>

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
                {/* Empty field: real product photos with their price, in one swipeable row */}
                {searchTrimmed.length < 2 && suggested.items.length > 0 && (
                  <div id="search-trending-container">
                    <p className="mb-2 text-sm font-extrabold leading-5 text-ink">{suggested.title}</p>
                    <div className="sag-scroll-x -mx-4 flex gap-2.5 overflow-x-auto px-4 sm:-mx-8 sm:px-8">
                      {suggested.items.map((prod) => (
                        <button
                          key={prod.id}
                          type="button"
                          id={`search-trending-${prod.id}`}
                          onClick={() => { navigateToProduct(prod.id); setIsSearchOpen(false); setSearchInput(''); }}
                          aria-label={`${prod.name}, ₹${prod.price.toLocaleString('en-IN')}`}
                          className="flex w-[104px] shrink-0 flex-col gap-1.5 rounded-chip text-left cursor-pointer"
                        >
                          <img src={getCleanImageUrl(prod.images?.[0] || prod.image || '', 320)} alt="" loading="lazy" className="aspect-[4/5] w-full rounded-chip bg-sunken object-cover object-top" />
                          <span className="sag-num px-0.5 text-[13px] font-bold leading-4 text-ink">₹{prod.price.toLocaleString('en-IN')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Quick ways in: only collections that have products, each with its real count */}
                {(collections.length > 0 || hasKidsToys) && (
                  <div id="trending-searches-container">
                    <p className="mb-2 text-sm font-extrabold leading-5 text-ink">Collections</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {collections.map(([name, count]) => (
                        <button key={name} type="button" onClick={() => { navigateToCategory(name as any); setIsSearchOpen(false); }} className={tile}>
                          <span className="min-w-0 break-words">{name}</span>
                          <span className="sag-num shrink-0 text-xs font-semibold text-ink-muted">{count}</span>
                        </button>
                      ))}
                      {hasKidsToys && <button type="button" onClick={() => { navigateToCategory(KIDS_TOYS as any); setIsSearchOpen(false); }} className={tile}><span className="min-w-0 break-words">{KIDS_TOYS}</span></button>}
                      <button type="button" onClick={() => { navigateToCategory('New Arrivals'); setIsSearchOpen(false); }} className={tile}><span className="min-w-0 break-words">New arrivals</span></button>
                      <button type="button" onClick={() => { navigateToCategory('Sale'); setIsSearchOpen(false); }} className="flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-chip bg-peach px-3 py-2.5 text-left text-[13px] font-bold text-peach-ink cursor-pointer"><TagIcon className="w-4 h-4 shrink-0" mono /> Offers</button>
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
