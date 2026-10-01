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
        eyebrow="Inventory & Catalog"
        title={<>Products <span className="text-[#2A1A26]/45 font-normal">({outfits.length})</span></>}
        icon={<PackageIcon live={false} />}
        description="Women's outfits: prices, stock, badges and what is live on the store."
        actions={<>
        {/* Store-wide low-stock alert level (admin only; a product can set its own in the product form) */}
        <form
          onSubmit={(e) => { e.preventDefault(); void saveThreshold(); }}
          className="flex items-center gap-2 rounded-full border border-[#4B1D3F]/15 bg-[#FBF7F3] pl-4 pr-1 py-1"
        >
          <label htmlFor="low-stock-threshold" className="text-xs font-semibold text-[#4B1D3F] whitespace-nowrap">Low-stock alert at</label>
          <input
            id="low-stock-threshold"
            type="number"
            min={0}
            step={1}
            value={thresholdDraft ?? String(lowStockThreshold)}
            onChange={(e) => setThresholdDraft(e.target.value)}
            className="w-16 h-8 px-2 rounded-full border border-[#4B1D3F]/15 bg-white text-sm text-center text-[#2A1A26] focus:outline-none focus:ring-2 focus:ring-[#4B1D3F]/30"
          />
          <span className="text-xs text-[#2A1A26]/55">pcs</span>
          <button
            type="submit"
            disabled={thresholdDraft === null || savingThreshold || thresholdDraft === String(lowStockThreshold)}
            className="h-8 px-3 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
          >
            {savingThreshold ? 'Saving…' : 'Save'}
          </button>
        </form>

        {/* Prominent + Add Product Button */}
        <button
          id="admin-add-product-btn"
          onClick={openAdminProductNew}
          className="h-11 px-5 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full text-sm font-semibold transition-colors shadow-sm inline-flex items-center gap-2 cursor-pointer"
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
            className={`h-10 px-5 rounded-full text-sm font-semibold flex items-center gap-2 transition cursor-pointer ${
              view === key ? 'bg-[#4B1D3F] text-white' : 'bg-white border border-[#4B1D3F]/15 text-[#4B1D3F] hover:bg-[#F3EEF8]'
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#4B1D3F]/10 bg-[#F3EEF8] px-4 py-3">
        <p className="flex items-center gap-2.5 text-sm text-[#4B1D3F] min-w-0 flex-1 basis-56">
          <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0"><Layers className="w-4 h-4 text-current" aria-hidden="true" /></span>
          <span>Bags, heels, jewellery and other accessories are managed in Complete the Look</span>
        </p>
        <button
          type="button"
          onClick={() => openAdminTab('looks')}
          className="h-9 px-4 rounded-full border border-[#4B1D3F]/20 bg-white text-xs font-semibold text-[#4B1D3F] hover:bg-[#E6DDF0] transition-colors cursor-pointer"
        >
          Open Complete the Look
        </button>
      </div>

      {/* Kids wear and toys are their own sections */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#4B1D3F]/10 bg-[#F3EEF8] px-4 py-3">
        <p className="flex items-center gap-2.5 text-sm text-[#4B1D3F] min-w-0 flex-1 basis-56">
          <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0"><Baby className="w-4 h-4 text-current" aria-hidden="true" /></span>
          <span>Kids wear and toys are managed in Kids Wear and Toys</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openAdminTab('kids')}
            className="h-9 px-4 rounded-full border border-[#4B1D3F]/20 bg-white text-xs font-semibold text-[#4B1D3F] hover:bg-[#E6DDF0] transition-colors cursor-pointer"
          >
            Open Kids Wear
          </button>
          <button
            type="button"
            onClick={() => openAdminTab('toys')}
            className="h-9 px-4 rounded-full border border-[#4B1D3F]/20 bg-white text-xs font-semibold text-[#4B1D3F] hover:bg-[#E6DDF0] transition-colors cursor-pointer"
          >
            Open Toys
          </button>
        </div>
      </div>
      </div>

      {/* Status tabs */}
      <div role="tablist" aria-label="Filter by status" className="flex flex-nowrap gap-1.5 p-1.5 rounded-full bg-white border border-[#4B1D3F]/10 w-fit max-w-full overflow-x-auto sag-scroll-x">
        {(['all', 'published', 'draft', 'archived'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={statusTab === tab}
            onClick={() => setStatusTab(tab)}
            className={`h-9 px-4 shrink-0 whitespace-nowrap rounded-full text-sm font-semibold transition-colors cursor-pointer inline-flex items-center ${
              statusTab === tab ? 'bg-[#4B1D3F] text-white' : 'text-[#4B1D3F] hover:bg-[#F3EEF8]'
            }`}
          >
            <span className="capitalize">{tab}</span>
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] ${statusTab === tab ? 'bg-white/20' : 'bg-[#F3EEF8]'}`}>{statusCount(tab)}</span>
          </button>
        ))}
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3">

        {/* Search */}
        <div className="sm:col-span-12 lg:col-span-5 relative">
          <input
            type="text"
            placeholder="Search by product name, SKU, category, or fabric..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 border border-[#4B1D3F]/15 rounded-full text-base sm:text-sm bg-[#FBF7F3] focus:bg-white focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 text-[#2A1A26] placeholder:text-[#2A1A26]/45"
          />
          <Search className="w-4 h-4 text-[#4B1D3F]/60 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Product type filter */}
        <div className="sm:col-span-4 lg:col-span-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            aria-label="Filter by product type"
            className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-sm bg-white text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 cursor-pointer"
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
            className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-sm bg-white text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 cursor-pointer"
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
            className="w-full h-11 px-4 border border-[#4B1D3F]/15 rounded-full text-sm bg-white text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 cursor-pointer"
          >
            <option value="all">Stock: All Inventory</option>
            <option value="inStock">Stock: In Stock Only</option>
            <option value="outOfStock">Stock: Out of Stock / Low</option>
          </select>
        </div>

      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] overflow-hidden">
        <div className="md:overflow-x-auto">
          <table className="block md:table w-full text-left text-xs border-collapse">
            <thead className="hidden md:table-header-group">
              <tr className="bg-[#FBF7F3] border-b border-[#4B1D3F]/10 text-[11px] text-[#2A1A26]/60 font-semibold uppercase tracking-[0.12em]">
                <th className="py-3 px-3">Image</th>
                <th className="py-3 px-3">Product Name</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Price</th>
                <th className="py-3 px-3">Stock</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group divide-y divide-[#4B1D3F]/10">
              {filteredProducts.length === 0 ? (
                <tr className="block md:table-row">
                  <td colSpan={7} className="block md:table-cell py-14 px-4 text-center">
                    <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-[#F3EEF8] flex items-center justify-center"><PackageIcon className="w-7 h-7" live={false} /></span>
                    <span className="block font-serif text-lg text-[#2A1A26]">No products here yet</span>
                    <span className="block mt-1 text-sm text-[#2A1A26]/60">No products matched your search or filters.</span>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stockQty = Math.max(0, Number(product.stockQuantity ?? 0));
                  const isOutOfStock = !product.inStock || stockQty === 0;
                  const lowStock = isLowStock(product, lowStockThreshold);
                  const status = statusOf(product);

                  return (
                    <tr key={product.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 md:p-0 md:table-row hover:bg-[#FBF7F3] transition-colors">

                      {/* 1. Image */}
                      <td className="row-span-5 md:table-cell md:py-3 md:px-3 align-middle">
                        <div className="w-16 md:w-12 aspect-[4/5] rounded-xl overflow-hidden border border-[#4B1D3F]/10 bg-[#F3EEF8] shrink-0">
                          {product.images[0] && product.images[0].trim() !== "" ? (
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              loading="lazy"
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#4B1D3F]/40"><Package className="w-5 h-5 text-current" aria-hidden="true" /></div>
                          )}
                        </div>
                      </td>

                      {/* 2. Product Name & SKU */}
                      <td className="min-w-0 md:table-cell md:py-3 md:px-3 align-middle">
                        <p className="text-sm font-semibold text-[#2A1A26] md:max-w-xs line-clamp-2 md:truncate">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-[#2A1A26]/50 font-mono">
                          SKU: {product.sku || product.id}
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {setTypeOf(product) && (
                            <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F7E4EA] text-[#8A2E55] border border-[#8A2E55]/15" title="Complete the look shows on this product page">
                              Combo · {setTypeOf(product)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => run(product.id, () => updateProduct(product.id, { isBestSeller: !product.isBestSeller }), `"${product.name}" ${product.isBestSeller ? 'is no longer a bestseller' : 'marked as bestseller'}.`)}
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold h-6 px-2 rounded-full border cursor-pointer transition-colors ${
                              product.isBestSeller
                                ? 'bg-white text-[#2A1A26] border-[#C5A46D]/60'
                                : 'bg-white text-[#2A1A26]/55 border-dashed border-[#4B1D3F]/20 hover:bg-[#F3EEF8] hover:text-[#4B1D3F]'
                            }`}
                            title="Click to toggle Bestseller status"
                          >
                            {product.isBestSeller ? <Star className="w-3 h-3 fill-[#C5A46D] text-[#9C7A45]" aria-hidden="true" /> : <Sparkles className="w-3 h-3 text-current" aria-hidden="true" />}
                            <span>{product.isBestSeller ? 'Bestseller' : 'Mark bestseller'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => run(product.id, () => updateProduct(product.id, { isNewArrival: !product.isNewArrival }), `"${product.name}" new arrival ${product.isNewArrival ? 'removed' : 'set'}.`)}
                            className={`inline-flex items-center text-[11px] font-semibold h-6 px-2 rounded-full border cursor-pointer transition-colors ${
                              product.isNewArrival
                                ? 'bg-[#F3EEF8] text-[#4B1D3F] border-[#4B1D3F]/20'
                                : 'bg-white text-[#2A1A26]/55 border-dashed border-[#4B1D3F]/20 hover:bg-[#F3EEF8] hover:text-[#4B1D3F]'
                            }`}
                            title="Click to toggle New Arrival status"
                          >
                            {product.isNewArrival ? 'New arrival' : '+ New arrival'}
                          </button>
                        </div>
                      </td>

                      {/* 3. Category */}
                      <td className="md:table-cell md:py-3 md:px-3 align-middle">
                        <span className="inline-flex items-center h-6 px-2.5 bg-[#F3EEF8] text-[#4B1D3F] rounded-full font-medium text-[11px]">
                          {product.category}
                        </span>
                      </td>

                      {/* 4. Price */}
                      <td className="flex items-baseline gap-2 md:table-cell md:py-3 md:px-3 align-middle">
                        <p className="font-semibold text-[#2A1A26] text-sm">
                          ₹{product.price.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[11px] text-[#2A1A26]/50 line-through">
                          ₹{product.originalPrice.toLocaleString('en-IN')}
                        </p>
                      </td>

                      {/* 5. Stock */}
                      <td className="flex items-center gap-2 md:table-cell md:py-3 md:px-3 align-middle">
                        <span className="md:hidden text-[11px] font-semibold uppercase tracking-wider text-[#2A1A26]/50">Stock</span>
                        <div className="inline-flex items-center gap-1 rounded-full border border-[#4B1D3F]/15 bg-white p-0.5">
                          <button
                            onClick={() => run(product.id, () => adjustStock(product.id, -1), `Stock of "${product.name}" reduced by 1.`)}
                            disabled={busyId === product.id || stockQty <= 0}
                            aria-label={`Decrease stock of ${product.name}`}
                            className="w-7 h-7 rounded-full hover:bg-[#F3EEF8] text-[#4B1D3F] font-semibold disabled:opacity-40 cursor-pointer"
                          >
                            -
                          </button>
                          <span className={`min-w-7 text-center text-sm font-semibold tabular-nums ${
                            isOutOfStock
                              ? 'text-rose-700 font-bold'
                              : lowStock
                              ? 'text-[#8A2E55] font-bold'
                              : 'text-[#2A1A26]/80'
                          }`} title={lowStock ? `Low stock (alert at ${lowStockLevelFor(product, lowStockThreshold)})` : undefined}>
                            {stockQty}
                          </span>
                          <button
                            onClick={() => run(product.id, () => adjustStock(product.id, 1), `Stock of "${product.name}" increased by 1.`)}
                            disabled={busyId === product.id}
                            aria-label={`Increase stock of ${product.name}`}
                            className="w-7 h-7 rounded-full hover:bg-[#F3EEF8] text-[#4B1D3F] font-semibold disabled:opacity-40 cursor-pointer"
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
                          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide cursor-pointer disabled:opacity-50 ${
                            status === 'published'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : status === 'archived'
                              ? 'bg-[#F3EEF8] text-[#4B1D3F] border border-[#4B1D3F]/15'
                              : 'bg-[#F7E4EA] text-[#8A2E55]'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${status === 'published' ? 'bg-emerald-600' : status === 'archived' ? 'bg-[#4B1D3F]/50' : 'bg-[#8A2E55]'}`} aria-hidden="true" />
                          {status === 'published' ? 'Published' : status === 'archived' ? 'Archived' : 'Draft'}
                        </button>
                      </td>

                      {/* 7. Actions: Edit, Delete, Duplicate */}
                      <td className="col-span-2 md:table-cell pt-2 mt-1 border-t border-[#4B1D3F]/10 md:border-0 md:mt-0 md:py-3 md:px-3 md:text-right align-middle">
                        <div className="flex items-center justify-between md:justify-end gap-1 md:gap-0">

                          {/* View on Store */}
                          <button
                            id={`view-store-${product.id}`}
                            onClick={() => {
                              navigateToProduct(product.id);
                              navigate(`/product/${product.id}`);
                            }}
                            className="p-1.5 text-[#2A1A26]/70 hover:text-emerald-700 hover:bg-emerald-50 rounded-full transition-colors cursor-pointer w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center"
                            title="View in Storefront"
                          >
                            <Eye className="w-4 h-4 text-current" />
                          </button>

                          {/* Edit */}
                          <button
                            id={`edit-prod-${product.id}`}
                            onClick={() => openAdminProductEdit(product.id)}
                            className="p-1.5 text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8] rounded-full transition-colors cursor-pointer w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center"
                            title="Edit product"
                          >
                            <Edit3 className="w-4 h-4 text-current" />
                          </button>

                          {/* Duplicate */}
                          <button
                            id={`dup-prod-${product.id}`}
                            onClick={() => handleDuplicate(product.id, product.name)}
                            className="p-1.5 text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8] rounded-full transition-colors cursor-pointer w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center"
                            title="Duplicate product"
                          >
                            <Copy className="w-4 h-4 text-current" />
                          </button>

                          {/* Archive / restore (archived products stay hidden and are never sold) */}
                          {status === 'archived' ? (
                            <button
                              type="button"
                              onClick={() => run(product.id, () => updateProduct(product.id, { status: 'draft', hidden: true }), `"${product.name}" restored as a draft.`)}
                              disabled={busyId === product.id}
                              className="p-1.5 text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8] rounded-full transition-colors cursor-pointer w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center disabled:opacity-50"
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
                              className="p-1.5 text-[#2A1A26]/70 hover:text-[#4B1D3F] hover:bg-[#F3EEF8] rounded-full transition-colors cursor-pointer w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center disabled:opacity-50"
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
                            className="p-1.5 text-[#2A1A26]/70 hover:text-rose-700 hover:bg-rose-50 rounded-full transition-colors cursor-pointer w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center"
                            title="Delete product"
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
        <div className="fixed inset-0 z-50 bg-[#2A1A26]/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl space-y-4 border border-[#4B1D3F]/10 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-current" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="font-serif text-2xl font-semibold text-[#2A1A26]">Delete product?</h4>
              <p className="text-sm text-[#2A1A26]/65">
                This will permanently remove the item from catalog and customer storefront.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 h-11 rounded-full border border-[#4B1D3F]/20 text-sm font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const target = products.find((p) => p.id === deleteConfirmId);
                  if (target) handleDelete(target.id, target.name);
                }}
                className="flex-1 h-11 rounded-full bg-rose-700 text-white text-sm font-semibold hover:bg-rose-800 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
