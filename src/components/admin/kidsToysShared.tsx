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
// Swatch shown until a colour is picked (a neutral grey from the design tokens)
const FALLBACK_HEX = '#857F74';

const FIELD_BASE = 'border border-control bg-surface text-base sm:text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:text-ink-faint disabled:cursor-not-allowed transition-colors';
const BTN_BASE = 'inline-flex items-center justify-center gap-2 font-semibold cursor-pointer transition-colors disabled:cursor-not-allowed';

/**
 * The admin look in one place ("Aura"): white cards on the paper page, ink text, an ink pill with paper text for the
 * one main action, outline or sand pills for everything else. Every admin page builds from these.
 */
export const ui = {
  card: 'sag-glass p-4 sm:p-5',
  /** Card without padding, for lists and tables that run edge to edge. */
  panel: 'sag-glass overflow-hidden',
  label: 'block text-[13px] leading-[18px] font-medium text-ink-muted mb-1.5',
  optional: 'font-normal text-ink-faint',
  hint: 'mt-1.5 text-[13px] leading-[18px] text-ink-muted',
  // 16px on phones so the browser does not zoom into the field
  field: `w-full h-12 sm:h-11 px-3.5 rounded-[16px] ${FIELD_BASE}`,
  textarea: `w-full px-3.5 py-3 rounded-[16px] ${FIELD_BASE}`,
  search: `w-full h-12 sm:h-11 pl-10 pr-3.5 rounded-[16px] ${FIELD_BASE}`,
  /** Native select. Add the left padding yourself: pl-3.5, or pl-10 when an icon sits inside. */
  select: `w-full h-12 sm:h-11 pr-8 rounded-[16px] cursor-pointer ${FIELD_BASE}`,
  iconBtn: 'w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
  /** The one main action of a screen: an ink pill with paper text. */
  primary: 'sag-btn-primary h-11 px-5 text-sm gap-2',
  outline: 'sag-btn-outline h-11 px-5 text-sm gap-2 disabled:opacity-50',
  /** Destructive or "say no" action: always with words, never colour alone. */
  danger: `h-11 px-5 rounded-full border border-danger-line bg-danger-tint text-sm text-danger hover:bg-sunken ${BTN_BASE} disabled:opacity-50`,
  /** Compact button: 44px tall on a phone, 36px in table rows on wide screens. */
  small: `h-11 md:h-9 px-3.5 rounded-full bg-sunken text-[13px] text-ink hover:bg-sunken-deep ${BTN_BASE} disabled:opacity-50`,
  /** Text link inside lists (order numbers, "View all"). */
  link: 'font-semibold text-brand underline underline-offset-[3px] hover:text-brand-dark cursor-pointer',
  chip: (on: boolean) => `sag-chip h-11 px-3.5 text-sm inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${on ? 'is-selected' : 'font-medium'}`,
  /** Status pill shell; add one of the `tone` fills. */
  badge: 'inline-flex items-center gap-1 min-h-[22px] px-2.5 py-0.5 rounded-full text-[11px] leading-[14px] font-semibold whitespace-nowrap',
  /** Small label above a value (stat tiles, detail lists): small muted capitals. */
  eyebrow: 'text-[11px] leading-4 font-bold uppercase tracking-[0.08em] text-ink-muted',
  /** Page title: Figtree 800, plain (the admin never uses the serif accent word). */
  h1: 'font-display text-[28px] leading-8 sm:text-[32px] sm:leading-9 text-ink',
  /** Same size as h1 for a title that is really an order number or product name: those stay in the text face. */
  h1Name: 'font-sans text-[22px] leading-7 sm:text-2xl sm:leading-8 font-extrabold tracking-[-0.02em] text-ink',
  h2: 'text-[18px] leading-6 font-extrabold tracking-[-0.015em] text-ink',
  /** Big number in a stat tile. */
  stat: 'text-[26px] leading-8 sm:text-[30px] sm:leading-9 font-extrabold tracking-[-0.02em] text-ink sag-num',
  /** Table header row. */
  thead: 'border-b border-line text-[11px] font-bold uppercase tracking-[0.08em] text-ink-muted',
  /** Honest empty state. */
  empty: 'sag-glass px-5 py-10 text-center',
  /** Error banner: use with role="alert". */
  alert: 'px-4 py-3 rounded-[16px] bg-danger-tint border border-danger-line text-sm font-medium text-danger',
};

