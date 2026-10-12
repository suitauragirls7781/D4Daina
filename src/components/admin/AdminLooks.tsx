import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { adminDb as db } from '../../lib/firebase';
import { deleteImages, uploadImage } from '../../lib/dataStore';
import { useShop } from '../../context/ShopContext';
import { useProducts } from '../../context/ProductContext';
import { Check, ImagePlus, Layers, Loader2, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { Product, ProductColor, ProductSize } from '../../types';
import { normaliseDiscovery } from '../../utils/discovery';
import { detectColourFromFile } from '../../utils/detectColour';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { isAvailable } from '../../utils/smartQuery';
import {
  ACCESSORY_CATEGORY, ACCESSORY_SIZE, ACCESSORY_TYPES, FOOTWEAR_SIZES, LookRelations, MAX_LOOK_ITEMS, MAX_LOOKS, MAX_SHOWN_ACCESSORIES,
  SET_TYPES, SIZED_ACCESSORY_TYPES, accessoriesFor, accessoryTypeOf, byAccessoryType, inr, isAccessory, isLookId, normaliseLookRelations,
  setTypeHint, setTypeOf, sizesOf,
} from '../../utils/looks';
import { AdminPageHeader, SCRIM, ui } from './adminShared';

const LIST_LIMIT = 60;
// Search results shown at once in "Make a product a combo"
const PICK_LIMIT = 8;
const OTHER = 'Other';
// "Other (type your own)" in the set type select
const CUSTOM_SET_TYPE = '__custom';
// "Add bag", "Add heels"... then "Add other" for anything else (the admin types the kind).
const QUICK_ADD: Array<{ type: string; label: string }> = [
  ...ACCESSORY_TYPES.map((type) => ({ type, label: `Add ${type.toLowerCase()}` })),
  { type: OTHER, label: 'Add other' },
];

// Order-independent, so "unsaved changes" only shows when something really changed.
const fingerprint = (m: LookRelations) => JSON.stringify(Object.keys(m).sort().map((k) => [k, [...m[k]].sort()]));
const matches = (p: Product, query: string) => {
  const needle = query.trim().toLowerCase();
  return !needle || [p.name, p.sku, p.accessoryType, p.setType].some((v) => String(v || '').toLowerCase().includes(needle));
};
/** Outfit search for "Make a product a combo" (nothing is listed until the admin types). */
const matchesOutfit = (p: Product, query: string) => {
  const needle = query.trim().toLowerCase();
  return Boolean(needle) && [p.name, p.sku, p.category, p.id].some((v) => String(v || '').toLowerCase().includes(needle));
};
const mrpOf = (p: Product) => Math.max(p.price, Number(p.originalPrice) || p.price);
/** Only outfits can be combos: never an accessory. */
const isWomenOutfit = (p?: Product | null) => Boolean(p) && !isAccessory(p);
// "Standard" / "Default" are stand-ins for products saved without a colour.
const isRealColour = (c?: ProductColor) => Boolean(c && c.name && !['standard', 'default'].includes(c.name.trim().toLowerCase()));
/** Sizes an accessory is sold in, apart from Free Size (empty = one size). */
const realSizesOf = (p: Product) => sizesOf(p).filter((s) => s !== ACCESSORY_SIZE);
/** "UK 5, UK 6" or "6 sizes" for accessories sold in sizes; '' for one-size accessories. */
const sizeSummary = (p: Product) => {
  const sizes = realSizesOf(p);
  return sizes.length === 0 ? '' : sizes.length <= 3 ? sizes.join(', ') : `${sizes.length} sizes`;
};

const Thumb: React.FC<{ p: Product }> = ({ p }) => (
  <img src={getCleanImageUrl(p.images?.find(Boolean) || p.image, 120)} alt="" loading="lazy" className="shrink-0 w-12 aspect-[4/5] rounded-[12px] object-cover object-top bg-sunken" />
);
const Status: React.FC<{ p: Product }> = ({ p }) => (
  <span className={`sag-num ${p.hidden ? 'text-ink-muted' : !isAvailable(p) ? 'text-danger font-semibold' : 'text-ink-muted'}`}>
    {p.hidden ? 'Hidden' : !isAvailable(p) ? 'Sold out' : `${Number(p.stockQuantity ?? 0)} in stock`}
  </span>
);
const Price: React.FC<{ p: Product }> = ({ p }) => (
  <>
    <span className="font-semibold text-ink sag-num">{inr(p.price)}</span>
    {mrpOf(p) > p.price && <span className="ml-1.5 line-through text-ink-faint sag-num">{inr(mrpOf(p))}</span>}
  </>
);
/** One honest count from the live catalogue. */
const Stat: React.FC<{ label: string; value: React.ReactNode; note: string }> = ({ label, value, note }) => (
  <div className="min-w-0 sag-glass px-3.5 py-3 sm:px-4 sm:py-3.5">
    <dt className={`${ui.eyebrow} break-words`}>{label}</dt>
    <dd className={`mt-1 ${ui.stat}`}>{value}</dd>
    <dd className="mt-0.5 text-xs leading-4 text-ink-muted break-words">{note}</dd>
  </div>
);

interface Draft {
  id?: string;
  type: string;
  customType: string;
  name: string;
  price: string;
  mrp: string;
  stock: string;
  images: string[];
  colourName: string;
  colourHex: string;
  description: string;
  published: boolean;
  /** 'one' = sold as Free Size; 'sizes' = sold in the ticked sizes (UK shoe sizes for heels). */
  sizeMode: 'one' | 'sizes';
  sizes: ProductSize[];
  /** The admin chose the sizing (or it was saved before), so changing the type no longer switches it. */
  sizesTouched: boolean;
}

/** Heels start with shoe sizes; every other kind starts as one size. */
const sizeModeFor = (type: string): Draft['sizeMode'] => (SIZED_ACCESSORY_TYPES.includes(type) ? 'sizes' : 'one');
const emptyDraft = (type: string): Draft => ({
  type, customType: '', name: '', price: '', mrp: '', stock: '1', images: [], colourName: '', colourHex: '#1B1A17', description: '', published: true,
  sizeMode: sizeModeFor(type), sizes: [], sizesTouched: false,
});
const draftFrom = (p: Product): Draft => {
  const kind = accessoryTypeOf(p);
  const known = (ACCESSORY_TYPES as readonly string[]).includes(kind);
  const colour = (p.colors || []).find(isRealColour);
  const sizes = realSizesOf(p);
  return {
    id: p.id,
    type: known ? kind : OTHER,
    customType: known || kind === OTHER ? '' : kind,
    name: p.name,
    price: String(p.price || ''),
    mrp: mrpOf(p) > p.price ? String(mrpOf(p)) : '',
    stock: String(Math.max(0, Number(p.stockQuantity ?? 0))),
    images: (p.images || []).filter(Boolean),
    colourName: colour?.name || '',
    colourHex: colour?.hex || '#1B1A17',
    description: p.description || '',
    published: !p.hidden,
    sizeMode: sizes.length ? 'sizes' : 'one',
    sizes,
    sizesTouched: true,
  };
};

/**
 * Admin: "Complete the Look", a section of its own. Accessories (bag, heels, jewellery, earrings, watch...)
 * are real products shown only inside Complete the look on combo / set product pages, and bought only
 * together with that outfit. Here the admin adds accessories, marks which outfits are combos, and picks
 * the accessories each combo shows (none picked = all published accessories).
 */
export const AdminLooks: React.FC = () => {
  const { showToast } = useShop();
  const { allProducts = [], isLoading, addProduct, updateProduct, deleteProduct, toggleProductStatus } = useProducts();
  const [saved, setSaved] = useState<LookRelations>({});
  const [form, setForm] = useState<LookRelations>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [featureOn, setFeatureOn] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [accQuery, setAccQuery] = useState('');
  const [pickQuery, setPickQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // "Make a product a combo": the outfit picked and its set type
  const [comboQuery, setComboQuery] = useState('');
  const [comboPickId, setComboPickId] = useState<string | null>(null);
  const [comboType, setComboType] = useState('');
  const [comboCustom, setComboCustom] = useState(false);
  const [making, setMaking] = useState(false);
  const comboSearchRef = useRef<HTMLInputElement>(null);
  const comboTypeRef = useRef<HTMLSelectElement>(null);

  const dirty = fingerprint(form) !== fingerprint(saved);
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => onSnapshot(doc(db, 'storefront_settings', 'lookRelations'), (snap) => {
    let value: LookRelations = {};
    try { value = normaliseLookRelations(snap.exists() ? JSON.parse(snap.data().value_json || '{}') : {}); } catch {}
    setSaved(value);
    // Keep edits the admin has not saved yet
    if (!dirtyRef.current) setForm(value);
    setLoadError(false);
    setLoaded(true);
  }, () => { setLoadError(true); setLoaded(true); }), []);

  useEffect(() => onSnapshot(doc(db, 'storefront_settings', 'discovery'), (snap) => {
    try { setFeatureOn(normaliseDiscovery(snap.exists() ? JSON.parse(snap.data().value_json || '{}') : {}).features.completeLook !== false); } catch {}
  }, () => {}), []);

  // Warn before closing the tab with unsaved choices
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const catalogueReady = !isLoading && allProducts.length > 0;
  const byId = useMemo(() => new Map(allProducts.map((p) => [String(p.id), p])), [allProducts]);
  const accessories = useMemo(() => byAccessoryType(allProducts.filter(isAccessory)), [allProducts]);
  const combos = useMemo(() => allProducts.filter((p) => isWomenOutfit(p) && setTypeOf(p) && isLookId(String(p.id))), [allProducts]);
  // Women's outfits that can be made a combo (never an accessory; the id must be one a look can be saved under)
  const outfits = useMemo(() => allProducts.filter((p) => isWomenOutfit(p) && !setTypeOf(p) && isLookId(String(p.id))), [allProducts]);
  const setLike = useMemo(() => outfits.filter((p) => setTypeHint(p.name).looksLikeSet).slice(0, 5), [outfits]);
  const outfitResults = useMemo(() => outfits.filter((p) => matchesOutfit(p, comboQuery)), [outfits, comboQuery]);
  // Cleared automatically if the product is deleted or becomes a combo on another device
  const comboPick = comboPickId ? outfits.find((p) => String(p.id) === comboPickId) : undefined;
  const accResults = useMemo(() => accessories.filter((p) => matches(p, accQuery)), [accessories, accQuery]);
  const pickable = useMemo(() => accessories.filter((p) => isLookId(String(p.id)) && matches(p, pickQuery)), [accessories, pickQuery]);
  // Honest counts from the live catalogue: shoppers see only published, in-stock accessories
  const publishedAccessories = accessories.filter((p) => !p.hidden).length;
  const shownAccessories = accessories.filter((p) => !p.hidden && isAvailable(p)).length;
  const liveCombos = combos.filter((p) => !p.hidden).length;

  // A combo with no picks shows every accessory: drop the key so the saved map stays clean.
  const setPicks = (key: string, ids: string[]) => setForm((f) => {
    const next = { ...f };
    if (ids.length) next[key] = ids; else delete next[key];
    return next;
  });
  const togglePick = (key: string, id: string) => {
    const picks = form[key] || [];
    if (picks.includes(id)) { setPicks(key, picks.filter((x) => x !== id)); return; }
    if (picks.length >= MAX_LOOK_ITEMS) { showToast(`A product can show up to ${MAX_LOOK_ITEMS} chosen accessories. Untick one first.`, 'info'); return; }
    if (!form[key] && Object.keys(form).length >= MAX_LOOKS) { showToast(`You can choose accessories for up to ${MAX_LOOKS} products.`, 'error'); return; }
    setPicks(key, [...picks, id]);
  };

  /** Only real accessory ids on real products are saved (deleted ones drop out). */
  const cleanForSave = (value: LookRelations) => {
    if (!catalogueReady) return normaliseLookRelations(value);
    const pruned: LookRelations = {};
    Object.entries(value).forEach(([key, ids]) => {
      const owner = byId.get(key);
      if (!owner || !isWomenOutfit(owner)) return;
      const kept = ids.filter((id) => isAccessory(byId.get(id)));
      if (kept.length) pruned[key] = kept;
    });
    return normaliseLookRelations(pruned);
  };

  const putRelations = async (value: LookRelations) => {
    const response = await fetch('/api/admin-config', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { lookRelations: value } }),
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not save.');
  };

  const save = async () => {
    if (loadError) return;
    const clean = cleanForSave(form);
    setSaving(true);
    try {
      await putRelations(clean);
      setForm(clean);
      setSaved(clean);
      showToast('Saved. Product pages now show these accessories.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (p: Product) => {
    setBusyId(p.id);
    try {
      await toggleProductStatus(p.id);
      showToast(p.hidden ? `"${p.name}" is now shown in Complete the look.` : `"${p.name}" is hidden from the store.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'The change could not be saved. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const removeAccessory = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? It disappears from every Complete the look and from the store. Past orders keep their details, but this accessory's photos will no longer show in them. If it has been sold, hide it instead.`)) return;
    setBusyId(p.id);
    try {
      await deleteProduct(p.id);
      // Take it out of every combo's choices straight away (unsaved edits elsewhere stay unsaved)
      const without = (m: LookRelations) => Object.fromEntries(
        Object.entries(m).map(([k, ids]) => [k, ids.filter((id) => id !== p.id)] as [string, string[]]).filter(([, ids]) => ids.length),
      );
      if (!loadError && Object.values(saved).some((ids) => ids.includes(p.id))) {
        const next = without(saved);
        await putRelations(next).then(() => setSaved(next)).catch(() => {});
      }
      setForm((f) => without(f));
      showToast(`Deleted "${p.name}".`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not delete. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** Picks the outfit to make a combo; a name like "3 piece set" pre-selects that set type. */
  const chooseForCombo = (p: Product) => {
    setComboPickId(String(p.id));
    const suggestion = setTypeHint(p.name).suggestion;
    if (suggestion) {
      setComboType(suggestion);
      setComboCustom(false);
    }
    window.requestAnimationFrame(() => comboTypeRef.current?.focus());
  };
  const clearComboPick = () => {
    setComboPickId(null);
    window.requestAnimationFrame(() => comboSearchRef.current?.focus());
  };

  // A set / combo type is what makes a product a combo: Complete the look then shows on its page.
  const makeCombo = async () => {
    const p = comboPick;
    const type = comboType.trim().slice(0, 40);
    if (!p) { showToast('Choose a product first.', 'error'); return; }
    if (!type) { showToast('Choose the set / combo type.', 'error'); return; }
    setMaking(true);
    try {
      await updateProduct(p.id, { setType: type });
      showToast(`"${p.name}" is now a combo (${type}). Choose its accessories below, or leave it on all.`, 'success');
      setComboPickId(null);
      setComboQuery('');
      setComboType('');
      setComboCustom(false);
    } catch (err: any) {
      showToast(err?.message || 'The change could not be saved. Please try again.', 'error');
    } finally {
      setMaking(false);
    }
  };

  const removeCombo = async (p: Product) => {
    const key = String(p.id);
    const hadPicks = Boolean(form[key]?.length || saved[key]?.length);
    if (!window.confirm(`Remove "${p.name}" from combos?\n\nComplete the look will no longer show on its page${hadPicks ? ' and its chosen accessories will be cleared' : ''}. The product itself stays in your catalogue.`)) return;
    setBusyId(p.id);
    try {
      await updateProduct(p.id, { setType: '' });
      // Its accessory choices no longer apply (unsaved edits for other combos stay unsaved)
      if (!loadError && saved[key]) {
        const next = { ...saved };
        delete next[key];
        await putRelations(next).then(() => setSaved(next)).catch(() => {});
      }
      setForm((f) => {
        if (!f[key]) return f;
        const next = { ...f };
        delete next[key];
        return next;
      });
      if (editing === key) setEditing(null);
      showToast(`"${p.name}" is no longer a combo.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'The change could not be saved. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (!loaded) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;

  const card = ui.card;
  const input = ui.search;
  const iconBtn = 'w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors';
  const field = ui.field;
  // Counts wait for the catalogue instead of showing a misleading 0
  const countsLoading = isLoading && allProducts.length === 0;
  const count = (n: number) => (countsLoading ? '…' : n);
  const combosWithPicks = combos.filter((p) => (form[String(p.id)] || []).length > 0).length;
  const saveButton = (
    <button onClick={save} disabled={saving || !dirty || loadError} className="h-11 px-5 sag-btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
      {saving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />} Save changes
    </button>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Storefront · Accessories"
        title="Complete the Look"
        icon={<Layers className="text-current" />}
        description={<>Accessories (bag, heels, jewellery, earrings, watch...) are shown only on combo product pages, inside "Complete the look". Customers can buy them only together with that outfit — never on their own, and never from the shop, search or home page.</>}
        actions={<>
          {dirty && <span className="h-8 px-3 rounded-full bg-sale-tint text-xs font-semibold text-sale inline-flex items-center">Unsaved changes</span>}
          {saveButton}
        </>}
      />
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 text-sm text-ink-muted">
        {['Add accessories', 'Mark your combo products', 'Choose accessories for a combo (optional), then save'].map((step, i) => (
          <li key={step} className="flex items-center gap-3 rounded-[16px] bg-page px-4 py-3">
            <span className="w-7 h-7 rounded-full bg-brand-wash text-brand text-sm font-semibold sag-num flex items-center justify-center shrink-0">{i + 1}</span>
            <span className="min-w-0 text-ink">{step}</span>
          </li>
        ))}
      </ol>

      {loadError && (
        <p role="alert" className="rounded-[16px] border border-danger-line bg-danger-tint px-4 py-3 text-sm text-danger">The saved choices could not be loaded, so saving is turned off to avoid overwriting them. Please refresh the page.</p>
      )}
      {!featureOn && (
        <p className="rounded-[16px] bg-sale-tint border border-sale-line px-4 py-3 text-sm text-ink">Complete the Look is switched off in the Discovery settings, so shoppers will not see it until it is turned on there.</p>
      )}

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3" aria-label="Complete the Look in numbers">
        <Stat label="Accessories" value={count(accessories.length)} note={countsLoading ? 'Loading…' : `${publishedAccessories} published · ${accessories.length - publishedAccessories} hidden`} />
        <Stat label="Published & in stock" value={count(shownAccessories)} note={!featureOn ? 'not shown: Complete the Look is off' : combos.length === 0 ? 'no combo products yet' : 'can show on combo pages'} />
        <Stat label="Combo products" value={count(combos.length)} note={countsLoading ? 'Loading…' : `${liveCombos} on the store`} />
        <Stat label="Combos with own picks" value={count(combosWithPicks)} note={countsLoading ? 'Loading…' : `${combos.length - combosWithPicks} show all accessories`} />
      </dl>

      <div className="grid gap-6 xl:grid-cols-2 items-start">
        {/* Accessories */}
        <section className={`${card} min-w-0`} aria-labelledby="ctl-acc-title">
          <h3 id="ctl-acc-title" className={ui.h2}>Accessories <span className="font-normal text-ink-muted sag-num">({accessories.length})</span></h3>
          <p className="text-[13px] text-ink-muted mt-0.5">Real products with their own price, stock and photos. Sold out or hidden ones are not shown to shoppers.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_ADD.map(({ type, label }) => (
              <button key={type} type="button" onClick={() => setDraft(emptyDraft(type))}
                className={`${ui.small} md:h-11`}>
                <Plus className="w-4 h-4 text-current" /> {label}
              </button>
            ))}
          </div>

          {accessories.length > 6 && (
            <div className="relative mt-4">
              <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input value={accQuery} onChange={(e) => setAccQuery(e.target.value)} placeholder="Search accessories" aria-label="Search accessories" className={input} />
            </div>
          )}

          {!catalogueReady && isLoading ? (
            <p className="mt-4 text-sm text-ink-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-current" /> Loading products…</p>
          ) : accessories.length === 0 ? (
            <div className="mt-4 rounded-[16px] bg-page p-5 text-sm text-ink-muted text-center">
              No accessories yet. Use the buttons above to add a bag, heels, jewellery, earrings or a watch.
            </div>
          ) : accResults.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">No accessories match.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {accResults.slice(0, LIST_LIMIT).map((p) => (
                <li key={p.id} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Thumb p={p} />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="text-sm font-semibold text-ink line-clamp-1">{p.name}</p>
                    <p className="mt-0.5 text-[13px] text-ink-muted">
                      <span className="font-semibold text-ink-muted">{accessoryTypeOf(p)}</span> · <Price p={p} />{sizeSummary(p) && <> · {sizeSummary(p)}</>} · <Status p={p} />
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <button type="button" onClick={() => togglePublished(p)} disabled={busyId === p.id} aria-pressed={!p.hidden}
                      title={p.hidden ? 'Hidden: tap to show it in Complete the look' : 'Published: tap to hide it'}
                      className={`h-11 sm:h-9 px-3.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${p.hidden ? 'bg-sunken border-line text-ink-muted' : 'bg-ok-tint border-ok-line text-ok'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${p.hidden ? 'bg-ink-faint' : 'bg-ok'}`} aria-hidden="true" />
                      {p.hidden ? 'Hidden' : 'Published'}
                    </button>
                    <button type="button" onClick={() => setDraft(draftFrom(p))} disabled={busyId === p.id} aria-label={`Edit ${p.name}`} className={`${ui.small} !border-brand-line !text-brand`}><Pencil className="w-3.5 h-3.5 text-current" /> Edit</button>
                    <button type="button" onClick={() => removeAccessory(p)} disabled={busyId === p.id} aria-label={`Delete ${p.name}`} className={`${iconBtn} hover:bg-danger-tint text-danger`}>
                      {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Trash2 className="w-4 h-4 text-current" />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {accResults.length > LIST_LIMIT && <p className="mt-2 text-[13px] text-ink-muted">Showing {LIST_LIMIT} of {accResults.length}. Search to narrow the list.</p>}
        </section>

        {/* Combo / set products */}
        <section className={`${card} min-w-0`} aria-labelledby="ctl-combo-title">
          <h3 id="ctl-combo-title" className={ui.h2}>Combo / set products <span className="font-normal text-ink-muted sag-num">({combos.length})</span></h3>
          <p className="text-[13px] text-ink-muted mt-0.5">
            Complete the look shows on these product pages. Choose accessories for a product, or leave it on all accessories (in-stock ones, up to {MAX_SHOWN_ACCESSORIES}).
          </p>

          {/* Make a product a combo: its set / combo type is saved on the product */}
          <div role="group" className="mt-4 rounded-[16px] bg-page p-3.5 sm:p-4" aria-labelledby="ctl-make-title">
            <p id="ctl-make-title" className="text-sm font-semibold text-ink">Make a product a combo</p>
            <p className="text-[13px] text-ink-muted mt-0.5">Find the outfit, choose its set type, then tap Make combo.</p>
            {comboPick ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] bg-sunken-deep border border-line p-2">
                <Thumb p={comboPick} />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm font-medium text-ink line-clamp-1">{comboPick.name}</p>
                  <p className="text-[13px] text-ink-muted">{comboPick.category} · <Price p={comboPick} /> · <Status p={comboPick} /></p>
                </div>
                <button type="button" onClick={clearComboPick} disabled={making}
                  className={`ml-auto ${ui.small}`}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <div className="relative mt-3">
                  <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input ref={comboSearchRef} value={comboQuery} onChange={(e) => setComboQuery(e.target.value)}
                    placeholder="Search products by name or SKU" aria-label="Search products to make a combo" className={input} />
                </div>
                {comboQuery.trim() && (outfitResults.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">
                    No product matches{outfits.length === 0 && !countsLoading ? ' (every product is already a combo)' : ''}. Accessories and products that are already combos are not listed.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-72 overflow-y-auto grid gap-1" aria-label="Matching products">
                    {outfitResults.slice(0, PICK_LIMIT).map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => chooseForCombo(p)} className="w-full flex items-center gap-3 p-1.5 rounded-[16px] text-left hover:bg-sunken-deep cursor-pointer">
                          <Thumb p={p} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-ink line-clamp-1">{p.name}</span>
                            <span className="block text-[13px] text-ink-muted">{p.category} · <Price p={p} /> · <Status p={p} /></span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
                {comboQuery.trim() && outfitResults.length > PICK_LIMIT && (
                  <p className="mt-1 text-[13px] text-ink-muted">Showing {PICK_LIMIT} of {outfitResults.length}. Keep typing to narrow the list.</p>
                )}
              </>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select ref={comboTypeRef} value={comboCustom ? CUSTOM_SET_TYPE : comboType} aria-label="Set / combo type"
                onChange={(e) => {
                  if (e.target.value === CUSTOM_SET_TYPE) {
                    setComboCustom(true);
                    if ((SET_TYPES as readonly string[]).includes(comboType)) setComboType('');
                  } else {
                    setComboCustom(false);
                    setComboType(e.target.value);
                  }
                }}
                className={`${field} flex-1 basis-40 min-w-0`}>
                <option value="">Choose set type</option>
                {SET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value={CUSTOM_SET_TYPE}>Other (type your own)</option>
              </select>
              {comboCustom && (
                <input value={comboType} maxLength={40} onChange={(e) => setComboType(e.target.value)} placeholder="e.g. Kurti + palazzo + dupatta"
                  aria-label="Your own set / combo type" className={`${field} flex-1 basis-40 min-w-0`} />
              )}
              <button type="button" onClick={makeCombo} disabled={!comboPick || !comboType.trim() || making}
                className="h-11 px-5 sag-btn-primary text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                {making ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Plus className="w-4 h-4 text-current" />} Make combo
              </button>
            </div>
          </div>

          {combos.length === 0 ? (
            <div className="mt-4 rounded-[16px] bg-page p-5 text-sm text-ink-muted text-center">
              No combo products yet. Use <span className="font-semibold">Make a product a combo</span> above to mark an outfit with its set type.
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {combos.map((p) => {
                const key = String(p.id);
                const picks = form[key] || [];
                const showing = accessoriesFor(p, form, accessories).length;
                const deletedPicks = catalogueReady ? picks.filter((id) => !isAccessory(byId.get(id))).length : 0;
                const open = editing === key;
                return (
                  <li key={key} className={`py-3 ${open ? 'bg-sunken -mx-2 px-2 rounded-[16px]' : ''}`}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <Thumb p={p} />
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="text-sm font-semibold text-ink line-clamp-1">{p.name}</p>
                        <p className="mt-0.5 text-[13px] text-ink-muted">
                          <span className="inline-block px-2 rounded-full bg-sale-tint text-sale text-xs font-semibold">{setTypeOf(p)}</span>{' '}
                          {p.hidden ? 'Product hidden — not on the store'
                            : `${picks.length ? `${picks.length} chosen` : 'All accessories'} · ${showing} showing now`}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => removeCombo(p)} disabled={busyId === p.id} aria-label={`Remove combo: ${p.name}`}
                          className="h-11 md:h-9 px-3 rounded-full text-[13px] font-semibold text-danger hover:bg-danger-tint inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                          {busyId === p.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-current" />} Remove combo
                        </button>
                        <button type="button" onClick={() => { setEditing(open ? null : key); setPickQuery(''); }} aria-expanded={open}
                          className={`${ui.small} !border-brand-line !text-brand`}>
                          {open ? 'Done' : 'Choose accessories'}
                        </button>
                      </div>
                    </div>

                    {open && (
                      <div className="mt-3">
                        <p className="text-[13px] text-ink-muted">
                          Tick up to {MAX_LOOK_ITEMS} accessories for this product. With none ticked, all published in-stock accessories show.
                        </p>
                        {deletedPicks > 0 && <p className="mt-1 text-[13px] text-sale">{deletedPicks} chosen {deletedPicks === 1 ? 'accessory was' : 'accessories were'} deleted and will be removed when you save.</p>}
                        {picks.length > 0 && (
                          <button type="button" onClick={() => setPicks(key, [])} className={`mt-2 ${ui.small}`}>
                            Show all accessories instead
                          </button>
                        )}
                        {accessories.length === 0 ? (
                          <p className="mt-3 text-sm text-ink-muted">Add accessories first (left).</p>
                        ) : (
                          <>
                            {accessories.length > 6 && (
                              <div className="relative mt-3">
                                <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                                <input value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} placeholder="Search accessories" aria-label="Search accessories to choose" className={input} />
                              </div>
                            )}
                            <ul className="mt-2 max-h-80 overflow-y-auto grid gap-1">
                              {pickable.slice(0, LIST_LIMIT).map((a) => {
                                const id = String(a.id);
                                const on = picks.includes(id);
                                const full = !on && picks.length >= MAX_LOOK_ITEMS;
                                return (
                                  <li key={id}>
                                    <label className={`flex items-center gap-3 p-1.5 rounded-[16px] ${full ? 'opacity-50 cursor-not-allowed' : 'hover:bg-sunken-deep cursor-pointer'}`}>
                                      <input type="checkbox" checked={on} disabled={full} onChange={() => togglePick(key, id)} className="w-4 h-4 accent-brand shrink-0" />
                                      <Thumb p={a} />
                                      <span className="min-w-0 flex-1">
                                        <span className="block text-sm text-ink line-clamp-1">{a.name}</span>
                                        <span className="block text-[13px] text-ink-muted">{accessoryTypeOf(a)} · <Price p={a} /> · <Status p={a} /></span>
                                      </span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                            {pickable.length === 0 && <p className="mt-2 text-sm text-ink-muted">No accessories match.</p>}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {setLike.length > 0 && (
            <div className="mt-4 rounded-[16px] bg-page p-3.5">
              <p className="text-[13px] font-semibold text-ink">These look like sets but have no set / combo type yet</p>
              <ul className="mt-2 grid gap-1">
                {setLike.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Thumb p={p} />
                    <span className="min-w-0 flex-1 text-sm text-ink line-clamp-1">{p.name}</span>
                    <button type="button" onClick={() => chooseForCombo(p)} disabled={comboPickId === String(p.id)} aria-label={comboPickId === String(p.id) ? `${p.name} is selected above` : `Select ${p.name} to make it a combo`}
                      className={`${ui.small} disabled:cursor-default`}>
                      {comboPickId === String(p.id) ? 'Selected' : 'Select'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dirty && <div className="mt-4 flex justify-end">{saveButton}</div>}
        </section>
      </div>

      {draft && (
        <AccessoryForm
          draft={draft}
          existing={draft.id ? byId.get(draft.id) : undefined}
          allProducts={allProducts}
          onClose={() => setDraft(null)}
          addProduct={addProduct}
          updateProduct={updateProduct}
          showToast={showToast}
        />
      )}
    </div>
  );
};

interface AccessoryFormProps {
  draft: Draft;
  existing?: Product;
  allProducts: Product[];
  onClose: () => void;
  addProduct: (p: Omit<Product, 'id'>) => Promise<Product>;
  updateProduct: (id: string, p: Partial<Product>) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
}

/** Compact add / edit form for one accessory, saved through the same product functions as the catalogue. */
const AccessoryForm: React.FC<AccessoryFormProps> = ({ draft: initial, existing, allProducts, onClose, addProduct, updateProduct, showToast }) => {
  const [d, setD] = useState<Draft>(initial);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Uploaded in this session (deleted if the admin cancels) / saved photos removed (deleted after a successful save)
  const [sessionUploads, setSessionUploads] = useState<string[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const isEdit = Boolean(d.id);
  const kindLabel = d.type === OTHER ? (d.customType.trim() || 'accessory') : d.type.toLowerCase();
  // UK shoe sizes, plus any other size already saved on this accessory (kept, never dropped silently)
  const sizeChoices = useMemo(() => [...FOOTWEAR_SIZES, ...initial.sizes.filter((s) => !FOOTWEAR_SIZES.includes(s))], [initial.sizes]);
  // A new accessory follows its type (heels = shoe sizes) until the admin picks the sizing themselves
  const changeType = (type: string) => setD((prev) => (prev.sizesTouched ? { ...prev, type } : { ...prev, type, sizeMode: sizeModeFor(type) }));
  const toggleSize = (size: ProductSize) => setD((prev) => ({
    ...prev,
    sizes: prev.sizes.includes(size) ? prev.sizes.filter((s) => s !== size) : [...prev.sizes, size],
    sizesTouched: true,
  }));

  const cancel = () => {
    if (saving || uploading) return;
    if (sessionUploads.length) deleteImages(sessionUploads).catch(() => undefined);
    onClose();
  };
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelRef.current(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, []);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    event.target.value = '';
    if (!files.length) return;
    setUploading(true);
    let colourChecked = Boolean(d.colourName.trim());
    for (const file of files) {
      if (!file.type.startsWith('image/')) { showToast('Only image files can be uploaded.', 'error'); continue; }
      try {
        const url = await uploadImage(file, 'product-images');
        setSessionUploads((list) => [...list, url]);
        setD((prev) => ({ ...prev, images: [...prev.images, url] }));
        if (!colourChecked) {
          colourChecked = true;
          // Fill the colour from the first photo when none is typed yet; the admin can change it
          detectColourFromFile(file).then((found) => {
            if (found) setD((prev) => (prev.colourName.trim() ? prev : { ...prev, colourName: found.name, colourHex: found.hex }));
          }).catch(() => undefined);
        }
      } catch (err: any) {
        showToast(`Could not upload "${file.name}": ${err?.message || 'please try again.'}`, 'error');
      }
    }
    setUploading(false);
  };

  const removeImage = (url: string) => {
    if (sessionUploads.includes(url)) {
      setSessionUploads((list) => list.filter((u) => u !== url));
      deleteImages([url]).catch(() => undefined);
    } else {
      setPendingDeletes((list) => [...list, url]);
    }
    set({ images: d.images.filter((u) => u !== url) });
  };
  const makeCover = (url: string) => set({ images: [url, ...d.images.filter((u) => u !== url)] });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Deleted (e.g. on another device) while this form was open: never re-create it by accident
    if (d.id && !existing) { showToast('This accessory was deleted. Close this form and add it again.', 'error'); return; }
    const name = d.name.trim();
    const price = Math.round(Number(d.price));
    const mrp = d.mrp.trim() ? Math.round(Number(d.mrp)) : 0;
    const stock = Number(d.stock);
    const type = d.type === OTHER ? d.customType.trim().slice(0, 40) || OTHER : d.type;
    if (!name) { showToast('Please enter a name.', 'error'); return; }
    if (!Number.isFinite(price) || price <= 0) { showToast('Please enter a valid price.', 'error'); return; }
    if (d.mrp.trim() && (!Number.isFinite(mrp) || mrp < price)) { showToast('MRP cannot be lower than the price.', 'error'); return; }
    if (!Number.isInteger(stock) || stock < 0) { showToast('Stock must be a whole number of 0 or more.', 'error'); return; }
    if (d.sizeMode === 'sizes' && d.sizes.length === 0) { showToast('Tick the sizes you have, or choose One size.', 'error'); return; }
    if (d.images.length === 0) { showToast('Please upload at least one photo.', 'error'); return; }

    const originalPrice = Math.max(price, mrp || price);
    const discount = originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
    // The first real colour is the one edited here; any other colours saved on the product are kept.
    const others = (existing?.colors || []).filter(isRealColour);
    const firstReal = others.shift();
    const colour: ProductColor[] = d.colourName.trim()
      ? [{ ...(firstReal || {}), name: d.colourName.trim().slice(0, 40), hex: /^#[0-9a-f]{6}$/i.test(d.colourHex) ? d.colourHex.toUpperCase() : '#1B1A17' }]
      : [];
    // Sold as Free Size, or in the ticked sizes (in the order they are offered); the server accepts only these
    const sizes: ProductSize[] = d.sizeMode === 'sizes' ? sizeChoices.filter((s) => d.sizes.includes(s)) : [ACCESSORY_SIZE];
    const common = {
      name,
      description: d.description.trim(),
      price,
      originalPrice,
      discount,
      images: d.images,
      colors: [...colour, ...others],
      sizes,
      hidden: !d.published,
      productType: 'accessory' as const,
      accessoryType: type,
      setType: '',
    };

    setSaving(true);
    try {
      if (existing) {
        const changes: Partial<Product> = { ...common };
        // Stock the admin did not change is not written back: orders may have changed it since the form opened
        if (stock !== Number(initial.stock)) {
          changes.stockQuantity = stock;
          changes.inStock = stock > 0;
        }
        await updateProduct(existing.id, changes);
        showToast(`Saved "${name}".`, 'success');
      } else {
        await addProduct({
          ...common,
          sku: `SAG-ACC-${Date.now().toString(36).toUpperCase().slice(-6)}`,
          category: ACCESSORY_CATEGORY as Product['category'],
          subcategory: '',
          stockQuantity: stock,
          inStock: stock > 0,
          rating: 0,
          reviewCount: 0,
          fabric: '',
          fit: '',
          occasion: '',
          washCare: '',
          videoUrl: '',
          tags: [],
          reviews: [],
          isFeatured: false,
          isNewArrival: false,
          isBestSeller: false,
          isSale: false,
          isTrending: false,
          isFestive: false,
        });
        showToast(`Added "${name}". It shows in Complete the look on combo / set products.`, 'success');
      }
      // Removed photos are deleted only when no other product still uses them
      const usedElsewhere = new Set(allProducts.filter((p) => p.id !== d.id).flatMap((p) => [...p.images, ...p.colors.map((c) => c.imageUrl || '')]));
      const removed = pendingDeletes.filter((url) => !d.images.includes(url) && !usedElsewhere.has(url));
      if (removed.length) deleteImages(removed).catch(() => undefined);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const label = ui.label;
  const field = ui.field;

  return (
    <div className={`fixed inset-0 z-[80] ${SCRIM} flex items-end sm:items-center justify-center sm:p-4`} onClick={cancel}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="acc-form-title" onClick={(e) => e.stopPropagation()}
        className="bg-surface w-full sm:max-w-lg max-h-[92dvh] rounded-t-[28px] sm:rounded-[28px] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 pl-5 pr-3 py-3 border-b border-line">
          <p id="acc-form-title" className="font-display text-[20px] leading-7 text-ink">{isEdit ? 'Edit accessory' : `Add ${kindLabel}`}</p>
          <button type="button" onClick={cancel} aria-label="Close" className="w-11 h-11 rounded-full hover:bg-sunken-deep text-ink flex items-center justify-center cursor-pointer"><X className="w-5 h-5 text-current" /></button>
        </div>

        <form id="acc-form" onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="acc-type" className={label}>Type</label>
              <select id="acc-type" value={d.type} onChange={(e) => changeType(e.target.value)} className={field}>
                {ACCESSORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value={OTHER}>Other</option>
              </select>
            </div>
            {d.type === OTHER && (
              <div>
                <label htmlFor="acc-custom-type" className={label}>What is it?</label>
                <input id="acc-custom-type" value={d.customType} maxLength={40} onChange={(e) => set({ customType: e.target.value })} placeholder="e.g. Clutch, Bangles" className={field} />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="acc-name" className={label}>Name *</label>
            <input id="acc-name" ref={nameRef} required maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder={`e.g. Gold-tone ${kindLabel}`} className={field} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="acc-price" className={label}>Price (₹) *</label>
              <input id="acc-price" required type="number" inputMode="numeric" min={1} value={d.price} onChange={(e) => set({ price: e.target.value })} className={field} />
            </div>
            <div>
              <label htmlFor="acc-mrp" className={label}>MRP (₹)</label>
              <input id="acc-mrp" type="number" inputMode="numeric" min={1} value={d.mrp} onChange={(e) => set({ mrp: e.target.value })} placeholder="Optional" className={field} />
            </div>
            <div>
              <label htmlFor="acc-stock" className={label}>Stock *</label>
              <input id="acc-stock" required type="number" inputMode="numeric" min={0} step={1} value={d.stock} onChange={(e) => set({ stock: e.target.value })} className={field} />
            </div>
          </div>

          <div>
            <p id="acc-sizes-label" className={label}>Sizes</p>
            <div role="group" aria-labelledby="acc-sizes-label" className="grid grid-cols-2 gap-2">
              {([['one', 'One size'], ['sizes', 'Shoe sizes']] as const).map(([mode, text]) => (
                <button key={mode} type="button" aria-pressed={d.sizeMode === mode} onClick={() => set({ sizeMode: mode, sizesTouched: true })}
                  className={ui.chip(d.sizeMode === mode)}>
                  {text}
                </button>
              ))}
            </div>
            {d.sizeMode === 'sizes' && (
              <div role="group" aria-label="Sizes you have" className="mt-2.5 flex flex-wrap gap-2">
                {sizeChoices.map((s) => {
                  const on = d.sizes.includes(s);
                  return (
                    <button key={s} type="button" aria-pressed={on} onClick={() => toggleSize(s)}
                      className={`${ui.chip(on)} min-w-16 sag-num`}>
                      {on && <Check className="w-3.5 h-3.5 text-current" aria-hidden="true" />}{s}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-1.5 text-[13px] text-ink-muted">
              {d.sizeMode === 'sizes' ? "Tick the sizes you have. Shoppers choose their size on the accessory's page." : 'Sold as Free Size (bags, jewellery, watches...).'}
            </p>
          </div>

          <div>
            <p className={label}>Photos * <span className={ui.optional}>(first photo is the cover)</span></p>
            <div className="flex flex-wrap gap-2">
              {d.images.map((url, i) => (
                <div key={url} className="w-20">
                  <img src={getCleanImageUrl(url, 200)} alt={`Photo ${i + 1}`} className="w-20 aspect-[4/5] rounded-[12px] object-cover object-top bg-sunken" />
                  <div className="mt-1 flex items-center justify-between">
                    {i === 0 ? <span className="text-[11px] font-semibold text-brand">Cover</span>
                      : <button type="button" onClick={() => makeCover(url)} className="text-[13px] text-brand underline underline-offset-2 cursor-pointer">Make cover</button>}
                    <button type="button" onClick={() => removeImage(url)} aria-label={`Remove photo ${i + 1}`} className="w-11 h-11 rounded-full hover:bg-danger-tint text-danger flex items-center justify-center cursor-pointer"><X className="w-3.5 h-3.5 text-current" /></button>
                  </div>
                </div>
              ))}
              <label className={`w-20 aspect-[4/5] rounded-[16px] border-[1.5px] border-dashed border-control bg-sunken flex flex-col items-center justify-center gap-1 text-[11px] text-ink ${uploading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-sunken-deep'}`}>
                {uploading ? <Loader2 className="w-5 h-5 animate-spin text-current" /> : <ImagePlus className="w-5 h-5 text-current" />}
                {uploading ? 'Uploading' : 'Add photo'}
                <input type="file" accept="image/*" multiple disabled={uploading} onChange={upload} className="sr-only" />
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="acc-colour" className={label}>Colour <span className="font-normal text-ink-muted">(optional)</span></label>
            <div className="flex items-center gap-2">
              <label className="relative w-11 h-11 shrink-0 rounded-full border-[1.5px] border-control overflow-hidden cursor-pointer" title="Pick the colour">
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(d.colourHex) ? d.colourHex : '#1B1A17'} onChange={(e) => set({ colourHex: e.target.value })} aria-label="Colour swatch" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <span className="block w-full h-full" style={{ backgroundColor: d.colourHex }} />
              </label>
              <input id="acc-colour" value={d.colourName} maxLength={40} onChange={(e) => set({ colourName: e.target.value })} placeholder="e.g. Gold" className={field} />
            </div>
          </div>

          <div>
            <label htmlFor="acc-desc" className={label}>Short description <span className="font-normal text-ink-muted">(optional)</span></label>
            <textarea id="acc-desc" rows={3} maxLength={400} value={d.description} onChange={(e) => set({ description: e.target.value })}
              placeholder="Material, size, what it pairs with"
              className={ui.textarea} />
          </div>

          <label className="flex items-center gap-2.5 text-sm text-ink cursor-pointer">
            <input type="checkbox" checked={d.published} onChange={(e) => set({ published: e.target.checked })} className="w-4 h-4 accent-brand" />
            Published (shown in Complete the look when in stock)
          </label>
        </form>

        <div className="flex items-center justify-end gap-3 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-line">
          <button type="button" onClick={cancel} disabled={saving || uploading} className={ui.outline}>Cancel</button>
          <button type="submit" form="acc-form" disabled={saving || uploading}
            className="h-11 px-5 sag-btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />} {isEdit ? 'Save' : 'Add accessory'}
          </button>
        </div>
      </div>
    </div>
  );
};
