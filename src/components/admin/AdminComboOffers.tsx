import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useShop } from '../../context/ShopContext';
import { Gift, Loader2, Save } from 'lucide-react';
import { ComboOfferConfig } from '../../types';
import { AdminPageHeader } from './kidsToysShared';

const DEFAULTS: ComboOfferConfig = { enabled: false, percent: 15, minItems: 2, title: 'Festive combo', subtitle: '' };

export const AdminComboOffers: React.FC = () => {
  const { showToast } = useShop();
  const [form, setForm] = useState<ComboOfferConfig>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'storefront_settings', 'comboOffer'), (snapshot) => {
      try {
        if (snapshot.exists()) setForm({ ...DEFAULTS, ...JSON.parse(snapshot.data().value_json || '{}') });
      } catch {}
      setLoaded(true);
    }, () => setLoaded(true));
    return unsubscribe;
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.enabled && (form.percent < 1 || form.percent > 50)) {
      showToast('Discount must be between 1% and 50%.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/admin-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { comboOffer: form } }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not save the combo offer.');
      }
      showToast(form.enabled ? `Combo offer live: ${form.percent}% off ${form.minItems}+ outfits.` : 'Combo offer turned off.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save the combo offer.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full h-11 px-4 rounded-full border border-[#4B1D3F]/15 bg-white text-base sm:text-sm text-[#2A1A26] focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10';

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Promotions"
        title="Combo offer"
        icon={<Gift className="text-current" />}
        description="A percentage off the whole bag when a customer buys enough outfits. It is applied automatically in the bag and re-checked by the server at checkout. Accessories from Complete the look don't count towards the minimum; the % comes off the whole bag."
      />

      <form onSubmit={save} className="bg-white rounded-3xl p-5 sm:p-7 border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-[#4B1D3F]/10">
          <span className="w-9 h-9 rounded-xl bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center shrink-0"><Gift className="w-[18px] h-[18px] text-current" /></span>
          <h3 className="font-serif font-semibold text-xl text-[#2A1A26]">Offer rules</h3>
          {!loaded && <Loader2 className="w-4 h-4 animate-spin text-[#9C7A45]" />}
        </div>

        <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-[#4B1D3F]/10 bg-[#FBF7F3] text-sm font-semibold text-[#2A1A26] cursor-pointer">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="peer sr-only" />
          <span className="relative shrink-0 w-11 h-6 rounded-full bg-[#E6DDF0] peer-checked:bg-[#4B1D3F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#4B1D3F]/30 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
          <span className="order-first">Offer is live on the store</span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#2A1A26]/70 uppercase tracking-[0.12em] block">Discount (%)</span>
            <input type="number" min={1} max={50} value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} className={inputClass} />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#2A1A26]/70 uppercase tracking-[0.12em] block">Minimum pieces in bag</span>
            <input type="number" min={2} max={10} value={form.minItems} onChange={(e) => setForm({ ...form, minItems: Number(e.target.value) })} className={inputClass} />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#2A1A26]/70 uppercase tracking-[0.12em] block">Section label</span>
            <input type="text" maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-semibold text-[#2A1A26]/70 uppercase tracking-[0.12em] block">Description (optional)</span>
            <input type="text" maxLength={200} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className={inputClass} />
          </label>
        </div>

        <p className="rounded-2xl bg-[#F3EEF8] px-4 py-3 text-sm text-[#4B1D3F]">
          Example: with {form.percent}% and {form.minItems} pieces, two ₹1,499 suits cost ₹{Math.round(2998 * (1 - form.percent / 100)).toLocaleString('en-IN')} before any coupon.
        </p>

        <button
          type="submit"
          disabled={saving || !loaded}
          className="h-11 px-6 bg-[#4B1D3F] hover:bg-[#3B1532] text-white font-semibold text-sm rounded-full flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Save className="w-4 h-4 text-white" />}
          <span>{saving ? 'Saving…' : 'Save combo offer'}</span>
        </button>
      </form>
    </div>
  );
};
