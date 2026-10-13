import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBackToClose } from '../utils/backClose';
import { createPortal } from 'react-dom';
import { useShop } from '../context/ShopContext';
import { useRouter } from '../context/RouterContext';
import { useAdmin } from '../context/AdminContext';
import { ProductCard } from './ProductCard';
import { BagReminder } from './BagReminder';
import { FestiveBanner } from './FestiveBanner';
import { Product, ProductSize } from '../types';
import { fuzzyMatchProduct } from '../utils/fuzzySearch';
import { hasStructure, isAvailable, matchesSmartQuery, parseSmartQuery } from '../utils/smartQuery';
import { rememberSearch } from '../utils/shopperMemory';
import { trackItem } from '../utils/visitorTracker';
import { VoiceSearchButton } from './VoiceSearchButton';
const FindThisLookButton = React.lazy(() => import('./FindThisLook').then((m) => ({ default: m.FindThisLookButton })));
import { BuildYourLookButton } from './BuildYourLook';
import { useDiscovery, occasionProducts } from '../utils/discovery';
import { categoryToSlug } from '../utils/slugHelper';
import { WOMEN_CATEGORY_INFO, isWomenCategory } from '../data/womenCategories';
import { ChevronDown, ChevronRight, Shuffle, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { AuraTitle, Icon, Odometer, clamp, prefersReducedMotion, setVar, useFlip, useScrollFx } from '../aura';
import { KineticBand } from './HomeSections';

type SortKey = 'featured' | 'newest' | 'price-low' | 'price-high' | 'discount' | 'top-rated';
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'featured', label: 'Featured' },
  { key: 'newest', label: 'Newest' },
  { key: 'price-low', label: 'Price: low to high' },
  { key: 'price-high', label: 'Price: high to low' },
  { key: 'discount', label: 'Biggest discount' },
  { key: 'top-rated', label: 'Top rated' },
];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8', 'Free Size'];
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

// A pie slice of a circle as a clip-path (0..1, clockwise from the top): the back-to-top ring shows only that part
const pie = (p: number) => {
  if (p >= 0.999) return 'none';
  const a = p * Math.PI * 2;
  const pts = ['50% 50%', '50% -50%'];
  if (p > 0.125) pts.push('150% -50%');
  if (p > 0.375) pts.push('150% 150%');
  if (p > 0.625) pts.push('-50% 150%');
  if (p > 0.875) pts.push('-50% -50%');
  pts.push(`${(50 + 100 * Math.sin(a)).toFixed(1)}% ${(50 - 100 * Math.cos(a)).toFixed(1)}%`);
  return `polygon(${pts.join(',')})`;
};

/** The site header: its height, and whether it has slid off the screen. Sizes are read on mount and on resize, never while scrolling. */
const useSiteHeader = () => {
  const [state, setState] = useState({ height: 56, gone: false });
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('header.fixed, header.sticky, [data-site-header]') || document.querySelector<HTMLElement>('body header');
    if (!el) return;
    const measure = () => {
      const height = Math.max(0, Math.round(el.offsetHeight + Math.max(0, parseFloat(getComputedStyle(el).top) || 0)));
      setState((s) => (s.height === height ? s : { ...s, height }));
    };
    measure();
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    sizes?.observe(el);
    const sight = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      const gone = entry.intersectionRatio < 0.5;
      setState((s) => (s.gone === gone ? s : { ...s, gone }));
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    sight?.observe(el);
    return () => { sizes?.disconnect(); sight?.disconnect(); };
  }, []);
  return state;
};