/** Status pills: forest for good / current, sand for done or neutral, red (always with words) for problems. */
export const tone = {
  neutral: 'bg-sunken-deep text-ink',
  muted: 'bg-sunken text-ink-muted',
  ok: 'bg-ok-tint text-ok',
  warn: 'border border-danger-line bg-surface text-danger',
  danger: 'bg-danger-tint text-danger',
  brand: 'bg-brand-wash text-brand',
};

/** The dim layer behind a dialog. */
export const SCRIM = 'bg-[color:var(--sag-scrim)]';
/** Paper text for anything that sits on an ink fill (the constant's name is from an earlier look). */
export const ON_GOLD = 'text-[color:var(--sag-on-gold)]';
/** On / off switch drawn after a hidden `peer` checkbox. */
export const SWITCH_TRACK = "relative shrink-0 w-12 h-7 rounded-full bg-sunken-deep border border-line peer-checked:bg-brand peer-checked:border-transparent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand transition-colors after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:w-5 after:h-5 after:rounded-full after:bg-ink after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-[color:var(--sag-on-gold)]";

// ---------------------------------------------------------------- page shell (all admin catalogue / storefront pages)

interface AdminPageHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  id?: string;
}

/** The same page header everywhere: small section label, title, one line of help, and the page's main actions. */
export const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({ eyebrow, title, description, icon, actions, id }) => (
  <header id={id} className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-6">
    <div className="min-w-0 flex-1 flex items-start gap-3.5">
      {/* The icon is for wide screens; on a phone the title gets the full width */}
      {icon && (
        <span className="hidden sm:flex w-12 h-12 rounded-[16px] bg-surface text-brand items-center justify-center shrink-0 [&>svg]:w-5 [&>svg]:h-5" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className={ui.eyebrow}>{eyebrow}</p>
        <h2 className={`mt-1 ${ui.h1} break-words`}>{title}</h2>
        {description && <p className="mt-1.5 text-sm leading-5 text-ink-muted max-w-2xl">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end lg:shrink-0">{actions}</div>}
  </header>
);

/** Section heading inside a panel: small icon, title and an optional line of help. */
export const SectionTitle: React.FC<{ icon?: React.ReactNode; title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; id?: string }> = ({ icon, title, hint, action, id }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 mb-4 border-b border-line">
    <div className="flex items-start gap-3 min-w-0">
      {icon && <span className="w-9 h-9 rounded-full bg-sunken text-brand flex items-center justify-center shrink-0 [&>svg]:w-[18px] [&>svg]:h-[18px]" aria-hidden="true">{icon}</span>}
      <div className="min-w-0">
        <h3 id={id} className={ui.h2}>{title}</h3>
        {hint && <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{hint}</p>}
      </div>
    </div>
    {action}
  </div>
);

/** One key number of a page (real counts only). `tone` colours the number: forest for good (the value 'gold' is only a name), red for a real problem. */
export const StatTile: React.FC<{ label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'plain' | 'gold' | 'danger'; onClick?: () => void; active?: boolean }> = ({ label, value, note, tone: colour = 'plain', onClick, active }) => {
  const body = (
    <>
      <span className={`block ${ui.eyebrow} break-words`}>{label}</span>
      <span className={`block mt-1 ${ui.stat} ${colour === 'gold' ? '!text-ok' : colour === 'danger' ? '!text-danger' : ''}`}>{value}</span>
      {note && <span className="block mt-0.5 text-xs leading-4 text-ink-muted break-words">{note}</span>}
    </>
  );
  const shell = `min-w-0 text-left sag-glass px-3.5 py-3 sm:px-4 sm:py-3.5 ${active ? 'ring-2 ring-inset ring-brand' : ''}`;
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={Boolean(active)} className={`${shell} cursor-pointer`}>{body}</button>
    : <div className={shell}>{body}</div>;
};
/** The row of key numbers under a page title: two across on phones, up to four on wide screens. */
export const StatRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div role="group" aria-label={label} className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">{children}</div>
);
/** Honest empty state: what is missing and what to do next. */
export const EmptyState: React.FC<{ icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }> = ({ icon, title, children, action }) => (
  <div className="px-5 py-12 text-center">
    {icon && <span className="mx-auto mb-3 w-12 h-12 rounded-full bg-sunken text-ink-muted flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6" aria-hidden="true">{icon}</span>}
    <p className="text-base font-semibold text-ink">{title}</p>
    {children && <p className="mt-1 text-sm leading-5 text-ink-muted max-w-md mx-auto">{children}</p>}
    {action && <div className="mt-4 flex justify-center">{action}</div>}
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
            <label className="relative w-12 h-12 sm:w-11 sm:h-11 shrink-0 rounded-full border-[1.5px] border-control overflow-hidden cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand" title="Pick the colour">
              <input type="color" value={validHex(row.hex) ? row.hex : FALLBACK_HEX} onChange={(e) => update(row.key, { hex: e.target.value })}
                aria-label={`Colour ${i + 1} swatch`} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <span className="block w-full h-full" style={{ backgroundColor: validHex(row.hex) ? row.hex : FALLBACK_HEX }} />
            </label>
            <input id={i === 0 ? `${idPrefix}-colour` : undefined} value={row.name} maxLength={40} onChange={(e) => update(row.key, { name: e.target.value })}
              placeholder={i === 0 ? placeholder : 'Another colour'} aria-label={`Colour ${i + 1} name`} className={`${ui.field} min-w-0`} />
            {(rows.length > 1 || row.name.trim()) && (
              <button type="button" onClick={() => remove(row.key)} aria-label={`Remove colour ${i + 1}`} className={`${ui.iconBtn} hover:bg-danger-tint text-danger`}>
                <X className="w-4 h-4 text-current" />
              </button>
            )}
          </div>
        ))}
      </div>
      {showDetected && <p className={ui.hint}>Filled in from the first photo. Change it if it is not right.</p>}
      {suggestion && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[16px] bg-brand-wash border border-brand-line pl-3 pr-1 py-1">
          <span className="w-6 h-6 rounded-full ring-1 ring-control shrink-0" style={{ backgroundColor: suggestion.hex }} aria-hidden="true" />
          <span className="text-[13px] leading-[18px] text-ink min-w-0 flex-1">Colour in the new photo: <span className="font-semibold">{suggestion.name}</span></span>
          <button type="button" onClick={onUseSuggestion} className={ui.small}>Add</button>
          <button type="button" onClick={onDismissSuggestion} aria-label="Dismiss the suggested colour" className="w-11 h-11 rounded-full hover:bg-sunken-deep text-ink flex items-center justify-center cursor-pointer"><X className="w-4 h-4 text-current" /></button>
        </div>
      )}
      {rows.length < MAX_COLOURS && (
        <button type="button" onClick={() => onChange([...rows, colourRow()])} className="mt-1 h-11 px-1 text-sm font-semibold text-brand hover:text-brand-dark underline underline-offset-[3px] inline-flex items-center gap-1.5 cursor-pointer">
          <Plus className="w-4 h-4 text-current" /> Add another colour
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
            className="w-full aspect-[4/5] rounded-[16px] object-cover object-top bg-sunken" />
          <div className="mt-1 flex items-center justify-between gap-1">
            {i === 0
              ? <span className={`${ui.badge} ${tone.brand}`}>Cover</span>
              : <button type="button" onClick={() => onCover(url)} className="h-10 px-0.5 text-xs font-semibold text-brand underline underline-offset-[3px] cursor-pointer">Make cover</button>}
            <button type="button" onClick={() => onRemove(url)} aria-label={`Remove photo ${i + 1}`}
              className="w-10 h-10 shrink-0 rounded-full hover:bg-danger-tint text-danger flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4 text-current" />
            </button>
          </div>
        </div>
      ))}
      <label className={`w-full aspect-[4/5] rounded-[16px] border-[1.5px] border-dashed border-control bg-sunken flex flex-col items-center justify-center gap-1 px-1 text-center text-[13px] font-semibold text-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${uploading ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-sunken-deep'}`}>
        {uploading ? <Loader2 className="w-5 h-5 animate-spin text-brand" /> : <ImagePlus className="w-5 h-5 text-brand" />}
        {uploading ? 'Uploading…' : images.length ? 'Add more' : 'Add photos'}
        <input id={id} type="file" accept="image/*" multiple disabled={uploading} className="sr-only"
          onChange={(e) => { const files = Array.from(e.target.files || []) as File[]; e.target.value = ''; onFiles(files); }} />
      </label>
    </div>
    <p className={ui.hint}>{hint}</p>
  </div>
);

