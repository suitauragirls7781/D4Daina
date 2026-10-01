import React, { useMemo, useRef, useState } from 'react';
import { Baby, Check, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useShop } from '../../context/ShopContext';
import { useProducts } from '../../context/ProductContext';
import { useRouter } from '../../context/RouterContext';
import { Product, ProductCategory, ProductSize } from '../../types';
import { detectColourFromFile } from '../../utils/detectColour';
import { isAvailable } from '../../utils/smartQuery';
import { BABY_BOYS, BABY_GIRLS, KIDS_CATEGORIES, KIDS_SIZES, KIDS_SIZE_PAIRS, KIDS_TYPES, departmentOf, kindOf, sortKidsSizes } from '../../utils/kids';
import { AiProductFill, type AiDraft } from './AiProductFill';
import {
  AdminPageHeader, CategoryResult, CategoryStatus, ColourFind, ColourRow, ColoursField, FilterChips, FormSheet, LIST_STEP, OTHER, PhotoField, Price, PriceHint, Problem,
  PublishButton, ShowToast, Stat, Status, Thumb, Toggle, categoryNote, changedFields, clip, colourNames, colourRow, colourRowsFrom, coloursToSave,
  focusField, keepPricesTogether, matchesText, mrpOf, newSku, priceFields, priceProblem, settleWithin, stockProblem, ui, usePhotoSession,
  useStoreCategories,
} from './kidsToysShared';

type KidsCategory = (typeof KIDS_CATEGORIES)[number];
const ALL = 'all';
const isKidsCategory = (value: string): value is KidsCategory => (KIDS_CATEGORIES as readonly string[]).includes(value);

const QUICK_ADD: Array<{ category: KidsCategory; hint: string; tone: string }> = [
  { category: BABY_GIRLS, hint: 'Frocks, ethnic sets, tops… ages 1-2 Y to 14-15 Y', tone: 'bg-[#F7E4EA] border-[#8A2E55]/15 hover:border-[#8A2E55]/45 text-[#8A2E55]' },
  { category: BABY_BOYS, hint: 'Shirts, kurta sets, T-shirts… ages 1-2 Y to 14-15 Y', tone: 'bg-[#F3EEF8] border-[#4B1D3F]/15 hover:border-[#4B1D3F]/45 text-[#4B1D3F]' },
];

/** "1-2 Y, 3-4 Y" or "8 ages · 1-2 to 14-15 Y". */
const agesSummary = (sizes: string[]) => {
  const ages = sortKidsSizes(sizes.filter((s) => KIDS_SIZES.includes(s as ProductSize)));
  if (ages.length === 0) return 'No age sizes yet';
  if (ages.length === KIDS_SIZES.length) return 'All ages · 1-2 to 14-15 Y';
  if (ages.length <= 3) return ages.join(', ');
  return `${ages.length} ages · ${ages[0].replace(' Y', '')} to ${ages[ages.length - 1]}`;
};

const CategoryBadge: React.FC<{ category: string }> = ({ category }) => (
  <span className={`inline-block px-1.5 rounded font-semibold ${category === BABY_GIRLS ? 'bg-[#F7E4EA] text-[#8A2E55]' : category === BABY_BOYS ? 'bg-[#F3EEF8] text-[#4B1D3F]' : 'bg-[#2A1A26]/5 text-[#2A1A26]/70'}`}>
    {isKidsCategory(category) ? category : 'Girls or boys? Edit to choose'}
  </span>
);

interface KidsDraft {
  id?: string;
  category: KidsCategory | '';
  /** One of KIDS_TYPES, OTHER (the admin types it) or '' (not chosen yet). */
  type: string;
  customType: string;
  name: string;
  price: string;
  mrp: string;
  stock: string;
  sizes: ProductSize[];
  images: string[];
  colours: ColourRow[];
  fabric: string;
  description: string;
  washCare: string;
  isNewArrival: boolean;
  published: boolean;
}

const emptyDraft = (category: KidsCategory): KidsDraft => ({
  category, type: '', customType: '', name: '', price: '', mrp: '', stock: '', sizes: [], images: [], colours: [colourRow()],
  fabric: '', description: '', washCare: '', isNewArrival: true, published: true,
});

