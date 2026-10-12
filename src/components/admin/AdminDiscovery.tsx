import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { useShop } from '../../context/ShopContext';
import { useProducts } from '../../context/ProductContext';
import { ArrowDown, ArrowUp, CalendarHeart, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { DEFAULT_DISCOVERY, DiscoveryFeatures, DiscoverySettings, OccasionConfig, normaliseDiscovery, occasionProducts } from '../../utils/discovery';
import { OCCASIONS } from '../../utils/smartQuery';
import { SearchIcon } from '../StoreIcons';
import { AdminPageHeader } from './adminShared';
import { CheckRow, Empty, Panel, Pill, SaveBar, Switch, Tile, Tiles, kit } from './AdminPaymentGateways';

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
/** The same features, grouped by where a shopper meets them. Every feature is in exactly one group. */
const FEATURE_GROUPS: Array<{ title: string; hint: string; keys: Array<keyof DiscoveryFeatures> }> = [
  { title: 'Finding a style', hint: 'Ways to search and browse the store.', keys: ['assistant', 'voiceSearch', 'visualSearch', 'surpriseMe', 'compare', 'occasions', 'giftMode'] },
  { title: 'On the product page', hint: 'Extra help while a shopper looks at one style.', keys: ['findMySize', 'completeLook', 'bundleBuilder', 'reviewPhotos'] },
  { title: 'For returning shoppers', hint: 'Things that use a shopper\'s own activity or account.', keys: ['personalRails', 'styleProfile', 'shareWishlist', 'googleOneTap'] },
  { title: 'Emails and videos', hint: 'Emails the store sends by itself, and the video section.', keys: ['priceDropAlerts', 'backInStockAlerts', 'reels'] },
];
const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', 'Free Size'];

export const AdminDiscovery: React.FC = () => {
  const { showToast } = useShop();
  const { allProducts = [] } = useProducts();
  const [form, setForm] = useState<DiscoverySettings>(DEFAULT_DISCOVERY);
  // What the store has saved right now (the form may hold changes not saved yet)
  const [live, setLive] = useState<DiscoverySettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  useEffect(() => onSnapshot(doc(db, 'storefront_settings', 'discovery'), (snap) => {
    try {
      const saved = normaliseDiscovery(snap.exists() ? JSON.parse(snap.data().value_json || '{}') : {});
      setForm(saved);
      setLive(saved);
    } catch {}
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

  const input = kit.field;
  const label = 'sag-label';
  const optional = 'font-normal text-ink-muted';

  const saved = live || DEFAULT_DISCOVERY;
  const unsaved = JSON.stringify(form) !== JSON.stringify(saved);
  const liveFeatureCount = FEATURE_LABELS.filter(([key]) => saved.features[key]).length;
  // An occasion is on the store only when it is switched on and has an in-stock product
  const liveOccasionCount = saved.features.occasions ? saved.occasions.filter((o) => o.enabled && occasionProducts(o, products).length > 0).length : 0;
  const featureByKey = new Map(FEATURE_LABELS.map((row) => [row[0], row]));

  return (
    <div id="admin-discovery-page" className="space-y-5">
      <AdminPageHeader
        eyebrow="Storefront · Discovery"
        title="Discovery features"
        icon={<SearchIcon live={false} />}
        description="The extra ways shoppers find and choose a style. Switch each one on or off, manage the occasion collections, then press Save. Everything uses your real catalogue."
      />

      <Tiles className="lg:!grid-cols-3">
        <Tile label="Features live on the site" value={<>{liveFeatureCount} <span className="text-base font-medium text-ink-muted">of {FEATURE_LABELS.length}</span></>} />
        <Tile label="Occasions on the site" value={liveOccasionCount} note={saved.features.occasions ? 'Switched on and with a product in stock' : '"Shop by occasion" is off'} />
        <Tile label="Occasions in all" value={saved.occasions.length} />
      </Tiles>

      {FEATURE_GROUPS.map((group) => (
        <Panel key={group.title} title={group.title} hint={group.hint}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {group.keys.map((key) => {
              const row = featureByKey.get(key);
              if (!row) return null;
              const wasOn = saved.features[key];
              return (
                <CheckRow
                  key={key}
                  label={row[1]}
                  hint={row[2]}
                  checked={form.features[key]}
                  onChange={(checked) => setForm((f) => ({ ...f, features: { ...f.features, [key]: checked } }))}
                  onText={wasOn ? 'Live on the site' : 'Live after you save'}
                  offText={wasOn ? 'Off after you save' : 'Off'}
                />
              );
            })}
          </div>
        </Panel>
      ))}

      <Panel
        title="Occasions"
        hint="An occasion shows on the store only when it is enabled and has at least one in-stock product. Products come from the rule (occasion word, price, sizes) plus any you pick by hand."
        action={<button onClick={addOccasion} className={kit.small}><Plus className="w-4 h-4 text-current" /> Add occasion</button>}
      >
        {form.occasions.length === 0 ? (
          <Empty icon={<CalendarHeart />} title="No occasions yet">Use Add occasion to make the first collection, for example "Wedding" or "Office wear".</Empty>
        ) : (
          <ul className="space-y-2">
            {form.occasions.map((o, i) => {
              const count = occasionProducts(o, products).length;
              const open = editing === o.id;
              return (
                <li key={o.id} className={`rounded-[16px] border transition-colors ${open ? 'border-brand-line bg-sunken' : 'border-line bg-sunken'}`}>
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1 pl-3 pr-1.5 py-1.5">
                    <span className="inline-flex mr-1" title={o.enabled ? 'Shown on the store' : 'Hidden'}>
                      <Switch checked={o.enabled} onChange={(enabled) => setOccasion(o.id, { enabled })} label={`Show ${o.name}`} />
                    </span>
                    <button onClick={() => setEditing(open ? null : o.id)} aria-expanded={open} className="flex-1 min-w-[8rem] min-h-11 flex flex-wrap items-center gap-x-2 gap-y-1 text-left cursor-pointer">
                      <span className="text-[15px] leading-5 font-semibold text-ink">{o.name}</span>
                      <Pill tone={!o.enabled ? 'off' : count > 0 ? 'live' : 'soon'}>{!o.enabled ? 'Off' : count > 0 ? 'On' : 'On, but no product in stock'}</Pill>
                      <span className="text-[13px] text-ink-muted sag-num">{count} {count === 1 ? 'product' : 'products'}</span>
                      <span className="text-[13px] text-brand underline underline-offset-[3px]">{open ? 'Close' : 'Edit'}</span>
                    </button>
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${o.name} up`} className={kit.iconBtn}><ArrowUp className="w-4 h-4 text-current" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === form.occasions.length - 1} aria-label={`Move ${o.name} down`} className={kit.iconBtn}><ArrowDown className="w-4 h-4 text-current" /></button>
                    <button onClick={() => removeOccasion(o)} aria-label={`Delete ${o.name}`} className={kit.iconBtnDanger}><Trash2 className="w-4 h-4 text-current" /></button>
                  </div>
                  {open && (
                    <div className="border-t border-line p-3 sm:p-4 grid gap-4 sm:grid-cols-2">
                      <label className="block"><span className={label}>Name</span><input value={o.name} maxLength={40} onChange={(e) => setOccasion(o.id, { name: e.target.value })} className={input} /></label>
                      <label className="block"><span className={label}>Short description <span className={optional}>(optional)</span></span><input value={o.description || ''} maxLength={160} onChange={(e) => setOccasion(o.id, { description: e.target.value })} className={input} /></label>
                      <label className="block">
                        <span className={label}>Auto-include products for occasion</span>
                        <select value={o.match || ''} onChange={(e) => setOccasion(o.id, { match: e.target.value })} className={`${input} cursor-pointer`}>
                          <option value="">None (hand-picked only)</option>
                          {Object.keys(OCCASIONS).map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                        <span className={`mt-1.5 block ${kit.hint}`}>Adds every product that suits this occasion, by itself.</span>
                      </label>
                      <label className="block"><span className={label}>Max price ₹ <span className={optional}>(optional)</span></span><input inputMode="numeric" value={o.maxPrice || ''} onChange={(e) => setOccasion(o.id, { maxPrice: Number(e.target.value.replace(/\D/g, '')) || null })} className={`${input} sag-num`} /></label>
                      <fieldset className="sm:col-span-2">
                        <legend className={label}>Only styles available in these sizes <span className={optional}>(optional)</span></legend>
                        <div className="flex flex-wrap gap-2">
                          {SIZE_OPTIONS.map((s) => {
                            const on = (o.sizes || []).includes(s);
                            return <button key={s} type="button" onClick={() => setOccasion(o.id, { sizes: on ? (o.sizes || []).filter((x) => x !== s) : [...(o.sizes || []), s] })} aria-pressed={on} className="sag-chip h-11 px-3.5 text-sm">{s}</button>;
                          })}
                        </div>
                      </fieldset>
                      <div className="sm:col-span-2">
                        <p className={label}>Hand-picked products <span className={`${optional} sag-num`}>({o.productIds.length})</span></p>
                        <input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Search products" aria-label="Search products to hand-pick" className={`${input} mb-2`} />
                        <div className="max-h-64 overflow-y-auto overscroll-contain rounded-[16px] border border-line p-1 grid gap-0.5">
                          {products.filter((p) => p.productType !== 'accessory' && p.name.toLowerCase().includes(pickerQuery.toLowerCase())).map((p) => {
                            const on = o.productIds.includes(String(p.id));
                            return (
                              <label key={p.id} className="flex items-center gap-2.5 min-h-11 px-2 text-sm leading-5 text-ink rounded-full hover:bg-sunken-deep cursor-pointer">
                                <input type="checkbox" checked={on} onChange={() => setOccasion(o.id, { productIds: on ? o.productIds.filter((x) => x !== String(p.id)) : [...o.productIds, String(p.id)] })} className="w-5 h-5 shrink-0 accent-brand" />
                                <span className="flex-1 min-w-0 line-clamp-1">{p.name}</span><span className="text-[13px] text-ink-muted sag-num">₹{p.price}</span>
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
        )}
      </Panel>

      <SaveBar note={unsaved ? <span className="font-medium text-brand">You have changes that are not saved yet. Nothing changes on the store until you save.</span> : 'Everything here is saved and live.'}>
        <button onClick={save} disabled={saving} className={kit.primary}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />} Save changes
        </button>
      </SaveBar>
    </div>
  );
};
