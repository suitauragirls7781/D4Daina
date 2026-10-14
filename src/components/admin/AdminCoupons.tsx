import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { adminDb } from '../../lib/firebase';
import { useAdmin } from '../../context/AdminContext';
import { useShop } from '../../context/ShopContext';
import { Plus, Edit3, Trash2, X, Save, CheckCircle2, Search, Sparkles, Eye } from 'lucide-react';
import { Coupon } from '../../types';
import { couponRestrictionNotes } from '../../utils/coupons';
import { TagIcon } from '../StoreIcons';
import { AdminPageHeader } from './adminShared';
import { CheckRow, Empty, Meter, Pill, Switch, Tile, Tiles, kit } from './AdminPaymentGateways';

const rupees = (value: unknown) => `₹${(Number(value) || 0).toLocaleString('en-IN')}`;
/** "2026-10-20" → "20 Oct 2026" (the stored text is shown as it is when it is not a date). */
const dayText = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
/** What the coupon gives, in one plain line: "10% off, up to ₹400, on orders above ₹499". */
const offerText = (c: Pick<Coupon, 'discountType' | 'discountValue' | 'maxDiscount' | 'minOrderValue'>) => {
  const parts = [c.discountType === 'percentage' ? `${Number(c.discountValue) || 0}% off` : `${rupees(c.discountValue)} off`];
  if (c.discountType === 'percentage' && Number(c.maxDiscount) > 0) parts.push(`up to ${rupees(c.maxDiscount)}`);
  parts.push(Number(c.minOrderValue) > 0 ? `on orders above ${rupees(c.minOrderValue)}` : 'on any order');
  return parts.join(', ');
};

type CouponState = 'running' | 'upcoming' | 'usedup' | 'ended' | 'off';
type FilterTab = 'all' | CouponState;

const FILTER_LABEL: Record<FilterTab, string> = { all: 'All', running: 'Live', upcoming: 'Scheduled', usedup: 'Used up', ended: 'Ended', off: 'Switched off' };
const EMPTY_TEXT: Record<FilterTab, string> = {
  all: '', running: 'No coupon is live right now.', upcoming: 'No coupon is waiting for its start day.', usedup: 'No coupon has run out of uses.',
  ended: 'No coupon has ended yet.', off: 'No coupon is switched off.',
};

/** "2026-10-20" in days from today (negative = past). */
const daysFrom = (iso: string, today: string) => Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
const isoIn = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

/**
 * Ready-made starting points for a new coupon. They only fill the form (every value can be changed) and promise
 * nothing the store does not do: the "once per customer" one counts paid orders per email or mobile, it does not
 * check that it is the customer's first order.
 */
const TEMPLATES: Array<{ id: string; name: string; line: string; fill: () => Partial<Omit<Coupon, 'id' | 'usageCount'>> }> = [
  { id: 'festive', name: 'Festive % off', line: '20% off up to ₹600 on orders above ₹1,499, for two weeks', fill: () => ({ code: 'FESTIVE20', discountType: 'percentage', discountValue: 20, maxDiscount: 600, minOrderValue: 1499, startDate: isoIn(0), expiryDate: isoIn(14), usageLimit: 500, perUserLimit: 0 }) },
  { id: 'welcome', name: 'Once per customer', line: '10% off up to ₹300 on orders above ₹999; each email or mobile can use it once', fill: () => ({ code: 'WELCOME10', discountType: 'percentage', discountValue: 10, maxDiscount: 300, minOrderValue: 999, startDate: isoIn(0), expiryDate: isoIn(90), usageLimit: 1000, perUserLimit: 1 }) },
  { id: 'flat', name: 'Flat ₹ off a bigger bag', line: '₹200 off on orders above ₹2,499, for a month', fill: () => ({ code: 'SAVE200', discountType: 'fixed', discountValue: 200, maxDiscount: undefined, minOrderValue: 2499, startDate: isoIn(0), expiryDate: isoIn(30), usageLimit: 300, perUserLimit: 0 }) },
];

/** The sentence a shopper reads about this coupon, from its own fields. */
const shopperLine = (c: Pick<Coupon, 'code' | 'discountType' | 'discountValue' | 'maxDiscount' | 'minOrderValue' | 'expiryDate' | 'allowedCategories' | 'allowedProductIds' | 'perUserLimit'>) => {
  const code = String(c.code || '').trim().toUpperCase().replace(/\s+/g, '') || 'CODE';
  const notes = couponRestrictionNotes(c as Coupon);
  return `Use ${code} in the bag: ${offerText(c)}${notes.length ? ` (${notes.join('; ').toLowerCase()})` : ''}${c.expiryDate ? `. Valid till ${dayText(c.expiryDate)}` : ''}.`;
};

