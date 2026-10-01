import React, { useEffect, useRef, useState } from 'react';
import { Check, FolderPlus, ImagePlus, Loader2, Plus, Save, X } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { deleteImages, uploadImage } from '../../lib/dataStore';
import { Product, ProductCategory, ProductColor } from '../../types';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { inr } from '../../utils/looks';
import { isAvailable } from '../../utils/smartQuery';

/**
 * Building blocks shared by Admin → Kids Wear and Admin → Toys: photo uploads, colours, the add / edit
 * sheet, list rows and the store category check. Same look and rules as Complete the Look (AdminLooks).
 */

export type ShowToast = (message: string, type?: 'success' | 'info' | 'error') => void;

/** Rows shown at first, and added by "Show more". */
export const LIST_STEP = 60;
/** "Other (type your own)" in a type select. */
export const OTHER = 'Other';
const MAX_PHOTO_MB = 10;
const MAX_COLOURS = 8;
const FALLBACK_HEX = '#4B1D3F';

export const ui = {
  card: 'bg-white rounded-2xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] p-4 sm:p-5',
  label: 'block text-xs font-semibold text-[#2A1A26]/80 mb-1',
  optional: 'font-normal text-[#2A1A26]/55',
  // 16px on phones so iOS does not zoom into the field
  field: 'w-full h-11 px-4 rounded-full border border-[#4B1D3F]/15 bg-white text-base sm:text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 transition-colors',
  textarea: 'w-full px-4 py-3 rounded-2xl border border-[#4B1D3F]/15 bg-white text-base sm:text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 transition-colors',
  search: 'w-full h-11 pl-10 pr-4 rounded-full border border-[#4B1D3F]/15 bg-white text-base sm:text-sm text-[#2A1A26] placeholder:text-[#2A1A26]/40 focus:outline-none focus:border-[#4B1D3F]/50 focus:ring-2 focus:ring-[#4B1D3F]/10 transition-colors',
  iconBtn: 'w-10 h-10 shrink-0 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed',
  primary: 'h-11 px-5 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors',
  outline: 'h-11 px-5 rounded-full border border-[#4B1D3F]/20 bg-white text-sm font-medium text-[#4B1D3F] hover:bg-[#F3EEF8] inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer transition-colors',
  chip: (on: boolean) => `h-10 px-3 rounded-full border text-sm inline-flex items-center justify-center gap-1 transition-colors cursor-pointer ${on ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/20 text-[#2A1A26] hover:border-[#4B1D3F]'}`,
};

// ---------------------------------------------------------------- page shell (all admin catalogue / storefront pages)

interface AdminPageHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
}

