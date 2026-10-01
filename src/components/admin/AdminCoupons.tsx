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
        eyebrow="Marketing & Offers"
        title="Coupons & promo codes"
        icon={<TagIcon live={false} />}
        description="Checkout discounts with validity dates and usage caps. The server re-checks every coupon before payment."
        actions={
          <button
            onClick={handleOpenAdd}
            className="h-11 px-5 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full text-sm font-semibold transition-colors shadow-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-current" />
            <span>Create coupon</span>
          </button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex flex-nowrap gap-1.5 p-1.5 rounded-full bg-white border border-[#4B1D3F]/10 w-fit max-w-full overflow-x-auto sag-scroll-x">
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
              onClick={() => setFilterTab(tab)}
              className={`h-9 px-4 shrink-0 whitespace-nowrap inline-flex items-center text-sm font-semibold rounded-full transition-colors cursor-pointer ${
                filterTab === tab
                  ? 'bg-[#4B1D3F] text-white'
                  : 'text-[#4B1D3F] hover:bg-[#F3EEF8]'
              }`}
            >
              <span className="capitalize">{tab}</span>
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                filterTab === tab ? 'bg-white/20 text-white' : 'bg-[#F3EEF8] text-[#2A1A26]'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Coupons Grid */}
      {filteredCoupons.length === 0 ? (
        <div className="px-6 py-14 text-center bg-white rounded-3xl border border-dashed border-[#4B1D3F]/20 space-y-2">
          <span className="mx-auto mb-2 w-14 h-14 rounded-2xl bg-[#F3EEF8] flex items-center justify-center"><TagIcon className="w-7 h-7" live={false} /></span>
          <p className="font-serif text-xl text-[#2A1A26]">No coupons found</p>
          <p className="text-sm text-[#2A1A26]/60">There are no coupons matching the "{filterTab}" category at this moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {filteredCoupons.map((coupon) => {
            const isExpired = checkIfExpired(coupon);
            return (
              <div
                key={coupon.id}
                className={`bg-white rounded-3xl border p-5 shadow-[var(--sag-shadow)] transition-colors flex flex-col justify-between space-y-4 relative ${
                  isExpired
                    ? 'border-rose-200 opacity-80'
                    : coupon.isActive
                      ? 'border-[#4B1D3F]/15 hover:border-[#4B1D3F]/40'
                      : 'border-[#4B1D3F]/15 opacity-75'
                }`}
              >
                {/* Top Row: Code & Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <span className={`font-mono text-lg font-bold tracking-[0.14em] px-3.5 py-1.5 border border-dashed rounded-xl inline-block ${
                      isExpired
                        ? 'text-[#2A1A26]/50 bg-[#FBF7F3] border-[#4B1D3F]/15 line-through'
                        : 'text-[#4B1D3F] bg-[#F3EEF8] border-[#4B1D3F]/30'
                    }`}>
                      {coupon.code}
                    </span>
                    <p className="font-serif text-lg font-semibold text-[#2A1A26]">
                      {coupon.discountType === 'percentage'
                        ? `${coupon.discountValue}% OFF (Max ₹${coupon.maxDiscount || 'Unlimited'})`
                        : `Flat ₹${coupon.discountValue} OFF`}
                    </p>
                  </div>

                  {isExpired ? (
                    <span className="h-7 px-2.5 inline-flex items-center rounded-full text-[11px] font-semibold uppercase tracking-wide bg-rose-50 text-rose-700 border border-rose-200">
                      Expired
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        toggleCouponStatus(coupon.id)
                          .then(() => showToast(`Coupon ${coupon.code} is now ${!coupon.isActive ? 'active' : 'disabled'}.`, 'info'))
                          .catch((err: any) => showToast(err?.message || 'Could not save. Please try again.', 'error'));
                      }}
                      className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide transition-colors cursor-pointer ${
                        coupon.isActive
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-[#F3EEF8] text-[#4B1D3F] border-[#4B1D3F]/15'
                      }`}
                      title="Tap to switch on / off"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${coupon.isActive ? 'bg-emerald-600' : 'bg-[#4B1D3F]/40'}`} aria-hidden="true" />
                      {coupon.isActive ? 'Active' : 'Disabled'}
                    </button>
                  )}
                </div>

                {/* Conditions & Thresholds */}
                <div className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                  isExpired
                    ? 'bg-rose-50 border-rose-200 text-[#2A1A26]/60'
                    : 'bg-[#FBF7F3] border-[#4B1D3F]/10 text-[#2A1A26]/70'
                }`}>
                  <div className="flex justify-between">
                    <span>Min Order Value:</span>
                    <strong className="text-[#2A1A26]">₹{coupon.minOrderValue}</strong>
                  </div>
                  <div className="flex justify-between items-center gap-1">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5 text-[#4B1D3F]" />
                      Validity Window:
                    </span>
                    <span className={isExpired ? 'text-rose-700 font-semibold' : ''}>
                      {coupon.startDate} to {coupon.expiryDate}
                    </span>
                  </div>
                  {couponRestrictionNotes(coupon).map((note) => (
                    <div key={note} className="flex justify-between gap-2">
                      <span>Limit:</span>
                      <strong className="text-[#4B1D3F] text-right">{note}</strong>
                    </div>
                  ))}
                  <div className="flex justify-between">
                    <span>Redemptions:</span>
                    <strong className="text-[#2A1A26]">
                      {coupon.usageCount} / {coupon.usageLimit}
                    </strong>
                  </div>
                </div>

                {/* Progress Bar of usage */}
                <div className="space-y-1">
                  <div className="w-full bg-[#F3EEF8] h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isExpired ? 'bg-[#2A1A26]/30' : 'bg-[#4B1D3F]'}`}
                      style={{ width: `${Math.min(100, (coupon.usageCount / coupon.usageLimit) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-[#4B1D3F]/10 text-xs">
                  <span className="text-[11px] text-[#2A1A26]/50">Coupon ID: {coupon.id}</span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(coupon)}
                      className="w-9 h-9 inline-flex items-center justify-center hover:bg-[#F3EEF8] rounded-full text-[#4B1D3F] transition-colors cursor-pointer"
                      title="Edit Coupon"
                    >
                      <Edit3 className="w-4 h-4 text-current" />
                    </button>
                    <button
                      onClick={() => handleDelete(coupon)}
                      className="w-9 h-9 inline-flex items-center justify-center hover:bg-rose-50 rounded-full text-rose-700 transition-colors cursor-pointer"
                      title="Delete Coupon"
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
        <div className="fixed inset-0 z-50 bg-[#2A1A26]/50 flex items-end sm:items-center justify-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label={editingCouponId ? 'Edit coupon' : 'Create new coupon'} className="bg-white rounded-t-3xl sm:rounded-3xl max-w-xl w-full max-h-[94dvh] sm:max-h-[90vh] overflow-y-auto p-5 sm:p-7 shadow-2xl border border-[#4B1D3F]/10 space-y-4 animate-in zoom-in-95 duration-150">

            <div className="flex items-center justify-between border-b border-[#4B1D3F]/10 pb-3">
              <h3 className="font-serif text-2xl font-semibold text-[#2A1A26]">
                {editingCouponId ? 'Edit coupon' : 'Create a coupon'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="Close" className="w-10 h-10 rounded-full flex items-center justify-center text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer">
                <X className="w-5 h-5 text-current" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Coupon Code *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g. FIRST15 or AURA20"
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 font-mono uppercase font-bold tracking-wider"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Discount Type</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value as any })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 cursor-pointer"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Flat Amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">
                    {formData.discountType === 'percentage' ? 'Discount Percentage (%)' : 'Discount Amount (₹)'}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: Number(e.target.value) })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Min Order Value (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.minOrderValue}
                    onChange={(e) => setFormData({ ...formData, minOrderValue: Number(e.target.value) })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Max Cap Discount (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.maxDiscount || ''}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: Number(e.target.value) || undefined })}
                    placeholder="Optional"
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Start Date</label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Expiry Date</label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Total Usage Limit (Total Redemptions)</label>
                <input
                  type="number"
                  min={1}
                  value={formData.usageLimit}
                  onChange={(e) => setFormData({ ...formData, usageLimit: Number(e.target.value) })}
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70 mb-1.5">Uses per customer</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={formData.perUserLimit || ''}
                  onChange={(e) => setFormData({ ...formData, perUserLimit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  placeholder="No limit"
                  className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                />
                <p className="mt-1 text-[11px] text-[#2A1A26]/60">Counts paid orders with the same email or mobile number. Leave empty for no limit.</p>
              </div>

              <fieldset className="rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] p-4 space-y-3">
                <legend className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2A1A26]/70">Valid on (optional)</legend>
                <p className="text-[11px] text-[#2A1A26]/60">Leave both empty to allow every item. When set, the discount is worked out only on matching items in the bag (an item matches if it is in a chosen category or is a chosen product).</p>

                <div>
                  <p className="text-xs font-semibold text-[#2A1A26]/80 mb-1.5">Categories</p>
                  {categoryOptions.length === 0 ? (
                    <p className="text-[11px] text-[#2A1A26]/60">No categories yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
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
                            className={`h-9 px-3.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
                              selected
                                ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white'
                                : 'bg-white border-[#4B1D3F]/15 text-[#4B1D3F] hover:bg-[#F3EEF8]'
                            }`}
                          >
                            {selected && <CheckCircle2 className="inline w-3 h-3 mr-1 -mt-0.5 text-current" aria-hidden="true" />}
                            {category}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-[#2A1A26]/80 mb-1.5">Products</p>
                  {(formData.allowedProductIds || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(formData.allowedProductIds || []).map((id) => {
                        const product = products.find((p) => String(p.id) === id);
                        return (
                          <span key={id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-[#F3EEF8] border border-[#4B1D3F]/15 text-[11px] text-[#4B1D3F] font-semibold">
                            <span className="max-w-[180px] truncate">{product?.name || `Removed product (${id})`}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${product?.name || id}`}
                              onClick={() => setFormData({ ...formData, allowedProductIds: (formData.allowedProductIds || []).filter((pid) => pid !== id) })}
                              className="p-0.5 rounded-full hover:bg-[#E6DDF0] cursor-pointer"
                            >
                              <X className="w-3 h-3 text-current" />
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
                    className="w-full h-11 px-4 border border-[#4B1D3F]/15 bg-white rounded-full text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10"
                  />
                  {productSearch.trim().length >= 2 && (() => {
                    const q = productSearch.trim().toLowerCase();
                    const matches = products
                      .filter((p) => !(formData.allowedProductIds || []).includes(String(p.id)))
                      .filter((p) => p.name.toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q))
                      .slice(0, 8);
                    return (
                      <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-2xl border border-[#4B1D3F]/10 divide-y divide-[#4B1D3F]/10 bg-white">
                        {matches.length === 0 ? (
                          <li className="px-3 py-2 text-[11px] text-[#2A1A26]/60">No matching products.</li>
                        ) : matches.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, allowedProductIds: [...(formData.allowedProductIds || []), String(p.id)] });
                                setProductSearch('');
                              }}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#F3EEF8] cursor-pointer"
                            >
                              <span className="truncate text-[#2A1A26]">{p.name}{p.hidden ? ' (hidden)' : ''}</span>
                              <span className="shrink-0 text-[11px] text-[#2A1A26]/60">{p.category}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </fieldset>

              <div className="pt-2">
                <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] cursor-pointer text-sm font-semibold text-[#2A1A26]">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
                  <span className="order-first">Enable and activate this coupon immediately</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[#4B1D3F]/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-11 px-5 border border-[#4B1D3F]/20 rounded-full text-[#4B1D3F] font-semibold hover:bg-[#F3EEF8] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-11 px-6 bg-[#4B1D3F] hover:bg-[#3B1532] text-white rounded-full font-semibold flex items-center gap-2 cursor-pointer"
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
