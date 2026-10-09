import React, { useMemo, useRef, useState } from 'react';
import { Bike, Car, Loader2, Pencil, Plus, Puzzle, Rabbit, Search, Sparkles, ToyBrick, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { useProducts } from '../../context/ProductContext';
import { useRouter } from '../../context/RouterContext';
import { Product } from '../../types';
import { detectColourFromFile } from '../../utils/detectColour';
import { isAvailable } from '../../utils/smartQuery';
import { TOYS, TOY_AGES, TOY_SIZE, TOY_TYPES, departmentOf, kindOf } from '../../utils/kids';
import { AiProductFill, type AiDraft } from './AiProductFill';
import {
  AdminPageHeader, CategoryResult, CategoryStatus, ColourFind, ColourRow, ColoursField, FilterChips, FormSheet, LIST_STEP, OTHER, PhotoField, Price, PriceHint, Problem,
  PublishButton, ShowToast, Stat, Status, Thumb, Toggle, categoryNote, changedFields, clip, colourNames, colourRow, colourRowsFrom, coloursToSave,
  focusField, keepPricesTogether, matchesText, mrpOf, newSku, priceFields, priceProblem, settleWithin, stockProblem, ui, usePhotoSession,
  useStoreCategories,
} from './kidsToysShared';

const ALL = 'all';
// "Add car", "Add bike"... then "Add other" for anything else (the admin types the kind).
const QUICK_ADD: Array<{ type: string; label: string; icon: LucideIcon }> = [
  { type: 'Cars', label: 'Add car', icon: Car },
  { type: 'Bikes', label: 'Add bike', icon: Bike },
  { type: 'Dolls', label: 'Add doll', icon: Sparkles },
  { type: 'Soft Toys', label: 'Add soft toy', icon: Rabbit },
  { type: 'Puzzles & Games', label: 'Add puzzle / game', icon: Puzzle },
  { type: OTHER, label: 'Add other', icon: Plus },
];
const SINGULAR: Record<string, string> = { Cars: 'car', Bikes: 'bike', Dolls: 'doll', 'Soft Toys': 'soft toy', 'Puzzles & Games': 'puzzle / game' };
/** A toy's kind for the list and filters ("Other" when none was saved). */
const toyKind = (p: Product) => kindOf(p) || OTHER;
const typeRank = (type: string) => {
  const index = (TOY_TYPES as readonly string[]).indexOf(type);
  return index === -1 ? (type === OTHER ? TOY_TYPES.length + 1 : TOY_TYPES.length) : index;
};

interface ToyDraft {
  id?: string;
  /** One of TOY_TYPES, OTHER (the admin types it) or '' (not chosen yet). */
  type: string;
  customType: string;
  name: string;
  /** '' = not specified. */
  ageRange: string;
  price: string;
  mrp: string;
  stock: string;
  images: string[];
  colours: ColourRow[];
  /** Material, saved in the product's fabric field. */
  fabric: string;
  description: string;
  isNewArrival: boolean;
  published: boolean;
}

const emptyDraft = (type: string): ToyDraft => ({
  type, customType: '', name: '', ageRange: '', price: '', mrp: '', stock: '', images: [], colours: [colourRow()],
  fabric: '', description: '', isNewArrival: true, published: true,
});

const draftFrom = (p: Product): ToyDraft => {
  const kind = kindOf(p);
  const known = (TOY_TYPES as readonly string[]).includes(kind);
  return {
    id: p.id,
    type: known ? kind : kind ? OTHER : '',
    customType: known || kind === OTHER ? '' : kind,
    name: p.name || '',
    ageRange: String(p.ageRange || '').trim(),
    price: p.price > 0 ? String(p.price) : '',
    mrp: mrpOf(p) > p.price ? String(mrpOf(p)) : '',
    stock: String(Math.max(0, Number(p.stockQuantity ?? 0))),
    images: (p.images || []).filter(Boolean),
    colours: colourRowsFrom(p),
    fabric: p.fabric || '',
    description: p.description || '',
    isNewArrival: Boolean(p.isNewArrival),
    published: !p.hidden,
  };
};

const typeOf = (d: ToyDraft) => (d.type === OTHER ? clip(d.customType, 40) : d.type);
const kindLabel = (d: ToyDraft) => (d.type === OTHER ? clip(d.customType, 40).toLowerCase() || 'toy' : SINGULAR[d.type] || 'toy');

/** The product fields this form edits, as they would be saved. */
type ToyFields = Pick<Product, 'name' | 'subcategory' | 'ageRange' | 'price' | 'originalPrice' | 'discount' | 'images' | 'colors' | 'fabric' | 'description' | 'isNewArrival' | 'hidden'>;
const fieldsOf = (d: ToyDraft): ToyFields => ({
  name: clip(d.name, 120),
  subcategory: typeOf(d),
  ageRange: clip(d.ageRange, 40),
  ...priceFields(d.price, d.mrp),
  images: d.images,
  colors: coloursToSave(d.colours, d.images),
  fabric: clip(d.fabric, 120),
  description: clip(d.description, 1500),
  isNewArrival: d.isNewArrival,
  hidden: !d.published,
});

const problemOf = (d: ToyDraft): Problem | null => {
  if (!d.type) return { message: 'Choose what kind of toy it is.', field: 'toy-type' };
  if (d.type === OTHER && !d.customType.trim()) return { message: 'Type what kind of toy it is (for example Kitchen set).', field: 'toy-custom-type' };
  if (!d.name.trim()) return { message: 'Please enter a name.', field: 'toy-name' };
  const price = priceProblem(d.price, d.mrp, { price: 'toy-price', mrp: 'toy-mrp' });
  if (price) return price;
  const stock = stockProblem(d.stock, 'toy-stock');
  if (stock) return stock;
  if (d.images.length === 0) return { message: 'Please upload at least one photo.', field: 'toy-photos' };
  return null;
};

/**
 * Admin: Toys, a section of its own. Toys are real products (category "Toys", productType 'toy') sold as one piece,
 * with a kind (Cars, Bikes, Dolls...) and a suitable age, shown in the store's Toys section.
 */
export const AdminToys: React.FC = () => {
  const { showToast } = useShop();
  const { allProducts = [], isLoading, addProduct, updateProduct, deleteProduct, toggleProductStatus } = useProducts();
  const { openAdminTab } = useRouter();
  const cats = useStoreCategories();
  const [draft, setDraft] = useState<ToyDraft | null>(null);
  const [filter, setFilter] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(LIST_STEP);
  const [busyId, setBusyId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(allProducts.map((p) => [String(p.id), p])), [allProducts]);
  const toys = useMemo(() => allProducts.filter((p) => departmentOf(p) === 'toys'), [allProducts]);
  // Filter chips only for the kinds that exist, in the usual order
  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    toys.forEach((p) => counts.set(toyKind(p), (counts.get(toyKind(p)) || 0) + 1));
    return [...counts.entries()].sort((a, b) => typeRank(a[0]) - typeRank(b[0]) || a[0].localeCompare(b[0]));
  }, [toys]);
  const activeFilter = filter !== ALL && !kinds.some(([kind]) => kind === filter) ? ALL : filter;
  const results = useMemo(() => toys.filter((p) => (activeFilter === ALL || toyKind(p) === activeFilter)
    && matchesText(query, [p.name, p.sku, kindOf(p), p.ageRange, p.fabric, ...colourNames(p)])), [toys, activeFilter, query]);

  // Counts wait for the catalogue instead of showing a misleading 0
  const countsLoading = isLoading && allProducts.length === 0;
  const count = (n: number) => (countsLoading ? '…' : n);
  const published = toys.filter((p) => !p.hidden).length;
  const onStore = toys.filter((p) => !p.hidden && isAvailable(p)).length;
  const soldOut = toys.filter((p) => !p.hidden && !isAvailable(p)).length;

  const togglePublished = async (p: Product) => {
    setBusyId(p.id);
    try {
      await toggleProductStatus(p.id);
      showToast(p.hidden
        ? `"${p.name}" is now shown in the Toys section${isAvailable(p) ? '' : ' (as sold out until you add stock)'}.`
        : `"${p.name}" is hidden from the store.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'The change could not be saved. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"?\n\nIt is removed from the store and its photos are deleted. Past orders keep their details, but its photos will no longer show in them. If it has been sold, you can hide it instead.`)) return;
    setBusyId(p.id);
    try {
      await deleteProduct(p.id);
      showToast(`Deleted "${p.name}".`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not delete. Please try again.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Storefront · Toys"
        title="Toys"
        icon={<ToyBrick className="text-current" />}
        description={<>Add cars, bikes, dolls, soft toys, puzzles and more here. They are shown in their own Toys section of the store. A toy is sold as one piece (no sizes); add its suitable age so parents can choose.</>}
      />

      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3" aria-label="Toys in numbers">
        <Stat label="Toys" value={count(toys.length)} note={countsLoading ? 'Loading…' : `${published} published · ${toys.length - published} hidden`} />
        <Stat label="On the store now" value={count(onStore)} note={countsLoading ? 'Loading…' : 'published and in stock'} />
        <Stat label="Sold out" value={count(soldOut)} note={countsLoading ? 'Loading…' : soldOut ? 'published, add stock to sell' : 'nothing is sold out'} />
        <Stat label="Hidden" value={count(toys.length - published)} note={countsLoading ? 'Loading…' : 'kept here, not on the store'} />
      </dl>

      <section className={`${ui.card} min-w-0`} aria-labelledby="toys-add-title">
        <h3 id="toys-add-title" className={ui.h2}>Add a toy</h3>
        <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">Pick the kind; you can change it in the form. Other kinds (educational, remote control, outdoor, musical…) are in the form too.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_ADD.map(({ type, label, icon: Icon }) => (
            <button key={type} type="button" onClick={() => setDraft(emptyDraft(type))}
              className={ui.outline}>
              <Icon className="w-4 h-4 text-current" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </section>

      <CategoryStatus names={[TOYS]} cats={cats} showToast={showToast} onOpenCategories={() => openAdminTab('categories')} />

      <section className={`${ui.card} min-w-0`} aria-labelledby="toys-list-title">
        <h3 id="toys-list-title" className={ui.h2}>All toys <span className="font-normal text-ink-muted sag-num">({count(toys.length)})</span></h3>
        {kinds.length > 0 && (
          <div className="mt-3">
            <FilterChips label="Show toys of kind" value={activeFilter} onChange={(v) => { setFilter(v); setLimit(LIST_STEP); }} options={[
              { value: ALL, label: 'All', count: toys.length },
              ...kinds.map(([kind, n]) => ({ value: kind, label: kind, count: n })),
            ]} />
          </div>
        )}

        {toys.length > 0 && (
          <div className="relative mt-3">
            <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(LIST_STEP); }}
              placeholder="Search by name, kind, age or SKU" aria-label="Search toys" className={ui.search} />
          </div>
        )}

        {countsLoading ? (
          <p className="mt-4 text-sm text-ink-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-current" /> Loading products…</p>
        ) : toys.length === 0 ? (
          <div className="mt-4 rounded-[16px] bg-page p-5 text-sm text-ink-muted text-center">
            No toys yet. Use the buttons above to add a car, bike, doll, soft toy, puzzle or any other toy.
          </div>
        ) : results.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">{query.trim() ? `Nothing matches "${query.trim()}".` : 'No toys of this kind.'}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {results.slice(0, limit).map((p) => (
              <li key={p.id} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Thumb p={p} />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-semibold text-ink line-clamp-2 sm:line-clamp-1">{p.name}</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-ink-muted">{toyKind(p)}</span>
                    <span>{p.ageRange ? `For ${p.ageRange}` : 'Age not set'}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-ink-muted"><Price p={p} /> · <Status p={p} /></p>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <PublishButton p={p} busy={busyId === p.id} onToggle={() => togglePublished(p)} />
                  <button type="button" onClick={() => setDraft(draftFrom(p))} disabled={busyId === p.id} aria-label={`Edit ${p.name}`} className={`${ui.small} !border-brand-line !text-brand`}>
                    <Pencil className="w-3.5 h-3.5 text-current" /> Edit
                  </button>
                  <button type="button" onClick={() => remove(p)} disabled={busyId === p.id} aria-label={`Delete ${p.name}`} className={`${ui.iconBtn} hover:bg-danger-tint text-danger`}>
                    {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Trash2 className="w-4 h-4 text-current" />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {results.length > limit && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-ink-muted">Showing {limit} of {results.length}.</p>
            <button type="button" onClick={() => setLimit((n) => n + LIST_STEP)} className={ui.outline}>Show more</button>
          </div>
        )}
      </section>

      {draft && (
        <ToyForm
          draft={draft}
          existing={draft.id ? byId.get(draft.id) : undefined}
          allProducts={allProducts}
          onClose={() => setDraft(null)}
          onSaved={(kind) => setFilter((f) => (f === ALL || f === kind ? f : ALL))}
          addProduct={addProduct}
          updateProduct={updateProduct}
          ensureCategory={cats.ensure}
          showToast={showToast}
        />
      )}
    </div>
  );
};