const draftFrom = (p: Product): KidsDraft => {
  const kind = kindOf(p);
  const known = (KIDS_TYPES as readonly string[]).includes(kind);
  return {
    id: p.id,
    category: isKidsCategory(p.category) ? p.category : '',
    type: known ? kind : kind ? OTHER : '',
    customType: known || kind === OTHER ? '' : kind,
    name: p.name || '',
    price: p.price > 0 ? String(p.price) : '',
    mrp: mrpOf(p) > p.price ? String(mrpOf(p)) : '',
    stock: String(Math.max(0, Number(p.stockQuantity ?? 0))),
    sizes: sortKidsSizes((p.sizes || []).map(String)) as ProductSize[],
    images: (p.images || []).filter(Boolean),
    colours: colourRowsFrom(p),
    fabric: p.fabric || '',
    description: p.description || '',
    washCare: p.washCare || '',
    isNewArrival: Boolean(p.isNewArrival),
    published: !p.hidden,
  };
};

const typeOf = (d: KidsDraft) => (d.type === OTHER ? clip(d.customType, 40) : d.type);

/** The product fields this form edits, as they would be saved. */
type KidsFields = Pick<Product, 'name' | 'category' | 'subcategory' | 'price' | 'originalPrice' | 'discount' | 'sizes' | 'images' | 'colors' | 'fabric' | 'washCare' | 'description' | 'isNewArrival' | 'hidden'>;
const fieldsOf = (d: KidsDraft, sizeOrder: ProductSize[]): KidsFields => ({
  name: clip(d.name, 120),
  category: d.category as ProductCategory,
  subcategory: typeOf(d),
  ...priceFields(d.price, d.mrp),
  sizes: sizeOrder.filter((s) => d.sizes.includes(s)),
  images: d.images,
  colors: coloursToSave(d.colours, d.images),
  fabric: clip(d.fabric, 120),
  washCare: clip(d.washCare, 200),
  description: clip(d.description, 1500),
  isNewArrival: d.isNewArrival,
  hidden: !d.published,
});

const problemOf = (d: KidsDraft): Problem | null => {
  if (!d.category) return { message: 'Choose who it is for: Baby Girls or Baby Boys.', field: 'kid-for-girls' };
  if (!d.name.trim()) return { message: 'Please enter a name.', field: 'kid-name' };
  if (!d.type) return { message: 'Choose the type (for example Frocks & Dresses).', field: 'kid-type' };
  if (d.type === OTHER && !d.customType.trim()) return { message: 'Type what kind of kids wear it is.', field: 'kid-custom-type' };
  const price = priceProblem(d.price, d.mrp, { price: 'kid-price', mrp: 'kid-mrp' });
  if (price) return price;
  const stock = stockProblem(d.stock, 'kid-stock');
  if (stock) return stock;
  if (d.sizes.length === 0) return { message: 'Tick at least one age size.', field: 'kid-sizes' };
  if (d.images.length === 0) return { message: 'Please upload at least one photo.', field: 'kid-photos' };
  return null;
};

/**
 * Admin: Kids Wear, a section of its own. Clothes for Baby Girls and Baby Boys are real products (category
 * "Baby Girls" / "Baby Boys", productType 'kids') sized by age, shown in the store's Kids section. They are never
 * added or listed in the women's Products pages, and the women's product form is not used for them.
 */
