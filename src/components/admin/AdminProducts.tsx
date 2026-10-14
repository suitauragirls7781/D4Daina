import React, { useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useProducts } from '../../context/ProductContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import {
  Package,
  Plus,
  Search,
  Edit3,
  Copy,
  Trash2,
  Sparkles,
  Layers,
  Eye,
  Star,
  Archive,
  ArchiveRestore,
  History,
  LayoutGrid,
  List,
  Check,
  X,
  Pencil,
  Undo2,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import { Product } from '../../types';
import { isLowStock, lowStockLevelFor } from '../../utils/inventory';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { AdminStockHistory } from './AdminStockHistory';
import { PackageIcon } from '../StoreIcons';
import { AdminPageHeader, EmptyState, LIST_STEP, SCRIM, StatRow, StatTile, priceFields, priceProblem, stockProblem, tone, ui } from './adminShared';
import { WOMEN_CATEGORY_NAMES } from '../../data/womenCategories';
import { isAccessory, setTypeOf } from '../../utils/looks';
import { ScoreRing } from './catalogue/ScoreRing';
import { BulkSheet, type PlannedChange } from './catalogue/BulkActions';
import {
  DESCRIPTION_GOOD,
  PERF_DAYS,
  PHOTOS_GOOD,
  fixChange,
  healthChecks,
  healthScore,
  healthWord,
  offOf,
  openFormAt,
  readPref,
  takePendingCategory,
  useProductPerformance,
  writePref,
  type HealthCheck,
  type ProductNumbers,
} from './catalogue/catalogueKit';

type StatusTab = 'all' | 'published' | 'draft' | 'archived';
// 'hidden' = drafts and archived together (the "Drafts / hidden" tile); it has no tab of its own
type StatusFilter = StatusTab | 'hidden';
type StockFilter = 'all' | 'inStock' | 'outOfStock' | 'low';
/** Quick filters for what a listing is missing, or what it is doing. */
type SmartFilter = '' | 'needsWork' | 'fewPhotos' | 'noDescription' | 'noSearchText' | 'onOffer' | 'liveSoldOut' | 'noSales';
type SortKey = 'newest' | 'name' | 'priceLow' | 'priceHigh' | 'stockLow' | 'health' | 'views' | 'sold';
type View = 'list' | 'grid';

// Same rule as ProductContext: hidden decides visibility; an archived product is a hidden one put away.
const statusOf = (product: Product): Exclude<StatusTab, 'all'> =>
  !product.hidden ? 'published' : product.status === 'archived' ? 'archived' : 'draft';

// Outfit categories only: accessories live in Complete the Look, never in this list.
const ALL_CATEGORIES: string[] = ['All', ...WOMEN_CATEGORY_NAMES];

const STATUS_LABEL: Record<StatusTab, string> = { all: 'All', published: 'Published', draft: 'Draft', archived: 'Archived' };
// Sold out the same way the stock filter reads it
const isSoldOut = (product: Product) => !product.inStock || (product.stockQuantity !== undefined && product.stockQuantity === 0);

const SORT_LABEL: Record<SortKey, string> = {
  newest: 'Newest first',
  name: 'Name A to Z',
  priceLow: 'Price: low to high',
  priceHigh: 'Price: high to low',
  stockLow: 'Stock: lowest first',
  health: 'Listing quality: weakest first',
  views: `Most viewed (${PERF_DAYS} days)`,
  sold: `Most sold (${PERF_DAYS} days)`,
};

const ICON_BTN = 'w-11 h-11 md:w-9 md:h-9 shrink-0 rounded-full inline-flex items-center justify-center text-ink-muted hover:text-ink hover:bg-sunken-deep transition-colors cursor-pointer disabled:opacity-50';
// A small on / off label under the product name (bestseller, new arrival)
const flagChip = (on: boolean) => `inline-flex items-center gap-1 h-11 md:h-7 px-3 md:px-2.5 rounded-full border text-[13px] md:text-xs font-medium cursor-pointer transition-colors ${
  on ? 'bg-brand-wash border-brand-line text-brand' : 'border-dashed border-line text-ink-muted hover:text-ink hover:bg-sunken'
}`;
const CHECKBOX = 'w-5 h-5 shrink-0 rounded-[6px] accent-[var(--color-ink)] cursor-pointer';
const VIEW_PREF = 'sag_admin_products_view';
const SORT_PREF = 'sag_admin_products_sort';

interface Undo { label: string; items: Array<{ id: string; name: string; before: Partial<Product> }> }

