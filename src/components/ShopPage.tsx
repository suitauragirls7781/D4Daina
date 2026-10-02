import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useShop } from '../context/ShopContext';
import { useRouter } from '../context/RouterContext';
import { useAdmin } from '../context/AdminContext';
import { ProductCard } from './ProductCard';
import { Product, ProductSize } from '../types';
import { fuzzyMatchProduct } from '../utils/fuzzySearch';
import { hasStructure, isAvailable, matchesSmartQuery, parseSmartQuery } from '../utils/smartQuery';
import { rememberSearch } from '../utils/shopperMemory';
import { trackItem } from '../utils/visitorTracker';
import { VoiceSearchButton } from './VoiceSearchButton';
const FindThisLookButton = React.lazy(() => import('./FindThisLook').then((m) => ({ default: m.FindThisLookButton })));
import { BuildYourLookButton } from './BuildYourLook';
import { useDiscovery, occasionProducts } from '../utils/discovery';
import { KIDS_ALL, KIDS_CATEGORIES, KIDS_SIZES, KIDS_TOYS, TOYS, departmentOf, isKids, isKidsToysListing, kindOf } from '../utils/kids';
import { categoryToSlug } from '../utils/slugHelper';
import { ArrowUpDown, Check, ChevronDown, ChevronRight, Shuffle, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { SearchIcon } from './StoreIcons';

type SortKey = 'featured' | 'newest' | 'price-low' | 'price-high' | 'discount' | 'top-rated';
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'featured', label: 'Featured' },
  { key: 'newest', label: 'Newest' },
  { key: 'price-low', label: 'Price: low to high' },
  { key: 'price-high', label: 'Price: high to low' },
  { key: 'discount', label: 'Biggest discount' },
  { key: 'top-rated', label: 'Top rated' },
];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', ...KIDS_SIZES, 'UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8', 'Free Size'];
const FABRIC_WORDS = ['cotton', 'silk', 'georgette', 'chiffon', 'rayon', 'velvet', 'organza', 'linen', 'crepe', 'net', 'chanderi', 'muslin', 'satin', 'khadi', 'modal', 'viscose', 'tissue', 'banarasi'];
const SPECIAL = ['All', 'New Arrivals', 'Sale', 'Best Sellers', 'Trending'] as const;
const PAGE = 24;
const PRICE_STEP = 50;

const SITE = 'https://www.suitauragirls.in';
const DEFAULT_TITLE = "Suit Aura Girls | Women's Suits, Kurtis & Ethnic Fashion";
const DEFAULT_DESCRIPTION = "Shop elegant women's suits, kurtis, dresses, anarkali and ethnic fashion at Suit Aura Girls.";

const discountOf = (p: Product) => {
  const mrp = Math.max(p.price, Number(p.originalPrice) || p.price);
  return mrp > p.price ? Math.round(((mrp - p.price) / mrp) * 100) : 0;
};
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);
const readParams = () => {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const sort = params.get('sort') as SortKey | null;
  return { q: params.get('q') || '', sort: sort && SORTS.some((s) => s.key === sort) ? sort : 'featured' as SortKey };
};

// Head tags for listing pages. Tags this page had to add are marked and removed again on leaving.
const setHead = (selector: string, attr: string, value: string) => document.head.querySelector(selector)?.setAttribute(attr, value);
const ensureHead = (selector: string, create: () => HTMLElement) => {
  if (document.head.querySelector(selector)) return;
  const tag = create();
  tag.setAttribute('data-shop-seo', '');
  document.head.appendChild(tag);
};