/** The same page header everywhere: eyebrow, serif title, one line of help, and the page's main actions. */
export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({ eyebrow, title, description, icon, actions, id }) => (
  <header id={id} className="relative overflow-hidden bg-white rounded-3xl border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
    <span className="pointer-events-none absolute -right-10 -top-12 w-40 h-40 rounded-full bg-[#F3EEF8]" aria-hidden="true" />
    <div className="relative min-w-0 flex-1">
      <div className="flex items-center sm:items-start gap-3.5 sm:gap-4 min-w-0">
        {icon && (
          <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#F3EEF8] border border-[#4B1D3F]/10 text-[#4B1D3F] flex items-center justify-center shrink-0 [&>svg]:w-6 [&>svg]:h-6 sm:[&>svg]:w-7 sm:[&>svg]:h-7" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9C7A45]">{eyebrow}</p>
          <h2 className="mt-0.5 font-serif text-[26px] sm:text-3xl leading-tight font-semibold text-[#2A1A26] break-words">{title}</h2>
          {description && <p className="hidden sm:block mt-1 text-sm text-[#2A1A26]/65 max-w-2xl">{description}</p>}
        </div>
      </div>
      {/* Phones: the help line uses the full width under the title */}
      {description && <p className="sm:hidden mt-3 text-sm text-[#2A1A26]/65">{description}</p>}
    </div>
    {actions && <div className="relative flex flex-wrap items-center gap-2 sm:gap-2.5 lg:justify-end lg:shrink-0">{actions}</div>}
  </header>
);

/** Section heading inside a card: small lavender icon tile, title and an optional line of help. */
export const SectionTitle: React.FC<{ icon?: React.ReactNode; title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; id?: string }> = ({ icon, title, hint, action, id }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 pb-4 mb-5 border-b border-[#4B1D3F]/10">
    <div className="flex items-start gap-3 min-w-0">
      {icon && <span className="w-9 h-9 rounded-xl bg-[#F3EEF8] text-[#4B1D3F] flex items-center justify-center shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]" aria-hidden="true">{icon}</span>}
      <div className="min-w-0">
        <h3 id={id} className="font-serif text-xl leading-tight font-semibold text-[#2A1A26]">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-[#2A1A26]/60">{hint}</p>}
      </div>
    </div>
    {action}
  </div>
);

// ---------------------------------------------------------------- helpers

export const validHex = (hex?: string) => /^#[0-9a-f]{6}$/i.test(String(hex || ''));
export const mrpOf = (p: Product) => Math.max(p.price, Number(p.originalPrice) || p.price);
/** "Standard" / "Default" are stand-ins for products saved without a colour. */
export const isRealColour = (c?: ProductColor) => Boolean(c && c.name && !['standard', 'default'].includes(c.name.trim().toLowerCase()));
export const newSku = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
export const clip = (text: string, max: number) => String(text || '').trim().slice(0, max);
export const matchesText = (query: string, values: unknown[]) => {
  const needle = query.trim().toLowerCase();
  return !needle || values.some((v) => String(v ?? '').toLowerCase().includes(needle));
};
export const colourNames = (p: Product) => (p.colors || []).filter(isRealColour).map((c) => c.name);

/** Saved price, MRP and discount from the form boxes (the same sums the product form uses). */
export const priceFields = (priceText: string, mrpText: string) => {
  const price = Math.round(Number(priceText)) || 0;
  const mrp = mrpText.trim() ? Math.round(Number(mrpText)) || 0 : 0;
  const originalPrice = Math.max(price, mrp || price);
  const discount = originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
  return { price, originalPrice, discount };
};
/** A validation message and the id of the field it is about. */
export interface Problem { message: string; field: string }

/** What is wrong with the price / MRP boxes (null when they are fine). */
export const priceProblem = (priceText: string, mrpText: string, ids: { price: string; mrp: string }): Problem | null => {
  const price = Number(priceText);
  if (!priceText.trim() || !Number.isFinite(price) || Math.round(price) <= 0) return { message: 'Please enter a valid price.', field: ids.price };
  if (mrpText.trim()) {
    const mrp = Number(mrpText);
    if (!Number.isFinite(mrp) || Math.round(mrp) < Math.round(price)) return { message: 'MRP cannot be lower than the price.', field: ids.mrp };
  }
  return null;
};
export const stockProblem = (stockText: string, id: string): Problem | null => {
  const stock = Number(stockText);
  return !stockText.trim() || !Number.isInteger(stock) || stock < 0 ? { message: 'Stock must be a whole number of 0 or more.', field: id } : null;
};

/** The promise's answer, or the fallback if it takes longer than ms (the work itself carries on). */
export const settleWithin = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([promise, new Promise<T>((resolve) => { window.setTimeout(() => resolve(fallback), ms); })]);

/**
 * Only the fields that differ from when the form opened, so an edit never overwrites anything the admin
 * did not change (other fields, or changes made meanwhile on another device).
 */
export const changedFields = <T extends object>(before: T, after: T): Partial<T> => {
  const out: Partial<T> = {};
  (Object.keys(after) as Array<keyof T>).forEach((key) => {
    if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) out[key] = after[key];
  });
  return out;
};
/** Price, MRP and discount are saved together whenever one of them changes. */
export const keepPricesTogether = (changes: Partial<Product>, after: Pick<Product, 'price' | 'originalPrice' | 'discount'>) => {
  if ('price' in changes || 'originalPrice' in changes || 'discount' in changes) {
    changes.price = after.price;
    changes.originalPrice = after.originalPrice;
    changes.discount = after.discount;
  }
  return changes;
};

/** Moves the cursor to the field a validation message is about. */
export const focusField = (id?: string) => {
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  (el as HTMLElement).focus?.({ preventScroll: true });
};

// ---------------------------------------------------------------- colours

export interface ColourRow { key: string; name: string; hex: string; imageUrl?: string }
let rowSeq = 0;
export const colourRow = (c?: Partial<ProductColor>): ColourRow => {
  const row: ColourRow = { key: `colour-${++rowSeq}`, name: c?.name || '', hex: validHex(c?.hex) ? String(c?.hex) : FALLBACK_HEX };
  if (c?.imageUrl) row.imageUrl = c.imageUrl;
  return row;
};
/** The product's real colours as editable rows (one empty row when it has none). */
export const colourRowsFrom = (p?: Product) => {
  const rows = (p?.colors || []).filter(isRealColour).map(colourRow);
  return rows.length ? rows : [colourRow()];
};
/** Colours as saved: named rows only (no repeats), a valid hex, and a photo link only while that photo is still on the product. */
export const coloursToSave = (rows: ColourRow[], images: string[]): ProductColor[] => {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const name = clip(row.name, 40);
    if (!name || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    const colour: ProductColor = { name, hex: validHex(row.hex) ? row.hex.toUpperCase() : FALLBACK_HEX };
    if (row.imageUrl && images.includes(row.imageUrl)) colour.imageUrl = row.imageUrl;
    return [colour];
  });
};

export interface ColourFind { name: string; hex: string }

interface ColoursFieldProps {
  idPrefix: string;
  rows: ColourRow[];
  onChange: (rows: ColourRow[]) => void;
  /** Name filled in from the first photo (shown as a note while the first colour still has that name). */
  detected: string;
  /** Colour read from a new photo while the product already has colours: offered, never added by itself. */
  suggestion: ColourFind | null;
  onUseSuggestion: () => void;
  onDismissSuggestion: () => void;
  placeholder: string;
}

export const ColoursField: React.FC<ColoursFieldProps> = ({ idPrefix, rows, onChange, detected, suggestion, onUseSuggestion, onDismissSuggestion, placeholder }) => {
  const update = (key: string, patch: Partial<ColourRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => {
    const next = rows.filter((r) => r.key !== key);
    onChange(next.length ? next : [colourRow()]);
  };
  const showDetected = Boolean(detected) && rows[0]?.name.trim() === detected;
  return (
    <div>
      <p id={`${idPrefix}-colours-label`} className={ui.label}>Colour <span className={ui.optional}>(optional, add more if it comes in several)</span></p>
      <div role="group" aria-labelledby={`${idPrefix}-colours-label`} className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.key} className="flex items-center gap-2">
            <label className="relative w-11 h-11 shrink-0 rounded-full border border-[#4B1D3F]/15 overflow-hidden cursor-pointer" title="Pick the colour">
              <input type="color" value={validHex(row.hex) ? row.hex : FALLBACK_HEX} onChange={(e) => update(row.key, { hex: e.target.value })}
                aria-label={`Colour ${i + 1} swatch`} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <span className="block w-full h-full" style={{ backgroundColor: validHex(row.hex) ? row.hex : FALLBACK_HEX }} />
            </label>
            <input id={i === 0 ? `${idPrefix}-colour` : undefined} value={row.name} maxLength={40} onChange={(e) => update(row.key, { name: e.target.value })}
              placeholder={i === 0 ? placeholder : 'Another colour'} aria-label={`Colour ${i + 1} name`} className={`${ui.field} min-w-0`} />
            {(rows.length > 1 || row.name.trim()) && (
              <button type="button" onClick={() => remove(row.key)} aria-label={`Remove colour ${i + 1}`} className={`${ui.iconBtn} rounded-full hover:bg-rose-50 text-rose-700`}>
                <X className="w-4 h-4 text-current" />
              </button>
            )}
          </div>
        ))}
      </div>
      {showDetected && <p className="mt-1.5 text-xs text-[#2A1A26]/65">Filled in from the first photo — change it if it is not right.</p>}
      {suggestion && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-[#F3EEF8] px-3 py-2">
          <span className="w-6 h-6 rounded-full border border-white shadow-sm shrink-0" style={{ backgroundColor: suggestion.hex }} aria-hidden="true" />
          <span className="text-xs text-[#2A1A26]/80 min-w-0 flex-1">Colour in the new photo: <span className="font-semibold">{suggestion.name}</span></span>
          <button type="button" onClick={onUseSuggestion} className="h-8 px-3 rounded-full bg-[#4B1D3F] text-white text-xs font-semibold hover:bg-[#3B1532] cursor-pointer">Add</button>
          <button type="button" onClick={onDismissSuggestion} aria-label="Dismiss the suggested colour" className="w-8 h-8 rounded-full hover:bg-white text-[#4B1D3F] flex items-center justify-center cursor-pointer"><X className="w-4 h-4 text-current" /></button>
        </div>
      )}
      {rows.length < MAX_COLOURS && (
        <button type="button" onClick={() => onChange([...rows, colourRow()])} className="mt-2 h-9 px-3 rounded-full text-xs font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] inline-flex items-center gap-1.5 cursor-pointer">
          <Plus className="w-3.5 h-3.5 text-current" /> Add another colour
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- photos

/**
 * Photo uploads for one add / edit form. Photos uploaded here are deleted again if the form is closed without
 * saving; saved photos the admin removes are deleted only after a successful save, and only when nothing
 * else on the store still shows them.
 */
export const usePhotoSession = (showToast: ShowToast) => {
  const { heroConfig, dealOfTheDay, categories = [] } = useAdmin();
  const [uploading, setUploading] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const session = useRef<string[]>([]);
  const saved = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Left without saving (e.g. with the browser's Back button): these photos are not used anywhere
      if (!saved.current && session.current.length) deleteImages(session.current).catch(() => undefined);
      session.current = [];
    };
  }, []);

  /** Uploads the chosen files one by one; onFirstPhoto gets the first photo that uploaded (for the colour). */
  const upload = async (files: File[], onUploaded: (url: string) => void, onFirstPhoto?: (file: File) => void) => {
    if (!files.length) return;
    setUploading(true);
    let first = true;
    for (const file of files) {
      if (!file.type.startsWith('image/')) { showToast(`"${file.name}" is not a photo. Only image files can be uploaded.`, 'error'); continue; }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) { showToast(`"${file.name}" is larger than ${MAX_PHOTO_MB} MB. Please choose a smaller photo.`, 'error'); continue; }
      try {
        const url = await uploadImage(file, 'product-images');
        if (!mounted.current) { deleteImages([url]).catch(() => undefined); return; }
        session.current = [...session.current, url];
        onUploaded(url);
        if (first) { first = false; onFirstPhoto?.(file); }
      } catch (err: any) {
        showToast(`Could not upload "${file.name}": ${err?.message || 'please try again.'}`, 'error');
      }
    }
    if (mounted.current) setUploading(false);
  };

  const remove = (url: string) => {
    if (session.current.includes(url)) {
      // Never saved on a product, so it can go right away
      session.current = session.current.filter((u) => u !== url);
      deleteImages([url]).catch(() => undefined);
    } else {
      setPendingDeletes((list) => (list.includes(url) ? list : [...list, url]));
    }
  };

  /** Closing without saving: photos uploaded in this form are deleted. */
  const discard = () => {
    if (session.current.length) deleteImages(session.current).catch(() => undefined);
    session.current = [];
  };

  /** After a successful save. */
  const commit = (finalImages: string[], allProducts: Product[], selfId?: string) => {
    saved.current = true;
    session.current = [];
    const inUse = new Set<string>([
      ...allProducts.filter((p) => p.id !== selfId).flatMap((p) => [...(p.images || []), p.image || '', ...(p.colors || []).map((c) => c.imageUrl || '')]),
      ...categories.map((c) => c.image || ''),
      ...(heroConfig?.slides || []).flatMap((s) => [s.image || '', s.bannerImage || '']),
      dealOfTheDay?.bannerImage || '',
    ]);
    const removed = pendingDeletes.filter((url) => !finalImages.includes(url) && !inUse.has(url));
    if (removed.length) deleteImages(removed).catch(() => undefined);
  };

  return { uploading, upload, remove, discard, commit };
};

