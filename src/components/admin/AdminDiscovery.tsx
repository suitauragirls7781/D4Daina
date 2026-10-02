import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useShop } from '../../context/ShopContext';
import { useProducts } from '../../context/ProductContext';
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { DEFAULT_DISCOVERY, DiscoveryFeatures, DiscoverySettings, OccasionConfig, normaliseDiscovery, occasionProducts } from '../../utils/discovery';
import { OCCASIONS } from '../../utils/smartQuery';
import { SearchIcon } from '../StoreIcons';
import { AdminPageHeader, SectionTitle } from './kidsToysShared';

const FEATURE_LABELS: Array<[keyof DiscoveryFeatures, string, string]> = [
  ['assistant', 'Ask SuitAura assistant', 'Chat that finds real products from typed requests'],
  ['voiceSearch', 'Voice search', 'Mic button in search (supported browsers only)'],
  ['compare', 'Compare products', 'Compare 2–4 styles with a factual summary'],
  ['surpriseMe', 'Surprise me', 'Opens a random in-stock style from the current results'],
  ['findMySize', 'Find my size', 'Size estimate on product pages from the size chart'],
  ['personalRails', 'Picked for you / Recently viewed', 'Homepage rails from the shopper’s own activity'],
  ['occasions', 'Shop by occasion', 'Occasion collections below (homepage + shop)'],
  ['giftMode', 'Shop as a gift', 'Gift finder by occasion, budget, colour and size'],
  ['shareWishlist', 'Shareable wishlist', 'Customers can share a wishlist link'],
  ['priceDropAlerts', 'Price-drop emails', 'Email wishlist customers when you lower a price'],
  ['backInStockAlerts', 'Back-in-stock emails', 'Email customers who asked, when stock returns'],
  ['googleOneTap', 'Google One Tap', 'Automatic Google sign-in prompt for signed-out shoppers'],
  ['reels', 'Aura Reels', 'Vertical video reels linked to products (manage in Aura Reels)'],
  ['completeLook', 'Complete the Look', 'Matching items on product pages (manage in Complete the Look)'],
  ['bundleBuilder', 'Build your look (bundles)', 'Customers combine styles; combo offer applies when configured'],
  ['visualSearch', 'Find this look (photo search)', 'Shopper uploads a photo; styles in matching colours are shown (colour matching on the phone, no AI). Off until you turn it on'],
  ['reviewPhotos', 'Review photos', 'Signed-in customers can add a photo to their review'],
  ['styleProfile', 'Style profile', 'Customers save colours, sizes, budget and occasions for recommendations'],
];
const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'];

