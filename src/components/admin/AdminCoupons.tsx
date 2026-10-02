import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import {
  Tag,
  Plus,
  Edit3,
  Trash2,
  Percent,
  IndianRupee,
  Calendar,
  Users,
  X,
  Save,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  CalendarDays,
  FileSpreadsheet
} from 'lucide-react';
import { Coupon } from '../../types';
import { couponRestrictionNotes } from '../../utils/coupons';
import { TagIcon } from '../StoreIcons';
import { AdminPageHeader } from './kidsToysShared';

export const AdminCoupons: React.FC = () => {
  const { coupons = [], addCoupon, updateCoupon, deleteCoupon, toggleCouponStatus, products = [], categories = [] } = useAdmin();
  const [productSearch, setProductSearch] = useState('');
  // Categories the admin can limit a coupon to: every category in the category list or used by a product
  const categoryOptions = [...new Set([
    ...categories.map((c) => String(c.name || '').trim()),
    ...products.map((p) => String(p.category || '').trim()),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const { showToast } = useShop();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'expired' | 'disabled'>('all');

  const [formData, setFormData] = useState<Omit<Coupon, 'id' | 'usageCount'>>({
    code: '',
    discountType: 'percentage',
    discountValue: 15,
    minOrderValue: 999,
    maxDiscount: 500,
    startDate: '2026-08-01',
    expiryDate: '2026-12-31',
    usageLimit: 1000,
    isActive: true,
    perUserLimit: 0,
    allowedCategories: [],
    allowedProductIds: [],
  });

  const todayStr = new Date().toISOString().split('T')[0];

  const checkIfExpired = (coupon: Coupon) => {
    if (!coupon.expiryDate) return false;
    return coupon.expiryDate < todayStr;
  };

  const handleOpenAdd = () => {
    setEditingCouponId(null);
    setFormData({
      code: 'AURA25',
      discountType: 'percentage',
      discountValue: 25,
      minOrderValue: 1499,
      maxDiscount: 750,
      startDate: todayStr,
      expiryDate: '2026-12-31',
      usageLimit: 500,
      isActive: true,
      perUserLimit: 0,
      allowedCategories: [],
      allowedProductIds: [],
    });
    setProductSearch('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (coupon: Coupon) => {
    setEditingCouponId(coupon.id);
    setFormData({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minOrderValue: coupon.minOrderValue,
      maxDiscount: coupon.maxDiscount,
      startDate: coupon.startDate,
      expiryDate: coupon.expiryDate,
      usageLimit: coupon.usageLimit,
      isActive: coupon.isActive,
      perUserLimit: coupon.perUserLimit || 0,
      allowedCategories: coupon.allowedCategories || [],
      allowedProductIds: coupon.allowedProductIds || [],
    });
    setProductSearch('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim()) {
      showToast('Coupon code is required.', 'error');
      return;
    }

    const cleanedCode = formData.code.trim().toUpperCase().replace(/\s+/g, '');

    if (Number(formData.discountValue) <= 0) {
      showToast('Discount value must be more than 0.', 'error');
      return;
    }
    if (formData.discountType === 'percentage' && Number(formData.discountValue) > 90) {
      showToast('Percentage discount cannot be more than 90%.', 'error');
      return;
    }
    const perUserLimit = Math.max(0, Math.floor(Number(formData.perUserLimit) || 0));
    try {
      if (editingCouponId) {
        await updateCoupon(editingCouponId, { ...formData, perUserLimit, code: cleanedCode });
        showToast(`Coupon ${cleanedCode} updated.`, 'success');
      } else {
        await addCoupon({ ...formData, perUserLimit, code: cleanedCode });
        showToast(`Coupon ${cleanedCode} created.`, 'success');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
    }
  };

  const handleDelete = (coupon: Coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
    deleteCoupon(coupon.id)
      .then(() => showToast(`Coupon ${coupon.code} deleted.`, 'info'))
      .catch((err: any) => showToast(err?.message || 'Could not save. Please try again.', 'error'));
  };

  // Filter logic
  const filteredCoupons = coupons.filter(coupon => {
    const isExpired = checkIfExpired(coupon);
    if (filterTab === 'active') {
      return coupon.isActive && !isExpired;
    }
    if (filterTab === 'expired') {
      return isExpired;
    }
    if (filterTab === 'disabled') {
      return !coupon.isActive && !isExpired;
    }
    return true; // 'all'
  });

  return (
    <div id="admin-coupons-page" className="space-y-6">

      {/* Header */}
      <AdminPageHeader
        eyebrow="Offers"
        title="Coupons & promo codes"
        icon={<TagIcon live={false} />}
        description="Checkout discounts with validity dates and usage caps. The server re-checks every coupon before payment."
        actions={
          <button
            onClick={handleOpenAdd}
            className="sag-btn-primary h-12 px-5 text-[15px] gap-2 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 text-current" />
            <span>Create coupon</span>
          </button>
        }
      />

      {/* Filter Tabs */}
      <div role="group" aria-label="Filter coupons" className="flex flex-nowrap gap-1 p-1 rounded-xl bg-white border border-line w-fit max-w-full overflow-x-auto sag-scroll-x">
        {(['all', 'active', 'expired', 'disabled'] as const).map((tab) => {
          const count = coupons.filter(c => {
            const exp = checkIfExpired(c);
            if (tab === 'active') return c.isActive && !exp;
            if (tab === 'expired') return exp;
            if (tab === 'disabled') return !c.isActive && !exp;
            return true;
          }).length;

          return (
            <button
              key={tab}
              type="button"
              aria-pressed={filterTab === tab}
              onClick={() => setFilterTab(tab)}
              className={`h-11 px-4 shrink-0 whitespace-nowrap inline-flex items-center text-sm font-semibold rounded-xl transition-colors cursor-pointer ${
                filterTab === tab
                  ? 'bg-ink text-white'
                  : 'text-ink hover:bg-sunken'
              }`}
            >
              <span className="capitalize">{tab}</span>
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold ${
                filterTab === tab ? 'bg-white/20 text-white' : 'bg-sunken text-ink'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Coupons Grid */}
      {filteredCoupons.length === 0 ? (
        <div className="px-6 py-14 text-center bg-white rounded-2xl border border-dashed border-line space-y-2">
          <span className="mx-auto mb-2 w-14 h-14 rounded-2xl bg-sunken flex items-center justify-center"><TagIcon className="w-7 h-7" live={false} /></span>
          <p className="text-base font-semibold text-ink">No coupons here</p>
          <p className="text-sm text-ink-muted">{filterTab === 'all' ? 'Use Create coupon to add the first one.' : `No ${filterTab} coupons right now.`}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {filteredCoupons.map((coupon) => {
            const isExpired = checkIfExpired(coupon);
            return (
              <div
                key={coupon.id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 flex flex-col justify-between space-y-4 relative ${
                  isExpired
                    ? 'border-danger-line'
                    : 'border-line'
                }`}
              >
                {/* Top Row: Code & Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <span className={`font-mono text-base font-bold tracking-[0.08em] px-3 py-1.5 border border-dashed rounded-[10px] inline-block break-all ${
                      isExpired
                        ? 'text-ink-faint bg-page border-line line-through'
                        : 'text-ink bg-sale-tint border-sale-line'
                    }`}>
                      {coupon.code}
                    </span>
                    <p className="text-base font-semibold text-sale sag-num">
                      {coupon.discountType === 'percentage'
                        ? `${coupon.discountValue}% off${coupon.maxDiscount ? ` (up to ₹${coupon.maxDiscount})` : ''}`
                        : `₹${coupon.discountValue} off`}
                    </p>
                  </div>

                  {isExpired ? (
                    <span className="h-7 px-2.5 inline-flex items-center rounded-md text-xs font-semibold bg-danger-tint text-danger border border-danger-line">
                      Expired
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        toggleCouponStatus(coupon.id)
                          .then(() => showToast(`Coupon ${coupon.code} is now ${!coupon.isActive ? 'active' : 'disabled'}.`, 'info'))
                          .catch((err: any) => showToast(err?.message || 'Could not save. Please try again.', 'error'));
                      }}
                      aria-pressed={coupon.isActive}
                      className={`h-11 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-xl border text-[13px] font-semibold transition-colors cursor-pointer ${
                        coupon.isActive
                          ? 'bg-ok-tint text-ok border-ok-line'
                          : 'bg-sunken text-ink border-line'
                      }`}
                      title="Tap to switch on / off"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${coupon.isActive ? 'bg-ok' : 'bg-ink/50'}`} aria-hidden="true" />
                      {coupon.isActive ? 'Active' : 'Disabled'}
                    </button>
                  )}
                </div>

                {/* Conditions & Thresholds */}
                <div className={`p-3.5 rounded-xl border text-[13px] space-y-2 sag-num ${
                  isExpired
                    ? 'bg-danger-tint border-danger-line text-ink-muted'
                    : 'bg-page border-line text-ink-muted'
                }`}>
                  <div className="flex justify-between">
                    <span>Minimum order</span>
                    <strong className="text-ink">₹{coupon.minOrderValue}</strong>
                  </div>
                  <div className="flex justify-between items-center gap-1">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5 text-ink" />
                      Valid
                    </span>
                    <span className={isExpired ? 'text-danger font-semibold' : ''}>
                      {coupon.startDate} to {coupon.expiryDate}
                    </span>
                  </div>
                  {couponRestrictionNotes(coupon).map((note) => (
                    <div key={note} className="flex justify-between gap-2">
                      <span>Limit</span>
                      <strong className="text-ink text-right">{note}</strong>
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <span>Used</span>
                    <strong className="text-ink">
                      {coupon.usageCount} of {coupon.usageLimit}
                    </strong>
                  </div>
                </div>

                {/* Progress Bar of usage */}
                <div className="space-y-1">
                  <div className="w-full bg-sunken h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isExpired ? 'bg-ink/50' : 'bg-brand'}`}
                      style={{ width: `${Math.min(100, (coupon.usageCount / coupon.usageLimit) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
                  <span className="min-w-0 truncate text-xs text-ink-faint">ID: {coupon.id}</span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(coupon)}
                      className="w-11 h-11 inline-flex items-center justify-center hover:bg-sunken rounded-full text-ink transition-colors cursor-pointer"
                      title="Edit coupon"
                      aria-label={`Edit coupon ${coupon.code}`}
                    >
                      <Edit3 className="w-4 h-4 text-current" />
                    </button>
                    <button
                      onClick={() => handleDelete(coupon)}
                      className="w-11 h-11 inline-flex items-center justify-center hover:bg-danger-tint rounded-full text-danger transition-colors cursor-pointer"
                      title="Delete coupon"
                      aria-label={`Delete coupon ${coupon.code}`}
                    >
                      <Trash2 className="w-4 h-4 text-current" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Coupon Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-ink/50 flex items-end sm:items-center justify-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={editingCouponId ? 'Edit coupon' : 'Create new coupon'} className="bg-white rounded-t-[20px] sm:rounded-2xl sm:max-w-xl w-full max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain p-5 sm:p-7 shadow-[var(--sag-shadow-pop)] space-y-4 animate-in fade-in slide-in-from-bottom-5">

            <div className="sticky top-0 z-10 -mx-5 sm:-mx-7 -mt-5 sm:-mt-7 px-5 sm:px-7 py-3 bg-white flex items-center justify-between border-b border-line">
              <h3 className="text-[17px] leading-6 font-semibold text-ink">
                {editingCouponId ? 'Edit coupon' : 'Create a coupon'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Close" className="w-11 h-11 rounded-full flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
                <X className="w-5 h-5 text-current" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">

              <div>
                <label htmlFor="coupon-code" className="sag-label">Coupon code <span className="text-danger">*</span></label>
                <input
                  id="coupon-code"
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. FIRST15 or AURA20"
                  className="sag-input font-mono uppercase font-bold tracking-wider"
                />
                <p className="mt-1.5 text-[13px] text-ink-muted">Letters and numbers, no spaces. Shoppers type this in the bag.</p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="sag-label">Discount type</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value as any })}
                    className="sag-input"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Flat amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="sag-label">
                    {formData.discountType === 'percentage' ? 'Discount (%)' : 'Discount (₹)'}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: Number(e.target.value) })}
                    className="sag-input font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="sag-label">Minimum order (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.minOrderValue}
                    onChange={(e) => setFormData({ ...formData, minOrderValue: Number(e.target.value) })}
                    className="sag-input"
                  />
                </div>

                <div>
                  <label className="sag-label">Most it can take off (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.maxDiscount || ''}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: Number(e.target.value) || undefined })}
                    placeholder="No cap"
                    className="sag-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="sag-label">Starts on</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="sag-input"
                  />
                </div>

                <div>
                  <label className="sag-label">Ends on</label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="sag-input"
                  />
                </div>
              </div>

              <div>
                <label className="sag-label">Total uses allowed</label>
                <input
                  type="number"
                  min={1}
                  value={formData.usageLimit}
                  onChange={(e) => setFormData({ ...formData, usageLimit: Number(e.target.value) })}
                  className="sag-input"
                />
              </div>

              <div>
                <label className="sag-label">Uses per customer</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={formData.perUserLimit || ''}
                  onChange={(e) => setFormData({ ...formData, perUserLimit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  placeholder="No limit"
                  className="sag-input"
                />
                <p className="mt-1.5 text-[13px] text-ink-muted">Counts paid orders with the same email or mobile number. Leave empty for no limit.</p>
              </div>

              <fieldset className="rounded-xl border border-line bg-page p-3.5 sm:p-4 space-y-3">
                <legend className="px-1.5 text-[13px] font-semibold text-ink">Valid on <span className="font-normal text-ink-muted">(optional)</span></legend>
                <p className="text-[13px] text-ink-muted">Leave both empty to allow every item. When set, the discount is worked out only on matching items in the bag (an item matches if it is in a chosen category or is a chosen product).</p>

                <div>
                  <p className="sag-label">Categories</p>
                  {categoryOptions.length === 0 ? (
                    <p className="text-[13px] text-ink-muted">No categories yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {categoryOptions.map((category) => {
                        const selected = (formData.allowedCategories || []).includes(category);
                        return (
                          <button
                            key={category}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setFormData({
                              ...formData,
                              allowedCategories: selected
                                ? (formData.allowedCategories || []).filter((c) => c !== category)
                                : [...(formData.allowedCategories || []), category],
                            })}
                            className={`h-11 px-3.5 rounded-[10px] border-[1.5px] text-sm font-medium transition-colors cursor-pointer ${
                              selected
                                ? 'bg-ink border-ink text-white'
                                : 'bg-white border-control text-ink hover:bg-sunken'
                            }`}
                          >
                            {selected && <CheckCircle2 className="inline w-4 h-4 mr-1 -mt-0.5 text-current" aria-hidden="true" />}
                            {category}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <p className="sag-label">Products</p>
                  {(formData.allowedProductIds || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(formData.allowedProductIds || []).map((id) => {
                        const product = products.find((p) => String(p.id) === id);
                        return (
                          <span key={id} className="inline-flex items-center gap-1 pl-3 rounded-[10px] bg-white border border-line text-[13px] text-ink font-semibold">
                            <span className="max-w-[180px] truncate">{product?.name || `Removed product (${id})`}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${product?.name || id}`}
                              onClick={() => setFormData({ ...formData, allowedProductIds: (formData.allowedProductIds || []).filter((pid) => pid !== id) })}
                              className="w-11 h-11 flex items-center justify-center rounded-[10px] hover:bg-sunken cursor-pointer"
                            >
                              <X className="w-4 h-4 text-current" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Search products by name or SKU"
                    aria-label="Search products to add"
                    className="sag-input"
                  />
                  {productSearch.trim().length >= 2 && (() => {
                    const q = productSearch.trim().toLowerCase();
                    const matches = products
                      .filter((p) => !(formData.allowedProductIds || []).includes(String(p.id)))
                      .filter((p) => p.name.toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q))
                      .slice(0, 8);
                    return (
                      <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-line divide-y divide-line bg-white">
                        {matches.length === 0 ? (
                          <li className="px-3 py-3 text-[13px] text-ink-muted">No matching products.</li>
                        ) : matches.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, allowedProductIds: [...(formData.allowedProductIds || []), String(p.id)] });
                                setProductSearch('');
                              }}
                              className="w-full min-h-11 flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-sunken cursor-pointer"
                            >
                              <span className="truncate text-ink">{p.name}{p.hidden ? ' (hidden)' : ''}</span>
                              <span className="shrink-0 text-xs text-ink-muted">{p.category}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </fieldset>

              <div className="pt-2">
                <label className="flex items-center justify-between gap-3 min-h-[52px] px-3.5 py-2.5 rounded-xl border border-line bg-white cursor-pointer text-sm font-semibold text-ink has-[:checked]:border-brand has-[:checked]:bg-brand-wash">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="relative shrink-0 w-11 h-6 rounded-full bg-sunken-deep peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
                  <span className="order-first">Coupon is switched on</span>
                </label>
              </div>

              <div className="sticky bottom-0 z-10 -mx-5 sm:-mx-7 -mb-5 sm:-mb-7 px-5 sm:px-7 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white flex gap-3 border-t border-line shadow-[var(--sag-shadow-bar)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="sag-btn-outline h-12 flex-1 sm:flex-none sm:ml-auto sm:px-6 text-[15px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sag-btn-primary h-12 flex-[2] sm:flex-none sm:px-8 gap-2"
                >
                  <Save className="w-4 h-4 text-current" /> Save coupon
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