interface ToyFormProps {
  draft: ToyDraft;
  existing?: Product;
  allProducts: Product[];
  onClose: () => void;
  onSaved: (kind: string) => void;
  addProduct: (p: Omit<Product, 'id'>) => Promise<Product>;
  updateProduct: (id: string, p: Partial<Product>) => Promise<void>;
  ensureCategory: (name: string) => Promise<CategoryResult>;
  showToast: ShowToast;
}

/** Add / edit one toy, saved through the same product functions as the rest of the catalogue. */
const ToyForm: React.FC<ToyFormProps> = ({ draft: initial, existing, allProducts, onClose, onSaved, addProduct, updateProduct, ensureCategory, showToast }) => {
  const [d, setD] = useState<ToyDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState('');
  const [suggestion, setSuggestion] = useState<ColourFind | null>(null);
  const photos = usePhotoSession(showToast);
  const nameRef = useRef<HTMLInputElement>(null);
  const latest = useRef(d);
  latest.current = d;
  const set = (patch: Partial<ToyDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const isEdit = Boolean(initial.id);
  // Suitable ages, plus an age already saved on this toy that is not in the list (kept, never dropped silently)
  const ageOptions = useMemo(() => {
    const ages: string[] = [...TOY_AGES];
    return initial.ageRange && !ages.includes(initial.ageRange) ? [...ages, initial.ageRange] : ages;
  }, [initial.ageRange]);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  const cancel = () => {
    if (saving) return;
    if (photos.uploading) { showToast('Please wait for the photos to finish uploading.', 'info'); return; }
    if (dirty && !window.confirm(isEdit ? 'Close without saving your changes?' : 'Close without adding this toy? What you entered will be lost.')) return;
    photos.discard();
    onClose();
  };

  // The colour of the first new photo: filled in when no colour is typed yet, otherwise only offered
  const onFirstPhoto = (file: File) => {
    detectColourFromFile(file).then((found) => {
      if (!found) return;
      const colour = { name: found.name, hex: found.hex };
      const current = latest.current.colours;
      if (!current.some((c) => c.name.trim())) {
        setD((prev) => (prev.colours.some((c) => c.name.trim()) ? prev : { ...prev, colours: [colourRow(colour)] }));
        setDetected(found.name);
      } else if (!current.some((c) => c.name.trim().toLowerCase() === found.name.toLowerCase())) {
        setSuggestion(colour);
      }
    }).catch(() => undefined);
  };

  const upload = (files: File[]) => photos.upload(files, (url) => setD((prev) => ({ ...prev, images: [...prev.images, url] })), onFirstPhoto);
  const removeImage = (url: string) => {
    photos.remove(url);
    setD((prev) => ({ ...prev, images: prev.images.filter((u) => u !== url) }));
  };
  const makeCover = (url: string) => setD((prev) => ({ ...prev, images: [url, ...prev.images.filter((u) => u !== url)] }));
  const addSuggestedColour = () => {
    if (!suggestion) return;
    const colour = suggestion;
    setD((prev) => ({ ...prev, colours: [...prev.colours.filter((c) => c.name.trim()), colourRow(colour)] }));
    setSuggestion(null);
  };
  // Gemini: the text fields from the photos. The kind the admin already chose is kept; the age is filled only
  // when it is printed on the toy or box; price, MRP and stock are never touched.
  const applyAi = (draft: AiDraft) => {
    setD((prev) => ({
      ...prev,
      type: prev.type || (draft.kind || (draft.customKind ? OTHER : '')),
      customType: prev.type ? prev.customType : draft.kind ? '' : draft.customKind,
      ageRange: prev.ageRange || draft.ageRange,
      name: draft.name || prev.name,
      description: draft.description || prev.description,
      fabric: draft.fabric || prev.fabric,
      colours: draft.colors.length ? draft.colors.map((c, i) => colourRow({ name: c.name, hex: c.hex, ...(i === 0 && prev.images[0] ? { imageUrl: prev.images[0] } : {}) })) : prev.colours,
    }));
    setSuggestion(null);
    setDetected('');
  };
  const aiUpload = (e: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) upload(files); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || photos.uploading) return;
    // Deleted (e.g. on another device) while this form was open: never re-create it by accident
    if (d.id && !existing) { showToast('This toy was deleted (maybe on another device). Close this form and add it again.', 'error'); return; }
    const problem = problemOf(d);
    if (problem) { showToast(problem.message, 'error'); focusField(problem.field); return; }

    const stock = Number(d.stock);
    const after = fieldsOf(d);
    setSaving(true);
    try {
      let message: string;
      let changed = true;
      if (existing) {
        const changes: Partial<Product> = keepPricesTogether(changedFields(fieldsOf(initial), after), after);
        // Always saved as a toy: category Toys, sold as one piece (an older item may differ)
        if (existing.category !== TOYS) changes.category = TOYS;
        if (JSON.stringify(existing.sizes || []) !== JSON.stringify([TOY_SIZE])) changes.sizes = [TOY_SIZE];
        if (existing.productType !== 'toy') {
          changes.productType = 'toy';
          changes.setType = '';
          changes.accessoryType = '';
        }
        // Stock the admin did not change is not written back: orders may have changed it since the form opened
        if (stock !== Number(initial.stock)) {
          changes.stockQuantity = stock;
          changes.inStock = stock > 0;
        }
        changed = Object.keys(changes).length > 0;
        if (changed) await updateProduct(existing.id, changes);
        message = changed ? `Saved "${after.name}".` : 'No changes to save.';
      } else {
        await addProduct({
          ...after,
          category: TOYS,
          sizes: [TOY_SIZE],
          productType: 'toy',
          sku: newSku('SAG-TOY'),
          stockQuantity: stock,
          inStock: stock > 0,
          rating: 0,
          reviewCount: 0,
          fit: '',
          occasion: '',
          washCare: '',
          videoUrl: '',
          tags: [],
          reviews: [],
          isFeatured: false,
          isBestSeller: false,
          isSale: false,
          isTrending: false,
          isFestive: false,
          accessoryType: '',
          setType: '',
        });
        message = `Added "${after.name}" to Toys${after.hidden ? ' (hidden until you publish it)' : ''}.`;
      }
      photos.commit(d.images, allProducts, d.id);
      // "Toys" in Admin → Categories (for its photo); never holds the form up for long
      const categoryResult = await settleWithin(ensureCategory(TOYS), 5000, 'skipped' as CategoryResult);
      showToast(message + categoryNote(categoryResult, TOYS), changed ? 'success' : 'info');
      onSaved(after.subcategory || OTHER);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
      setSaving(false);
    }
  };

  return (
    <FormSheet titleId="toy-form-title" title={isEdit ? 'Edit toy' : `Add ${kindLabel(d)}`} subtitle={isEdit ? initial.name : 'Shown in the Toys section of the store'} formId="toy-form"
      submitLabel={isEdit ? 'Save' : 'Add toy'} saving={saving} uploading={photos.uploading} onCancel={cancel} focusRef={nameRef}>
      <form id="toy-form" onSubmit={submit} noValidate>
        {/* Nothing can be changed while saving (e.g. a photo removed half-way) */}
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <AiProductFill department="toys" images={d.images} uploading={photos.uploading} onUpload={aiUpload}
            kinds={TOY_TYPES} ages={TOY_AGES} currentName={d.name}
            hasDetails={Boolean(d.name.trim() || d.description.trim())} onApply={applyAi} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="toy-type" className={ui.label}>Kind of toy *</label>
              <select id="toy-type" required value={d.type} onChange={(e) => set({ type: e.target.value })} className={ui.field}>
                <option value="">Choose kind</option>
                {TOY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value={OTHER}>Other (type your own)</option>
              </select>
            </div>
            {d.type === OTHER && (
              <div>
                <label htmlFor="toy-custom-type" className={ui.label}>What is it? *</label>
                <input id="toy-custom-type" required maxLength={40} value={d.customType} onChange={(e) => set({ customType: e.target.value })} placeholder="e.g. Kitchen set" className={ui.field} />
              </div>
            )}
          </div>

          <div>
            <label htmlFor="toy-name" className={ui.label}>Name *</label>
            <input id="toy-name" ref={nameRef} required maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })}
              placeholder={d.type === 'Cars' ? 'e.g. Pull-back racing car' : d.type === 'Bikes' ? 'e.g. Kids balance bike' : 'e.g. Musical teddy bear'} className={ui.field} />
          </div>

          <div>
            <label htmlFor="toy-age" className={ui.label}>Suitable age <span className={ui.optional}>(recommended)</span></label>
            <select id="toy-age" value={d.ageRange} onChange={(e) => set({ ageRange: e.target.value })} className={ui.field}>
              <option value="">Not specified</option>
              {ageOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <p className={ui.hint}>Shown on the toy's page as "Suitable for". Use the age printed on the box or given by your supplier.</p>
          </div>

          <div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="toy-price" className={ui.label}>Price (₹) *</label>
                <input id="toy-price" required type="number" inputMode="numeric" min={1} step={1} value={d.price} onChange={(e) => set({ price: e.target.value })} className={ui.field} />
              </div>
              <div>
                <label htmlFor="toy-mrp" className={ui.label}>MRP (₹)</label>
                <input id="toy-mrp" type="number" inputMode="numeric" min={1} step={1} value={d.mrp} onChange={(e) => set({ mrp: e.target.value })} placeholder="Optional" className={ui.field} />
              </div>
              <div>
                <label htmlFor="toy-stock" className={ui.label}>Stock *</label>
                <input id="toy-stock" required type="number" inputMode="numeric" min={0} step={1} value={d.stock} onChange={(e) => set({ stock: e.target.value })} placeholder="e.g. 5" className={ui.field} />
              </div>
            </div>
            <PriceHint price={d.price} mrp={d.mrp} />
            <p className="mt-1 text-[13px] text-ink-muted">Sold as one piece (no sizes). Stock is how many you have.</p>
          </div>

          <PhotoField id="toy-photos" images={d.images} uploading={photos.uploading} onFiles={upload} onRemove={removeImage} onCover={makeCover}
            hint="Show the toy clearly (and the box, if it comes in one). The colour below is read from the first photo you upload." />

          <ColoursField idPrefix="toy" rows={d.colours} onChange={(colours) => set({ colours })} detected={detected} suggestion={suggestion}
            onUseSuggestion={addSuggestedColour} onDismissSuggestion={() => setSuggestion(null)} placeholder="e.g. Red" />

          <div>
            <label htmlFor="toy-material" className={ui.label}>Material <span className={ui.optional}>(optional)</span></label>
            <input id="toy-material" maxLength={120} value={d.fabric} onChange={(e) => set({ fabric: e.target.value })} placeholder="e.g. Plastic, soft plush, wood" className={ui.field} />
          </div>

          <div>
            <label htmlFor="toy-desc" className={ui.label}>Description <span className={ui.optional}>(recommended)</span></label>
            <textarea id="toy-desc" rows={3} maxLength={1500} value={d.description} onChange={(e) => set({ description: e.target.value })}
              placeholder="What it does, size, what is in the box, batteries needed or not" className={ui.textarea} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Toggle id="toy-new" checked={d.isNewArrival} onChange={(v) => set({ isNewArrival: v })} label="New arrival" hint='Shows a "New" badge on the product.' />
            <Toggle id="toy-published" checked={d.published} onChange={(v) => set({ published: v })} label="Published"
              hint={d.published ? 'Shown in the Toys section (as sold out when stock is 0).' : 'Hidden: kept here, not shown on the store.'} />
          </div>
        </fieldset>
      </form>
    </FormSheet>
  );
};