export const AdminKids: React.FC = () => {
  const { showToast } = useShop();
  const { allProducts = [], isLoading, addProduct, updateProduct, deleteProduct, toggleProductStatus } = useProducts();
  const { openAdminTab } = useRouter();
  const cats = useStoreCategories();
  const [draft, setDraft] = useState<KidsDraft | null>(null);
  const [filter, setFilter] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(LIST_STEP);
  const [busyId, setBusyId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(allProducts.map((p) => [String(p.id), p])), [allProducts]);
  const kids = useMemo(() => allProducts.filter((p) => departmentOf(p) === 'kids'), [allProducts]);
  const girls = useMemo(() => kids.filter((p) => p.category === BABY_GIRLS), [kids]);
  const boys = useMemo(() => kids.filter((p) => p.category === BABY_BOYS), [kids]);
  const results = useMemo(() => kids.filter((p) => (filter === ALL || p.category === filter)
    && matchesText(query, [p.name, p.sku, p.category, kindOf(p), p.fabric, ...colourNames(p), ...(p.sizes || [])])), [kids, filter, query]);

  // Counts wait for the catalogue instead of showing a misleading 0
  const countsLoading = isLoading && allProducts.length === 0;
  const count = (n: number) => (countsLoading ? '…' : n);
  const onStore = (list: Product[]) => list.filter((p) => !p.hidden && isAvailable(p)).length;
  const published = kids.filter((p) => !p.hidden).length;

  const togglePublished = async (p: Product) => {
    setBusyId(p.id);
    try {
      await toggleProductStatus(p.id);
      showToast(p.hidden
        ? `"${p.name}" is now shown in the Kids section${isAvailable(p) ? '' : ' (as sold out until you add stock)'}.`
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

  const changeFilter = (value: string) => { setFilter(value); setLimit(LIST_STEP); };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Storefront · Kids"
        title="Kids Wear"
        icon={<Baby className="text-current" />}
        description={<>Add clothes for Baby Girls and Baby Boys here. They are shown in their own Kids section of the store, with sizes by age from 1-2 Y to 14-15 Y. Your women's products stay in Products and are not changed here.</>}
      />

      <dl className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Kids wear in numbers">
        <Stat label="Kids wear" value={count(kids.length)} note={countsLoading ? 'Loading…' : `${published} published · ${kids.length - published} hidden`} />
        <Stat label={BABY_GIRLS} value={count(girls.length)} note={countsLoading ? 'Loading…' : `${onStore(girls)} on the store now`} />
        <Stat label={BABY_BOYS} value={count(boys.length)} note={countsLoading ? 'Loading…' : `${onStore(boys)} on the store now`} />
      </dl>

      <div className="grid grid-cols-2 gap-3">
        {QUICK_ADD.map(({ category, hint, tone }) => (
          <button key={category} type="button" onClick={() => setDraft(emptyDraft(category))}
            className={`min-w-0 text-left rounded-2xl border p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 transition-colors cursor-pointer ${tone}`}>
            <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center shrink-0" aria-hidden="true"><Plus className="w-5 h-5 text-current" /></span>
            <span className="min-w-0">
              <span className="block font-serif text-lg sm:text-xl font-semibold leading-tight">Add {category} wear</span>
              <span className="hidden sm:block mt-0.5 text-xs text-[#2A1A26]/65">{hint}</span>
            </span>
          </button>
        ))}
      </div>

      <CategoryStatus names={[BABY_GIRLS, BABY_BOYS]} cats={cats} showToast={showToast} onOpenCategories={() => openAdminTab('categories')} />

      <section className={`${ui.card} min-w-0`} aria-labelledby="kids-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="kids-list-title" className="font-semibold text-[#2A1A26]">Kids wear ({count(kids.length)})</h3>
          <FilterChips label="Show kids wear for" value={filter} onChange={changeFilter} options={[
            { value: ALL, label: 'All', count: kids.length },
            { value: BABY_GIRLS, label: BABY_GIRLS, count: girls.length },
            { value: BABY_BOYS, label: BABY_BOYS, count: boys.length },
          ]} />
        </div>

        {kids.length > 0 && (
          <div className="relative mt-3">
            <Search className="w-4 h-4 text-[#4B1D3F]/50 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(LIST_STEP); }}
              placeholder="Search by name, type, colour or SKU" aria-label="Search kids wear" className={ui.search} />
          </div>
        )}

        {countsLoading ? (
          <p className="mt-4 text-sm text-[#2A1A26]/65 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-current" /> Loading products…</p>
        ) : kids.length === 0 ? (
          <div className="mt-4 rounded-xl bg-[#F3EEF8] p-4 text-sm text-[#2A1A26]/75">
            No kids wear yet. Use <span className="font-semibold text-[#4B1D3F]">Add Baby Girls wear</span> or <span className="font-semibold text-[#4B1D3F]">Add Baby Boys wear</span> above to add the first item.
          </div>
        ) : results.length === 0 ? (
          <p className="mt-4 text-sm text-[#2A1A26]/65">{query.trim() ? `Nothing matches "${query.trim()}".` : `No ${filter} items yet.`}</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#4B1D3F]/10">
            {results.slice(0, limit).map((p) => (
              <li key={p.id} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Thumb p={p} />
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-medium text-[#2A1A26] line-clamp-2 sm:line-clamp-1">{p.name}</p>
                  <p className="mt-0.5 text-xs text-[#2A1A26]/65 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <CategoryBadge category={p.category} />
                    {kindOf(p) && <span className="font-semibold text-[#9C7A45]">{kindOf(p)}</span>}
                    <span>{agesSummary(p.sizes || [])}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#2A1A26]/65"><Price p={p} /> · <Status p={p} /></p>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                  <PublishButton p={p} busy={busyId === p.id} onToggle={() => togglePublished(p)} />
                  <button type="button" onClick={() => setDraft(draftFrom(p))} disabled={busyId === p.id} aria-label={`Edit ${p.name}`} className={`${ui.iconBtn} hover:bg-[#F3EEF8] text-[#4B1D3F]`}>
                    <Pencil className="w-4 h-4 text-current" />
                  </button>
                  <button type="button" onClick={() => remove(p)} disabled={busyId === p.id} aria-label={`Delete ${p.name}`} className={`${ui.iconBtn} hover:bg-rose-50 text-rose-700`}>
                    {busyId === p.id ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Trash2 className="w-4 h-4 text-current" />}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {results.length > limit && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#2A1A26]/60">Showing {limit} of {results.length}.</p>
            <button type="button" onClick={() => setLimit((n) => n + LIST_STEP)} className={ui.outline}>Show more</button>
          </div>
        )}
      </section>

      {draft && (
        <KidsForm
          draft={draft}
          existing={draft.id ? byId.get(draft.id) : undefined}
          allProducts={allProducts}
          onClose={() => setDraft(null)}
          onSaved={(category) => setFilter((f) => (f === ALL || f === category ? f : ALL))}
          addProduct={addProduct}
          updateProduct={updateProduct}
          ensureCategory={cats.ensure}
          showToast={showToast}
        />
      )}
    </div>
  );
};

interface KidsFormProps {
  draft: KidsDraft;
  existing?: Product;
  allProducts: Product[];
  onClose: () => void;
  onSaved: (category: KidsCategory) => void;
  addProduct: (p: Omit<Product, 'id'>) => Promise<Product>;
  updateProduct: (id: string, p: Partial<Product>) => Promise<void>;
  ensureCategory: (name: string) => Promise<CategoryResult>;
  showToast: ShowToast;
}

const shortcut = 'h-8 px-3 rounded-full border border-[#4B1D3F]/20 bg-white text-xs font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer';

/** Add / edit one kids wear item, saved through the same product functions as the rest of the catalogue. */
const KidsForm: React.FC<KidsFormProps> = ({ draft: initial, existing, allProducts, onClose, onSaved, addProduct, updateProduct, ensureCategory, showToast }) => {
  const [d, setD] = useState<KidsDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [detected, setDetected] = useState('');
  const [suggestion, setSuggestion] = useState<ColourFind | null>(null);
  const photos = usePhotoSession(showToast);
  const nameRef = useRef<HTMLInputElement>(null);
  const latest = useRef(d);
  latest.current = d;
  const set = (patch: Partial<KidsDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const isEdit = Boolean(initial.id);
  // Age sizes, plus any other size already saved on this item (kept visible, never dropped silently)
  const sizeOrder = useMemo(() => [...KIDS_SIZES, ...initial.sizes.filter((s) => !KIDS_SIZES.includes(s))], [initial.sizes]);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  const toggleSize = (size: ProductSize) => setD((prev) => ({ ...prev, sizes: prev.sizes.includes(size) ? prev.sizes.filter((s) => s !== size) : [...prev.sizes, size] }));

  const cancel = () => {
    if (saving) return;
    if (photos.uploading) { showToast('Please wait for the photos to finish uploading.', 'info'); return; }
    if (dirty && !window.confirm(isEdit ? 'Close without saving your changes?' : 'Close without adding this item? What you entered will be lost.')) return;
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
  // Gemini: the text fields from the photos. Who it is for and the type the admin already chose are kept;
  // price, MRP, stock and age sizes are never touched.
  const applyAi = (draft: AiDraft) => {
    setD((prev) => ({
      ...prev,
      category: prev.category || ((KIDS_CATEGORIES as readonly string[]).includes(draft.category) ? draft.category as KidsCategory : ''),
      type: prev.type || (draft.kind || (draft.customKind ? OTHER : '')),
      customType: prev.type ? prev.customType : draft.kind ? '' : draft.customKind,
      name: draft.name || prev.name,
      description: draft.description || prev.description,
      fabric: draft.fabric || prev.fabric,
      washCare: draft.washCare || prev.washCare,
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
    if (d.id && !existing) { showToast('This item was deleted (maybe on another device). Close this form and add it again.', 'error'); return; }
    const problem = problemOf(d);
    if (problem) { showToast(problem.message, 'error'); focusField(problem.field); return; }

    const category = d.category as KidsCategory;
    const stock = Number(d.stock);
    const after = fieldsOf(d, sizeOrder);
    setSaving(true);
    try {
      let message: string;
      let changed = true;
      if (existing) {
        const changes: Partial<Product> = keepPricesTogether(changedFields(fieldsOf(initial, sizeOrder), after), after);
        // Always saved as kids wear (an older item may only have had the category)
        if (existing.productType !== 'kids') {
          changes.productType = 'kids';
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
          category,
          productType: 'kids',
          sku: newSku('SAG-KID'),
          stockQuantity: stock,
          inStock: stock > 0,
          rating: 0,
          reviewCount: 0,
          fit: '',
          occasion: '',
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
          ageRange: '',
        });
        message = `Added "${after.name}" to ${category}${after.hidden ? ' (hidden until you publish it)' : ''}.`;
      }
      photos.commit(d.images, allProducts, d.id);
      // "Baby Girls" / "Baby Boys" in Admin → Categories (for its photo); never holds the form up for long
      const categoryResult = await settleWithin(ensureCategory(category), 5000, 'skipped' as CategoryResult);
      showToast(message + categoryNote(categoryResult, category), changed ? 'success' : 'info');
      onSaved(category);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Could not save. Please try again.', 'error');
      setSaving(false);
    }
  };

  const title = isEdit ? 'Edit kids wear' : `Add ${d.category || 'kids'} wear`;

  return (
    <FormSheet titleId="kid-form-title" title={title} subtitle={isEdit ? initial.name : 'Shown in the Kids section of the store'} formId="kid-form"
      submitLabel={isEdit ? 'Save' : 'Add item'} saving={saving} uploading={photos.uploading} onCancel={cancel} focusRef={nameRef}>
      <form id="kid-form" onSubmit={submit} noValidate>
        {/* Nothing can be changed while saving (e.g. a photo removed half-way) */}
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <AiProductFill department="kids" images={d.images} uploading={photos.uploading} onUpload={aiUpload}
            categories={KIDS_CATEGORIES} kinds={KIDS_TYPES} currentName={d.name}
            hasDetails={Boolean(d.name.trim() || d.description.trim())} onApply={applyAi} />

          <div>
            <p id="kid-for-label" className={ui.label}>For *</p>
            <div role="group" aria-labelledby="kid-for-label" className="grid grid-cols-2 gap-2">
              {KIDS_CATEGORIES.map((c) => {
                const on = d.category === c;
                return (
                  <button key={c} id={c === BABY_GIRLS ? 'kid-for-girls' : 'kid-for-boys'} type="button" aria-pressed={on} onClick={() => set({ category: c })}
                    className={`h-11 rounded-full border text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${on ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/15 text-[#2A1A26] hover:bg-[#F3EEF8]'}`}>
                    {on && <Check className="w-4 h-4 text-current" aria-hidden="true" />}{c}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="kid-name" className={ui.label}>Name *</label>
            <input id="kid-name" ref={nameRef} required maxLength={120} value={d.name} onChange={(e) => set({ name: e.target.value })}
              placeholder={d.category === BABY_BOYS ? 'e.g. Cotton kurta pyjama set' : 'e.g. Floral party frock'} className={ui.field} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="kid-type" className={ui.label}>Type *</label>
              <select id="kid-type" required value={d.type} onChange={(e) => set({ type: e.target.value })} className={ui.field}>
                <option value="">Choose type</option>
                {KIDS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value={OTHER}>Other (type your own)</option>
              </select>
            </div>
            {d.type === OTHER && (
              <div>
                <label htmlFor="kid-custom-type" className={ui.label}>What is it? *</label>
                <input id="kid-custom-type" required maxLength={40} value={d.customType} onChange={(e) => set({ customType: e.target.value })} placeholder="e.g. Lehenga choli" className={ui.field} />
              </div>
            )}
          </div>

          <div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="kid-price" className={ui.label}>Price (₹) *</label>
                <input id="kid-price" required type="number" inputMode="numeric" min={1} step={1} value={d.price} onChange={(e) => set({ price: e.target.value })} className={ui.field} />
              </div>
              <div>
                <label htmlFor="kid-mrp" className={ui.label}>MRP (₹)</label>
                <input id="kid-mrp" type="number" inputMode="numeric" min={1} step={1} value={d.mrp} onChange={(e) => set({ mrp: e.target.value })} placeholder="Optional" className={ui.field} />
              </div>
              <div>
                <label htmlFor="kid-stock" className={ui.label}>Stock *</label>
                <input id="kid-stock" required type="number" inputMode="numeric" min={0} step={1} value={d.stock} onChange={(e) => set({ stock: e.target.value })} placeholder="e.g. 10" className={ui.field} />
              </div>
            </div>
            <PriceHint price={d.price} mrp={d.mrp} />
            <p className="mt-1 text-[11px] text-[#2A1A26]/60">Stock is the total number of pieces you have, all age sizes together.</p>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <p id="kid-sizes-label" className="text-xs font-semibold text-[#2A1A26]/80">Age sizes * <span className={ui.optional}>(tick the ones you have)</span></p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => set({ sizes: [...KIDS_SIZE_PAIRS] })} title="Tick 1-2, 3-4, 5-6, 7-8, 9-10, 11-12, 13-14 and 14-15 Y" className={shortcut}>
                  1-2, 3-4, 5-6…
                </button>
                <button type="button" onClick={() => set({ sizes: [...KIDS_SIZES] })} className={shortcut}>All ages</button>
                {d.sizes.length > 0 && <button type="button" onClick={() => set({ sizes: [] })} className={shortcut}>Clear</button>}
              </div>
            </div>
            <div id="kid-sizes" role="group" aria-labelledby="kid-sizes-label" tabIndex={-1} className="flex flex-wrap gap-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#8A2E55]/30 focus:ring-offset-4 focus:ring-offset-[#FBF7F3]">
              {sizeOrder.map((s) => {
                const on = d.sizes.includes(s);
                return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => toggleSize(s)} className={`${ui.chip(on)} min-w-[4.75rem]`}>
                    {on && <Check className="w-3.5 h-3.5 text-current" aria-hidden="true" />}{s}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-[#2A1A26]/60">
              {d.sizes.length > 0 ? `${d.sizes.length} ticked. ` : ''}Shoppers choose their child's age size on the product page.
            </p>
          </div>

          <PhotoField id="kid-photos" images={d.images} uploading={photos.uploading} onFiles={upload} onRemove={removeImage} onCover={makeCover}
            hint="Clear, bright photos work best. The colour below is read from the first photo you upload." />

          <ColoursField idPrefix="kid" rows={d.colours} onChange={(colours) => set({ colours })} detected={detected} suggestion={suggestion}
            onUseSuggestion={addSuggestedColour} onDismissSuggestion={() => setSuggestion(null)} placeholder="e.g. Baby pink" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="kid-fabric" className={ui.label}>Fabric <span className={ui.optional}>(recommended)</span></label>
              <input id="kid-fabric" maxLength={120} value={d.fabric} onChange={(e) => set({ fabric: e.target.value })} placeholder="e.g. Soft cotton" className={ui.field} />
            </div>
            <div>
              <label htmlFor="kid-care" className={ui.label}>Wash care <span className={ui.optional}>(optional)</span></label>
              <input id="kid-care" maxLength={200} value={d.washCare} onChange={(e) => set({ washCare: e.target.value })} placeholder="e.g. Gentle machine wash" className={ui.field} />
            </div>
          </div>

          <div>
            <label htmlFor="kid-desc" className={ui.label}>Description <span className={ui.optional}>(recommended)</span></label>
            <textarea id="kid-desc" rows={3} maxLength={1500} value={d.description} onChange={(e) => set({ description: e.target.value })}
              placeholder="What it is, what is in the set, the fit, the occasion" className={ui.textarea} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Toggle id="kid-new" checked={d.isNewArrival} onChange={(v) => set({ isNewArrival: v })} label="New arrival" hint='Shows a "New" badge on the product.' />
            <Toggle id="kid-published" checked={d.published} onChange={(v) => set({ published: v })} label="Published"
              hint={d.published ? 'Shown in the Kids section (as sold out when stock is 0).' : 'Hidden: kept here, not shown on the store.'} />
          </div>
        </fieldset>
      </form>
    </FormSheet>
  );
};