export const AdminProducts: React.FC = () => {
  const {
    products = [],
    deleteProduct,
    duplicateProduct,
    toggleProductStatus,
    updateProduct,
    lowStockThreshold,
    updateLowStockThreshold,
    orders = [],
    ordersLoaded = false,
  } = useAdmin();
  const [view, setView] = useState<'products' | 'history'>('products');
  const [statusTab, setStatusTab] = useState<StatusFilter>('all');
  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const { showToast, navigateToProduct } = useShop();
  const { adjustStock } = useProducts();
  const [busyId, setBusyId] = useState<string | null>(null);
  const { navigate, openAdminTab, openAdminProductNew, openAdminProductEdit } = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  // Opened from Categories → "See products": start on that category
  const [selectedCategory, setSelectedCategory] = useState<string>(() => takePendingCategory() || 'All');
  const [filterStock, setFilterStock] = useState<StockFilter>('all');
  const [filterType, setFilterType] = useState<'all' | 'combos' | 'singles'>('all');
  const [smart, setSmart] = useState<SmartFilter>('');
  const [sort, setSort] = useState<SortKey>(() => (readPref(SORT_PREF, 'newest') as SortKey) in SORT_LABEL ? readPref(SORT_PREF, 'newest') as SortKey : 'newest');
  const [layout, setLayout] = useState<View>(() => (readPref(VIEW_PREF, 'list') === 'grid' ? 'grid' : 'list'));
  const [shown, setShown] = useState(LIST_STEP);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Selection and bulk changes
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);

  // One row open for quick edit, and one row's listing checks open
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quick, setQuick] = useState({ price: '', mrp: '', stock: '' });
  const [quickError, setQuickError] = useState('');
  const [healthId, setHealthId] = useState<string | null>(null);

  const performance = useProductPerformance(orders, ordersLoaded);

  const saveThreshold = async () => {
    if (thresholdDraft === null) return;
    setSavingThreshold(true);
    try {
      await updateLowStockThreshold(Number(thresholdDraft));
      showToast(`Low-stock alert set to ${Math.floor(Number(thresholdDraft))} pieces.`, 'success');
      setThresholdDraft(null);
    } catch (err: any) {
      showToast(err?.message || 'The setting could not be saved. Please try again.', 'error');
    } finally {
      setSavingThreshold(false);
    }
  };

  // Every admin action waits for the database and reports the real outcome.
  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    try {
      await action();
      showToast(success, 'success');
      return true;
    } catch (err: any) {
      showToast(err?.message || 'The change could not be saved. Please try again.', 'error');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  // Accessories (bags, heels, jewellery...) are a separate section, managed only in Complete the Look:
  // none of them is listed, counted or filtered here.
  const outfits = useMemo(() => products.filter((product) => !isAccessory(product)), [products]);
  const comboCount = outfits.filter((product) => setTypeOf(product)).length;

  // The listing checks of every product, worked out once per change of the catalogue
  const health = useMemo(() => {
    const map = new Map<string, { checks: HealthCheck[]; score: number }>();
    outfits.forEach((p) => {
      const checks = healthChecks(p);
      map.set(p.id, { checks, score: healthScore(checks) });
    });
    return map;
  }, [outfits]);
  const numbersOf = (id: string): ProductNumbers | undefined => performance.byId?.get(id);

  const handleDuplicate = (id: string, name: string) =>
    run(id, () => duplicateProduct(id), `Created a hidden copy of "${name}". Edit it, then publish.`);

  const handleDelete = (id: string, name: string) => {
    setDeleteConfirmId(null);
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    return run(id, () => deleteProduct(id), `Deleted "${name}".`);
  };

  const isLowOnly = (product: Product) => !isSoldOut(product) && isLowStock(product, lowStockThreshold);

  const matchesSmart = (product: Product) => {
    if (!smart) return true;
    const h = health.get(product.id);
    if (smart === 'needsWork') return (h?.score ?? 100) < 70;
    if (smart === 'fewPhotos') return (product.images || []).length < PHOTOS_GOOD;
    if (smart === 'noDescription') return product.description.trim().length < DESCRIPTION_GOOD;
    if (smart === 'noSearchText') return !String(product.seoTitle || '').trim() || !String(product.seoDescription || '').trim();
    if (smart === 'onOffer') return offOf(product.price, Number(product.originalPrice) || 0) > 0;
    if (smart === 'liveSoldOut') return !product.hidden && isSoldOut(product);
    if (smart === 'noSales') {
      const n = numbersOf(product.id);
      return !product.hidden && (n?.views || 0) > 0 && !(n?.sold);
    }
    return true;
  };

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = outfits.filter((product) => {
      const matchesSearch = !q ||
        product.name.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q) ||
        (product.sku && product.sku.toLowerCase().includes(q)) ||
        (product.fabric && product.fabric.toLowerCase().includes(q));
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      let matchesStock = true;
      if (filterStock === 'inStock') matchesStock = product.inStock && (product.stockQuantity === undefined || product.stockQuantity > 0);
      else if (filterStock === 'outOfStock') matchesStock = isSoldOut(product);
      else if (filterStock === 'low') matchesStock = isLowOnly(product);
      const matchesType = filterType === 'all' || (filterType === 'combos') === Boolean(setTypeOf(product));
      const matchesStatus = statusTab === 'all' || (statusTab === 'hidden' ? Boolean(product.hidden) : statusOf(product) === statusTab);
      return matchesSearch && matchesCategory && matchesStock && matchesType && matchesStatus && matchesSmart(product);
    });
    if (sort === 'newest') return list;
    const by = (fn: (p: Product) => number) => [...list].sort((a, b) => fn(a) - fn(b));
    if (sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'priceLow') return by((p) => p.price);
    if (sort === 'priceHigh') return by((p) => -p.price);
    if (sort === 'stockLow') return by((p) => Math.max(0, Number(p.stockQuantity) || 0));
    if (sort === 'health') return by((p) => health.get(p.id)?.score ?? 100);
    if (sort === 'views') return by((p) => -(numbersOf(p.id)?.views || 0));
    if (sort === 'sold') return by((p) => -(numbersOf(p.id)?.sold || 0));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outfits, searchQuery, selectedCategory, filterStock, filterType, statusTab, smart, sort, health, performance.byId, lowStockThreshold]);
  const visible = filteredProducts.slice(0, shown);
  const statusCount = (tab: StatusTab) => (tab === 'all' ? outfits.length : outfits.filter((p) => statusOf(p) === tab).length);

  // The page's key numbers, all counted from the live catalogue
  const draftCount = statusCount('draft');
  const archivedCount = statusCount('archived');
  const soldOutCount = outfits.filter(isSoldOut).length;
  const lowCount = outfits.filter(isLowOnly).length;
  const liveSoldOut = outfits.filter((p) => !p.hidden && isSoldOut(p)).length;
  const needsWorkCount = outfits.filter((p) => (health.get(p.id)?.score ?? 100) < 70).length;
  const averageScore = outfits.length ? Math.round(outfits.reduce((s, p) => s + (health.get(p.id)?.score ?? 0), 0) / outfits.length) : 0;
  const filtersOn = Boolean(searchQuery.trim()) || selectedCategory !== 'All' || filterStock !== 'all' || filterType !== 'all' || statusTab !== 'all' || Boolean(smart);
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setFilterStock('all');
    setFilterType('all');
    setStatusTab('all');
    setSmart('');
    setShown(LIST_STEP);
  };
  // A tile shows only its own group: every other filter is cleared so the list matches the number on the tile
  const showOnly = (status: StatusFilter, stock: StockFilter, smartFilter: SmartFilter = '') => {
    clearFilters();
    setStatusTab(status);
    setFilterStock(stock);
    setSmart(smartFilter);
  };
  const onlyFilter = (status: StatusFilter, stock: StockFilter) =>
    statusTab === status && filterStock === stock && !searchQuery.trim() && selectedCategory === 'All' && filterType === 'all' && !smart;

  const chooseLayout = (next: View) => { setLayout(next); writePref(VIEW_PREF, next); };
  const chooseSort = (next: SortKey) => { setSort(next); writePref(SORT_PREF, next); };

  // ---------------------------------------------------------------- selection and bulk changes
  const selectedProducts = outfits.filter((p) => selected.has(p.id));
  const allShownSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllShown = () => setSelected((s) => {
    const n = new Set(s);
    if (allShownSelected) visible.forEach((p) => n.delete(p.id));
    else visible.forEach((p) => n.add(p.id));
    return n;
  });

  // Saves the planned changes one product at a time through the normal product save, then offers an undo
  const applyPlan = async (plan: PlannedChange[], label: string, reason: string) => {
    setBulkProgress({ done: 0, total: plan.length, label });
    const done: Undo['items'] = [];
    let failed = 0;
    for (const row of plan) {
      try {
        await updateProduct(row.product.id, row.change, reason);
        done.push({ id: row.product.id, name: row.product.name, before: row.before });
      } catch {
        failed += 1;
      }
      setBulkProgress({ done: done.length + failed, total: plan.length, label });
    }
    setBulkProgress(null);
    setBulkOpen(false);
    if (done.length) setUndo({ label: `${label}: ${done.length} product${done.length === 1 ? '' : 's'}`, items: done });
    if (failed) showToast(`${done.length} saved, ${failed} could not be saved. Please try those again.`, 'error');
    else showToast(`${label}: ${done.length} product${done.length === 1 ? '' : 's'} saved.`, 'success');
  };

  const runUndo = async () => {
    if (!undo) return;
    const items = undo.items;
    setUndo(null);
    setBulkProgress({ done: 0, total: items.length, label: 'Undoing' });
    let failed = 0;
    for (let i = 0; i < items.length; i += 1) {
      try { await updateProduct(items[i].id, items[i].before, 'Undo bulk edit'); } catch { failed += 1; }
      setBulkProgress({ done: i + 1, total: items.length, label: 'Undoing' });
    }
    setBulkProgress(null);
    showToast(failed ? `${items.length - failed} put back, ${failed} could not be put back.` : `Undone: ${items.length} product${items.length === 1 ? '' : 's'} put back as they were.`, failed ? 'error' : 'success');
  };

  // ---------------------------------------------------------------- quick edit (price, MRP, stock) per row
  const openQuick = (p: Product) => {
    setQuickId(p.id);
    setQuickError('');
    setQuick({ price: String(p.price), mrp: Number(p.originalPrice) > p.price ? String(p.originalPrice) : '', stock: String(Math.max(0, Number(p.stockQuantity) || 0)) });
  };
  const saveQuick = async (p: Product) => {
    const problem = priceProblem(quick.price, quick.mrp, { price: `qe-price-${p.id}`, mrp: `qe-mrp-${p.id}` }) || stockProblem(quick.stock, `qe-stock-${p.id}`);
    if (problem) { setQuickError(problem.message); document.getElementById(problem.field)?.focus(); return; }
    const f = priceFields(quick.price, quick.mrp);
    const change: Partial<Product> = {};
    if (f.price !== p.price || f.originalPrice !== Math.max(p.price, Number(p.originalPrice) || p.price)) Object.assign(change, f);
    const stock = Number(quick.stock);
    if (stock !== Math.max(0, Number(p.stockQuantity) || 0)) { change.stockQuantity = stock; change.inStock = stock > 0; }
    if (!Object.keys(change).length) { setQuickId(null); return; }
    const ok = await run(p.id, () => updateProduct(p.id, change, 'Quick edit in Products'), `"${p.name}" saved.`);
    if (ok) setQuickId(null);
  };

  // ---------------------------------------------------------------- one-tap fixes from the listing checks
  const fixOne = (p: Product, check: HealthCheck) => {
    const change = check.fix ? fixChange(p, check.fix) : null;
    if (change) {
      void run(p.id, () => updateProduct(p.id, change, 'Listing fix in Products'), `"${p.name}": ${check.label.toLowerCase()} filled.`);
      return;
    }
    openFormAt(p.id, check.section);
    openAdminProductEdit(p.id);
  };

  // ---------------------------------------------------------------- pieces of a row / card
  const stockStepper = (product: Product) => {
    const stockQty = Math.max(0, Number(product.stockQuantity ?? 0));
    const isOutOfStock = !product.inStock || stockQty === 0;
    const lowStock = isLowStock(product, lowStockThreshold);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-full bg-sunken p-0.5">
          <button
            onClick={() => run(product.id, () => adjustStock(product.id, -1), `Stock of "${product.name}" reduced by 1.`)}
            disabled={busyId === product.id || stockQty <= 0}
            aria-label={`Decrease stock of ${product.name}`}
            className="w-11 h-11 md:w-8 md:h-8 rounded-full hover:bg-sunken-deep text-ink text-base font-semibold disabled:opacity-40 cursor-pointer"
          >
            -
          </button>
          <span className={`min-w-8 text-center text-sm font-semibold tabular-nums ${isOutOfStock ? 'text-danger' : lowStock ? 'text-sale' : 'text-ink'}`}
            title={lowStock ? `Low stock (alert at ${lowStockLevelFor(product, lowStockThreshold)})` : undefined}>
            {stockQty}
          </span>
          <button
            onClick={() => run(product.id, () => adjustStock(product.id, 1), `Stock of "${product.name}" increased by 1.`)}
            disabled={busyId === product.id}
            aria-label={`Increase stock of ${product.name}`}
            className="w-11 h-11 md:w-8 md:h-8 rounded-full hover:bg-sunken-deep text-ink text-base font-semibold disabled:opacity-40 cursor-pointer"
          >
            +
          </button>
        </div>
        <span className={`${ui.badge} sag-num ${isOutOfStock ? tone.danger : lowStock ? tone.warn : tone.muted}`}>
          {isOutOfStock ? 'Out of stock' : lowStock ? `Low: ${stockQty} left` : 'In stock'}
        </span>
      </div>
    );
  };

  const priceBlock = (product: Product) => {
    const hasMrp = Number(product.originalPrice) > product.price;
    const off = hasMrp ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : 0;
    return (
      <p className="flex md:block items-baseline gap-2 flex-wrap">
        <span className="font-semibold text-ink text-base md:text-[15px] sag-num">₹{product.price.toLocaleString('en-IN')}</span>
        {hasMrp && (
          <span className="md:block text-[13px] text-ink-faint sag-num whitespace-nowrap">
            MRP <span className="line-through">₹{product.originalPrice.toLocaleString('en-IN')}</span>
            <span className="ml-1.5 text-sale font-semibold">{off}% off</span>
          </span>
        )}
      </p>
    );
  };

  const statusButton = (product: Product) => {
    const status = statusOf(product);
    return (
      <button
        onClick={() => run(product.id, () => toggleProductStatus(product.id), product.hidden ? `"${product.name}" is now live on the store.` : `"${product.name}" is now a draft (hidden from the store).`)}
        disabled={busyId === product.id}
        aria-pressed={!product.hidden}
        title={product.hidden ? 'Click to publish on the store' : 'Click to make it a draft (hidden)'}
        className={`inline-flex items-center gap-1.5 h-11 md:h-8 px-3.5 md:px-3 rounded-full border text-[13px] md:text-xs font-semibold cursor-pointer disabled:opacity-50 ${
          status === 'published' ? 'bg-ok-tint text-ok border-ok-line' : 'bg-sunken text-ink-muted border-line'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${status === 'published' ? 'bg-ok' : 'bg-ink-faint'}`} aria-hidden="true" />
        {status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Draft'}
      </button>
    );
  };

  const flags = (product: Product) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {setTypeOf(product) && (
        <span className={`${ui.badge} ${tone.brand}`} title="Complete the look shows on this product page">Combo · {setTypeOf(product)}</span>
      )}
      <button
        type="button"
        onClick={() => run(product.id, () => updateProduct(product.id, { isBestSeller: !product.isBestSeller }), `"${product.name}" ${product.isBestSeller ? 'is no longer a bestseller' : 'marked as bestseller'}.`)}
        aria-pressed={Boolean(product.isBestSeller)}
        className={flagChip(Boolean(product.isBestSeller))}
        title="Click to toggle Bestseller status"
      >
        {product.isBestSeller ? <Star className="w-3.5 h-3.5 fill-current text-current" aria-hidden="true" /> : <Sparkles className="w-3 h-3 text-current" aria-hidden="true" />}
        <span>{product.isBestSeller ? 'Bestseller' : 'Mark bestseller'}</span>
      </button>
      <button
        type="button"
        onClick={() => run(product.id, () => updateProduct(product.id, { isNewArrival: !product.isNewArrival }), `"${product.name}" new arrival ${product.isNewArrival ? 'removed' : 'set'}.`)}
        aria-pressed={Boolean(product.isNewArrival)}
        className={flagChip(Boolean(product.isNewArrival))}
        title="Click to toggle New Arrival status"
      >
        {product.isNewArrival ? 'New arrival' : '+ New arrival'}
      </button>
      <button
        type="button"
        onClick={() => run(product.id, () => updateProduct(product.id, { isFeatured: !product.isFeatured }), `"${product.name}" ${product.isFeatured ? 'is no longer featured' : 'is now featured'}.`)}
        aria-pressed={Boolean(product.isFeatured)}
        className={flagChip(Boolean(product.isFeatured))}
        title="Featured products are picked first for the homepage"
      >
        {product.isFeatured ? 'Featured' : '+ Featured'}
      </button>
    </div>
  );

  const healthButton = (product: Product) => {
    const h = health.get(product.id);
    if (!h) return null;
    const open = healthId === product.id;
    return (
      <button type="button" onClick={() => setHealthId(open ? null : product.id)} aria-expanded={open} aria-controls={`health-${product.id}`}
        aria-label={`Listing quality of ${product.name}: ${h.score} out of 100, ${healthWord(h.score)}`}
        className="inline-flex items-center gap-2 min-h-11 md:min-h-9 pr-2 rounded-full hover:bg-sunken cursor-pointer text-left">
        <ScoreRing score={h.score} size={34} />
        <span className={`text-[12.5px] leading-4 font-semibold text-ink whitespace-nowrap ${layout === 'list' ? 'md:hidden 2xl:inline' : ''}`}>{healthWord(h.score)}<ChevronDown className={`inline w-3.5 h-3.5 ml-0.5 text-ink-muted motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /></span>
      </button>
    );
  };

  const healthPanel = (product: Product) => {
    const h = health.get(product.id);
    if (!h || healthId !== product.id) return null;
    const missing = h.checks.filter((c) => !c.ok);
    return (
      <div id={`health-${product.id}`} className="rounded-[16px] bg-page p-3 sm:p-3.5">
        <p className="text-[13px] font-semibold text-ink">{missing.length ? `${missing.length} thing${missing.length === 1 ? '' : 's'} would make this listing stronger` : 'Everything checked is in place.'}</p>
        <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
          {h.checks.map((c) => (
            <li key={c.id} className="flex items-center gap-2 min-h-10 text-[13px]">
              <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${c.ok ? 'bg-ok text-[color:var(--sag-on-gold)]' : 'border border-control text-ink-muted'}`} aria-hidden="true">
                {c.ok ? <Check className="w-3 h-3" strokeWidth={3} /> : <span className="w-1 h-1 rounded-full bg-current" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={c.ok ? 'text-ink' : 'font-semibold text-ink'}>{c.label}</span>
                {!c.ok && <span className="block text-[12px] leading-4 text-ink-muted">{c.todo}</span>}
              </span>
              {!c.ok && (
                <button type="button" onClick={() => fixOne(product, c)} disabled={busyId === product.id} className={`${ui.small} shrink-0`}>
                  {c.fix ? 'Fill it' : 'Open'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const perfLine = (product: Product) => {
    const n = numbersOf(product.id);
    if (!performance.byId) return null;
    return (
      <p className="text-[12px] leading-4 text-ink-muted sag-num" title={`Last ${PERF_DAYS} days: views and wishlist saves are counted once a day per visitor; pieces sold come from paid orders`}>
        {PERF_DAYS} days: {(n?.views || 0).toLocaleString('en-IN')} views · {n?.saves || 0} saves{ordersLoaded ? ` · ${n?.sold || 0} sold` : ''}
      </p>
    );
  };

  const quickEditor = (product: Product) => (quickId !== product.id ? null : (
    <form
      id={`quick-edit-${product.id}`}
      onSubmit={(e) => { e.preventDefault(); void saveQuick(product); }}
      className="rounded-[16px] bg-page p-3 sm:p-3.5 md:max-w-xl"
      aria-label={`Quick edit ${product.name}`}
    >
      <div className="grid grid-cols-3 gap-2">
        {([['price', 'Price ₹', `qe-price-${product.id}`], ['mrp', 'MRP ₹', `qe-mrp-${product.id}`], ['stock', 'Stock', `qe-stock-${product.id}`]] as const).map(([key, label, id]) => (
          <div key={key} className="min-w-0">
            <label htmlFor={id} className="block text-[12px] font-semibold text-ink-muted mb-1">{label}</label>
            <input id={id} type="number" inputMode="numeric" min={0} value={quick[key]} placeholder={key === 'mrp' ? 'None' : ''}
              onChange={(e) => { setQuick((q) => ({ ...q, [key]: e.target.value })); setQuickError(''); }}
              className={`${ui.field} !h-11 !px-2.5 sag-num text-center`} />
          </div>
        ))}
      </div>
      {(() => {
        if (quickError) return <p role="alert" className="mt-2 text-[13px] text-danger">{quickError}</p>;
        const f = priceFields(quick.price, quick.mrp);
        return f.price > 0 ? (
          <p className="mt-2 text-[12.5px] text-ink-muted sag-num">
            Shoppers will see <span className="font-semibold text-ink">₹{f.price.toLocaleString('en-IN')}</span>
            {f.discount > 0 && <> <span className="line-through">₹{f.originalPrice.toLocaleString('en-IN')}</span> <span className="font-semibold text-sale">{f.discount}% off</span></>}
          </p>
        ) : null;
      })()}
      <div className="mt-2.5 flex gap-2 justify-end">
        <button type="button" onClick={() => setQuickId(null)} className={ui.small}>Cancel</button>
        <button type="submit" disabled={busyId === product.id} className={`${ui.primary} !h-11 md:!h-9`}>{busyId === product.id ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  ));

  const actions = (product: Product, compact = false) => {
    const status = statusOf(product);
    return (
      <div className={`flex items-center gap-1 ${compact ? 'flex-wrap justify-between' : 'md:flex-wrap md:justify-end md:max-w-[10.5rem] md:ml-auto'}`}>
        {/* Edit */}
        <button
          id={`edit-prod-${product.id}`}
          onClick={() => openAdminProductEdit(product.id)}
          className={`${ui.small} !border-brand-line !text-brand ${compact ? 'basis-full mb-1' : 'mr-auto md:mr-1'} px-4`}
          title="Edit product"
          aria-label={`Edit ${product.name}`}
        >
          <Edit3 className="w-3.5 h-3.5 text-current" /> Edit
        </button>
        {/* Quick edit: price, MRP and stock without leaving the list */}
        <button
          id={`quick-prod-${product.id}`}
          type="button"
          onClick={() => (quickId === product.id ? setQuickId(null) : openQuick(product))}
          aria-expanded={quickId === product.id}
          className={ICON_BTN}
          title="Quick edit price and stock"
          aria-label={`Quick edit price and stock of ${product.name}`}
        >
          <Pencil className="w-4 h-4 text-current" />
        </button>
        {/* View on Store */}
        <button
          id={`view-store-${product.id}`}
          onClick={() => { navigateToProduct(product.id); navigate(`/product/${product.id}`); }}
          className={ICON_BTN}
          title="View on the store"
          aria-label={`View ${product.name} on the store`}
        >
          <Eye className="w-4 h-4 text-current" />
        </button>
        {/* Duplicate */}
        <button id={`dup-prod-${product.id}`} onClick={() => handleDuplicate(product.id, product.name)} className={ICON_BTN} title="Duplicate product" aria-label={`Duplicate ${product.name}`}>
          <Copy className="w-4 h-4 text-current" />
        </button>
        {/* Archive / restore (archived products stay hidden and are never sold) */}
        {status === 'archived' ? (
          <button type="button" onClick={() => run(product.id, () => updateProduct(product.id, { status: 'draft', hidden: true }), `"${product.name}" restored as a draft.`)}
            disabled={busyId === product.id} className={ICON_BTN} title="Restore as draft" aria-label={`Restore ${product.name} as draft`}>
            <ArchiveRestore className="w-4 h-4 text-current" />
          </button>
        ) : (
          <button type="button" onClick={() => run(product.id, () => updateProduct(product.id, { status: 'archived', hidden: true }), `"${product.name}" archived and hidden from the store.`)}
            disabled={busyId === product.id} className={ICON_BTN} title="Archive (hide and put away)" aria-label={`Archive ${product.name}`}>
            <Archive className="w-4 h-4 text-current" />
          </button>
        )}
        {/* Delete */}
        <button id={`del-prod-${product.id}`} onClick={() => setDeleteConfirmId(product.id)} className={`${ICON_BTN} !text-danger hover:!bg-danger-tint`} title="Delete product" aria-label={`Delete ${product.name}`}>
          <Trash2 className="w-4 h-4 text-current" />
        </button>
      </div>
    );
  };

  const cover = (product: Product) => (product.images?.[0] && product.images[0].trim() !== '' ? product.images[0] : '');
  const selectBox = (product: Product) => (
    <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelect(product.id)} aria-label={`Choose ${product.name}`} className={CHECKBOX} />
  );

  const SMART: Array<{ id: SmartFilter; label: string; count: number }> = [
    { id: 'needsWork', label: 'Needs work', count: needsWorkCount },
    { id: 'fewPhotos', label: `Under ${PHOTOS_GOOD} photos`, count: outfits.filter((p) => (p.images || []).length < PHOTOS_GOOD).length },
    { id: 'noDescription', label: 'Short description', count: outfits.filter((p) => p.description.trim().length < DESCRIPTION_GOOD).length },
    { id: 'noSearchText', label: 'No search text', count: outfits.filter((p) => !String(p.seoTitle || '').trim() || !String(p.seoDescription || '').trim()).length },
    { id: 'onOffer', label: 'On offer', count: outfits.filter((p) => offOf(p.price, Number(p.originalPrice) || 0) > 0).length },
    { id: 'liveSoldOut', label: 'Live but sold out', count: liveSoldOut },
    ...(performance.byId && ordersLoaded ? [{ id: 'noSales' as SmartFilter, label: 'Viewed, not sold', count: outfits.filter((p) => !p.hidden && (numbersOf(p.id)?.views || 0) > 0 && !numbersOf(p.id)?.sold).length }] : []),
  ];

  return (
    <div id="admin-products-page" className={`space-y-5 sm:space-y-6 ${selected.size || undo || bulkProgress ? 'pb-28' : ''}`}>

      {/* 1. Title, what the page is for, and the one main action */}
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Products"
        icon={<PackageIcon live={false} />}
        description="Every women's outfit in your store: its price, how many pieces are left and whether shoppers can see it."
        actions={
          <button id="admin-add-product-btn" onClick={openAdminProductNew} className="sag-btn-primary h-12 px-6 text-[15px] gap-2 w-full sm:w-auto">
            <Plus className="w-4 h-4 text-current" />
            <span>Add product</span>
          </button>
        }
      />

      {/* Products list / stock history */}
      <div role="tablist" aria-label="Products view" className="flex flex-wrap gap-2">
        {([['products', 'Products', Package], ['history', 'Stock history', History]] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`${ui.chip(view === key)} px-5`}>
            <Icon className="w-4 h-4 text-current" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {view === 'history' ? <AdminStockHistory /> : (<>

      {/* 2. Key numbers (tap one to see only those products) */}
      <StatRow label="Products in numbers">
        <StatTile label="Published" value={statusCount('published')} note={`of ${outfits.length} products, live on the store`} tone="gold"
          onClick={() => showOnly('published', 'all')} active={onlyFilter('published', 'all')} />
        <StatTile label="Drafts / hidden" value={draftCount + archivedCount} note={`${draftCount} draft · ${archivedCount} archived`}
          onClick={() => showOnly('hidden', 'all')} active={onlyFilter('hidden', 'all')} />
        <StatTile label="Out of stock" value={soldOutCount} note={soldOutCount ? 'cannot be bought: add stock' : 'nothing is sold out'} tone={soldOutCount ? 'danger' : 'plain'}
          onClick={() => showOnly('all', 'outOfStock')} active={onlyFilter('all', 'outOfStock')} />
        <StatTile label="Low stock" value={lowCount} note={`at or below the alert level (${lowStockThreshold} pcs)`}
          onClick={() => showOnly('all', 'low')} active={onlyFilter('all', 'low')} />
      </StatRow>

      {/* Alerts that need the owner now (real counts only) */}
      {(liveSoldOut > 0 || needsWorkCount > 0) && (
        <div id="admin-products-alerts" className="grid gap-2.5 sm:grid-cols-2">
          {liveSoldOut > 0 && (
            <div className="sag-glass px-4 py-3 flex items-center gap-3">
              <span className="w-10 h-10 shrink-0 rounded-full bg-danger-tint text-danger flex items-center justify-center"><AlertTriangle className="w-[18px] h-[18px]" aria-hidden="true" /></span>
              <p className="min-w-0 flex-1 text-[13.5px] leading-[19px] text-ink"><span className="font-semibold sag-num">{liveSoldOut} live product{liveSoldOut === 1 ? ' is' : 's are'} sold out.</span> <span className="text-ink-muted">Shoppers see {liveSoldOut === 1 ? 'it' : 'them'} but cannot buy.</span></p>
              <button type="button" onClick={() => showOnly('all', 'all', 'liveSoldOut')} className={`${ui.small} shrink-0`}>Show</button>
            </div>
          )}
          {needsWorkCount > 0 && (
            <div className="sag-glass px-4 py-3 flex items-center gap-3">
              <ScoreRing score={averageScore} size={40} />
              <p className="min-w-0 flex-1 text-[13.5px] leading-[19px] text-ink"><span className="font-semibold">Average listing quality {averageScore}.</span> <span className="text-ink-muted sag-num">{needsWorkCount} listing{needsWorkCount === 1 ? '' : 's'} below 70.</span></p>
              <button type="button" onClick={() => { showOnly('all', 'all', 'needsWork'); chooseSort('health'); }} className={`${ui.small} shrink-0`}>Improve</button>
            </div>
          )}
        </div>
      )}

      {/* 3. Status, search and filters in one panel */}
      <div className={`${ui.card} space-y-3`}>
        <div role="tablist" aria-label="Filter by status" className="flex flex-nowrap gap-2 max-w-full overflow-x-auto sag-scroll-x -mx-1 px-1 pb-0.5">
          {(['all', 'published', 'draft', 'archived'] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={statusTab === tab} onClick={() => { setStatusTab(tab); setShown(LIST_STEP); }} className={`${ui.chip(statusTab === tab)} shrink-0 whitespace-nowrap`}>
              <span>{STATUS_LABEL[tab]}</span>
              <span className={`sag-num font-normal ${statusTab === tab ? 'opacity-70' : 'text-ink-muted'}`}>{statusCount(tab)}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3">
          <div className="sm:col-span-12 lg:col-span-5 relative">
            <input type="text" placeholder="Search name, SKU, category or fabric" aria-label="Search products" value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShown(LIST_STEP); }} className={ui.search} />
            <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          </div>
          <div className="sm:col-span-4 lg:col-span-2">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)} aria-label="Filter by product type" className={`${ui.select} pl-3.5`}>
              <option value="all">Type: All</option>
              <option value="combos">Type: Combo / set ({comboCount})</option>
              <option value="singles">Type: Single outfits</option>
            </select>
          </div>
          <div className="sm:col-span-4 lg:col-span-3">
            <select value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setShown(LIST_STEP); }} aria-label="Filter by category" className={`${ui.select} pl-3.5`}>
              {ALL_CATEGORIES.map((cat) => {
                const n = cat === 'All' ? outfits.length : outfits.filter((p) => p.category === cat).length;
                return <option key={cat} value={cat}>Category: {cat}{cat !== 'All' ? ` (${n})` : ''}</option>;
              })}
            </select>
          </div>
          <div className="sm:col-span-4 lg:col-span-2">
            <select value={filterStock} onChange={(e) => setFilterStock(e.target.value as StockFilter)} aria-label="Filter by stock" className={`${ui.select} pl-3.5`}>
              <option value="all">Stock: All</option>
              <option value="inStock">Stock: In stock only</option>
              <option value="low">Stock: Low stock</option>
              <option value="outOfStock">Stock: Sold out</option>
            </select>
          </div>
        </div>

        {/* Smart filters: what a listing is missing or how it is doing */}
        <div role="group" aria-label="Quick filters" className="flex flex-nowrap gap-1.5 max-w-full overflow-x-auto sag-scroll-x -mx-1 px-1 pb-0.5">
          {SMART.map((s) => (
            <button key={s.id} type="button" aria-pressed={smart === s.id} onClick={() => { setSmart(smart === s.id ? '' : s.id); setShown(LIST_STEP); }}
              className={`sag-chip shrink-0 whitespace-nowrap !h-10 !min-w-0 !px-3.5 !text-[13px] inline-flex items-center gap-1.5 cursor-pointer ${smart === s.id ? 'is-selected' : ''}`}>
              {s.label} <span className={`sag-num ${smart === s.id ? 'opacity-70' : 'text-ink-muted'}`}>{s.count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 border-t border-line">
          <p className="text-[13px] leading-[18px] text-ink-muted sag-num" aria-live="polite">
            Showing <span className="font-semibold text-ink">{filteredProducts.length}</span> of {outfits.length} products
            {filtersOn && <button type="button" onClick={clearFilters} className={`ml-3 ${ui.link}`}>Clear filters</button>}
          </p>

          {/* Store-wide low-stock alert level (admin only; a product can set its own in the product form) */}
          <form onSubmit={(e) => { e.preventDefault(); void saveThreshold(); }} className="w-full sm:w-auto flex items-center gap-2">
            <label htmlFor="low-stock-threshold" className="text-[13px] text-ink-muted whitespace-nowrap">Warn me when stock is at or below</label>
            <input id="low-stock-threshold" type="number" min={0} step={1} value={thresholdDraft ?? String(lowStockThreshold)}
              onChange={(e) => setThresholdDraft(e.target.value)} inputMode="numeric" className={`${ui.field} sag-num !w-16 !px-2 text-center`} />
            <span className="text-[13px] text-ink-muted mr-auto sm:mr-0">pcs</span>
            <button type="submit" disabled={thresholdDraft === null || savingThreshold || thresholdDraft === String(lowStockThreshold)} className={ui.small}>
              {savingThreshold ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>
      </div>

      {/* Toolbar: choose all shown, sort, list or grid */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="inline-flex items-center gap-2.5 min-h-11 pl-3.5 pr-4 rounded-full bg-surface cursor-pointer text-[13.5px] font-semibold text-ink">
          <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} disabled={!visible.length} className={CHECKBOX} id="admin-products-select-all" />
          {allShownSelected ? 'Unselect shown' : `Select ${visible.length < filteredProducts.length ? `${visible.length} shown` : 'all shown'}`}
        </label>
        <select id="admin-products-sort" value={sort} onChange={(e) => chooseSort(e.target.value as SortKey)} aria-label="Sort products" className={`${ui.select} pl-3.5 !w-auto min-w-0 flex-1 sm:flex-none`}>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>Sort: {SORT_LABEL[k]}</option>)}
        </select>
        <div role="group" aria-label="Layout" className="ml-auto inline-flex gap-1 p-1 rounded-full bg-surface">
          <button type="button" aria-pressed={layout === 'list'} onClick={() => chooseLayout('list')} aria-label="Show as a list" title="List"
            className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${layout === 'list' ? 'bg-ink text-[color:var(--sag-on-gold)]' : 'text-ink hover:bg-sunken'}`}>
            <List className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
          <button type="button" aria-pressed={layout === 'grid'} onClick={() => chooseLayout('grid')} aria-label="Show as photo grid" title="Photo grid"
            className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${layout === 'grid' ? 'bg-ink text-[color:var(--sag-on-gold)]' : 'text-ink hover:bg-sunken'}`}>
            <LayoutGrid className="w-[18px] h-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 4. The products */}
      {filteredProducts.length === 0 ? (
        <div className={ui.panel}>
          {outfits.length === 0 ? (
            <EmptyState icon={<Package />} title="No products yet"
              action={<button type="button" onClick={openAdminProductNew} className={ui.primary}><Plus className="w-4 h-4 text-current" /> Add product</button>}>
              Add your first outfit with its photos, price and stock. It shows on the store as soon as you save it.
            </EmptyState>
          ) : (
            <EmptyState icon={<Search />} title="No products match"
              action={<button type="button" onClick={clearFilters} className={ui.outline}>Clear filters</button>}>
              Nothing fits this search or these filters. Clear them to see every product.
            </EmptyState>
          )}
        </div>
      ) : layout === 'grid' ? (
        // Photo grid: big photos, the essentials under each
        <ul id="admin-products-grid" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {visible.map((product) => {
            const photo = cover(product);
            const isChosen = selected.has(product.id);
            return (
              <li key={product.id} className={`min-w-0 sag-glass p-2.5 flex flex-col gap-2 ${isChosen ? 'ring-2 ring-ink' : ''}`}>
                <button type="button" onClick={() => openAdminProductEdit(product.id)} className="block w-full aspect-[4/5] rounded-[16px] overflow-hidden bg-sunken cursor-pointer" aria-label={`Open ${product.name}`}>
                  {photo ? <img src={getCleanImageUrl(photo, 480)} alt="" loading="lazy" className="w-full h-full object-cover object-top" />
                    : <span className="w-full h-full flex items-center justify-center text-ink-faint"><Package className="w-6 h-6" aria-hidden="true" /></span>}
                </button>
                <div className="flex items-center gap-2 px-0.5">
                  {selectBox(product)}
                  {statusButton(product)}
                </div>
                <div className="px-0.5 min-w-0">
                  <p className="text-[13.5px] leading-[18px] font-semibold text-ink line-clamp-2">{product.name}</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted truncate">{product.category}</p>
                  <div className="mt-1">{priceBlock(product)}</div>
                </div>
                <div className="px-0.5">{stockStepper(product)}</div>
                <div className="px-0.5">{healthButton(product)}</div>
                {healthPanel(product)}
                {quickEditor(product)}
                <div className="px-0.5 pt-2 mt-auto border-t border-line">{actions(product, true)}</div>
              </li>
            );
          })}
        </ul>
      ) : (
        // List: a table on wide screens, stacked cards on phones
        <div className={ui.panel}>
          <div className="md:overflow-x-auto">
            <table className="block md:table w-full text-left text-[13px] border-collapse">
              <thead className="hidden md:table-header-group">
                <tr className={ui.thead}>
                  <th className="py-3 pl-4 pr-1 w-9 font-medium"><span className="sr-only">Choose</span></th>
                  <th className="py-3 px-3 font-medium">Product</th>
                  <th className="py-3 px-3 font-medium text-right">Price</th>
                  <th className="py-3 px-3 font-medium">Stock</th>
                  <th className="py-3 px-3 font-medium">Quality</th>
                  <th className="py-3 px-3 font-medium">On the store</th>
                  <th className="py-3 pl-3 pr-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="block md:table-row-group divide-y divide-line">
                {visible.map((product) => {
                  const photo = cover(product);
                  const hasRating = Number(product.reviewCount) > 0 && Number(product.rating) > 0;
                  const extra = quickId === product.id || healthId === product.id;
                  return (
                    <React.Fragment key={product.id}>
                      <tr className={`grid grid-cols-[28px_72px_minmax(0,1fr)] gap-x-3 gap-y-2.5 p-4 md:p-0 md:table-row hover:bg-sunken transition-colors ${selected.has(product.id) ? 'bg-brand-wash' : ''} ${extra ? 'md:[&>td]:border-b-0' : ''}`}>
                        <td className="row-span-1 md:table-cell md:py-3 md:pl-4 md:pr-1 align-middle pt-1">{selectBox(product)}</td>

                        {/* 1. Photo, name, SKU, rating and labels */}
                        <td className="contents md:table-cell md:py-3 md:px-3 align-middle">
                          <div className="contents md:flex md:items-center md:gap-3.5">
                            <div className="row-span-5 md:row-auto w-[72px] md:w-14 aspect-[4/5] rounded-[12px] overflow-hidden bg-sunken shrink-0 self-start">
                              {photo ? <img src={getCleanImageUrl(photo, 160)} alt={product.name} loading="lazy" className="w-full h-full object-cover object-top" />
                                : <div className="w-full h-full flex items-center justify-center text-ink-faint"><Package className="w-5 h-5 text-current" aria-hidden="true" /></div>}
                            </div>
                            <div className="min-w-0 col-start-3 md:min-w-[14rem] 2xl:min-w-[20rem]">
                              <p className="text-sm leading-5 font-semibold text-ink md:max-w-xs line-clamp-2">{product.name}</p>
                              <p className="mt-0.5 text-xs text-ink-muted break-all">
                                <span className="text-ink">{product.category}</span> · SKU: <span className="font-mono">{product.sku || product.id}</span>
                              </p>
                              {hasRating && (
                                <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-muted sag-num">
                                  <Star className="w-3.5 h-3.5 fill-current text-star" aria-hidden="true" />
                                  <span className="font-semibold text-ink">{Number(product.rating).toFixed(1)}</span>
                                  <span>({product.reviewCount} {Number(product.reviewCount) === 1 ? 'review' : 'reviews'})</span>
                                </p>
                              )}
                              <div className="mt-0.5">{perfLine(product)}</div>
                              <div className="mt-1.5">{flags(product)}</div>
                            </div>
                          </div>
                        </td>

                        <td className="col-start-3 md:table-cell md:py-3 md:px-3 align-middle md:text-right md:whitespace-nowrap">{priceBlock(product)}</td>
                        <td className="col-start-3 md:table-cell md:py-3 md:px-3 align-middle">{stockStepper(product)}</td>
                        <td className="col-start-3 md:table-cell md:py-3 md:px-3 align-middle">{healthButton(product)}</td>
                        <td className="col-start-3 md:table-cell md:py-3 md:px-3 align-middle">{statusButton(product)}</td>
                        <td className="col-span-3 md:table-cell pt-3 border-t border-line md:border-0 md:py-3 md:pl-3 md:pr-4 md:text-right align-middle">{actions(product)}</td>
                      </tr>
                      {extra && (
                        <tr className={`block md:table-row !border-t-0 ${selected.has(product.id) ? 'bg-brand-wash' : ''}`}>
                          <td colSpan={7} className="block md:table-cell px-4 pb-4 md:pt-0 space-y-2.5">
                            {healthPanel(product)}
                            {quickEditor(product)}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredProducts.length > shown && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + LIST_STEP)} className={ui.outline}>
            Show more <span className="sag-num text-ink-muted">({filteredProducts.length - shown} more)</span>
          </button>
        </div>
      )}

      {/* Other things sold on the store have their own pages */}
      <div className={`${ui.card} flex flex-wrap items-center gap-x-5 gap-y-3`}>
        <div className="min-w-0 flex-1 basis-64">
          <p className={ui.eyebrow}>Not in this list</p>
          <p className="mt-1 flex items-start gap-2 text-sm leading-5 text-ink">
            <Layers className="w-4 h-4 mt-0.5 shrink-0 text-brand" aria-hidden="true" />
            <span>Bags, heels, jewellery and other accessories are managed in Complete the Look</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => openAdminTab('looks')} className={ui.small}>Open Complete the Look</button>
        </div>
      </div>
      </>)}

      {/* The bar for chosen products, progress of a bulk change, and its undo */}
      {view === 'products' && (selected.size > 0 || bulkProgress || undo) && (
        <div id="admin-bulk-bar" role="region" aria-label="Chosen products" className="fixed z-40 left-3 right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:left-auto md:right-6 md:bottom-6 md:w-[min(44rem,calc(100vw-20rem))]">
          <div className="rounded-[22px] bg-ink text-[color:var(--sag-on-gold)] shadow-[var(--sag-shadow-pop)] px-3.5 py-2.5 flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-bottom-3">
            {bulkProgress ? (
              <div className="flex-1 min-w-0 py-1" role="status" aria-live="polite">
                <p className="text-[13.5px] font-semibold sag-num">{bulkProgress.label}… {bulkProgress.done} of {bulkProgress.total}</p>
                <div className="mt-1.5 h-1 rounded-full bg-[color:var(--sag-on-gold)]/25 overflow-hidden">
                  <div className="h-full rounded-full bg-[color:var(--sag-on-gold)] motion-safe:transition-[width] duration-300" style={{ width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }} />
                </div>
              </div>
            ) : selected.size > 0 ? (
              <>
                <p className="text-[13.5px] font-semibold sag-num mr-auto pl-1">{selected.size} chosen</p>
                <button type="button" onClick={() => setSelected(new Set())} className="h-10 px-3 rounded-full text-[13px] font-semibold hover:bg-white/10 cursor-pointer inline-flex items-center gap-1">
                  <X className="w-4 h-4" aria-hidden="true" /> Clear
                </button>
                <button type="button" id="admin-bulk-open" onClick={() => setBulkOpen(true)} className="h-10 px-4 rounded-full bg-surface !text-ink text-[13.5px] font-semibold cursor-pointer">
                  Change chosen
                </button>
              </>
            ) : undo ? (
              <>
                <p className="text-[13.5px] mr-auto pl-1 min-w-0 truncate"><Check className="inline w-4 h-4 mr-1 -mt-0.5" aria-hidden="true" />{undo.label}</p>
                <button type="button" id="admin-bulk-undo" onClick={runUndo} className="h-10 px-4 rounded-full bg-surface !text-ink text-[13.5px] font-semibold cursor-pointer inline-flex items-center gap-1.5">
                  <Undo2 className="w-4 h-4" aria-hidden="true" /> Undo
                </button>
                <button type="button" onClick={() => setUndo(null)} aria-label="Close" className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkSheet
          products={selectedProducts}
          busy={Boolean(bulkProgress)}
          onClose={() => setBulkOpen(false)}
          onApply={(plan, label, reason) => { void applyPlan(plan, label, reason).then(() => setSelected(new Set())); }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className={`fixed inset-0 z-50 ${SCRIM} flex items-end sm:items-center justify-center sm:p-4`}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" className="bg-surface rounded-t-[28px] sm:rounded-[28px] sm:max-w-sm w-full p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 shadow-[var(--sag-shadow-pop)] space-y-4 animate-in fade-in slide-in-from-bottom-5">
            <div className="w-14 h-14 rounded-full bg-danger-tint border border-danger-line text-danger flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-current" />
            </div>
            <div className="text-center space-y-1">
              <h4 id="delete-product-title" className="text-[17px] leading-6 font-semibold text-ink">Delete this product?</h4>
              <p className="text-sm text-ink-muted">It is removed from the catalogue and the store for good. To take it off the store but keep it, archive it instead.</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setDeleteConfirmId(null)} className="sag-btn-outline flex-1 h-12 text-[15px]">Cancel</button>
              <button
                onClick={() => {
                  const target = products.find((p) => p.id === deleteConfirmId);
                  if (target) handleDelete(target.id, target.name);
                }}
                className={`${ui.danger} flex-1 !h-12 text-[15px]`}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