/** A titled group of fields inside the coupon form. */
const FormGroup: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <fieldset className={`${kit.inset} space-y-3`}>
    <legend className="float-left w-full text-sm leading-5 font-semibold text-ink">{title}</legend>
    {hint && <p className={`clear-both ${kit.hint}`}>{hint}</p>}
    <div className="clear-both space-y-3">{children}</div>
  </fieldset>
);

export const AdminCoupons: React.FC = () => {
  const { coupons = [], addCoupon, updateCoupon, deleteCoupon, toggleCouponStatus, products = [], categories = [], orders = [] } = useAdmin();
  const [productSearch, setProductSearch] = useState('');
  // Categories the admin can limit a coupon to: every category in the category list or used by a product
  const categoryOptions = [...new Set([
    ...categories.map((c) => String(c.name || '').trim()),
    ...products.map((p) => String(p.category || '').trim()),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const { showToast } = useShop();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [codeSearch, setCodeSearch] = useState('');
  // Coupons the festive panel (Admin → Special DOD) runs on, so a coupon card can say so
  const [dodCodes, setDodCodes] = useState<string[]>([]);
  useEffect(() => onSnapshot(doc(adminDb, 'storefront_settings', 'specialDod'), (snap) => {
    try {
      const value = snap.exists() ? JSON.parse(snap.data().value_json || '{}') : null;
      setDodCodes(value && value.enabled !== false && Array.isArray(value.offers)
        ? value.offers.filter((o: any) => o && o.enabled !== false && o.couponCode).map((o: any) => String(o.couponCode).trim().toUpperCase())
        : []);
    } catch { setDodCodes([]); }
  }, () => setDodCodes([])), []);

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

  /** Where the coupon stands today, from its own dates and switch. */
  const stateOf = (coupon: Coupon): CouponState => {
    if (checkIfExpired(coupon)) return 'ended';
    if (!coupon.isActive) return 'off';
    if (Number(coupon.usageLimit) > 0 && Number(coupon.usageCount) >= Number(coupon.usageLimit)) return 'usedup';
    if (coupon.startDate && coupon.startDate > todayStr) return 'upcoming';
    return 'running';
  };

  // Paid orders that carried each code, from the orders loaded in the admin: how many and the discount given
  const paidUse = useMemo(() => {
    const map = new Map<string, { orders: number; given: number }>();
    orders.forEach((order) => {
      if (!order.couponCode || order.paymentStatus !== 'Paid') return;
      const code = String(order.couponCode).trim().toUpperCase();
      const row = map.get(code) || { orders: 0, given: 0 };
      row.orders += 1;
      row.given += Number(order.couponDiscount) || 0;
      map.set(code, row);
    });
    return map;
  }, [orders]);

  const applyTemplate = (id: string) => {
    const template = TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    const fill = template.fill();
    // A code that already exists gets a number added, so a template never clashes with a real coupon
    let code = String(fill.code || '');
    const taken = new Set(coupons.filter((c) => c.id !== editingCouponId).map((c) => String(c.code).toUpperCase()));
    for (let n = 2; taken.has(code); n += 1) code = `${String(fill.code)}${n}`;
    setFormData((prev) => ({ ...prev, ...fill, code, isActive: true }));
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

  const matchesTab = (coupon: Coupon, tab: FilterTab) => tab === 'all' || stateOf(coupon) === tab;
  const STATE_RANK: Record<CouponState, number> = { running: 0, upcoming: 1, usedup: 2, off: 3, ended: 4 };
  const filteredCoupons = coupons
    .filter((coupon) => matchesTab(coupon, filterTab))
    .filter((coupon) => !codeSearch.trim() || String(coupon.code).toLowerCase().includes(codeSearch.trim().toLowerCase()))
    .sort((a, b) => STATE_RANK[stateOf(a)] - STATE_RANK[stateOf(b)]);

  // Key numbers, all from the real coupon list and the orders already loaded in the admin
  const runningCount = coupons.filter((c) => stateOf(c) === 'running').length;
  const upcomingCount = coupons.filter((c) => stateOf(c) === 'upcoming').length;
  const totalUses = coupons.reduce((sum, c) => sum + (Number(c.usageCount) || 0), 0);
  const now = new Date();
  const usedThisMonth = orders.filter((order) => {
    if (!order.couponCode || order.paymentStatus !== 'Paid') return false;
    const when = new Date(order.paidAt || order.date);
    return !Number.isNaN(when.getTime()) && when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth();
  }).length;

  return (
    <div id="admin-coupons-page" className="space-y-5">

      {/* Header */}
      <AdminPageHeader
        eyebrow="Offers"
        title="Coupons & promo codes"
        icon={<TagIcon live={false} />}
        description="Codes shoppers type in the bag to get a discount. You choose what each one gives, when it runs and how many times it can be used. The server checks every coupon again before payment."
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

      <Tiles>
        <Tile label="Running now" value={runningCount} note={upcomingCount ? `${upcomingCount} more start${upcomingCount === 1 ? 's' : ''} later` : 'Shoppers can use these today'} />
        <Tile label="Used this month" value={usedThisMonth} note="Paid orders with a coupon, from the orders loaded here" />
        <Tile label="Used in all" value={totalUses.toLocaleString('en-IN')} note="Every coupon, since it was made" />
        <Tile label="Coupons in all" value={coupons.length} />
      </Tiles>

      {/* Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="relative lg:w-64 shrink-0">
        <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        <input type="search" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} placeholder="Find a code" aria-label="Find a coupon by its code" className="sag-input h-11 pl-10" />
      </div>
      <div role="group" aria-label="Filter coupons" className="flex flex-nowrap gap-2 max-w-full overflow-x-auto sag-scroll-x min-w-0">
        {(['all', 'running', 'upcoming', 'usedup', 'ended', 'off'] as const).map((tab) => {
          const count = coupons.filter((c) => matchesTab(c, tab)).length;
          if (tab !== 'all' && tab !== 'running' && count === 0) return null;
          return (
            <button
              key={tab}
              type="button"
              aria-pressed={filterTab === tab}
              onClick={() => setFilterTab(tab)}
              className="sag-chip h-11 px-4 shrink-0 whitespace-nowrap gap-1.5 text-sm"
            >
              <span>{FILTER_LABEL[tab]}</span>
              <span className="sag-num opacity-80">{count}</span>
            </button>
          );
        })}
      </div>
      </div>

      {/* Coupons */}
      {filteredCoupons.length === 0 ? (
        <Empty
          icon={<TagIcon live={false} />}
          title="No coupons here"
          action={filterTab === 'all' ? (
            <button type="button" onClick={handleOpenAdd} className={kit.primary}><Plus className="w-4 h-4 text-current" /> Create coupon</button>
          ) : undefined}
        >
          {codeSearch.trim() ? 'No code matches this search.' : filterTab === 'all' ? 'Use Create coupon to add the first one.' : EMPTY_TEXT[filterTab]}
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
          {filteredCoupons.map((coupon) => {
            const state = stateOf(coupon);
            const isExpired = state === 'ended';
            const limit = Number(coupon.usageLimit) || 0;
            const used = Number(coupon.usageCount) || 0;
            const usedPercent = limit > 0 ? (used / limit) * 100 : 0;
            const usedUp = limit > 0 && used >= limit;
            return (
              <li key={coupon.id} className={`${kit.panel} flex flex-col gap-4 ${isExpired || state === 'off' ? 'opacity-80' : ''}`}>
                {/* Code and status */}
                <div className="flex items-start justify-between gap-3">
                  <span className={`font-mono text-lg leading-7 font-semibold tracking-[0.08em] px-3 py-1 border border-dashed rounded-full break-all ${isExpired ? 'text-ink-faint border-line line-through' : 'text-brand border-brand-line bg-brand-wash'}`}>
                    {coupon.code}
                  </span>
                  {state === 'running' && <Pill tone="live">Live</Pill>}
                  {state === 'upcoming' && <Pill tone="soon">Scheduled · starts {dayText(coupon.startDate)}</Pill>}
                  {state === 'usedup' && <Pill tone="problem">Used up</Pill>}
                  {state === 'ended' && <Pill tone="off">Ended</Pill>}
                  {state === 'off' && <Pill tone="off">Switched off</Pill>}
                </div>
                {(() => {
                  const code = String(coupon.code).toUpperCase();
                  const left = coupon.expiryDate && state === 'running' ? daysFrom(coupon.expiryDate, todayStr) : null;
                  return (dodCodes.includes(code) || (left !== null && left <= 3)) ? (
                    <div className="-mt-1 flex flex-wrap gap-1.5">
                      {dodCodes.includes(code) && <span className="inline-flex items-center gap-1 min-h-7 px-3 rounded-full bg-highlight text-xs font-semibold text-ink"><Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Runs the festive panel (Special DOD)</span>}
                      {left !== null && left <= 3 && <span className="inline-flex items-center min-h-7 px-3 rounded-full border border-brand-line text-xs font-semibold text-brand">{left <= 0 ? 'Last day today' : `${left} day${left === 1 ? '' : 's'} left`}</span>}
                    </div>
                  ) : null;
                })()}

                {/* What it gives */}
                <div>
                  <p className="text-base leading-6 font-semibold text-ink sag-num">{offerText(coupon)}</p>
                  {couponRestrictionNotes(coupon).map((note) => (
                    <p key={note} className={`mt-1 ${kit.hint}`}>{note}</p>
                  ))}
                  <p className="mt-2 flex items-start gap-1.5 rounded-[14px] bg-page px-3 py-2 text-[13px] leading-[18px] text-ink-muted">
                    <Eye className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                    <span><span className="font-semibold text-ink">A shopper reads:</span> {shopperLine(coupon)}</span>
                  </p>
                </div>

                {/* Dates and uses */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sag-num">
                  <div>
                    <dt className="text-xs leading-4 text-ink-muted">Starts</dt>
                    <dd className="mt-0.5 font-medium text-ink">{dayText(coupon.startDate) || 'Not set'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs leading-4 text-ink-muted">{isExpired ? 'Ended' : 'Ends'}</dt>
                    <dd className="mt-0.5 font-medium text-ink">{dayText(coupon.expiryDate) || 'No end date'}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="flex items-baseline justify-between gap-2 text-xs leading-4 text-ink-muted">
                      <span>Times used</span>
                      <span className="text-sm font-semibold text-ink">{used.toLocaleString('en-IN')} of {limit.toLocaleString('en-IN')}</span>
                    </dt>
                    <dd className="mt-1.5">
                      <Meter percent={usedPercent} label={`Coupon ${coupon.code} uses`} valueText={`${used} of ${limit} used`} />
                      {usedUp && <p className="mt-1.5 text-[13px] leading-[18px] font-medium text-danger">All uses are taken. Shoppers can no longer apply this code. Raise "Total uses allowed" to run it again.</p>}
                      {(() => {
                        const use = paidUse.get(String(coupon.code).toUpperCase());
                        return use ? (
                          <p className="mt-1.5 text-[13px] leading-[18px] text-ink-muted">
                            On <span className="font-semibold text-ink">{use.orders}</span> paid order{use.orders === 1 ? '' : 's'} loaded here{use.given > 0 ? <>, <span className="font-semibold text-ink">{rupees(use.given)}</span> given off</> : ''}.
                          </p>
                        ) : null;
                      })()}
                    </dd>
                  </div>
                </dl>

                {/* Actions */}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-line">
                  {isExpired ? (
                    <p className={`min-w-0 ${kit.hint}`}>Ended. Edit the end date to run it again.</p>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <Switch
                        checked={coupon.isActive}
                        label={`Coupon ${coupon.code} on/off`}
                        onChange={() => {
                          toggleCouponStatus(coupon.id)
                            .then(() => showToast(`Coupon ${coupon.code} is now ${!coupon.isActive ? 'active' : 'disabled'}.`, 'info'))
                            .catch((err: any) => showToast(err?.message || 'Could not save. Please try again.', 'error'));
                        }}
                      />
                      <span className="text-[13px] leading-[18px] text-ink-muted">{coupon.isActive ? 'On: shoppers can use it' : 'Off: the code is refused'}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleOpenEdit(coupon)}
                      className={kit.iconBtn}
                      title="Edit coupon"
                      aria-label={`Edit coupon ${coupon.code}`}
                    >
                      <Edit3 className="w-4 h-4 text-current" />
                    </button>
                    <button
                      onClick={() => handleDelete(coupon)}
                      className={kit.iconBtnDanger}
                      title="Delete coupon"
                      aria-label={`Delete coupon ${coupon.code}`}
                    >
                      <Trash2 className="w-4 h-4 text-current" />
                    </button>
                  </div>
                </div>
                <p className="-mt-2 min-w-0 truncate text-xs text-ink-faint">ID: {coupon.id}</p>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add / Edit Coupon Modal */}
      {isModalOpen && (
        <div className={`${kit.scrim} !z-50`}>
          <div role="dialog" aria-modal="true" aria-label={editingCouponId ? 'Edit coupon' : 'Create new coupon'} className={`${kit.sheet} sm:max-w-xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain animate-in fade-in slide-in-from-bottom-5`}>

            <div className="sticky top-0 z-10 px-5 sm:px-7 py-3 bg-surface flex items-center justify-between gap-3 border-b border-line">
              <div className="min-w-0">
                <h3 className="font-display text-xl leading-7 text-ink">
                  {editingCouponId ? 'Edit coupon' : 'Create a coupon'}
                </h3>
                <p className={`${kit.hint} sag-num`}>{offerText(formData)}</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Close" className={kit.iconBtn}>
                <X className="w-5 h-5 text-current" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="text-sm">
              <div className="px-5 sm:px-7 py-5 space-y-4">

                {!editingCouponId && (
                  <div role="group" aria-label="Start from a template">
                    <p className="sag-label">Start from a template (optional)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {TEMPLATES.map((t) => (
                        <button key={t.id} type="button" onClick={() => applyTemplate(t.id)} className="min-h-11 rounded-[16px] border border-line bg-surface px-3 py-2.5 text-left cursor-pointer transition-colors hover:border-ink">
                          <span className="block text-sm font-semibold text-ink">{t.name}</span>
                          <span className="mt-0.5 block text-xs leading-4 text-ink-muted">{t.line}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="flex items-start gap-2 rounded-[16px] bg-highlight px-3.5 py-3 text-[13px] leading-[18px] text-ink" aria-live="polite">
                  <Eye className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span><span className="font-semibold">A shopper reads:</span> {shopperLine(formData)}</span>
                </p>

                <FormGroup title="1. The code">
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
                      className="sag-input font-mono uppercase font-semibold tracking-wider"
                    />
                    <p className={`mt-1.5 ${kit.hint}`}>Letters and numbers, no spaces. Shoppers type this in the bag.</p>
                  </div>
                </FormGroup>

                <FormGroup title="2. What it gives">
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
                        className="sag-input font-semibold sag-num"
                      />
                    </div>

                    <div>
                      <label className="sag-label">Minimum order (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={formData.minOrderValue}
                        onChange={(e) => setFormData({ ...formData, minOrderValue: Number(e.target.value) })}
                        className="sag-input sag-num"
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
                        className="sag-input sag-num"
                      />
                    </div>
                  </div>
                </FormGroup>

                <FormGroup title="3. When it runs">
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
                  <CheckRow
                    label="Coupon is switched on"
                    hint="Off: shoppers cannot use the code, even between its dates."
                    checked={formData.isActive}
                    onChange={(isActive) => setFormData({ ...formData, isActive })}
                    className="!bg-transparent"
                  />
                </FormGroup>

                <FormGroup title="4. How many times">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="sag-label">Total uses allowed</label>
                      <input
                        type="number"
                        min={1}
                        value={formData.usageLimit}
                        onChange={(e) => setFormData({ ...formData, usageLimit: Number(e.target.value) })}
                        className="sag-input sag-num"
                      />
                      <p className={`mt-1.5 ${kit.hint}`}>After this many orders the code stops working.</p>
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
                        className="sag-input sag-num"
                      />
                      <p className={`mt-1.5 ${kit.hint}`}>Counts paid orders with the same email or mobile number. Leave empty for no limit.</p>
                    </div>
                  </div>
                </FormGroup>

                <FormGroup
                  title="5. Valid on (optional)"
                  hint="Leave both empty to allow every item. When set, the discount is worked out only on matching items in the bag (an item matches if it is in a chosen category or is a chosen product)."
                >
                  <div>
                    <p className="sag-label">Categories</p>
                    {categoryOptions.length === 0 ? (
                      <p className={kit.hint}>No categories yet.</p>
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
                              className="sag-chip h-11 px-3.5 text-sm gap-1"
                            >
                              {selected && <CheckCircle2 className="w-4 h-4 text-current" aria-hidden="true" />}
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
                            <span key={id} className="inline-flex items-center gap-1 pl-3.5 rounded-full border border-brand-line bg-brand-wash text-[13px] text-ink font-medium">
                              <span className="max-w-[180px] truncate">{product?.name || `Removed product (${id})`}</span>
                              <button
                                type="button"
                                aria-label={`Remove ${product?.name || id}`}
                                onClick={() => setFormData({ ...formData, allowedProductIds: (formData.allowedProductIds || []).filter((pid) => pid !== id) })}
                                className="w-11 h-11 flex items-center justify-center rounded-full text-ink hover:bg-sunken-deep cursor-pointer"
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
                        <ul className="mt-1.5 max-h-56 overflow-y-auto rounded-[16px] border border-line divide-y divide-line">
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
                                className="w-full min-h-11 flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-sunken-deep cursor-pointer"
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
                </FormGroup>
              </div>

              <div className="sticky bottom-0 z-10 px-5 sm:px-7 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-surface flex gap-3 border-t border-line">
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