interface PhotoFieldProps {
  id: string;
  images: string[];
  uploading: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (url: string) => void;
  onCover: (url: string) => void;
  hint: string;
}

export const PhotoField: React.FC<PhotoFieldProps> = ({ id, images, uploading, onFiles, onRemove, onCover, hint }) => (
  <div>
    <p id={`${id}-label`} className={ui.label}>Photos * <span className={ui.optional}>(the first photo is the cover)</span></p>
    <div role="group" aria-labelledby={`${id}-label`} className="grid grid-cols-3 min-[480px]:grid-cols-4 sm:grid-cols-5 gap-2.5">
      {images.map((url, i) => (
        <div key={url} className="min-w-0">
          <img src={getCleanImageUrl(url, 240)} alt={`Photo ${i + 1}${i === 0 ? ' (cover)' : ''}`}
            className="w-full aspect-[4/5] rounded-2xl object-cover object-top bg-[#F3EEF8] border border-[#4B1D3F]/10" />
          <div className="mt-1 flex items-center justify-between gap-1">
            {i === 0
              ? <span className="px-1 text-[11px] font-bold uppercase tracking-wide text-[#9C7A45]">Cover</span>
              : <button type="button" onClick={() => onCover(url)} className="h-8 px-1 text-[11px] font-semibold text-[#4B1D3F] underline underline-offset-2 cursor-pointer">Make cover</button>}
            <button type="button" onClick={() => onRemove(url)} aria-label={`Remove photo ${i + 1}`}
              className="w-8 h-8 shrink-0 rounded-full hover:bg-rose-50 text-rose-700 flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4 text-current" />
            </button>
          </div>
        </div>
      ))}
      <label className={`w-full aspect-[4/5] rounded-2xl border-2 border-dashed border-[#4B1D3F]/25 bg-[#FBF7F3] flex flex-col items-center justify-center gap-1 px-1 text-center text-xs font-semibold text-[#4B1D3F] ${uploading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-[#F3EEF8]'}`}>
        {uploading ? <Loader2 className="w-5 h-5 animate-spin text-current" /> : <ImagePlus className="w-5 h-5 text-current" />}
        {uploading ? 'Uploading…' : images.length ? 'Add more' : 'Add photos'}
        <input id={id} type="file" accept="image/*" multiple disabled={uploading} className="sr-only"
          onChange={(e) => { const files = Array.from(e.target.files || []) as File[]; e.target.value = ''; onFiles(files); }} />
      </label>
    </div>
    <p className="mt-1.5 text-[11px] text-[#2A1A26]/60">{hint}</p>
  </div>
);

