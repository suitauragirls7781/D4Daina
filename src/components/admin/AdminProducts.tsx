import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useProducts } from '../../context/ProductContext';
import { useShop } from '../../context/ShopContext';
import { useRouter } from '../../context/RouterContext';
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit3,
  Copy,
  Trash2,
  Check,
  X,
  Sparkles,
  Tag,
  Layers,
  Eye,
  AlertCircle,
  ArrowUpDown,
  Star,
  Baby,
  Archive,
  ArchiveRestore,
  History
} from 'lucide-react';
import { Product, ProductCategory } from '../../types';
import { isLowStock, lowStockLevelFor } from '../../utils/inventory';
import { AdminStockHistory } from './AdminStockHistory';
import { PackageIcon } from '../StoreIcons';
import { AdminPageHeader } from './kidsToysShared';

type StatusTab = 'all' | 'published' | 'draft' | 'archived';
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
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
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
  const [filterStock, setFilterStock] = useState<'all' | 'inStock' | 'outOfStock'>('all');
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
      matchesStock = !product.inStock || (product.stockQuantity !== undefined && product.stockQuantity === 0);
    }

    const matchesType = filterType === 'all' || (filterType === 'combos') === Boolean(setTypeOf(product));
    const matchesStatus = statusTab === 'all' || statusOf(product) === statusTab;

    return matchesSearch && matchesCategory && matchesStock && matchesType && matchesStatus;
  });
  const statusCount = (tab: StatusTab) => (tab === 'all' ? outfits.length : outfits.filter((p) => statusOf(p) === tab).length);

  return (
    <div id="admin-products-page" className="space-y-6">

      {/* Header Bar */}
      <AdminPageHeader
        eyebrow="Catalogue"
        title={<>Products <span className="text-ink-faint font-normal">({outfits.length})</span></>}
        icon={<PackageIcon live={false} />}
        description="Women's outfits: prices, stock, badges and what is live on the store."
        actions={<>
        {/* Store-wide low-stock alert level (admin only; a product can set its own in the product form) */}
        <form
          onSubmit={(e) => { e.preventDefault(); void saveThreshold(); }}
          className="w-full sm:w-auto flex items-center gap-2 rounded-xl border border-line bg-page pl-3.5 pr-1.5 py-1.5"
        >
          <label htmlFor="low-stock-threshold" className="text-[13px] font-semibold text-ink whitespace-nowrap">Low-stock alert at</label>
          <input
            id="low-stock-threshold"
            type="number"
            min={0}
            step={1}
            value={thresholdDraft ?? String(lowStockThreshold)}
            onChange={(e) => setThresholdDraft(e.target.value)}
            inputMode="numeric"
            className="sag-input sag-num w-16 h-11 px-2 text-center"
          />
          <span className="text-[13px] text-ink-muted mr-auto">pcs</span>
          <button
            type="submit"
            disabled={thresholdDraft === null || savingThreshold || thresholdDraft === String(lowStockThreshold)}
            className="sag-btn-outline h-11 px-4 text-sm"
          >
            {savingThreshold ? 'Saving…' : 'Save'}
          </button>
        </form>

        {/* Prominent + Add Product Button */}
        <button
          id="admin-add-product-btn"
          onClick={openAdminProductNew}
          className="sag-btn-primary h-12 px-5 text-[15px] gap-2 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 text-current" />
          <span>Add product</span>
        </button>
        </>}
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
            className={`h-11 px-5 rounded-xl text-sm font-semibold flex items-center gap-2 transition cursor-pointer ${
              view === key ? 'bg-ink border border-ink text-white' : 'bg-white border border-control text-ink hover:bg-sunken'
            }`}
          >
            <Icon className="w-4 h-4 text-current" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {view === 'history' ? <AdminStockHistory /> : (<>

      {/* Accessories are their own section */}
      <div className="grid gap-3 lg:grid-cols-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
        <p className="flex items-center gap-2.5 text-sm text-ink min-w-0 flex-1 basis-56">
          <span className="w-9 h-9 rounded-xl bg-sunken flex items-center justify-center shrink-0"><Layers className="w-4 h-4 text-current" aria-hidden="true" /></span>
          <span>Bags, heels, jewellery and other accessories are managed in Complete the Look</span>
        </p>
        <button
          type="button"
          onClick={() => openAdminTab('looks')}
          className="sag-btn-outline h-11 px-4 text-sm"
        >
          Open Complete the Look
        </button>
      </div>

      {/* Kids wear and toys are their own sections */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3">
        <p className="flex items-center gap-2.5 text-sm text-ink min-w-0 flex-1 basis-56">
          <span className="w-9 h-9 rounded-xl bg-sunken flex items-center justify-center shrink-0"><Baby className="w-4 h-4 text-current" aria-hidden="true" /></span>
          <span>Kids wear and toys are managed in Kids Wear and Toys</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openAdminTab('kids')}
            className="sag-btn-outline h-11 px-4 text-sm"
          >
            Open Kids Wear
          </button>
          <button
            type="button"
            onClick={() => openAdminTab('toys')}
            className="sag-btn-outline h-11 px-4 text-sm"
          >
            Open Toys
          </button>
        </div>
      </div>
      </div>

      {/* Status tabs */}
      <div role="tablist" aria-label="Filter by status" className="flex flex-nowrap gap-1 p-1 rounded-xl bg-white border border-line w-fit max-w-full overflow-x-auto sag-scroll-x">
        {(['all', 'published', 'draft', 'archived'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={statusTab === tab}
            onClick={() => setStatusTab(tab)}
            className={`h-11 px-4 shrink-0 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors cursor-pointer inline-flex items-center ${
              statusTab === tab ? 'bg-ink text-white' : 'text-ink hover:bg-sunken'
            }`}
          >
            <span className="capitalize">{tab}</span>
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[11px] ${statusTab === tab ? 'bg-white/20' : 'bg-sunken'}`}>{statusCount(tab)}</span>
          </button>
        ))}
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-line grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3">

        {/* Search */}
        <div className="sm:col-span-12 lg:col-span-5 relative">
          <input
            type="text"
            placeholder="Search name, SKU, category or fabric"
            aria-label="Search products"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sag-input pl-10 pr-4"
          />
          <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
        </div>

        {/* Product type filter */}
        <div className="sm:col-span-4 lg:col-span-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            aria-label="Filter by product type"
            className="sag-input"
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
            className="sag-input"
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
            onChange={(e) => setFilterStock(e.target.value as any)}
            aria-label="Filter by stock"
            className="sag-input"
          >
            <option value="all">Stock: All</option>
            <option value="inStock">Stock: In stock only</option>
            <option value="outOfStock">Stock: Sold out</option>
          </select>
        </div>

      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-line overflow-hidden">
        <div className="md:overflow-x-auto">
          <table className="block md:table w-full text-left text-xs border-collapse">
            <thead className="hidden md:table-header-group">
              <tr className="bg-page border-b border-line text-xs text-ink-muted font-semibold">
                <th className="py-3 px-3">Photo</th>
                <th className="py-3 px-3">Product</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Price</th>
                <th className="py-3 px-3">Stock</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group divide-y divide-line">
              {filteredProducts.length === 0 ? (
                <tr className="block md:table-row">
                  <td colSpan={7} className="block md:table-cell py-14 px-4 text-center">
                    <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-sunken flex items-center justify-center"><PackageIcon className="w-7 h-7" live={false} /></span>
                    <span className="block text-base font-semibold text-ink">No products match</span>
                    <span className="block mt-1 text-sm text-ink-muted">Nothing fits this search or these filters. Clear them to see every product.</span>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stockQty = Math.max(0, Number(product.stockQuantity ?? 0));
                  const isOutOfStock = !product.inStock || stockQty === 0;
                  const lowStock = isLowStock(product, lowStockThreshold);
                  const status = statusOf(product);

                  return (
                    <tr key={product.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 md:p-0 md:table-row hover:bg-page transition-colors">

                      {/* 1. Image */}
                      <td className="row-span-5 md:table-cell md:py-3 md:px-3 align-middle">
                        <div className="w-16 md:w-12 aspect-[4/5] rounded-xl overflow-hidden border border-line bg-sunken shrink-0">
                          {product.images[0] && product.images[0].trim() !== "" ? (
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              loading="lazy"
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-ink-faint"><Package className="w-5 h-5 text-current" aria-hidden="true" /></div>
                          )}
                        </div>
                      </td>

                      {/* 2. Product Name & SKU */}
                      <td className="min-w-0 md:table-cell md:py-3 md:px-3 align-middle">
                        <p className="text-sm font-semibold text-ink md:max-w-xs line-clamp-2 md:truncate">
                          {product.name}
                        </p>
                        <p className="text-xs text-ink-muted font-mono break-all">
                          SKU: {product.sku || product.id}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {setTypeOf(product) && (
                            <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md bg-sale-tint text-sale border border-sale-line" title="Complete the look shows on this product page">
                              Combo · {setTypeOf(product)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => run(product.id, () => updateProduct(product.id, { isBestSeller: !product.isBestSeller }), `"${product.name}" ${product.isBestSeller ? 'is no longer a bestseller' : 'marked as bestseller'}.`)}
                            aria-pressed={Boolean(product.isBestSeller)}
                            className={`inline-flex items-center gap-1 text-[13px] md:text-xs font-semibold h-11 md:h-8 px-3 md:px-2 rounded-[10px] border cursor-pointer transition-colors ${
                              product.isBestSeller
                                ? 'bg-accent-tint text-accent border-accent-tint'
                                : 'bg-white text-ink-muted border-dashed border-control hover:bg-sunken hover:text-ink'
                            }`}
                            title="Click to toggle Bestseller status"
                          >
                            {product.isBestSeller ? <Star className="w-3.5 h-3.5 fill-current text-current" aria-hidden="true" /> : <Sparkles className="w-3 h-3 text-current" aria-hidden="true" />}
                            <span>{product.isBestSeller ? 'Bestseller' : 'Mark bestseller'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => run(product.id, () => updateProduct(product.id, { isNewArrival: !product.isNewArrival }), `"${product.name}" new arrival ${product.isNewArrival ? 'removed' : 'set'}.`)}
                            aria-pressed={Boolean(product.isNewArrival)}
                            className={`inline-flex items-center text-[13px] md:text-xs font-semibold h-11 md:h-8 px-3 md:px-2 rounded-[10px] border cursor-pointer transition-colors ${
                              product.isNewArrival
                                ? 'bg-sunken text-ink border-line'
                                : 'bg-white text-ink-muted border-dashed border-control hover:bg-sunken hover:text-ink'
                            }`}
                            title="Click to toggle New Arrival status"
                          >
                            {product.isNewArrival ? 'New arrival' : '+ New arrival'}
                          </button>
                        </div>
                      </td>

                      {/* 3. Category */}
                      <td className="md:table-cell md:py-3 md:px-3 align-middle">
                        <span className="inline-flex items-center h-6 px-2.5 bg-sunken text-ink rounded-md font-medium text-[11px]">
                          {product.category}
                        </span>
                      </td>

                      {/* 4. Price */}
                      <td className="flex items-baseline gap-2 md:table-cell md:py-3 md:px-3 align-middle">
                        <p className="font-bold text-ink text-base md:text-sm sag-num">
                          ₹{product.price.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[13px] text-ink-faint line-through sag-num">
                          ₹{product.originalPrice.toLocaleString('en-IN')}
                        </p>
                      </td>

                      {/* 5. Stock */}
                      <td className="flex items-center gap-2 md:table-cell md:py-3 md:px-3 align-middle">
                        <span className="md:hidden text-xs font-semibold text-ink-faint">Stock</span>
                        <div className="inline-flex items-center gap-1 rounded-xl border border-control bg-white p-0.5">
                          <button
                            onClick={() => run(product.id, () => adjustStock(product.id, -1), `Stock of "${product.name}" reduced by 1.`)}
                            disabled={busyId === product.id || stockQty <= 0}
                            aria-label={`Decrease stock of ${product.name}`}
                            className="w-11 h-11 md:w-8 md:h-8 rounded-lg hover:bg-sunken text-ink text-base font-semibold disabled:opacity-40 cursor-pointer"
                          >
                            -
                          </button>
                          <span className={`min-w-8 text-center text-sm font-semibold tabular-nums ${
                            isOutOfStock
                              ? 'text-danger font-bold'
                              : lowStock
                              ? 'text-sale font-bold'
                              : 'text-ink-muted'
                          }`} title={lowStock ? `Low stock (alert at ${lowStockLevelFor(product, lowStockThreshold)})` : undefined}>
                            {stockQty}
                          </span>
                          <button
                            onClick={() => run(product.id, () => adjustStock(product.id, 1), `Stock of "${product.name}" increased by 1.`)}
                            disabled={busyId === product.id}
                            aria-label={`Increase stock of ${product.name}`}
                            className="w-11 h-11 md:w-8 md:h-8 rounded-lg hover:bg-sunken text-ink text-base font-semibold disabled:opacity-40 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* 6. Status */}
                      <td className="md:table-cell md:py-3 md:px-3 align-middle">
                        <button
                          onClick={() => run(product.id, () => toggleProductStatus(product.id), product.hidden ? `"${product.name}" is now live on the store.` : `"${product.name}" is now a draft (hidden from the store).`)}
                          disabled={busyId === product.id}
                          aria-pressed={!product.hidden}
                          title={product.hidden ? 'Click to publish on the store' : 'Click to make it a draft (hidden)'}
                          className={`inline-flex items-center gap-1.5 h-11 md:h-8 px-3 md:px-2.5 rounded-[10px] text-[13px] md:text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                            status === 'published'
                              ? 'bg-ok-tint text-ok border border-ok-line'
                              : status === 'archived'
                              ? 'bg-sunken text-ink border border-line'
                              : 'bg-sale-tint text-sale border border-sale-line'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${status === 'published' ? 'bg-ok' : status === 'archived' ? 'bg-ink/50' : 'bg-sale'}`} aria-hidden="true" />
                          {status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Draft'}
                        </button>
                      </td>

                      {/* 7. Actions: Edit, Delete, Duplicate */}
                      <td className="col-span-2 md:table-cell pt-2 mt-1 border-t border-line md:border-0 md:mt-0 md:py-3 md:px-3 md:text-right align-middle">
                        <div className="flex items-center justify-between md:justify-end gap-1 md:gap-0">

                          {/* View on Store */}
                          <button
                            id={`view-store-${product.id}`}
                            onClick={() => {
                              navigateToProduct(product.id);
                              navigate(`/product/${product.id}`);
                            }}
                            className="p-1.5 text-ink-muted hover:text-ok hover:bg-ok-tint rounded-full transition-colors cursor-pointer w-11 h-11 inline-flex items-center justify-center"
                            title="View on the store"
                            aria-label={`View ${product.name} on the store`}
                          >
                            <Eye className="w-4 h-4 text-current" />
                          </button>

                          {/* Edit */}
                          <button
                            id={`edit-prod-${product.id}`}
                            onClick={() => openAdminProductEdit(product.id)}
                            className="p-1.5 text-ink-muted hover:text-ink hover:bg-sunken rounded-full transition-colors cursor-pointer w-11 h-11 inline-flex items-center justify-center"
                            title="Edit product"
                            aria-label={`Edit ${product.name}`}
                          >
                            <Edit3 className="w-4 h-4 text-current" />
                          </button>

                          {/* Duplicate */}
                          <button
                            id={`dup-prod-${product.id}`}
                            onClick={() => handleDuplicate(product.id, product.name)}
                            className="p-1.5 text-ink-muted hover:text-ink hover:bg-sunken rounded-full transition-colors cursor-pointer w-11 h-11 inline-flex items-center justify-center"
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
                              className="p-1.5 text-ink-muted hover:text-ink hover:bg-sunken rounded-full transition-colors cursor-pointer w-11 h-11 inline-flex items-center justify-center disabled:opacity-50"
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
                              className="p-1.5 text-ink-muted hover:text-ink hover:bg-sunken rounded-full transition-colors cursor-pointer w-11 h-11 inline-flex items-center justify-center disabled:opacity-50"
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
                            className="p-1.5 text-ink-muted hover:text-danger hover:bg-danger-tint rounded-full transition-colors cursor-pointer w-11 h-11 inline-flex items-center justify-center"
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
      </>)}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center sm:p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" className="bg-white rounded-t-[20px] sm:rounded-2xl sm:max-w-sm w-full p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6 shadow-[var(--sag-shadow-pop)] space-y-4 animate-in fade-in slide-in-from-bottom-5">
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
                className="flex-1 h-12 rounded-xl bg-danger text-white text-[15px] font-semibold hover:bg-danger/90 cursor-pointer"
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