// ---------------------------------------------------------------- form pieces

/** How the price will read on the store, from the numbers typed (only when there is a real MRP above the price). */
export const PriceHint: React.FC<{ price: string; mrp: string }> = ({ price, mrp }) => {
  const f = priceFields(price, mrp);
  if (f.price <= 0 || !mrp.trim() || f.originalPrice <= f.price) return null;
  return (
    <p className={`${ui.hint} sag-num`}>
      Shown as <span className="font-semibold text-ink">{inr(f.price)}</span> <span className="line-through text-ink-faint">{inr(f.originalPrice)}</span> <span className="font-semibold text-sale">{f.discount}% off</span>
    </p>
  );
};

export const Toggle: React.FC<{ id: string; checked: boolean; onChange: (next: boolean) => void; label: string; hint: string }> = ({ id, checked, onChange, label, hint }) => (
  <div className={`flex items-center justify-between gap-3 min-h-[56px] rounded-[16px] border px-3.5 py-2.5 transition-colors ${checked ? 'bg-brand-wash border-brand-line' : 'bg-page border-transparent'}`}>
    <div className="min-w-0">
      <p id={`${id}-label`} className="text-sm leading-5 font-semibold text-ink">{label}</p>
      <p id={`${id}-hint`} className="text-[13px] leading-[18px] text-ink-muted">{hint}</p>
    </div>
    <button id={id} type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-12 h-7 rounded-full transition-colors cursor-pointer before:absolute before:-inset-2 before:content-[''] ${checked ? 'bg-brand' : 'bg-sunken-deep ring-1 ring-line'}`}>
      <span className={`absolute top-1 left-1 w-5 h-5 rounded-full transition-transform ${checked ? 'translate-x-5 bg-[color:var(--sag-on-gold)]' : 'bg-ink'}`} />
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
    <div className={`fixed inset-0 z-[80] ${SCRIM} flex items-end sm:items-center justify-center sm:p-4`}
      onMouseDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (pressedBackdrop.current && e.target === e.currentTarget) cancelRef.current(); pressedBackdrop.current = false; }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="animate-in slide-in-from-bottom-5 fade-in bg-surface w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[90dvh] rounded-t-[28px] sm:rounded-[28px] flex flex-col overflow-hidden focus:outline-none">
        <span className="sm:hidden mx-auto mt-2 w-9 h-1 rounded-full bg-sunken-deep shrink-0" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 pl-4 pr-2 sm:pl-6 sm:pr-3 py-2.5 border-b border-line">
          <div className="min-w-0 py-1">
            <p id={titleId} className="font-display text-[22px] leading-7 text-ink break-words">{title}</p>
            {subtitle && <p className="text-[13px] leading-[18px] text-ink-muted mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={() => cancelRef.current()} aria-label="Close" className="w-11 h-11 shrink-0 rounded-full hover:bg-sunken-deep text-ink flex items-center justify-center cursor-pointer"><X className="w-5 h-5 text-current" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4">{children}</div>
        <div className="flex items-center gap-3 px-4 sm:px-6 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-3 border-t border-line sm:justify-end">
          <button type="button" onClick={() => cancelRef.current()} disabled={saving || uploading} className={ui.outline}>Cancel</button>
          <button type="submit" form={formId} disabled={saving || uploading} className={`${ui.primary} flex-1 sm:flex-none`}>
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
    className="shrink-0 w-14 aspect-[4/5] rounded-[12px] object-cover object-top bg-sunken" />
);
export const Price: React.FC<{ p: Product }> = ({ p }) => (
  <>
    <span className="font-semibold text-ink sag-num">{inr(p.price)}</span>
    {mrpOf(p) > p.price && <span className="ml-1.5 line-through text-ink-faint sag-num">{inr(mrpOf(p))}</span>}
  </>
);
export const Status: React.FC<{ p: Product }> = ({ p }) => (
  <span className={`sag-num ${p.hidden ? 'text-ink-muted' : !isAvailable(p) ? 'text-danger font-semibold' : 'text-ink-muted'}`}>
    {p.hidden ? `Hidden · ${Math.max(0, Number(p.stockQuantity ?? 0))} in stock` : !isAvailable(p) ? 'Sold out' : `${Number(p.stockQuantity ?? 0)} in stock`}
  </span>
);
/** One honest count from the live catalogue. */
export const Stat: React.FC<{ label: string; value: React.ReactNode; note: string }> = ({ label, value, note }) => (
  <div className="min-w-0 sag-glass px-3.5 py-3 sm:px-4 sm:py-3.5">
    <dt className={`${ui.eyebrow} break-words`}>{label}</dt>
    <dd className={`mt-1 ${ui.stat}`}>{value}</dd>
    <dd className="mt-0.5 text-xs leading-4 text-ink-muted break-words">{note}</dd>
  </div>
);

export const FilterChips: React.FC<{ label: string; value: string; options: Array<{ value: string; label: string; count: number }>; onChange: (value: string) => void }> = ({ label, value, options, onChange }) => (
  <div role="group" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((o) => {
      const on = o.value === value;
      return (
        <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
          className={`${ui.chip(on)} whitespace-nowrap`}>
          {o.label}<span className={`sag-num font-normal ${on ? 'opacity-70' : 'text-ink-muted'}`}>{o.count}</span>
        </button>
      );
    })}
  </div>
);

export const PublishButton: React.FC<{ p: Product; busy: boolean; onToggle: () => void }> = ({ p, busy, onToggle }) => (
  <button type="button" onClick={onToggle} disabled={busy} aria-pressed={!p.hidden}
    title={p.hidden ? 'Hidden: tap to show it on the store' : 'Published: tap to hide it from the store'}
    className={`h-11 sm:h-9 px-3.5 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${p.hidden ? 'bg-sunken border-line text-ink-muted' : 'bg-ok-tint border-ok-line text-ok'}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${p.hidden ? 'bg-ink-faint' : 'bg-ok'}`} aria-hidden="true" />
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
    <div className="sag-glass px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div className="min-w-0 flex-1 basis-60">
        <p className={ui.eyebrow}>Store categories</p>
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {names.map((name) => {
            const cat = cats.find(name);
            return (
              <li key={name} className={`min-h-9 pl-3 pr-1 py-1 rounded-[18px] text-[13px] leading-[18px] inline-flex flex-wrap items-center gap-1.5 ${cat ? 'bg-ok-tint text-ok' : 'bg-sunken text-ink'}`}>
                {cats.loading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin text-current" aria-hidden="true" /> {name}: checking…</>
                ) : cat ? (
                  <span className="pr-1.5 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-current" aria-hidden="true" /> <span className="font-semibold">{name}</span>{!cat.isActive ? ' · switched off' : !cat.image ? ' · no photo yet' : ' · has a photo'}</span>
                ) : (
                  <>
                    <span><span className="font-semibold">{name}</span> · not in Categories yet</span>
                    <button type="button" onClick={() => add(name)} disabled={adding !== null}
                      className="h-9 px-3 rounded-full bg-surface border border-control text-xs font-semibold text-ink hover:bg-sunken inline-flex items-center gap-1 cursor-pointer disabled:opacity-60">
                      {adding === name ? <Loader2 className="w-3 h-3 animate-spin text-current" /> : <FolderPlus className="w-3 h-3 text-current" />} Add now
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-xs leading-4 text-ink-muted">Added automatically when you save an item. Without a category photo, the store uses the first product photo.</p>
      </div>
      <button type="button" onClick={onOpenCategories} className={ui.small}>
        Open Categories
      </button>
    </div>
  );
};