// ---------------------------------------------------------------- form pieces

/** How the price will read on the store, from the numbers typed (only when there is a real MRP above the price). */
export const PriceHint: React.FC<{ price: string; mrp: string }> = ({ price, mrp }) => {
  const f = priceFields(price, mrp);
  if (f.price <= 0 || !mrp.trim() || f.originalPrice <= f.price) return null;
  return (
    <p className="mt-1.5 text-[11px] text-[#2A1A26]/60">
      Shown as {inr(f.price)} <span className="line-through">{inr(f.originalPrice)}</span> · {f.discount}% off
    </p>
  );
};

export const Toggle: React.FC<{ id: string; checked: boolean; onChange: (next: boolean) => void; label: string; hint: string }> = ({ id, checked, onChange, label, hint }) => (
  <div className="flex items-center justify-between gap-3 rounded-2xl bg-white border border-[#4B1D3F]/10 px-3.5 py-3">
    <div className="min-w-0">
      <p id={`${id}-label`} className="text-sm font-semibold text-[#2A1A26]">{label}</p>
      <p id={`${id}-hint`} className="text-xs text-[#2A1A26]/60">{hint}</p>
    </div>
    <button id={id} type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-12 h-7 rounded-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4B1D3F]/30 ${checked ? 'bg-[#4B1D3F]' : 'bg-[#E6DDF0]'}`}>
      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  </div>
);

interface FormSheetProps {
  titleId: string;
  title: string;
  subtitle?: string;
  formId: string;
  submitLabel: string;
  saving: boolean;
  uploading: boolean;
  onCancel: () => void;
  /** Focused when the sheet opens on wider screens (phones do not pop the keyboard over the form). */
  focusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

/** Bottom sheet on phones, centred dialog on larger screens (same shell as the Complete the Look form). */
export const FormSheet: React.FC<FormSheetProps> = ({ titleId, title, subtitle, formId, submitLabel, saving, uploading, onCancel, focusRef, children }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  // A tap on the dim background closes the sheet, but not a text selection that started inside it
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (focusRef?.current && window.matchMedia?.('(min-width: 640px)').matches) focusRef.current.focus();
    else dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelRef.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (previous && document.contains(previous)) previous.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[80] bg-[#2A1A26]/50 flex items-end sm:items-center justify-center sm:p-4"
      onMouseDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedBackdrop.current && e.target === e.currentTarget) cancelRef.current(); pressedBackdrop.current = false; }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="bg-[#FBF7F3] w-full sm:max-w-2xl max-h-[94dvh] sm:max-h-[90dvh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden focus:outline-none">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#4B1D3F]/10 bg-white">
          <div className="min-w-0">
            <p id={titleId} className="font-serif text-xl sm:text-2xl leading-tight text-[#4B1D3F] break-words">{title}</p>
            {subtitle && <p className="text-xs text-[#2A1A26]/60 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={() => cancelRef.current()} aria-label="Close" className="w-10 h-10 shrink-0 rounded-full hover:bg-[#F3EEF8] flex items-center justify-center cursor-pointer"><X className="w-5 h-5 text-current" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        <div className="flex items-center justify-end gap-3 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#4B1D3F]/10 bg-white">
          <button type="button" onClick={() => cancelRef.current()} disabled={saving || uploading} className={ui.outline}>Cancel</button>
          <button type="submit" form={formId} disabled={saving || uploading} className={ui.primary}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin text-current" /> : <Save className="w-4 h-4 text-current" />} {uploading ? 'Uploading…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- list pieces

export const Thumb: React.FC<{ p: Product }> = ({ p }) => (
  <img src={getCleanImageUrl(p.images?.find(Boolean) || p.image, 160)} alt="" loading="lazy"
    className="shrink-0 w-12 aspect-[4/5] rounded-lg object-cover object-top bg-[#F3EEF8]" />
);
export const Price: React.FC<{ p: Product }> = ({ p }) => (
  <>
    <span className="font-semibold text-[#2A1A26]">{inr(p.price)}</span>
    {mrpOf(p) > p.price && <span className="ml-1 line-through text-[#2A1A26]/45">{inr(mrpOf(p))}</span>}
  </>
);
export const Status: React.FC<{ p: Product }> = ({ p }) => (
  <span className={p.hidden ? 'text-[#8A2E55]' : !isAvailable(p) ? 'text-rose-700 font-semibold' : 'text-[#2A1A26]/65'}>
    {p.hidden ? `Hidden · ${Math.max(0, Number(p.stockQuantity ?? 0))} in stock` : !isAvailable(p) ? 'Sold out' : `${Number(p.stockQuantity ?? 0)} in stock`}
  </span>
);
/** One honest count from the live catalogue. */
export const Stat: React.FC<{ label: string; value: React.ReactNode; note: string }> = ({ label, value, note }) => (
  <div className="min-w-0 rounded-2xl bg-white border border-[#4B1D3F]/10 shadow-[var(--sag-shadow)] px-3 py-3 sm:px-4">
    <dt className="text-[11px] font-bold uppercase tracking-wider text-[#9C7A45] break-words">{label}</dt>
    <dd className="font-serif text-2xl leading-tight text-[#4B1D3F]">{value}</dd>
    <dd className="text-xs text-[#2A1A26]/60 break-words">{note}</dd>
  </div>
);

export const FilterChips: React.FC<{ label: string; value: string; options: Array<{ value: string; label: string; count: number }>; onChange: (value: string) => void }> = ({ label, value, options, onChange }) => (
  <div role="group" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((o) => {
      const on = o.value === value;
      return (
        <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
          className={`h-9 px-3.5 rounded-full border text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${on ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/15 text-[#2A1A26] hover:bg-[#F3EEF8]'}`}>
          {o.label}<span className={on ? 'text-white/75' : 'text-[#2A1A26]/50'}>{o.count}</span>
        </button>
      );
    })}
  </div>
);