export const ShopPage: React.FC = () => {
  const { products = [], isLoading, selectedCategory, navigateToCategory, setActivePage, setSearchQuery, navigateToProduct } = useShop();
  const { reviewsList = [] } = useAdmin();
  const { routeState } = useRouter();
  const discovery = useDiscovery();

  // The URL slug decides the category. It is matched against the real product categories first,
  // so names that do not survive slugToCategory (e.g. "Salwar Suits", "Kurti & Palazzo") still open.
  const routeSlug = routeState.customerRoute === 'shop' ? (routeState.customerParams?.slug || routeState.customerParams?.category || '').toLowerCase() : '';
  const category = useMemo(() => {
    const exact = routeSlug ? products.find((p) => categoryToSlug(p.category) === routeSlug) : undefined;
    return exact ? exact.category : selectedCategory;
  }, [routeSlug, products, selectedCategory]);

  // /shop?occasion=<id>: an admin-managed occasion collection
  const [occasionId, setOccasionId] = useState(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('occasion') || '');
  useEffect(() => {
    const read = () => setOccasionId(new URLSearchParams(window.location.search).get('occasion') || '');
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  const activeOccasion = discovery.features.occasions ? discovery.occasions.find((o) => o.id === occasionId && o.enabled) || null : null;
  const occasionIds = useMemo(() => (activeOccasion ? new Set(occasionProducts(activeOccasion, products).map((p) => String(p.id))) : null), [activeOccasion, products]);
  const leaveOccasion = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete('occasion');
    const qs = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    setOccasionId('');
  };

  // The address bar alone decides the search (the header search puts ?q= in it), so an old search never follows the shopper.
  const [query, setQuery] = useState(() => readParams().q);
  const [sort, setSort] = useState<SortKey>(() => readParams().sort);
  const [sizes, setSizes] = useState<string[]>([]);
  // Kids wear / toys: one kind at a time (Frocks & Dresses, Cars...); '' = every kind
  const [kind, setKind] = useState('');
  const [colors, setColors] = useState<string[]>([]);
  const [fabrics, setFabrics] = useState<string[]>([]);
  const [fits, setFits] = useState<string[]>([]);
  const [occasions, setOccasions] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [minDiscount, setMinDiscount] = useState(0);
  const [minRating, setMinRating] = useState(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  // Typed min/max prices apply on blur or Enter, so a half-typed number never empties the list.
  const [minDraft, setMinDraft] = useState('');
  const [maxDraft, setMaxDraft] = useState('');
  useEffect(() => { setMinDraft(minPrice === null ? '' : String(minPrice)); }, [minPrice]);
  useEffect(() => { setMaxDraft(maxPrice === null ? '' : String(maxPrice)); }, [maxPrice]);

  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  // Keep ?q= and ?sort= in sync with the address bar (replace, so Back still leaves the shop).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (query.trim()) params.set('q', query.trim()); else params.delete('q');
    if (sort !== 'featured') params.set('sort', sort); else params.delete('sort');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next);
    setSearchQuery(query.trim());
  }, [query, sort]);

  // A new header search (or Back/Forward, or a link to another listing) updates the view from the URL.
  useEffect(() => {
    const fromUrl = readParams();
    setQuery(fromUrl.q);
    setSort(fromUrl.sort);
    setOccasionId(new URLSearchParams(window.location.search).get('occasion') || '');
    setVisible(PAGE);
  }, [routeState]);

  useEffect(() => { setVisible(PAGE); }, [category, query, sizes, colors, fabrics, fits, occasions, minPrice, maxPrice, minDiscount, minRating, inStockOnly, sort, kind]);
  useEffect(() => { setKind(''); }, [category]);

  // Ratings come only from approved customer reviews.
  const ratings = useMemo(() => {
    const totals = new Map<string, { sum: number; count: number }>();
    for (const r of reviewsList) {
      const value = Number(r.rating);
      if (r.status !== 'approved' || !r.productId || !(value >= 1 && value <= 5)) continue;
      const entry = totals.get(String(r.productId)) || { sum: 0, count: 0 };
      entry.sum += value;
      entry.count += 1;
      totals.set(String(r.productId), entry);
    }
    return new Map([...totals].map(([id, t]) => [id, { avg: t.sum / t.count, count: t.count }]));
  }, [reviewsList]);
  // Rounded like the product page shows it ("4.0"), so "4★ & up" matches what shoppers see.
  const shownRating = (p: Product) => {
    const r = ratings.get(String(p.id));
    return r ? Math.round(r.avg * 10) / 10 : 0;
  };
  const hasRatings = useMemo(() => products.some((p) => ratings.has(String(p.id))), [products, ratings]);
  const activeSort: SortKey = sort === 'top-rated' && !hasRatings ? 'featured' : sort;

  const kidsPage = isKidsToysListing(category);
  const searchingAll = category === 'All' && query.trim().length > 0;
  const pool = useMemo(
    () => (searchingAll ? products : products.filter((p) => (departmentOf(p) === 'women') !== kidsPage)),
    [products, kidsPage, searchingAll],
  );
  const inCategory = useMemo(() => pool.filter((p) => {
    switch (category) {
      case 'All': return true;
      case KIDS_TOYS: return true; // the whole Kids & Toys page
      case 'New Arrivals': return Boolean(p.isNewArrival);
      case 'Best Sellers': return Boolean(p.isBestSeller);
      case 'Trending': return Boolean(p.isTrending);
      case 'Sale': return Boolean(p.isSale) || discountOf(p) > 0;
      case KIDS_ALL: return isKids(p); // Baby Girls and Baby Boys together
      default: return categoryToSlug(p.category) === categoryToSlug(category);
    }
  }), [pool, category]);
  // What this listing holds before the shopper's own filters (used for page titles and descriptions)
  const listing = useMemo(() => (occasionIds ? inCategory.filter((p) => occasionIds.has(String(p.id))) : inCategory), [inCategory, occasionIds]);

  // Filter options come from the products actually in this view.
  const options = useMemo(() => {
    const uniq = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];
    const sizeSet = uniq(inCategory.flatMap((p) => p.sizes || []));
    const prices = inCategory.map((p) => p.price).filter((n) => Number.isFinite(n) && n >= 0);
    return {
      sizes: sizeSet.sort((a, b) => (SIZE_ORDER.indexOf(a) + 1 || 99) - (SIZE_ORDER.indexOf(b) + 1 || 99)),
      colors: uniq(inCategory.flatMap((p) => (p.colors || []).map((c) => c.name)).filter((n) => !['Default', 'Standard'].includes(n))),
      fabrics: FABRIC_WORDS.filter((w) => inCategory.some((p) => (p.fabric || '').toLowerCase().includes(w))),
      fits: uniq(inCategory.map((p) => titleCase((p.fit || '').toLowerCase()))),
      occasions: uniq(inCategory.flatMap((p) => (p.occasion || '').split(/,|&|\/| and /i).map((o) => titleCase(o.trim().toLowerCase())))),
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
      hasDiscounts: inCategory.some((p) => discountOf(p) > 0),
      hasSoldOut: inCategory.some((p) => !p.inStock || Number(p.stockQuantity ?? 0) <= 0),
      hasRatings: inCategory.some((p) => ratings.has(String(p.id))),
    };
  }, [inCategory, ratings]);

  // Slider ends on whole steps, so the top of the range really means "no upper limit".
  const lowBound = Math.floor(options.priceMin / PRICE_STEP) * PRICE_STEP;
  const highBound = Math.max(lowBound + PRICE_STEP, Math.ceil(options.priceMax / PRICE_STEP) * PRICE_STEP);
  const lo = Math.min(Math.max(minPrice ?? lowBound, lowBound), highBound);
  const hi = Math.max(Math.min(maxPrice ?? highBound, highBound), lo);
  const pct = (v: number) => (v - lowBound) / (highBound - lowBound);
  const commitPrice = (which: 'min' | 'max', raw: string) => {
    const n = Math.round(Number(raw));
    const value = !raw.trim() || !Number.isFinite(n) || n <= 0 ? null
      : which === 'min' ? (maxPrice !== null ? Math.min(n, maxPrice) : n)
      : (minPrice !== null ? Math.max(n, minPrice) : n);
    // The box always shows the price that is actually applied.
    if (which === 'min') { setMinPrice(value); setMinDraft(value === null ? '' : String(value)); }
    else { setMaxPrice(value); setMaxDraft(value === null ? '' : String(value)); }
  };

  // "black party suits under 1200 in XL" -> colour, occasion, type, price and size filters
  const smart = useMemo(() => parseSmartQuery(query), [query]);
  const smartOn = query.trim().length > 0 && hasStructure(smart);
  useEffect(() => {
    if (!query.trim()) return;
    const t = window.setTimeout(() => { rememberSearch(query); if (query.trim().length >= 3) trackItem('search', query.trim()); }, 1500);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useMemo(() => {
    const list = inCategory.filter((p) => {
      const soldOut = !p.inStock || Number(p.stockQuantity ?? 0) <= 0;
      if (inStockOnly && soldOut) return false;
      if (occasionIds && !occasionIds.has(String(p.id))) return false;
      if (query.trim() && (smartOn ? !matchesSmartQuery(p, smart) : !fuzzyMatchProduct(p, query))) return false;
      if (kind && kindOf(p) !== kind) return false;
      if (sizes.length && !sizes.some((s) => (p.sizes || []).includes(s as ProductSize))) return false;
      if (colors.length && !(p.colors || []).some((c) => colors.includes(c.name.trim()))) return false;
      if (fabrics.length && !fabrics.some((f) => (p.fabric || '').toLowerCase().includes(f))) return false;
      if (fits.length && !fits.includes(titleCase((p.fit || '').trim().toLowerCase()))) return false;
      if (occasions.length) {
        const own = (p.occasion || '').split(/,|&|\/| and /i).map((o) => titleCase(o.trim().toLowerCase()));
        if (!occasions.some((o) => own.includes(o))) return false;
      }
      if (minPrice !== null && p.price < minPrice) return false;
      if (maxPrice !== null && p.price > maxPrice) return false;
      if (minDiscount > 0 && discountOf(p) < minDiscount) return false;
      if (minRating > 0 && shownRating(p) < minRating) return false;
      return true;
    });
    const order = new Map(products.map((p, i) => [p.id, i])); // catalogue order = newest first
    const sorted = [...list].sort((a, b) => {
      if (activeSort === 'price-low') return a.price - b.price;
      if (activeSort === 'price-high') return b.price - a.price;
      if (activeSort === 'discount') return discountOf(b) - discountOf(a);
      if (activeSort === 'newest') return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
      if (activeSort === 'top-rated') {
        const ra = ratings.get(String(a.id));
        const rb = ratings.get(String(b.id));
        return (rb?.avg ?? 0) - (ra?.avg ?? 0) || (rb?.count ?? 0) - (ra?.count ?? 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
      }
      const score = (p: Product) => (p.isFeatured ? 4 : 0) + (p.isBestSeller ? 2 : 0) + (p.isNewArrival ? 1 : 0);
      return score(b) - score(a) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    });
    // Sold-out styles are shown last.
    return [...sorted.filter((p) => p.inStock && Number(p.stockQuantity ?? 0) > 0), ...sorted.filter((p) => !p.inStock || Number(p.stockQuantity ?? 0) <= 0)];
  }, [inCategory, occasionIds, query, smart, smartOn, sizes, colors, fabrics, fits, occasions, minPrice, maxPrice, minDiscount, minRating, ratings, inStockOnly, activeSort, products, kind]);

  // Kinds on offer in a kids or toys listing (with counts), shown as a second row of chips
  const kinds = useMemo(() => {
    if (!inCategory.length || inCategory.some((p) => departmentOf(p) === 'women')) return [] as Array<[string, number]>;
    const counts = new Map<string, number>();
    inCategory.forEach((p) => { const k = kindOf(p); if (k) counts.set(k, (counts.get(k) || 0) + 1); });
    return counts.size > 1 ? [...counts.entries()].sort((a, b) => b[1] - a[1]) : [];
  }, [inCategory]);

  // Surprise me: a random available style from what the shopper is looking at now
  const surprise = () => {
    const pool = results.filter(isAvailable);
    if (!pool.length) return;
    navigateToProduct(pool[Math.floor(Math.random() * pool.length)].id);
  };

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) =>
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  const clearFilters = () => {
    setSizes([]); setColors([]); setFabrics([]); setFits([]); setOccasions([]);
    setMinPrice(null); setMaxPrice(null); setMinDiscount(0); setMinRating(0); setInStockOnly(false);
  };

  // Every selected filter as a removable chip (a price range counts as one filter).
  const priceLabel = minPrice !== null && maxPrice !== null ? `${inr(minPrice)} – ${inr(maxPrice)}` : maxPrice !== null ? `Up to ${inr(maxPrice)}` : `From ${inr(minPrice ?? 0)}`;
  const activeChips: Array<{ key: string; label: string; remove: () => void }> = [
    ...sizes.map((v) => ({ key: `size-${v}`, label: `Size ${v}`, remove: () => toggle(setSizes, v) })),
    ...colors.map((v) => ({ key: `colour-${v}`, label: v, remove: () => toggle(setColors, v) })),
    ...fabrics.map((v) => ({ key: `fabric-${v}`, label: titleCase(v), remove: () => toggle(setFabrics, v) })),
    ...fits.map((v) => ({ key: `fit-${v}`, label: `${v} fit`, remove: () => toggle(setFits, v) })),
    ...occasions.map((v) => ({ key: `occasion-${v}`, label: v, remove: () => toggle(setOccasions, v) })),
    ...(minPrice !== null || maxPrice !== null ? [{ key: 'price', label: priceLabel, remove: () => { setMinPrice(null); setMaxPrice(null); } }] : []),
    ...(minDiscount ? [{ key: 'discount', label: `${minDiscount}%+ off`, remove: () => setMinDiscount(0) }] : []),
    ...(minRating ? [{ key: 'rating', label: `${minRating}★ & up`, remove: () => setMinRating(0) }] : []),
    ...(inStockOnly ? [{ key: 'stock', label: 'In stock only', remove: () => setInStockOnly(false) }] : []),
  ];
  const activeCount = activeChips.length;
  const removeChip = (index: number) => {
    activeChips[index].remove();
    // Keep keyboard focus in the chip row instead of dropping it on the page body.
    window.requestAnimationFrame(() => {
      const buttons = chipsRef.current?.querySelectorAll<HTMLButtonElement>('button');
      if (buttons?.length) buttons[Math.min(index, buttons.length - 1)].focus();
    });
  };

  const categoryPills = useMemo(() => {
    const all = [...new Set(products.map((p) => p.category))];
    // Women's categories first, then Kids (girls + boys together), Baby Girls, Baby Boys, then Toys
    const kidsCats = (KIDS_CATEGORIES as readonly string[]).filter((c) => all.includes(c as any));
    if (kidsPage) {
      const list: string[] = [KIDS_TOYS, ...(kidsCats.length ? [KIDS_ALL, ...kidsCats] : []), ...all.filter((c) => c === TOYS)];
      if (!list.some((c) => categoryToSlug(c) === categoryToSlug(category))) list.push(category);
      return list;
    }
    const women = products.filter((p) => departmentOf(p) === 'women');
    const own: string[] = all.filter((c) => departmentOf({ category: c } as Product) === 'women');
    const special = SPECIAL.filter((c) => c === 'All'
      || (c === 'New Arrivals' && women.some((p) => p.isNewArrival))
      || (c === 'Sale' && women.some((p) => p.isSale || discountOf(p) > 0))
      || (c === 'Best Sellers' && women.some((p) => p.isBestSeller))
      || (c === 'Trending' && women.some((p) => p.isTrending)));
    const list: string[] = [...special, ...own];
    if (!list.some((c) => categoryToSlug(c) === categoryToSlug(category))) list.push(category);
    return list;
  }, [products, category, kidsPage]);

  useEffect(() => {
    const row = pillsRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !active) return;
    const target = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
    row.scrollTo({ left: Math.max(0, target), behavior: 'auto' });
  }, [category, categoryPills.length]);

  // Mobile filter and sort sheets: focus moves in and stays inside, Escape closes, focus returns to the button that opened it.
  useEffect(() => {
    if (!filtersOpen && !sortOpen) return;
    const closeSheet = () => { setFiltersOpen(false); setSortOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeSheet(); return; }
      if (e.key !== 'Tab' || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!drawerRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    // The sheets are mobile-only; close them if the window grows to the desktop layout.
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onDesktop = () => { if (desktop.matches) closeSheet(); };
    desktop.addEventListener?.('change', onDesktop);
    const trigger = filtersOpen ? filtersButtonRef.current : sortButtonRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      desktop.removeEventListener?.('change', onDesktop);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [filtersOpen, sortOpen]);

  // Title, description, canonical and robots for this listing, built only from the live catalogue.
  const seo = useMemo(() => {
    const q = query.trim();
    const path = category === 'All' ? '/shop' : `/category/${categoryToSlug(category)}`;
    const isSpecial = (SPECIAL as readonly string[]).includes(category);
    const label = category === 'All' ? 'All styles' : category === 'Sale' ? 'Offers' : category === KIDS_TOYS ? 'Kids wear & toys' : category;
    const count = isLoading ? 0 : listing.length;
    const styles = count ? `${count} ${count === 1 ? 'style' : 'styles'}` : '';
    const prices = listing.map((p) => p.price).filter((n) => n > 0);
    const from = prices.length ? ` from ${inr(Math.min(...prices))}` : '';
    const trail = 'Secure online payment, shipped across India.';
    let title: string;
    let description: string;
    let canonical: string;
    if (q) {
      title = `Search: ${q} | Suit Aura Girls`;
      description = `Search results for “${q}” at Suit Aura Girls.`;
      canonical = `${SITE}${path}?q=${encodeURIComponent(q)}`;
    } else if (activeOccasion) {
      title = `${activeOccasion.name} | Suit Aura Girls`;
      const about = (activeOccasion.description || '').trim().replace(/[.!\s]*$/, '');
      description = `Shop ${activeOccasion.name} at Suit Aura Girls${styles ? `: ${styles}${from}` : ''}.${about ? ` ${about}.` : ''} ${trail}`;
      canonical = `${SITE}${path}?occasion=${encodeURIComponent(activeOccasion.id)}`;
    } else if (category === 'All') {
      const cats = [...new Set(listing.map((p) => p.category).filter(Boolean))].slice(0, 3);
      title = 'Shop all styles | Suit Aura Girls';
      description = `Shop ${styles ? `all ${styles}` : 'all styles'}${cats.length ? ` of ${listOf(cats)}` : ''} at Suit Aura Girls${from}. ${trail}`;
      canonical = `${SITE}/shop`;
    } else {
      title = isSpecial || kidsPage ? `${label} | Suit Aura Girls` : `${label} for women | Suit Aura Girls`;
      description = category === 'Sale'
        ? `Styles on offer at Suit Aura Girls${styles ? `: ${styles}${from}` : ''}. ${trail}`
        : `Shop ${label} at Suit Aura Girls${styles ? `: ${styles}${from}` : ''}. ${trail}`;
      canonical = `${SITE}${path}`;
    }
    // Search results and empty listings are kept out of search engines; their links are still followed.
    const robots = q || (!isLoading && listing.length === 0) ? 'noindex, follow' : 'index, follow';
    return { title, description: clip(description, 160), canonical, robots };
  }, [query, category, activeOccasion, listing, isLoading, kidsPage]);

  useEffect(() => {
    let cancelled = false;
    // Applied after the app's route-level head update, which runs later in the same commit.
    queueMicrotask(() => {
      if (cancelled) return;
      document.title = seo.title;
      setHead('meta[name="description"]', 'content', seo.description);
      setHead('meta[property="og:title"]', 'content', seo.title);
      setHead('meta[property="og:description"]', 'content', seo.description);
      ensureHead('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }));
      setHead('link[rel="canonical"]', 'href', seo.canonical);
      setHead('meta[property="og:url"]', 'content', seo.canonical);
      ensureHead('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' }));
      setHead('meta[name="robots"]', 'content', seo.robots);
    });
    return () => { cancelled = true; };
  }, [seo.title, seo.description, seo.canonical, seo.robots, routeState]);

  // Leaving the shop restores the site defaults (the next page then sets its own) and forgets the search.
  useEffect(() => () => {
    setSearchQuery('');
    document.title = DEFAULT_TITLE;
    setHead('meta[name="description"]', 'content', DEFAULT_DESCRIPTION);
    setHead('meta[property="og:title"]', 'content', DEFAULT_TITLE);
    setHead('meta[property="og:description"]', 'content', DEFAULT_DESCRIPTION);
    document.head.querySelectorAll('[data-shop-seo]').forEach((tag) => tag.remove());
    setHead('meta[name="robots"]', 'content', 'index, follow');
    setHead('link[rel="canonical"]', 'href', `${SITE}/`);
    setHead('meta[property="og:url"]', 'content', `${SITE}/`);
  }, []);

  // Filter / category chip: white with a control border, ink-filled when selected
  const chip = (active: boolean) => `sag-chip h-11 min-w-0 gap-1.5 px-3.5 text-sm ${active ? 'is-selected' : ''}`;
  // float + w-full keeps the legend inside the fieldset's padding (a plain legend sits on the top edge)
  const legend = 'float-left w-full mb-3 text-[13px] leading-[18px] font-semibold text-ink';
  // Real colour swatches, taken from the products' own colour data
  const colourHex = useMemo(() => {
    const map = new Map<string, string>();
    inCategory.forEach((p) => (p.colors || []).forEach((c) => { if (c?.name && c.hex && !map.has(c.name.trim())) map.set(c.name.trim(), c.hex); }));
    return map;
  }, [inCategory]);
  const thumb = 'absolute inset-0 w-full h-11 appearance-none bg-transparent pointer-events-none focus:outline-none '
    + '[&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:cursor-pointer focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ink '
    + '[&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:box-border [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:cursor-pointer focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-ink';
  // When both handles meet, the one that can still move is kept on top.
  const minOnTop = lo >= hi - PRICE_STEP && lo > (lowBound + highBound) / 2;

  const filterGroup = (title: string, values: string[], selected: string[], onToggle: (v: string) => void, format?: (v: string) => string, swatch = false) => values.length === 0 ? null : (
    <fieldset key={title} className="py-5 border-b border-line">
      <legend className={legend}>
        {title}
        {selected.length > 0 && <span className="ml-2 font-normal text-ink-muted">{selected.length} selected</span>}
      </legend>
      <div className="clear-both flex flex-wrap gap-2">
        {values.map((v) => (
          <button key={v} type="button" onClick={() => onToggle(v)} aria-pressed={selected.includes(v)} className={chip(selected.includes(v))}>
            {swatch && colourHex.get(v) && (
              <span className="w-4 h-4 shrink-0 rounded-full border border-line ring-2 ring-white" style={{ backgroundColor: colourHex.get(v) }} aria-hidden="true" />
            )}
            {format ? format(v) : v}
          </button>
        ))}
      </div>
    </fieldset>
  );

  const filterPanel = (
    <div>
      {filterGroup('Size', options.sizes, sizes, (v) => toggle(setSizes, v))}
      {filterGroup('Colour', options.colors, colors, (v) => toggle(setColors, v), undefined, true)}
      {filterGroup('Fabric', options.fabrics, fabrics, (v) => toggle(setFabrics, v), titleCase)}
      {filterGroup('Fit', options.fits, fits, (v) => toggle(setFits, v))}
      {filterGroup('Occasion', options.occasions, occasions, (v) => toggle(setOccasions, v))}
      {options.priceMax > options.priceMin && (
        <fieldset className="py-5 border-b border-line">
          <legend className={legend}>Price</legend>
          <p className="clear-both sag-num text-[15px] font-semibold text-ink">{inr(minPrice ?? lowBound)} – {inr(maxPrice ?? highBound)}</p>
          <div className="relative mt-1 h-11">
            <div className="absolute inset-x-3.5 top-1/2 -translate-y-1/2 h-1 rounded-full bg-sunken-deep" aria-hidden="true" />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-ink"
              style={{ left: `calc(${pct(lo)} * (100% - 28px) + 14px)`, right: `calc(${1 - pct(hi)} * (100% - 28px) + 14px)` }}
              aria-hidden="true"
            />
            <input
              type="range"
              min={lowBound}
              max={highBound}
              step={PRICE_STEP}
              value={lo}
              onChange={(e) => { const v = Math.min(Number(e.target.value), hi); setMinPrice(v <= lowBound ? null : v); }}
              aria-label="Minimum price"
              aria-valuetext={inr(lo)}
              className={`${thumb} ${minOnTop ? 'z-20' : 'z-10'}`}
            />
            <input
              type="range"
              min={lowBound}
              max={highBound}
              step={PRICE_STEP}
              value={hi}
              onChange={(e) => { const v = Math.max(Number(e.target.value), lo); setMaxPrice(v >= highBound ? null : v); }}
              aria-label="Maximum price"
              aria-valuetext={inr(hi)}
              className={`${thumb} ${minOnTop ? 'z-10' : 'z-20'}`}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(['min', 'max'] as const).map((which) => (
              <label key={which} className="block text-[13px] leading-[18px] font-semibold text-ink">
                {which === 'min' ? 'Min price (₹)' : 'Max price (₹)'}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={which === 'min' ? minDraft : maxDraft}
                  placeholder={String(which === 'min' ? lowBound : highBound)}
                  onChange={(e) => (which === 'min' ? setMinDraft : setMaxDraft)(e.target.value)}
                  onBlur={(e) => commitPrice(which, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitPrice(which, e.currentTarget.value); } }}
                  className="sag-input mt-1.5 h-12 font-normal"
                />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {options.hasDiscounts && (
        <fieldset className="py-5 border-b border-line">
          <legend className={legend}>Discount</legend>
          <div className="clear-both flex flex-wrap gap-2">
            {[0, 10, 20, 30, 40].map((d) => (
              <button key={d} type="button" onClick={() => setMinDiscount(d)} aria-pressed={minDiscount === d} className={chip(minDiscount === d)}>
                {d === 0 ? 'Any' : `${d}% or more`}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {options.hasRatings && (
        <fieldset className="py-5 border-b border-line">
          <legend className={legend}>Customer rating</legend>
          <div className="clear-both flex flex-wrap gap-2">
            {[0, 4, 3].map((r) => (
              <button key={r} type="button" onClick={() => setMinRating(r)} aria-pressed={minRating === r} className={chip(minRating === r)}>
                {r === 0 ? 'Any' : `${r}★ & up`}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {options.hasSoldOut && (
        <label className="flex items-center justify-between gap-3 min-h-[52px] py-4 text-sm text-ink cursor-pointer">
          <span>
            <span className="block font-semibold">In stock only</span>
            <span className="block text-[13px] text-ink-muted">Hide sold-out styles</span>
          </span>
          <input type="checkbox" role="switch" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} className="peer sr-only" />
          <span aria-hidden="true" className="relative w-12 h-7 shrink-0 rounded-full bg-control transition-colors peer-checked:bg-brand peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-6 after:h-6 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
        </label>
      )}
    </div>
  );

  const heading = activeOccasion ? activeOccasion.name : query.trim() ? `Results for “${query.trim()}”` : category === 'All' ? 'Shop all' : category === 'Sale' ? 'Offers' : category;
  const homeListing = kidsPage ? KIDS_TOYS : 'All';
  const narrowed = activeCount > 0 || Boolean(query.trim()) || Boolean(activeOccasion);
  const countLabel = isLoading ? 'Loading styles…' : `${results.length} ${results.length === 1 ? 'style' : 'styles'}`;
  const sortLabel = SORTS.find((s) => s.key === activeSort)?.label || 'Featured';
  const sortChoices = SORTS.filter((s) => s.key !== 'top-rated' || hasRatings);
  const tool = 'shrink-0 whitespace-nowrap h-11 px-3.5 rounded-chip border-[1.5px] border-control bg-white text-sm font-medium text-ink inline-flex items-center gap-1.5 hover:bg-sunken transition-colors cursor-pointer';
  const barButton = 'flex-1 min-w-0 h-11 px-3 rounded-control border-[1.5px] border-ink bg-white text-sm font-semibold text-ink inline-flex items-center justify-center gap-2 hover:bg-sunken transition-colors cursor-pointer';
  const grid = 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-9';
  // Collections that really have products, offered when a listing comes up empty
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => { if (p.category && (departmentOf(p) === 'women') !== kidsPage) counts.set(p.category, (counts.get(p.category) || 0) + 1); });
    return [...counts.entries()].filter(([c]) => categoryToSlug(c) !== categoryToSlug(category)).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [products, category, kidsPage]);
  const openCollection = (c: string) => { clearFilters(); setQuery(''); setOccasionId(''); navigateToCategory(c as any); };

  // Empty listing: the first way out is the primary button, the rest are secondary
  const emptyActions: Array<{ label: string; run: () => void }> = [
    ...(activeCount > 0 ? [{ label: 'Clear filters', run: clearFilters }] : []),
    ...(query.trim() ? [{ label: 'Clear search', run: () => setQuery('') }] : []),
    ...(category !== 'All' || activeOccasion ? [{ label: kidsPage ? 'See all kids & toys' : 'Shop all styles', run: () => openCollection(homeListing) }] : []),
  ];

  return (
    <div id="shop-catalog-page" className="bg-surface pt-4 pb-12 sm:pt-6 lg:pt-8 lg:pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-[13px] text-ink-muted mb-3 min-w-0">
          <button onClick={() => setActivePage('home')} className="shrink-0 min-h-11 hover:text-ink hover:underline underline-offset-2 cursor-pointer">Home</button>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
          {category !== homeListing && (
            <>
              <button onClick={() => openCollection(homeListing)} className="shrink-0 min-h-11 hover:text-ink hover:underline underline-offset-2 cursor-pointer">{kidsPage ? KIDS_TOYS : 'Shop'}</button>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            </>
          )}
          <span className="truncate text-ink font-medium" aria-current="page">{category === 'All' ? 'Shop' : category === 'Sale' ? 'Offers' : category}</span>
        </nav>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h1 className="font-display text-[28px] leading-8 lg:text-4xl lg:leading-[1.15] text-ink break-words min-w-0">{heading}</h1>
              <p className="sag-num text-sm text-ink-muted" aria-live="polite">{countLabel}</p>
            </div>
            {activeOccasion && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                {activeOccasion.description && <span className="max-w-xl">{activeOccasion.description}</span>}
                <button onClick={leaveOccasion} aria-label={`Leave the ${activeOccasion.name} collection`} className="h-11 px-3.5 inline-flex items-center gap-1.5 rounded-chip bg-sunken text-sm font-medium text-ink hover:bg-sunken-deep cursor-pointer">{activeOccasion.name} <X className="w-4 h-4" /></button>
              </div>
            )}
            {smartOn && smart.understood.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Search understood as">
                <span className="inline-flex items-center gap-1 text-[13px] text-ink-muted mr-0.5"><Sparkles className="w-3.5 h-3.5" /> Showing</span>
                {smart.understood.map((u) => <span key={u} className="sag-badge">{u}</span>)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end min-w-0">
            <div className="relative w-full sm:w-80">
              <SearchIcon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted" mono live={false} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={kidsPage ? 'Try “frock” or “car”' : 'Try “pink suit under 999”'}
                aria-label="Search products"
                enterKeyHint="search"
                className="sag-input h-12 pl-11 pr-24 [&::-webkit-search-cancel-button]:appearance-none"
              />
              <span className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="w-10 h-10 rounded-full flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer">
                    <X className="w-[18px] h-[18px]" />
                  </button>
                )}
                <VoiceSearchButton onResult={setQuery} className="mr-1" />
              </span>
            </div>
            <div className="sag-scroll-x -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto sm:overflow-visible empty:hidden">
              {discovery.features.surpriseMe && results.some(isAvailable) && (
                <button onClick={surprise} className={tool} title="Open a random style from these results">
                  <Shuffle className="w-4 h-4" /> Surprise me
                </button>
              )}
              {/* Outfit builder is for women's styles only */}
              {!kidsPage && <BuildYourLookButton className={tool} />}
              {discovery.features.visualSearch && <React.Suspense fallback={null}><FindThisLookButton className="shrink-0 whitespace-nowrap" /></React.Suspense>}
            </div>
          </div>
        </div>

        <div ref={pillsRef} className="sag-scroll-x mt-4 lg:mt-6 -mx-4 px-4 scroll-px-4 flex gap-2 overflow-x-auto pb-1 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible" role="tablist" aria-label="Categories">
          {categoryPills.map((c) => {
            const active = categoryToSlug(c) === categoryToSlug(category);
            return (
              <button key={c} role="tab" aria-selected={active} onClick={() => navigateToCategory(c as any)} className={`shrink-0 whitespace-nowrap ${chip(active)}`}>
                {c === 'Sale' ? 'Offers' : c === 'All' ? 'All' : c}
              </button>
            );
          })}
        </div>

        {kinds.length > 0 && (
          <div className="sag-scroll-x mt-2 -mx-4 px-4 scroll-px-4 flex gap-2 overflow-x-auto pb-1 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible" role="group" aria-label="Type">
            <button onClick={() => setKind('')} aria-pressed={kind === ''} className={`shrink-0 whitespace-nowrap ${chip(kind === '')} ${kind === '' ? '' : 'border-transparent bg-sunken'}`}>All types</button>
            {kinds.map(([k, n]) => (
              <button key={k} onClick={() => setKind(kind === k ? '' : k)} aria-pressed={kind === k} className={`shrink-0 whitespace-nowrap ${chip(kind === k)} ${kind === k ? '' : 'border-transparent bg-sunken'}`}>
                {k} <span className="sag-num font-normal opacity-80">({n})</span>
              </button>
            ))}
          </div>
        )}

        {/* Phones and tablets: Filter and Sort stay in reach under the header while the grid scrolls */}
        <div className="lg:hidden sticky top-[52px] z-30 mt-3 -mx-4 px-4 sm:-mx-6 sm:px-6 py-1.5 bg-surface border-y border-line flex items-center gap-2">
          <button
            ref={filtersButtonRef}
            type="button"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={filtersOpen}
            className={barButton}
          >
            <SlidersHorizontal className="w-[18px] h-[18px] shrink-0" /> Filter
            {activeCount > 0 && <span className="sag-num min-w-5 h-5 px-1.5 rounded-full bg-ink text-white text-[11px] font-bold inline-flex items-center justify-center" aria-label={`${activeCount} selected`}>{activeCount}</span>}
          </button>
          <button
            ref={sortButtonRef}
            type="button"
            onClick={() => setSortOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sortOpen}
            aria-label={`Sort: ${sortLabel}`}
            className={barButton}
          >
            <ArrowUpDown className="w-[18px] h-[18px] shrink-0" />
            <span className="truncate">{activeSort === 'featured' ? 'Sort' : sortLabel}</span>
          </button>
        </div>

        <div className="mt-4 lg:mt-8 grid gap-8 lg:grid-cols-[264px_minmax(0,1fr)]">
          <aside className="hidden lg:block" aria-label="Filters">
            <div className="lg:sticky lg:top-24 max-h-[calc(100vh-7.5rem)] overflow-y-auto overscroll-contain pr-3">
              <div className="flex items-center justify-between min-h-11 border-b border-line">
                <p className="text-[17px] leading-6 font-semibold text-ink inline-flex items-center gap-2">
                  Filters
                  {activeCount > 0 && <span className="sag-num min-w-5 h-5 px-1.5 rounded-full bg-ink text-white text-[11px] font-bold inline-flex items-center justify-center">{activeCount}</span>}
                </p>
                {activeCount > 0 && <button onClick={clearFilters} className="sag-link">Clear all</button>}
              </div>
              {filterPanel}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="hidden lg:flex mb-5 items-center gap-3">
              <p className="sag-num flex-1 text-sm text-ink-muted">
                {isLoading ? '' : results.length > 0 ? <>Showing <span className="font-semibold text-ink">{Math.min(visible, results.length)}</span> of {results.length} {results.length === 1 ? 'style' : 'styles'}</> : ''}
              </p>
              <label htmlFor="shop-sort" className="text-sm text-ink-muted">Sort by</label>
              <div className="relative w-56">
                <select id="shop-sort" value={activeSort} onChange={(e) => setSort(e.target.value as SortKey)}
                  className="sag-input h-11 pl-3.5 pr-9 appearance-none truncate text-sm font-semibold cursor-pointer">
                  {sortChoices.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              </div>
            </div>

            {activeCount > 0 && (
              <div ref={chipsRef} role="group" aria-label="Selected filters" className="mb-4 flex flex-wrap items-center gap-2">
                {activeChips.map((c, i) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => removeChip(i)}
                    aria-label={`Remove filter: ${c.label}`}
                    className="h-11 max-w-full pl-3 pr-2 inline-flex items-center gap-1 rounded-chip bg-sunken text-sm font-medium text-ink hover:bg-sunken-deep transition-colors cursor-pointer"
                  >
                    <span className="truncate">{c.label}</span>
                    <X className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  </button>
                ))}
                <button type="button" onClick={clearFilters} className="sag-link px-1">Clear all</button>
              </div>
            )}

            {isLoading ? (
              <div className={grid} aria-hidden="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={i >= 6 ? 'hidden xl:block' : ''}>
                    <div className="aspect-[4/5] rounded-control bg-sunken-deep" />
                    <div className="pt-3 space-y-2">
                      <div className="h-4 w-11/12 rounded-badge bg-sunken-deep" />
                      <div className="h-4 w-1/2 rounded-badge bg-sunken-deep" />
                      <div className="h-11 w-full rounded-control bg-sunken" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <>
                <div className="rounded-card border border-line px-5 py-10 sm:p-12 text-center">
                  <span className="mx-auto w-14 h-14 rounded-full bg-sunken flex items-center justify-center text-ink" aria-hidden="true">
                    <SearchIcon className="w-6 h-6" mono live={false} />
                  </span>
                  <p className="mt-4 text-[17px] leading-6 font-semibold text-ink break-words">
                    {query.trim() ? `No styles match “${query.trim()}”` : narrowed ? 'No styles match these filters' : 'No styles here yet'}
                  </p>
                  <p className="mt-1.5 text-sm leading-5 text-ink-muted max-w-md mx-auto">
                    {query.trim() ? 'Check the spelling, try a simpler word like “suit” or “kurti”, or browse a collection below.' : narrowed ? 'Try another colour, size or price range, or remove a filter.' : 'New styles are added often. Browse another collection meanwhile.'}
                  </p>
                  {emptyActions.length > 0 && (
                    <div className="mt-6 flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-2.5">
                      {emptyActions.map((a, i) => (
                        <button key={a.label} type="button" onClick={a.run} className={`${i === 0 ? 'sag-btn-primary' : 'sag-btn-outline'} h-12 px-6 text-[15px]`}>{a.label}</button>
                      ))}
                    </div>
                  )}
                  {suggestions.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-line">
                      <p className="sag-eyebrow mb-3">Collections with styles in them</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {suggestions.map(([c, n]) => (
                          <button key={c} type="button" onClick={() => openCollection(c)} className="sag-chip h-11 min-w-0 gap-1.5 px-3.5 text-sm">
                            {c} <span className="sag-num text-[13px] font-normal text-ink-muted">{n}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {products.some(isAvailable) && (
                  <div className="mt-10">
                    <h2 className="mb-4 font-display text-[22px] leading-7 text-ink">More styles in stock</h2>
                    <div className={grid}>
                      {products.filter(isAvailable).slice(0, 8).map((p, i) => <div key={p.id} className={i >= 6 ? 'hidden xl:block' : i >= 4 ? 'hidden md:block' : ''}><ProductCard product={p} /></div>)}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={grid}>
                  {results.slice(0, visible).map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
                {results.length > visible ? (
                  <div className="mt-10 flex flex-col items-center gap-3">
                    <p className="sag-num text-sm text-ink-muted">Showing <span className="font-semibold text-ink">{visible}</span> of {results.length} styles</p>
                    <div className="w-40 h-1 rounded-full bg-sunken-deep overflow-hidden" aria-hidden="true">
                      <div className="h-full rounded-full bg-ink" style={{ width: `${Math.round((visible / results.length) * 100)}%` }} />
                    </div>
                    <button onClick={() => setVisible((v) => v + PAGE)} className="sag-btn-outline mt-1 w-full sm:w-auto sm:px-12">Load more styles</button>
                  </div>
                ) : results.length > PAGE && (
                  <p className="sag-num mt-10 text-center text-sm text-ink-muted">You have seen all {results.length} styles</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Portalled to <body>: the page-enter animation on <main> would otherwise pin this fixed sheet to <main>, not the screen.
          A closed sheet is not rendered. */}
      {filtersOpen && createPortal(
        <div className="lg:hidden fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-ink/50 sag-fade" onClick={() => setFiltersOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-filters-title"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] rounded-t-sheet bg-surface text-ink flex flex-col shadow-[var(--sag-shadow-bar)] animate-in slide-in-from-bottom-5 fade-in"
          >
            <div className="shrink-0 pt-2 flex justify-center" aria-hidden="true"><span className="w-9 h-1 rounded-full bg-sunken-deep" /></div>
            <div className="flex items-center justify-between pl-4 pr-2 min-h-[52px] border-b border-line shrink-0">
              <h2 id="shop-filters-title" className="text-base leading-[22px] font-semibold text-ink inline-flex items-center gap-2">
                Filter
                {activeCount > 0 && <span className="text-sm font-normal text-ink-muted">{activeCount} selected</span>}
              </h2>
              <button ref={drawerCloseRef} type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
                <X className="w-[22px] h-[22px]" strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-4">{filterPanel}</div>
            <div className="sag-bar shrink-0 flex gap-2.5">
              <button type="button" onClick={clearFilters} disabled={activeCount === 0} className="sag-btn-outline flex-1 px-3">Clear all</button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="sag-btn-primary sag-num flex-[1.5] px-3">
                Show {results.length} {results.length === 1 ? 'style' : 'styles'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {sortOpen && createPortal(
        <div className="lg:hidden fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-ink/50 sag-fade" onClick={() => setSortOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-sort-title"
            className="absolute inset-x-0 bottom-0 max-h-[85dvh] rounded-t-sheet bg-surface text-ink flex flex-col shadow-[var(--sag-shadow-bar)] animate-in slide-in-from-bottom-5 fade-in"
          >
            <div className="shrink-0 pt-2 flex justify-center" aria-hidden="true"><span className="w-9 h-1 rounded-full bg-sunken-deep" /></div>
            <div className="flex items-center justify-between pl-4 pr-2 min-h-[52px] border-b border-line shrink-0">
              <h2 id="shop-sort-title" className="text-base leading-[22px] font-semibold text-ink">Sort by</h2>
              <button ref={drawerCloseRef} type="button" onClick={() => setSortOpen(false)} aria-label="Close sort options" className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
                <X className="w-[22px] h-[22px]" strokeWidth={1.75} />
              </button>
            </div>
            <div role="radiogroup" aria-labelledby="shop-sort-title" className="overflow-y-auto overscroll-contain px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {sortChoices.map((s) => {
                const on = s.key === activeSort;
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => { setSort(s.key); setSortOpen(false); }}
                    className={`sag-row w-full text-left cursor-pointer ${on ? '' : 'font-normal'}`}
                  >
                    <span className="flex-1">{s.label}</span>
                    {on && <Check className="w-5 h-5 shrink-0 text-ink" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
