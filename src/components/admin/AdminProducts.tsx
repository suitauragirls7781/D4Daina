import React, { useState } from 'react';
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
  Baby,
  Archive,
  ArchiveRestore,
  History
} from 'lucide-react';
import { Product } from '../../types';
import { isLowStock, lowStockLevelFor } from '../../utils/inventory';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { AdminStockHistory } from './AdminStockHistory';
import { PackageIcon } from '../StoreIcons';
import { AdminPageHeader, EmptyState, SCRIM, StatRow, StatTile, tone, ui } from './kidsToysShared';

type StatusTab = 'all' | 'published' | 'draft' | 'archived';
// 'hidden' = drafts and archived together (the "Drafts / hidden" tile); it has no tab of its own
type StatusFilter = StatusTab | 'hidden';
type StockFilter = 'all' | 'inStock' | 'outOfStock' | 'low';
// Same rule as ProductContext: hidden decides visibility; an archived product is a hidden one put away.
const statusOf = (product: Product): Exclude<StatusTab, 'all'> =>
  !product.hidden ? 'published' : product.status === 'archived' ? 'archived' : 'draft';
import { isAccessory, setTypeOf } from '../../utils/looks';
import { departmentOf } from '../../utils/kids';

// Outfit categories only: accessories live in Complete the Look, never in this list.
const ALL_CATEGORIES: string[] = [
  'All',
  'Suits',
  'Kurtis',
  'Dresses',
  'Anarkali',
  'Dupatta Sets',
  'Co-ord Sets',
  'Festive Wear',
  'Party Wear'
];

const STATUS_LABEL: Record<StatusTab, string> = { all: 'All', published: 'Published', draft: 'Draft', archived: 'Archived' };
// Sold out the same way the stock filter reads it
const isSoldOut = (product: Product) => !product.inStock || (product.stockQuantity !== undefined && product.stockQuantity === 0);

const ICON_BTN = 'w-11 h-11 md:w-9 md:h-9 shrink-0 rounded-full inline-flex items-center justify-center text-ink-muted hover:text-ink hover:bg-sunken-deep transition-colors cursor-pointer disabled:opacity-50';
// A small on / off label under the product name (bestseller, new arrival)
const flagChip = (on: boolean) => `inline-flex items-center gap-1 h-11 md:h-7 px-3 md:px-2.5 rounded-full border text-[13px] md:text-xs font-medium cursor-pointer transition-colors ${
  on ? 'bg-brand-wash border-brand-line text-brand' : 'border-dashed border-line text-ink-muted hover:text-ink hover:bg-sunken'
}`;