/** The collections as pill tabs with ONE ink indicator that slides to the current one; only the row itself scrolls sideways. */
const CategoryTabs: React.FC<{ scroller: React.RefObject<HTMLDivElement | null>; items: Array<{ key: string; label: string; active: boolean; pick: () => void }> }> = ({ scroller, items }) => {
  const row = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLElement>(null);
  const first = useRef(true);
  const place = useCallback((animate: boolean, follow: boolean) => {
    const box = row.current;
    const bar = ind.current;
    if (!box || !bar) return;
    const on = box.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!on || !on.offsetWidth) { bar.classList.remove('on'); return; }
    const move = animate && !prefersReducedMotion();
    bar.classList.toggle('mv', move);
    bar.style.width = `${on.offsetWidth}px`;
    bar.style.transform = `translate3d(${on.offsetLeft}px,0,0)`;
    bar.classList.add('on');
    const sc = scroller.current;
    if (follow && sc && sc.scrollWidth > sc.clientWidth) sc.scrollTo({ left: Math.max(0, on.offsetLeft - (sc.clientWidth - on.offsetWidth) / 2), behavior: move ? 'smooth' : 'auto' });
  }, [scroller]);
  const current = items.find((i) => i.active)?.key || '';
  const signature = items.map((i) => i.key).join('|');
  useLayoutEffect(() => { place(!first.current, true); first.current = false; }, [place, current, signature]);
  useEffect(() => {
    const box = row.current;
    if (!box) return;
    const again = () => place(false, false);
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(again);
    watch?.observe(box);
    document.fonts?.ready.then(again).catch(() => {});
    return () => watch?.disconnect();
  }, [place]);
  return (
    <div ref={scroller} className="shop-seg-sc">
      <div ref={row} className="aura-seg shop-seg" role="tablist" aria-label="Categories">
        <i ref={ind} aria-hidden="true" className="aura-seg-ind" />
        {items.map((i) => <button key={i.key} type="button" role="tab" aria-selected={i.active} onClick={i.pick}>{i.label}</button>)}
      </div>
    </div>
  );
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
  useBackToClose(filtersOpen, () => setFiltersOpen(false));
  useBackToClose(sortOpen, () => setSortOpen(false));
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
  // The filter bar stays right under the site header. The header slides away on the way down: the bar then moves up
  // into its place (a transform, never a new sticky offset), and comes back down when the header returns.
  const header = useSiteHeader();
  const barTop = header.height;
  const barMark = useRef<HTMLDivElement>(null);
  const [barStuck, setBarStuck] = useState(false);
  useEffect(() => {
    const mark = barMark.current;
    if (!mark || typeof IntersectionObserver === 'undefined') return;
    const watch = new IntersectionObserver(([entry]) => setBarStuck(!entry.isIntersecting && entry.boundingClientRect.top <= barTop + 1), { rootMargin: `-${barTop + 1}px 0px 0px 0px` });
    watch.observe(mark);
    return () => watch.disconnect();
  }, [barTop]);

  // Back to top: the button appears after about one screen, and its ring fills with how far the page has been read
  const pageRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLButtonElement>(null);
  const orbOn = useRef(false);
  useScrollFx(pageRef, ({ y, vh, top, height }) => {
    const orb = orbRef.current;
    if (!orb) return;
    const on = y > vh * 0.9;
    if (on !== orbOn.current) { orbOn.current = on; orb.classList.toggle('on', on); }
    if (on) setVar(orb, '--pie', pie(clamp(y / Math.max(1, top + height - vh))));
  });

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

  useEffect(() => { setVisible(PAGE); }, [category, query, sizes, colors, fabrics, fits, occasions, minPrice, maxPrice, minDiscount, minRating, inStockOnly, sort]);

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

  const pool = products;
  const inCategory = useMemo(() => pool.filter((p) => {
    switch (category) {
      case 'All': return true;
      case 'New Arrivals': return Boolean(p.isNewArrival);
      case 'Best Sellers': return Boolean(p.isBestSeller);
      case 'Trending': return Boolean(p.isTrending);
      case 'Sale': return Boolean(p.isSale) || discountOf(p) > 0;
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
  }, [inCategory, occasionIds, query, smart, smartOn, sizes, colors, fabrics, fits, occasions, minPrice, maxPrice, minDiscount, minRating, ratings, inStockOnly, activeSort, products]);

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
    const women = products;
    const own: string[] = all;
    const special = SPECIAL.filter((c) => c === 'All'
      || (c === 'New Arrivals' && women.some((p) => p.isNewArrival))
      || (c === 'Sale' && women.some((p) => p.isSale || discountOf(p) > 0))
      || (c === 'Best Sellers' && women.some((p) => p.isBestSeller))
      || (c === 'Trending' && women.some((p) => p.isTrending)));
    const list: string[] = [...special, ...own];
    if (!list.some((c) => categoryToSlug(c) === categoryToSlug(category))) list.push(category);
    return list;
  }, [products, category]);

  // Filter and sort sheets: focus moves in and stays inside, Escape closes, focus returns to the button that opened it.
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
    // The sort sheet is for phones and tablets (desktop has the select): close it if the window grows to the desktop layout.
    const desktop = window.matchMedia('(min-width: 900px)');
    const onDesktop = () => { if (desktop.matches) setSortOpen(false); };
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
    const label = category === 'All' ? 'All styles' : category === 'Sale' ? 'Offers' : category;
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
      title = isSpecial ? `${label} | Suit Aura Girls` : `${label} for women | Suit Aura Girls`;
      description = category === 'Sale'
        ? `Styles on offer at Suit Aura Girls${styles ? `: ${styles}${from}` : ''}. ${trail}`
        : `Shop ${label} at Suit Aura Girls${styles ? `: ${styles}${from}` : ''}. ${trail}`;
      canonical = `${SITE}${path}`;
    }
    // Search results and empty listings are kept out of search engines; their links are still followed.
    const robots = q || (!isLoading && listing.length === 0) ? 'noindex, follow' : 'index, follow';
    return { title, description: clip(description, 160), canonical, robots };
  }, [query, category, activeOccasion, listing, isLoading]);

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

  // Filter chip: a white pill; the chosen one is ink
  const chip = (active: boolean, small = false) => `sag-chip ${small ? 'h-10 text-[13px]' : 'h-11 text-[14px]'} min-w-[44px] inline-flex items-center justify-center gap-1.5 px-4 font-semibold whitespace-nowrap cursor-pointer ${active ? 'is-selected' : ''}`;
  // float + w-full keeps the legend inside the fieldset's padding (a plain legend sits on the top edge)
  const legend = 'aura-lbl float-left w-full mb-3';
  // Real colour swatches, taken from the products' own colour data
  const colourHex = useMemo(() => {
    const map = new Map<string, string>();
    inCategory.forEach((p) => (p.colors || []).forEach((c) => { if (c?.name && c.hex && !map.has(c.name.trim())) map.set(c.name.trim(), c.hex); }));
    return map;
  }, [inCategory]);
  const thumb = 'absolute inset-0 w-full h-11 appearance-none bg-transparent pointer-events-none focus:outline-none '
    + '[&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:cursor-pointer focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-accent '
    + '[&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:box-border [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-brand [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:cursor-pointer focus-visible:[&::-moz-range-thumb]:ring-2 focus-visible:[&::-moz-range-thumb]:ring-accent';
  // When both handles meet, the one that can still move is kept on top.
  const minOnTop = lo >= hi - PRICE_STEP && lo > (lowBound + highBound) / 2;

  const filterGroup = (title: string, values: string[], selected: string[], onToggle: (v: string) => void, format?: (v: string) => string, swatch = false) => values.length === 0 ? null : (
    <fieldset key={title} className="py-5 border-b border-line">
      <legend className={legend}>
        {title}
        {selected.length > 0 && <span className="ml-2 font-medium normal-case tracking-normal text-ink">{selected.length} selected</span>}
      </legend>
      <div className="clear-both flex flex-wrap gap-2">
        {values.map((v) => (
          <button key={v} type="button" onClick={() => onToggle(v)} aria-pressed={selected.includes(v)} className={`${chip(selected.includes(v))} ${swatch && colourHex.get(v) ? 'pl-2' : ''}`}>
            {swatch && colourHex.get(v) && (
              <span className="w-6 h-6 shrink-0 rounded-full border border-line" style={{ backgroundColor: colourHex.get(v) }} aria-hidden="true" />
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
          <p className="clear-both aura-num text-[17px] font-extrabold text-ink">{inr(minPrice ?? lowBound)} – {inr(maxPrice ?? highBound)}</p>
          <div className="relative mt-1 h-11">
            <div className="absolute inset-x-3.5 top-1/2 -translate-y-1/2 h-1 rounded-full bg-sunken-deep" aria-hidden="true" />
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full bg-brand"
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
              <label key={which} className="block text-[13px] leading-[18px] font-medium text-ink-muted">
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
                  className="sag-input aura-num mt-1.5 h-[52px] w-full px-4 text-[16px] font-medium"
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
        <label className="flex items-center justify-between gap-3 min-h-[60px] py-4 text-ink cursor-pointer">
          <span>
            <span className="block text-[15px] font-bold">In stock only</span>
            <span className="block text-[13px] text-ink-muted">Hide sold-out styles</span>
          </span>
          <input type="checkbox" role="switch" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} className="peer sr-only" />
          {/* A pill switch: the knob slides (transform only) */}
          <span aria-hidden="true" className="shop-switch peer-checked:bg-brand peer-checked:[&>i]:translate-x-[20px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"><i /></span>
        </label>
      )}
    </div>
  );

  // The page title: the real name of what is listed, its last word as the serif accent
  const heading = activeOccasion ? activeOccasion.name : query.trim() ? `Results for “${query.trim()}”` : category === 'All' ? 'Shop all' : category === 'Sale' ? 'Offers' : category;
  const [headMain, headAccent] = ((): [string, string] => {
    if (!activeOccasion && query.trim()) return ['Results for', `“${query.trim()}”`];
    const text = heading.trim();
    const cut = text.lastIndexOf(' ');
    if (cut < 1) return ['', text];
    const last = text.slice(cut + 1);
    return /^[\p{L}][\p{L}'’-]{2,}$/u.test(last) ? [text.slice(0, cut), last] : [text, ''];
  })();
  const headLabel = activeOccasion ? 'Occasion' : query.trim() ? 'Search' : category === 'All' ? 'Suit Aura Girls' : 'Collection';
  const homeListing = 'All';
  const narrowed = activeCount > 0 || Boolean(query.trim()) || Boolean(activeOccasion);
  const countLabel = isLoading ? 'Loading styles…' : `${results.length} ${results.length === 1 ? 'style' : 'styles'}`;
  const sortLabel = SORTS.find((s) => s.key === activeSort)?.label || 'Featured';
  const sortChoices = SORTS.filter((s) => s.key !== 'top-rated' || hasRatings);
  // Quiet bold link ("Clear all")
  const link = 'sag-link inline-flex items-center min-h-11 text-[14px] font-bold cursor-pointer';
  // Collections that really have products, offered when a listing comes up empty
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => { if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1); });
    return [...counts.entries()].filter(([c]) => categoryToSlug(c) !== categoryToSlug(category)).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [products, category]);
  const openCollection = (c: string) => { clearFilters(); setQuery(''); setOccasionId(''); navigateToCategory(c as any); };

  // Empty listing: the first way out is the primary button, the rest are secondary
  const emptyActions: Array<{ label: string; run: () => void }> = [
    ...(activeCount > 0 ? [{ label: 'Clear filters', run: clearFilters }] : []),
    ...(query.trim() ? [{ label: 'Clear search', run: () => setQuery('') }] : []),
    ...(category !== 'All' || activeOccasion ? [{ label: 'Shop all styles', run: () => openCollection(homeListing) }] : []),
  ];

  const tabs = categoryPills.map((c) => ({
    key: c,
    label: c === 'Sale' ? 'Offers' : c,
    active: categoryToSlug(c) === categoryToSlug(category),
    pick: () => navigateToCategory(c as any),
  }));
  // The bento: in every run of eight the first card is large and the sixth is wide (ProductCard lays itself out)
  const layoutOf = (i: number): 'big' | 'wide' | undefined => (i % 8 === 0 ? 'big' : i % 8 === 5 ? 'wide' : undefined);
  // Aura Kinetic: after a new sort or filter the cards glide from where they were to where they belong
  const gridRef = useRef<HTMLDivElement>(null);
  const shownIds = results.slice(0, visible).map((p) => p.id).join(',');
  useFlip(gridRef, shownIds, { selector: ':scope > article' });
  const sheet = 'absolute inset-x-0 bottom-0 max-h-[88dvh] bg-surface text-ink rounded-t-[28px] flex flex-col animate-in slide-in-from-bottom-5 fade-in';
  const sheetClose = 'w-11 h-11 shrink-0 rounded-full flex items-center justify-center bg-sunken text-ink cursor-pointer';

  return (
    <div ref={pageRef} id="shop-catalog-page" data-aura="" className="pb-16 min-[900px]:pb-24" style={{ '--shop-top': `${barTop}px` } as React.CSSProperties}>
      <div className="shop-w px-3 pt-3 empty:hidden sm:px-5">
        <FestiveBanner variant="strip" className="mb-3" />
        <BagReminder className="mb-3" />
        <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-[13px] text-ink-muted min-w-0">
          <button onClick={() => setActivePage('home')} className="shrink-0 min-h-11 hover:text-ink hover:underline underline-offset-2 cursor-pointer">Home</button>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
          {category !== homeListing && (
            <>
              <button onClick={() => openCollection(homeListing)} className="shrink-0 min-h-11 hover:text-ink hover:underline underline-offset-2 cursor-pointer">Shop</button>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
            </>
          )}
          <span className="truncate text-ink" aria-current="page">{category === 'All' ? 'Shop' : category === 'Sale' ? 'Offers' : category}</span>
        </nav>
      </div>

      {/* The band: the small label, the collection's real name as the big title, and the real count */}
      <div className="shop-w shop-band">
        <AuraTitle
          as="h1"
          label={headLabel}
          title={headMain ? [headMain] : []}
          accent={headAccent || undefined}
          size={heading.length > 22 ? 'lg' : 'xl'}
          titleClassName="[overflow-wrap:anywhere]"
          sub={<span className="aura-num" aria-live="polite">{countLabel}</span>}
          className="w-full min-w-0"
        />
        {activeOccasion && (
          <div className="mt-4 flex flex-col items-start gap-3 text-[15px] leading-[1.5] text-ink-muted">
            {activeOccasion.description && <span className="max-w-xl">{activeOccasion.description}</span>}
            <button onClick={leaveOccasion} aria-label={`Leave the ${activeOccasion.name} collection`} className={chip(true)}>{activeOccasion.name} <X className="w-4 h-4" strokeWidth={1.6} /></button>
          </div>
        )}
        {smartOn && smart.understood.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Search understood as">
            <span className="inline-flex items-center gap-1.5 text-[14px] text-ink-muted mr-1"><Sparkles className="w-4 h-4 text-accent" strokeWidth={1.6} /> Showing</span>
            {smart.understood.map((u) => <span key={u} className="aura-tag">{u}</span>)}
          </div>
        )}

        <div className="shop-search">
          <Icon name="search" size={20} className="absolute left-[18px] top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “pink suit under 999”"
            aria-label="Search products"
            enterKeyHint="search"
          />
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="w-11 h-11 rounded-full flex items-center justify-center text-ink-muted hover:text-ink cursor-pointer">
                <Icon name="close" size={18} />
              </button>
            )}
            <VoiceSearchButton onResult={setQuery} className="mr-0.5" />
          </span>
        </div>
        {/* The small tools: one row of white pills */}
        <div className="shop-tools empty:hidden">
          {discovery.features.surpriseMe && results.some(isAvailable) && (
            <button onClick={surprise} className="shop-tool" title="Open a random style from these results">
              <Shuffle className="w-[18px] h-[18px]" strokeWidth={1.6} /> Surprise me
            </button>
          )}
          <BuildYourLookButton className="shop-tool" />
          {discovery.features.visualSearch && <React.Suspense fallback={null}><FindThisLookButton variant="link" className="shop-tool" /></React.Suspense>}
        </div>
      </div>

      {/* The filter bar stays under the site header while the grid scrolls: Filter, then the collections as pills with
          the sliding ink indicator. Solid paper, so the grid never shows
          through. When the header slides away the bar moves up into its place. */}
      <div ref={barMark} aria-hidden="true" />
      <div className={`shop-fbar ${barStuck && header.gone ? 'up' : ''}`}>
        <div className="shop-fbar-in">
          <div className="shop-fbar-r">
            <button
              ref={filtersButtonRef}
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              className="shop-fbtn"
              data-ripple=""
            >
              <SlidersHorizontal className="w-[18px] h-[18px] shrink-0" strokeWidth={1.6} /> Filter
              {activeCount > 0 && <span className="aura-num shop-fbtn-n" aria-label={`${activeCount} selected`}>{activeCount}</span>}
            </button>
            <CategoryTabs scroller={pillsRef} items={tabs} />
          </div>

        </div>
      </div>

      <div className="shop-w px-2.5 sm:px-5">
        {/* The count at the left, Sort as a white pill at the right (a sheet on phones, a select on desktop) */}
        <div className="shop-sortw">
          <p className="aura-num min-w-0 truncate">
            {isLoading ? '' : results.length > 0 ? <>Showing <span className="font-bold text-ink"><Odometer value={Math.min(visible, results.length)} roll={false} /></span> of <Odometer value={results.length} roll={false} /> {results.length === 1 ? 'style' : 'styles'}</> : ''}
          </p>
          <button
            ref={sortButtonRef}
            type="button"
            onClick={() => setSortOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sortOpen}
            aria-label={`Sort: ${sortLabel}`}
            className="shop-sort"
          >
            <span className="truncate">{sortLabel}</span>
            <ChevronDown className="w-4 h-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          </button>
          <div className="hidden min-[900px]:flex items-center gap-3">
            <label htmlFor="shop-sort" className="aura-lbl">Sort by</label>
            <div className="relative">
              <select id="shop-sort" value={activeSort} onChange={(e) => setSort(e.target.value as SortKey)} className="shop-sort cursor-pointer">
                {sortChoices.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 text-ink absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.8} aria-hidden="true" />
            </div>
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
                className="kx-pop h-11 max-w-full pl-4 pr-3 inline-flex items-center gap-1.5 rounded-full bg-blush text-[14px] font-semibold text-ink cursor-pointer"
              >
                <span className="truncate">{c.label}</span>
                <X className="w-4 h-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
              </button>
            ))}
            <button type="button" onClick={clearFilters} className={`${link} px-2`}>Clear all</button>
          </div>
        )}

        {isLoading ? (
          <div className="shop-grid" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aura-card p-1.5 pb-4">
                <div className="aura-sk aspect-[4/5] rounded-[17px]" />
                <div className="px-2 pt-3 space-y-2">
                  <div className="h-3.5 w-11/12 rounded-full bg-sunken" />
                  <div className="h-3.5 w-1/2 rounded-full bg-sunken" />
                  <div className="h-11 w-full rounded-full bg-sunken" />
                </div>
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <>
            <div className="aura-card aura-blk px-5 py-10 sm:p-12 text-center">
              <span className="kx-seek mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blush text-ink" aria-hidden="true">
                <Icon name="search" size={24} />
              </span>
              <p className="aura-h2 aura-h-sm mt-5 [overflow-wrap:anywhere]">
                {query.trim() ? `No styles match “${query.trim()}”` : narrowed ? 'No styles match these filters' : isWomenCategory(category) ? `${category}: coming soon` : 'No styles here yet'}
              </p>
              <p className="mt-3 text-[15px] leading-[1.5] text-ink-muted max-w-md mx-auto">
                {query.trim() ? 'Check the spelling, try a simpler word like “suit” or “kurti”, or browse a collection below.' : narrowed ? 'Try another colour, size or price range, or remove a filter.' : isWomenCategory(category) ? `${WOMEN_CATEGORY_INFO[category].line}. This collection is being added to the store. Browse one that has styles meanwhile.` : 'New styles are added often. Browse another collection meanwhile.'}
              </p>
              {emptyActions.length > 0 && (
                <div className="mt-6 flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-2.5">
                  {emptyActions.map((a, i) => (
                    <button key={a.label} type="button" onClick={a.run} className={`aura-btn ${i === 0 ? '' : 'aura-btn-line'}`}>{a.label}</button>
                  ))}
                </div>
              )}
              {suggestions.length > 0 && (
                <div className="mt-8 pt-6 border-t border-line">
                  <p className="aura-lbl mb-3">Collections with styles in them</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {suggestions.map(([c, n]) => (
                      <button key={c} type="button" onClick={() => openCollection(c)} className={chip(false)}>
                        {c} <span className="aura-num text-[13px] font-medium text-ink-muted">{n}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* A collection still to come: its name and the plain fact, as the moving band (nothing invented) */}
            {!query.trim() && !narrowed && isWomenCategory(category) && (
              <KineticBand bare label={`${category}: coming soon`} rows={[[category, 'Coming soon', 'Suit Aura Girls']]} className="-mx-2.5 mt-8 sm:-mx-5" />
            )}
            {products.some(isAvailable) && (
              <div className="mt-14">
                <AuraTitle title="More styles in" accent="stock" size="lg" className="mb-6 px-1.5" />
                <div className="shop-grid">
                  {products.filter(isAvailable).slice(0, 8).map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div ref={gridRef} className="shop-grid">
              {results.slice(0, visible).map((p, i) => <ProductCard key={p.id} product={p} layout={layoutOf(i)} />)}
            </div>
            {results.length > visible ? (
              <div className="mt-12 flex flex-col items-center gap-3">
                <p className="aura-num text-[14px] text-ink-muted">Showing <span className="font-bold text-ink">{visible}</span> of {results.length} styles</p>
                <div className="w-44 h-1 rounded-full bg-sunken-deep overflow-hidden" aria-hidden="true">
                  <div className="h-full w-full origin-left rounded-full bg-brand transition-transform duration-700 motion-reduce:transition-none" style={{ transform: `scaleX(${visible / results.length})` }} />
                </div>
                <button onClick={() => setVisible((v) => v + PAGE)} className="aura-btn aura-btn-line mt-2 w-full sm:w-auto sm:px-12">Load more styles</button>
              </div>
            ) : results.length > PAGE && (
              <p className="aura-num mt-10 text-center text-[14px] text-ink-muted">You have seen all {results.length} styles</p>
            )}
          </>
        )}
      </div>

      {/* Back to top: a round ink button whose rose ring fills with how far the page has been read */}
      <button ref={orbRef} type="button" onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })} aria-label="Back to top" className="shop-orb">
        <i aria-hidden="true" />
        <Icon name="up" />
      </button>

      {/* Portalled to <body>: the page-enter animation on <main> would otherwise pin this fixed sheet to <main>, not the screen.
          A closed sheet is not rendered. White, 28px top corners; on desktop it is a panel at the right. */}
      {filtersOpen && createPortal(
        <div className="fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-[color:var(--sag-scrim)] sag-fade" onClick={() => setFiltersOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-filters-title"
            className={`${sheet} min-[900px]:inset-y-3 min-[900px]:left-auto min-[900px]:right-3 min-[900px]:w-[440px] min-[900px]:max-h-none min-[900px]:rounded-[28px]`}
          >
            <div className="shrink-0 pt-2.5 flex justify-center min-[900px]:hidden" aria-hidden="true"><span className="w-10 h-1 rounded-full bg-sunken-deep" /></div>
            <div className="flex items-center justify-between gap-3 pl-5 pr-3 min-h-[64px] shrink-0">
              <h2 id="shop-filters-title" className="aura-h2 aura-h-sm inline-flex items-baseline gap-2.5">
                Filter
                {activeCount > 0 && <span className="text-[14px] font-medium tracking-normal text-ink-muted">{activeCount} selected</span>}
              </h2>
              <button ref={drawerCloseRef} type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters" className={sheetClose}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 border-t border-line">{filterPanel}</div>
            <div className="shrink-0 flex gap-2.5 border-t border-line px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <button type="button" onClick={clearFilters} disabled={activeCount === 0} className="aura-btn aura-btn-line flex-1 px-3">Clear all</button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="aura-btn aura-num flex-[1.5] px-3">
                Show {results.length} {results.length === 1 ? 'style' : 'styles'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {sortOpen && createPortal(
        <div className="min-[900px]:hidden fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-[color:var(--sag-scrim)] sag-fade" onClick={() => setSortOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-sort-title"
            className={sheet}
          >
            <div className="shrink-0 pt-2.5 flex justify-center" aria-hidden="true"><span className="w-10 h-1 rounded-full bg-sunken-deep" /></div>
            <div className="flex items-center justify-between gap-3 pl-5 pr-3 min-h-[64px] shrink-0">
              <h2 id="shop-sort-title" className="aura-h2 aura-h-sm">Sort by</h2>
              <button ref={drawerCloseRef} type="button" onClick={() => setSortOpen(false)} aria-label="Close sort options" className={sheetClose}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <div role="radiogroup" aria-labelledby="shop-sort-title" className="overflow-y-auto overscroll-contain px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {sortChoices.map((s) => {
                const on = s.key === activeSort;
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => { setSort(s.key); setSortOpen(false); }}
                    className={`flex w-full min-h-[54px] items-center gap-3 rounded-full px-5 text-left text-[15.5px] cursor-pointer ${on ? 'bg-brand font-bold text-[color:var(--sag-on-gold)]' : 'font-medium text-ink'}`}
                  >
                    <span className="flex-1">{s.label}</span>
                    {on && <Icon name="check" size={20} className="shrink-0" />}
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