export const AdminDiscovery: React.FC = () => {
  const { showToast } = useShop();
  const { allProducts = [] } = useProducts();
  const [form, setForm] = useState<DiscoverySettings>(DEFAULT_DISCOVERY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  useEffect(() => onSnapshot(doc(db, 'storefront_settings', 'discovery'), (snap) => {
    try { setForm(normaliseDiscovery(snap.exists() ? JSON.parse(snap.data().value_json || '{}') : {})); } catch {}
    setLoaded(true);
  }, () => setLoaded(true)), []);

  const products = useMemo(() => allProducts.filter((p) => !p.hidden), [allProducts]);

  const save = async () => {
    if (form.occasions.some((o) => !o.name.trim())) { showToast('Every occasion needs a name.', 'error'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/admin-config', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { discovery: form } }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not save.');
      showToast('Discovery settings saved and live.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const setOccasion = (id: string, patch: Partial<OccasionConfig>) =>
    setForm((f) => ({ ...f, occasions: f.occasions.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const move = (i: number, d: number) => setForm((f) => {
    const list = [...f.occasions];
    const j = i + d;
    if (j < 0 || j >= list.length) return f;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...f, occasions: list };
  });
  const addOccasion = () => {
    const id = `occasion-${Date.now().toString(36)}`;
    setForm((f) => ({ ...f, occasions: [...f.occasions, { id, name: 'New occasion', enabled: false, productIds: [] }] }));
    setEditing(id);
  };
  const removeOccasion = (o: OccasionConfig) => {
    if (!window.confirm(`Delete the occasion "${o.name}"? Products are not affected.`)) return;
    setForm((f) => ({ ...f, occasions: f.occasions.filter((x) => x.id !== o.id) }));
  };

  if (!loaded) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink" /></div>;

  const card = 'bg-white rounded-2xl border border-line shadow-[var(--sag-shadow)] p-4 sm:p-6';
  const input = 'w-full h-11 px-4 rounded-full border border-line bg-white text-base sm:text-sm text-ink focus:outline-none focus:border-control focus:ring-2 focus:ring-brand';

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Storefront · Discovery"
        title="Discovery features"
        icon={<SearchIcon live={false} />}
        description="Turn shopping features on or off, and manage occasion collections. Everything uses your real catalogue."
        actions={
          <button onClick={save} disabled={saving} className="h-11 px-5 rounded-full bg-brand hover:bg-brand-dark text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60 cursor-pointer transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />} Save changes
          </button>
        }
      />

      <section className={card}>
        <SectionTitle icon={<Sparkles className="text-current" />} title="Features" hint="Switch a feature off to hide it from the store straight after you save." />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {FEATURE_LABELS.map(([key, label, hint]) => (
            <label key={key} className="flex items-center justify-between gap-4 p-3.5 rounded-2xl border border-line bg-page hover:bg-sunken transition-colors cursor-pointer">
              <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{label}</span><span className="block text-xs text-ink-muted">{hint}</span></span>
              <input type="checkbox" checked={form.features[key]} onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, [key]: e.target.checked } }))} className="peer sr-only" />
              <span className="relative shrink-0 w-12 h-7 rounded-full bg-sunken-deep peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" aria-hidden="true" />
            </label>
          ))}
        </div>
      </section>

      <section className={card}>
        <SectionTitle
          title="Occasions"
          hint="An occasion shows on the store only when it is enabled and has at least one in-stock product. Products come from the rule (occasion word, price, sizes) plus any you pick by hand."
          action={<button onClick={addOccasion} className="h-10 px-4 rounded-full border border-line bg-white text-sm font-semibold text-ink inline-flex items-center gap-1.5 hover:bg-sunken cursor-pointer transition-colors"><Plus className="w-4 h-4 text-current" /> Add occasion</button>}
        />
        <ul className="space-y-2.5">
          {form.occasions.map((o, i) => {
            const count = occasionProducts(o, products).length;
            const open = editing === o.id;
            return (
              <li key={o.id} className={`rounded-2xl border transition-colors ${open ? 'border-control bg-page' : 'border-line bg-white'}`}>
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <label className="relative inline-flex items-center cursor-pointer" title={o.enabled ? 'Shown on the store' : 'Hidden'}>
                    <input type="checkbox" checked={o.enabled} onChange={(e) => setOccasion(o.id, { enabled: e.target.checked })} aria-label={`Show ${o.name}`} className="peer sr-only" />
                    <span className="relative w-10 h-6 rounded-full bg-sunken-deep peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" aria-hidden="true" />
                  </label>
                  <button onClick={() => setEditing(open ? null : o.id)} className="flex-1 min-w-0 text-left text-sm font-semibold text-ink cursor-pointer">
                    {o.name} <span className="ml-1 inline-flex items-center h-6 px-2 rounded-full bg-sunken text-xs font-medium text-ink">{count} {count === 1 ? 'product' : 'products'}</span>
                  </button>
                  <button onClick={() => move(i, -1)} aria-label="Move up" className="w-9 h-9 rounded-full text-ink hover:bg-sunken flex items-center justify-center cursor-pointer"><ArrowUp className="w-4 h-4 text-current" /></button>
                  <button onClick={() => move(i, 1)} aria-label="Move down" className="w-9 h-9 rounded-full text-ink hover:bg-sunken flex items-center justify-center cursor-pointer"><ArrowDown className="w-4 h-4 text-current" /></button>
                  <button onClick={() => removeOccasion(o)} aria-label={`Delete ${o.name}`} className="w-9 h-9 rounded-full hover:bg-rose-50 text-rose-700 flex items-center justify-center cursor-pointer"><Trash2 className="w-4 h-4 text-current" /></button>
                </div>
                {open && (
                  <div className="border-t border-line p-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-ink-muted space-y-1"><span>Name</span><input value={o.name} maxLength={40} onChange={(e) => setOccasion(o.id, { name: e.target.value })} className={input} /></label>
                    <label className="text-xs text-ink-muted space-y-1"><span>Short description (optional)</span><input value={o.description || ''} maxLength={160} onChange={(e) => setOccasion(o.id, { description: e.target.value })} className={input} /></label>
                    <label className="text-xs text-ink-muted space-y-1">
                      <span>Auto-include products for occasion</span>
                      <select value={o.match || ''} onChange={(e) => setOccasion(o.id, { match: e.target.value })} className={input}>
                        <option value="">None (hand-picked only)</option>
                        {Object.keys(OCCASIONS).map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-ink-muted space-y-1"><span>Max price ₹ (optional)</span><input inputMode="numeric" value={o.maxPrice || ''} onChange={(e) => setOccasion(o.id, { maxPrice: Number(e.target.value.replace(/\D/g, '')) || null })} className={input} /></label>
                    <fieldset className="sm:col-span-2">
                      <legend className="text-xs text-ink-muted mb-1">Only styles available in these sizes (optional)</legend>
                      <div className="flex flex-wrap gap-1.5">
                        {SIZE_OPTIONS.map((s) => {
                          const on = (o.sizes || []).includes(s);
                          return <button key={s} type="button" onClick={() => setOccasion(o.id, { sizes: on ? (o.sizes || []).filter((x) => x !== s) : [...(o.sizes || []), s] })} className={`h-8 px-3 rounded-full border text-xs cursor-pointer ${on ? 'bg-brand text-white border-ink' : 'border-line'}`}>{s}</button>;
                        })}
                      </div>
                    </fieldset>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-ink-muted mb-1">Hand-picked products ({o.productIds.length})</p>
                      <input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Search products" className={`${input} mb-2`} />
                      <div className="max-h-56 overflow-y-auto grid gap-1">
                        {products.filter((p) => p.productType !== 'accessory' && p.name.toLowerCase().includes(pickerQuery.toLowerCase())).map((p) => {
                          const on = o.productIds.includes(String(p.id));
                          return (
                            <label key={p.id} className="flex items-center gap-2 text-sm p-1.5 rounded-lg hover:bg-sunken cursor-pointer">
                              <input type="checkbox" checked={on} onChange={() => setOccasion(o.id, { productIds: on ? o.productIds.filter((x) => x !== String(p.id)) : [...o.productIds, String(p.id)] })} className="accent-brand" />
                              <span className="flex-1 line-clamp-1">{p.name}</span><span className="text-xs text-ink-muted">₹{p.price}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};