export const AdminProducts: React.FC = () => {
  const {
    products = [],
    deleteProduct,
    duplicateProduct,
    toggleProductStatus,
    updateProduct,
    lowStockThreshold,
    updateLowStockThreshold
  } = useAdmin();
  const [view, setView] = useState<'products' | 'history'>('products');
  const [statusTab, setStatusTab] = useState<StatusFilter>('all');
  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null);
  const [savingThreshold, setSavingThreshold] = useState(false);
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
  const { showToast, navigateToProduct } = useShop();
  const { adjustStock } = useProducts();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Every admin action waits for the database and reports the real outcome.
  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    try {
      await action();
      showToast(success, 'success');
    } catch (err: any) {
      showToast(err?.message || 'The change could not be saved. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };
  const { navigate, openAdminTab, openAdminProductNew, openAdminProductEdit } = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [filterStock, setFilterStock] = useState<StockFilter>('all');
  // Accessories (bags, heels, jewellery...) are a separate section, managed only in Complete the Look, and
  // kids wear and toys are managed in Kids Wear and Toys: none of them is listed, counted or filtered here.
  const outfits = products.filter((product) => !isAccessory(product) && departmentOf(product) === 'women');
  const [filterType, setFilterType] = useState<'all' | 'combos' | 'singles'>('all');
  const comboCount = outfits.filter((product) => setTypeOf(product)).length;
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Duplicate handler
  const handleDuplicate = (id: string, name: string) =>
    run(id, () => duplicateProduct(id), `Created a hidden copy of "${name}". Edit it, then publish.`);

  // Delete handler
  const handleDelete = (id: string, name: string) => {
    setDeleteConfirmId(null);
    return run(id, () => deleteProduct(id), `Deleted "${name}".`);
  };

  const isLowOnly = (product: Product) => !isSoldOut(product) && isLowStock(product, lowStockThreshold);

  const filteredProducts = outfits.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (product.sku && product.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (product.fabric && product.fabric.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;

    let matchesStock = true;
    if (filterStock === 'inStock') {
      matchesStock = product.inStock && (product.stockQuantity === undefined || product.stockQuantity > 0);
    } else if (filterStock === 'outOfStock') {
      matchesStock = isSoldOut(product);
    } else if (filterStock === 'low') {
      matchesStock = isLowOnly(product);
    }

    const matchesType = filterType === 'all' || (filterType === 'combos') === Boolean(setTypeOf(product));
    const matchesStatus = statusTab === 'all' || (statusTab === 'hidden' ? Boolean(product.hidden) : statusOf(product) === statusTab);

    return matchesSearch && matchesCategory && matchesStock && matchesType && matchesStatus;
  });
  const statusCount = (tab: StatusTab) => (tab === 'all' ? outfits.length : outfits.filter((p) => statusOf(p) === tab).length);

  // The page's key numbers, all counted from the live catalogue
  const draftCount = statusCount('draft');
  const archivedCount = statusCount('archived');
  const soldOutCount = outfits.filter(isSoldOut).length;
  const lowCount = outfits.filter(isLowOnly).length;
  const filtersOn = Boolean(searchQuery.trim()) || selectedCategory !== 'All' || filterStock !== 'all' || filterType !== 'all' || statusTab !== 'all';
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('All');
    setFilterStock('all');
    setFilterType('all');
    setStatusTab('all');
  };
  // A tile shows only its own group: every other filter is cleared so the list matches the number on the tile
  const showOnly = (status: StatusFilter, stock: StockFilter) => {
    clearFilters();
    setStatusTab(status);
    setFilterStock(stock);
  };
  const onlyFilter = (status: StatusFilter, stock: StockFilter) =>
    statusTab === status && filterStock === stock && !searchQuery.trim() && selectedCategory === 'All' && filterType === 'all';

  return (
    <div id="admin-products-page" className="space-y-5 sm:space-y-6">

      {/* 1. Title, what the page is for, and the one main action */}
      <AdminPageHeader
        eyebrow="Catalogue"
        title="Products"
        icon={<PackageIcon live={false} />}
        description="Every women's outfit in your store: its price, how many pieces are left and whether shoppers can see it."
        actions={
          <button
            id="admin-add-product-btn"
            onClick={openAdminProductNew}
            className="sag-btn-primary h-12 px-6 text-[15px] gap-2 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 text-current" />
            <span>Add product</span>
          </button>
        }
      />

      {/* Products list / stock history */}
      <div role="tablist" aria-label="Products view" className="flex flex-wrap gap-2">
        {([['products', 'Products', Package], ['history', 'Stock history', History]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`${ui.chip(view === key)} px-5`}
          >
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

      {/* 3. Status, search and filters in one panel */}
      <div className={`${ui.card} space-y-3`}>
        <div role="tablist" aria-label="Filter by status" className="flex flex-nowrap gap-2 max-w-full overflow-x-auto sag-scroll-x -mx-1 px-1 pb-0.5">
          {(['all', 'published', 'draft', 'archived'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={statusTab === tab}
              onClick={() => setStatusTab(tab)}
              className={`${ui.chip(statusTab === tab)} shrink-0 whitespace-nowrap`}
            >
              <span>{STATUS_LABEL[tab]}</span>
              <span className={`sag-num font-normal ${statusTab === tab ? 'opacity-70' : 'text-ink-muted'}`}>{statusCount(tab)}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3">
          {/* Search */}
          <div className="sm:col-span-12 lg:col-span-5 relative">
            <input
              type="text"
              placeholder="Search name, SKU, category or fabric"
              aria-label="Search products"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={ui.search}
            />
            <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          </div>

          {/* Product type filter */}
          <div className="sm:col-span-4 lg:col-span-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              aria-label="Filter by product type"
              className={`${ui.select} pl-3.5`}
            >
              <option value="all">Type: All</option>
              <option value="combos">Type: Combo / set ({comboCount})</option>
              <option value="singles">Type: Single outfits</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="sm:col-span-4 lg:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
              className={`${ui.select} pl-3.5`}
            >
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>Category: {cat}</option>
              ))}
            </select>
          </div>

          {/* Stock Filter */}
          <div className="sm:col-span-4 lg:col-span-2">
            <select
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value as StockFilter)}
              aria-label="Filter by stock"
              className={`${ui.select} pl-3.5`}
            >
              <option value="all">Stock: All</option>
              <option value="inStock">Stock: In stock only</option>
              <option value="low">Stock: Low stock</option>
              <option value="outOfStock">Stock: Sold out</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 border-t border-line">
          <p className="text-[13px] leading-[18px] text-ink-muted sag-num" aria-live="polite">
            Showing <span className="font-semibold text-ink">{filteredProducts.length}</span> of {outfits.length} products
            {filtersOn && (
              <button type="button" onClick={clearFilters} className={`ml-3 ${ui.link}`}>Clear filters</button>
            )}
          </p>

          {/* Store-wide low-stock alert level (admin only; a product can set its own in the product form) */}
          <form
            onSubmit={(e) => { e.preventDefault(); void saveThreshold(); }}
            className="w-full sm:w-auto flex items-center gap-2"
          >
            <label htmlFor="low-stock-threshold" className="text-[13px] text-ink-muted whitespace-nowrap">Warn me when stock is at or below</label>
            <input
              id="low-stock-threshold"
              type="number"
              min={0}
              step={1}
              value={thresholdDraft ?? String(lowStockThreshold)}
              onChange={(e) => setThresholdDraft(e.target.value)}
              inputMode="numeric"
              className={`${ui.field} sag-num !w-16 !px-2 text-center`}
            />
            <span className="text-[13px] text-ink-muted mr-auto sm:mr-0">pcs</span>
            <button
              type="submit"
              disabled={thresholdDraft === null || savingThreshold || thresholdDraft === String(lowStockThreshold)}
              className={ui.small}
            >
              {savingThreshold ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>
      </div>

      {/* 4. The products: a table on wide screens, stacked cards on phones */}
      <div className={ui.panel}>
        <div className="md:overflow-x-auto">
          <table className="block md:table w-full text-left text-[13px] border-collapse">
            <thead className="hidden md:table-header-group">
              <tr className={ui.thead}>
                <th className="py-3 pl-4 pr-3 font-medium">Product</th>
                <th className="py-3 px-3 font-medium">Category</th>
                <th className="py-3 px-3 font-medium text-right">Price</th>
                <th className="py-3 px-3 font-medium">Stock</th>
                <th className="py-3 px-3 font-medium">On the store</th>
                <th className="py-3 pl-3 pr-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group divide-y divide-line">
              {filteredProducts.length === 0 ? (
                <tr className="block md:table-row">
                  <td colSpan={6} className="block md:table-cell">
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
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stockQty = Math.max(0, Number(product.stockQuantity ?? 0));
                  const isOutOfStock = !product.inStock || stockQty === 0;
                  const lowStock = isLowStock(product, lowStockThreshold);
                  const status = statusOf(product);
                  const hasMrp = Number(product.originalPrice) > product.price;
                  const off = hasMrp ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : 0;
                  const hasRating = Number(product.reviewCount) > 0 && Number(product.rating) > 0;
                  const cover = product.images?.[0] && product.images[0].trim() !== '' ? product.images[0] : '';

                  return (
                    <tr key={product.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3.5 gap-y-2.5 p-4 md:p-0 md:table-row hover:bg-sunken transition-colors">

                      {/* 1. Photo, name, SKU, rating and labels */}
                      <td className="contents md:table-cell md:py-3 md:pl-4 md:pr-3 align-middle">
                        <div className="contents md:flex md:items-center md:gap-3.5">
                          <div className="row-span-5 md:row-auto w-[72px] md:w-14 aspect-[4/5] rounded-xl overflow-hidden bg-sunken shrink-0 self-start">
                            {cover ? (
                              <img
                                src={getCleanImageUrl(cover, 160)}
                                alt={product.name}
                                loading="lazy"
                                className="w-full h-full object-cover object-top"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-ink-faint"><Package className="w-5 h-5 text-current" aria-hidden="true" /></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm leading-5 font-semibold text-ink md:max-w-xs line-clamp-2">
                              {product.name}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-muted break-all">
                              SKU: <span className="font-mono">{product.sku || product.id}</span>
                            </p>
                            {hasRating && (
                              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-muted sag-num">
                                <Star className="w-3.5 h-3.5 fill-current text-star" aria-hidden="true" />
                                <span className="font-semibold text-ink">{Number(product.rating).toFixed(1)}</span>
                                <span>({product.reviewCount} {Number(product.reviewCount) === 1 ? 'review' : 'reviews'})</span>
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {setTypeOf(product) && (
                                <span className={`${ui.badge} ${tone.warn}`} title="Complete the look shows on this product page">
                                  Combo · {setTypeOf(product)}
                                </span>
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
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Category */}
                      <td className="md:table-cell md:py-3 md:px-3 align-middle">
                        <span className={`${ui.badge} ${tone.muted}`}>
                          {product.category}
                        </span>
                      </td>

                      {/* 3. Price */}
                      <td className="md:table-cell md:py-3 md:px-3 align-middle md:text-right">
                        <p className="flex md:block items-baseline gap-2 flex-wrap">
                          <span className="font-semibold text-ink text-base md:text-[15px] sag-num">
                            ₹{product.price.toLocaleString('en-IN')}
                          </span>
                          {hasMrp && (
                            <span className="md:block text-[13px] text-ink-faint sag-num">
                              MRP <span className="line-through">₹{product.originalPrice.toLocaleString('en-IN')}</span>
                              <span className="ml-1.5 text-sale font-semibold">{off}% off</span>
                            </span>
                          )}
                        </p>
                      </td>

                      {/* 4. Stock */}
                      <td className="md:table-cell md:py-3 md:px-3 align-middle">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-sunken p-0.5">
                            <button
                              onClick={() => run(product.id, () => adjustStock(product.id, -1), `Stock of "${product.name}" reduced by 1.`)}
                              disabled={busyId === product.id || stockQty <= 0}
                              aria-label={`Decrease stock of ${product.name}`}
                              className="w-11 h-11 md:w-8 md:h-8 rounded-full hover:bg-sunken-deep text-ink text-base font-semibold disabled:opacity-40 cursor-pointer"
                            >
                              -
                            </button>
                            <span className={`min-w-8 text-center text-sm font-semibold tabular-nums ${
                              isOutOfStock
                                ? 'text-danger'
                                : lowStock
                                ? 'text-sale'
                                : 'text-ink'
                            }`} title={lowStock ? `Low stock (alert at ${lowStockLevelFor(product, lowStockThreshold)})` : undefined}>
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
                      </td>

                      {/* 5. Status */}
                      <td className="md:table-cell md:py-3 md:px-3 align-middle">
                        <button
                          onClick={() => run(product.id, () => toggleProductStatus(product.id), product.hidden ? `"${product.name}" is now live on the store.` : `"${product.name}" is now a draft (hidden from the store).`)}
                          disabled={busyId === product.id}
                          aria-pressed={!product.hidden}
                          title={product.hidden ? 'Click to publish on the store' : 'Click to make it a draft (hidden)'}
                          className={`inline-flex items-center gap-1.5 h-11 md:h-8 px-3.5 md:px-3 rounded-full border text-[13px] md:text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                            status === 'published'
                              ? 'bg-ok-tint text-ok border-ok-line'
                              : 'bg-sunken text-ink-muted border-line'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${status === 'published' ? 'bg-ok' : 'bg-ink-faint'}`} aria-hidden="true" />
                          {status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Draft'}
                        </button>
                      </td>

                      {/* 6. Actions: Edit first, then view, duplicate, archive and delete */}
                      <td className="col-span-2 md:table-cell pt-3 border-t border-line md:border-0 md:py-3 md:pl-3 md:pr-4 md:text-right align-middle">
                        <div className="flex items-center md:justify-end gap-1">

                          {/* Edit */}
                          <button
                            id={`edit-prod-${product.id}`}
                            onClick={() => openAdminProductEdit(product.id)}
                            className={`${ui.small} !border-brand-line !text-brand mr-auto md:mr-1 px-4`}
                            title="Edit product"
                            aria-label={`Edit ${product.name}`}
                          >
                            <Edit3 className="w-3.5 h-3.5 text-current" /> Edit
                          </button>

                          {/* View on Store */}
                          <button
                            id={`view-store-${product.id}`}
                            onClick={() => {
                              navigateToProduct(product.id);
                              navigate(`/product/${product.id}`);
                            }}
                            className={ICON_BTN}
                            title="View on the store"
                            aria-label={`View ${product.name} on the store`}
                          >
                            <Eye className="w-4 h-4 text-current" />
                          </button>

                          {/* Duplicate */}
                          <button
                            id={`dup-prod-${product.id}`}
                            onClick={() => handleDuplicate(product.id, product.name)}
                            className={ICON_BTN}
                            title="Duplicate product"
                            aria-label={`Duplicate ${product.name}`}
                          >
                            <Copy className="w-4 h-4 text-current" />
                          </button>

                          {/* Archive / restore (archived products stay hidden and are never sold) */}
                          {status === 'archived' ? (
                            <button
                              type="button"
                              onClick={() => run(product.id, () => updateProduct(product.id, { status: 'draft', hidden: true }), `"${product.name}" restored as a draft.`)}
                              disabled={busyId === product.id}
                              className={ICON_BTN}
                              title="Restore as draft"
                              aria-label={`Restore ${product.name} as draft`}
                            >
                              <ArchiveRestore className="w-4 h-4 text-current" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => run(product.id, () => updateProduct(product.id, { status: 'archived', hidden: true }), `"${product.name}" archived and hidden from the store.`)}
                              disabled={busyId === product.id}
                              className={ICON_BTN}
                              title="Archive (hide and put away)"
                              aria-label={`Archive ${product.name}`}
                            >
                              <Archive className="w-4 h-4 text-current" />
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            id={`del-prod-${product.id}`}
                            onClick={() => setDeleteConfirmId(product.id)}
                            className={`${ICON_BTN} !text-danger hover:!bg-danger-tint`}
                            title="Delete product"
                            aria-label={`Delete ${product.name}`}
                          >
                            <Trash2 className="w-4 h-4 text-current" />
                          </button>

                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Other things sold on the store have their own pages */}
      <div className={`${ui.card} flex flex-wrap items-center gap-x-5 gap-y-3`}>
        <div className="min-w-0 flex-1 basis-64">
          <p className={ui.eyebrow}>Not in this list</p>
          <p className="mt-1 flex items-start gap-2 text-sm leading-5 text-ink">
            <Layers className="w-4 h-4 mt-0.5 shrink-0 text-brand" aria-hidden="true" />
            <span>Bags, heels, jewellery and other accessories are managed in Complete the Look</span>
          </p>
          <p className="mt-1 flex items-start gap-2 text-sm leading-5 text-ink">
            <Baby className="w-4 h-4 mt-0.5 shrink-0 text-brand" aria-hidden="true" />
            <span>Kids wear and toys are managed in Kids Wear and Toys</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openAdminTab('looks')}
            className={ui.small}
          >
            Open Complete the Look
          </button>
          <button
            type="button"
            onClick={() => openAdminTab('kids')}
            className={ui.small}
          >
            Open Kids Wear
          </button>
          <button
            type="button"
            onClick={() => openAdminTab('toys')}
            className={ui.small}
          >
            Open Toys
          </button>
        </div>
      </div>
      </>)}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className={`fixed inset-0 z-50 ${SCRIM} flex items-end sm:items-center justify-center sm:p-4`}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" className="bg-surface border border-line rounded-t-[28px] sm:rounded-[28px] sm:max-w-sm w-full p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 shadow-[var(--sag-shadow-pop)] space-y-4 animate-in fade-in slide-in-from-bottom-5">
            <div className="w-14 h-14 rounded-full bg-danger-tint border border-danger-line text-danger flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-current" />
            </div>
            <div className="text-center space-y-1">
              <h4 id="delete-product-title" className="text-[17px] leading-6 font-semibold text-ink">Delete this product?</h4>
              <p className="text-sm text-ink-muted">
                It is removed from the catalogue and the store for good. To take it off the store but keep it, archive it instead.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="sag-btn-outline flex-1 h-12 text-[15px]"
              >
                Cancel
              </button>
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