export const PublishButton: React.FC<{ p: Product; busy: boolean; onToggle: () => void }> = ({ p, busy, onToggle }) => (
  <button type="button" onClick={onToggle} disabled={busy} aria-pressed={!p.hidden}
    title={p.hidden ? 'Hidden: tap to show it on the store' : 'Published: tap to hide it from the store'}
    className={`h-9 px-3 rounded-full text-[11px] font-bold uppercase tracking-wide cursor-pointer disabled:opacity-50 ${p.hidden ? 'bg-[#2A1A26]/5 text-[#2A1A26]/70' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
    {p.hidden ? 'Hidden' : 'Published'}
  </button>
);

// ---------------------------------------------------------------- store categories

export type CategoryResult = 'created' | 'exists' | 'skipped' | 'failed';
const categoryKey = (name: string) => String(name || '').trim().toLowerCase();

/**
 * "Baby Girls", "Baby Boys" and "Toys" entries in Admin → Categories (where the owner adds the category photo).
 * A missing one is created (name only, like Admin → Categories creates it); existing categories are never
 * changed or deleted here.
 */
export const useStoreCategories = () => {
  const { categories = [], addCategory, isLoading } = useAdmin();
  const latest = useRef(categories);
  latest.current = categories;
  const created = useRef(new Set<string>());
  const inFlight = useRef(new Map<string, Promise<CategoryResult>>());

  const find = (name: string) => categories.find((c) => categoryKey(c.name) === categoryKey(name));
  const has = (name: string) => created.current.has(categoryKey(name)) || latest.current.some((c) => categoryKey(c.name) === categoryKey(name));
  /** Still waiting for the category list (an empty list is not trusted while it may be loading). */
  const loading = isLoading && categories.length === 0;

  const ensure = (name: string, force = false): Promise<CategoryResult> => {
    const key = categoryKey(name);
    if (has(name)) return Promise.resolve('exists');
    const pending = inFlight.current.get(key);
    if (pending) return pending;
    // An empty list may simply not have loaded yet: never risk a duplicate (the admin can use "Add now")
    if (!force && latest.current.length === 0) return Promise.resolve('skipped');
    const job = addCategory({ name: name as ProductCategory, title: name, image: '', itemCount: '', tagline: '', isActive: true })
      .then((): CategoryResult => { created.current.add(key); return 'created'; }, (): CategoryResult => 'failed')
      .finally(() => { inFlight.current.delete(key); });
    inFlight.current.set(key, job);
    return job;
  };

  return { find, has, ensure, loading };
};
export type StoreCategories = ReturnType<typeof useStoreCategories>;

/** Short note for the save message when a category was added along the way. */
export const categoryNote = (result: CategoryResult, name: string) =>
  result === 'created' ? ` "${name}" was also added to Categories — you can give it a photo there.` : '';

export const CategoryStatus: React.FC<{ names: string[]; cats: StoreCategories; showToast: ShowToast; onOpenCategories: () => void }> = ({ names, cats, showToast, onOpenCategories }) => {
  const [adding, setAdding] = useState<string | null>(null);
  const add = async (name: string) => {
    setAdding(name);
    const result = await cats.ensure(name, true);
    setAdding(null);
    if (result === 'created') showToast(`"${name}" added to Categories. You can give it a photo there.`, 'success');
    else if (result === 'exists') showToast(`"${name}" is already in Categories.`, 'info');
    else showToast(`Could not add "${name}" to Categories. Please try again.`, 'error');
  };
  return (
    <div className="rounded-2xl border border-[#4B1D3F]/10 bg-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div className="min-w-0 flex-1 basis-60">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#9C7A45]">Store categories</p>
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {names.map((name) => {
            const cat = cats.find(name);
            return (
              <li key={name} className={`min-h-9 pl-3 pr-1.5 py-1 rounded-2xl text-xs inline-flex flex-wrap items-center gap-1.5 ${cat ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-[#F3EEF8] text-[#4B1D3F]'}`}>
                {cats.loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin text-current" aria-hidden="true" /> {name}: checking…</>
                ) : cat ? (
                  <span className="pr-1.5 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-current" aria-hidden="true" /> <span className="font-semibold">{name}</span>{!cat.isActive ? ' · switched off' : !cat.image ? ' · no photo yet' : ' · has a photo'}</span>
                ) : (
                  <>
                    <span><span className="font-semibold">{name}</span> · not in Categories yet</span>
                    <button type="button" onClick={() => add(name)} disabled={adding !== null}
                      className="h-7 px-2.5 rounded-full bg-white border border-[#4B1D3F]/20 text-[11px] font-bold text-[#4B1D3F] hover:bg-[#E6DDF0] inline-flex items-center gap-1 cursor-pointer disabled:opacity-60">
                      {adding === name ? <Loader2 className="w-3 h-3 animate-spin text-current" /> : <FolderPlus className="w-3 h-3 text-current" />} Add now
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-[11px] text-[#2A1A26]/60">Added automatically when you save an item. Without a category photo, the store uses the first product photo.</p>
      </div>
      <button type="button" onClick={onOpenCategories} className="h-9 px-4 rounded-full border border-[#4B1D3F]/20 bg-white text-xs font-semibold text-[#4B1D3F] hover:bg-[#F3EEF8] cursor-pointer">
        Open Categories
      </button>
    </div>
  );
};
