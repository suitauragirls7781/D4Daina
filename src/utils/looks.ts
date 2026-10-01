import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CartItem, ComboOfferConfig, Product, ProductColor, ProductSize } from '../types';
import { isAvailable } from './smartQuery';
import { fromCatalogOrLive } from '../lib/catalog';

/** Admin-picked accessories (storefront_settings/lookRelations): combo / set product id -> accessory ids. */
export type LookRelations = Record<string, string[]>;

// Must match sanitizeLookRelations in api/admin-config.js.
export const MAX_LOOK_ITEMS = 12;
export const MAX_LOOKS = 500;
// Must match MAX_LINES in api/_lib/orders.js.
export const MAX_BAG_LINES = 20;

const ID = /^[A-Za-z0-9_-]{1,60}$/;
/** Product ids the server accepts in a look (every id the store generates qualifies). */
export const isLookId = (id: string) => ID.test(id);

/** Same shape rules as the server sanitiser, so the storefront never trusts a malformed document. */
export const normaliseLookRelations = (raw: unknown): LookRelations => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: LookRelations = {};
  Object.entries(raw as Record<string, unknown>).forEach(([key, ids]) => {
    if (!ID.test(key) || !Array.isArray(ids)) return;
    const clean = [...new Set(ids.map(String).filter((id) => ID.test(id) && id !== key))].slice(0, MAX_LOOK_ITEMS);
    if (clean.length) out[key] = clean;
  });
  return out;
};

// null until the first answer from Firestore, so a page never flashes every accessory before the admin's picks arrive.
let cache: LookRelations | null = null;
const listeners = new Set<(r: LookRelations) => void>();
let started = false;
const start = () => {
  if (started) return;
  started = true;
  const publish = (value: LookRelations) => { cache = value; listeners.forEach((fn) => fn(value)); };
  fromCatalogOrLive(
    (catalog) => publish(normaliseLookRelations(catalog.settings.lookRelations || {})),
    () => onSnapshot(doc(db, 'storefront_settings', 'lookRelations'), (snap) => {
      let value: LookRelations = {};
      try { value = normaliseLookRelations(snap.exists() ? JSON.parse(snap.data().value_json || '{}') : {}); } catch {}
      publish(value);
    }, () => publish(cache || {})),
  );
};

/**
 * Live "Complete the Look" picks (one shared listener for the whole app); null until they have loaded.
 * With `enabled` false (a product that is not a set) the listener is not started, so plain product pages cost no read.
 */
export const useLookRelations = (enabled = true): LookRelations | null => {
  const [value, setValue] = useState<LookRelations | null>(cache);
  useEffect(() => {
    if (!enabled) return;
    start();
    listeners.add(setValue);
    setValue(cache);
    return () => { listeners.delete(setValue); };
  }, [enabled]);
  return value;
};

/** Accessory kinds the admin can add in one tap ("Other" lets the admin type their own word). */
export const ACCESSORY_TYPES = ['Bag', 'Heels', 'Jewellery', 'Earrings', 'Watch'] as const;
/** Set / combo types offered in the product form (the admin can also type their own). */
export const SET_TYPES = ['Full combo', '2 piece', '3 piece', '4 piece', '5 piece', '6 piece'] as const;
/** Category every accessory is saved under (never shown as a store category). */
export const ACCESSORY_CATEGORY = 'Accessories';
/** Most accessories are sold as one size; the server checks the size against product.sizes. */
export const ACCESSORY_SIZE: ProductSize = 'Free Size';
/** UK shoe sizes for heels and other footwear accessories (the admin ticks the ones they have). */
export const FOOTWEAR_SIZES: ProductSize[] = ['UK 3', 'UK 4', 'UK 5', 'UK 6', 'UK 7', 'UK 8'];
/** Accessory kinds that start with shoe sizes in the admin form (any accessory can use either). */
export const SIZED_ACCESSORY_TYPES: readonly string[] = ['Heels'];
/** Most accessories one product page shows when the admin has not picked any. */
export const MAX_SHOWN_ACCESSORIES = 24;

/** Accessories are sold only inside "Complete the look" and never listed anywhere else on the store. */
export const isAccessory = (p?: Pick<Product, 'productType'> | null) => p?.productType === 'accessory';
/** The product's set / combo type ('' when it is not a set). Accessories are never sets. */
export const setTypeOf = (p: Product) => (isAccessory(p) ? '' : String(p.setType || '').trim());
/** Bag, Heels, Jewellery, Earrings, Watch or the admin's own word ('Other' when empty). */
export const accessoryTypeOf = (p: Product) => String(p.accessoryType || '').trim() || 'Other';

const typeRank = (p: Product) => {
  const index = (ACCESSORY_TYPES as readonly string[]).indexOf(accessoryTypeOf(p));
  return index === -1 ? ACCESSORY_TYPES.length : index;
};
/** Accessories grouped by type (Bag, Heels, Jewellery, Earrings, Watch, then the rest), keeping their order within a type. */
export const byAccessoryType = (list: Product[]) =>
  list.map((p, i) => ({ p, i })).sort((a, b) => typeRank(a.p) - typeRank(b.p) || a.i - b.i).map(({ p }) => p);

/**
 * What "Complete the look" offers on a product: nothing unless it is a combo / set. Otherwise the
 * accessories the admin picked for it (`chosen` is true), or every accessory when none of its picks is
 * published (none picked, or all of them hidden / deleted). Only published, in-stock accessories are
 * offered, grouped by type. Never invented.
 */
export const lookFor = (product: Product, relations: LookRelations, accessories: Product[]): { items: Product[]; chosen: boolean } => {
  if (!setTypeOf(product)) return { items: [], chosen: false };
  const published = accessories.filter((a) => isAccessory(a) && !a.hidden && String(a.id) !== String(product.id));
  const byId = new Map(published.map((a) => [String(a.id), a]));
  const picked = (relations[String(product.id)] || []).map((id) => byId.get(id)).filter((a): a is Product => Boolean(a));
  const chosen = picked.length > 0;
  return { items: byAccessoryType(chosen ? picked : published).filter(isAvailable).slice(0, MAX_SHOWN_ACCESSORIES), chosen };
};
export const accessoriesFor = (product: Product, relations: LookRelations, accessories: Product[]) =>
  lookFor(product, relations, accessories).items;

/**
 * Admin hint only (never saved automatically): whether a product name reads like a set
 * ("combo", "set", "3 piece", "3pc"...) and the set type it most likely is, when the name says so.
 */
export const setTypeHint = (name: string): { looksLikeSet: boolean; suggestion: string } => {
  const n = String(name || '').toLowerCase();
  const pieces = n.match(/\b([2-6])\s*-?\s*(?:pcs?|pieces?)\b/);
  if (pieces) return { looksLikeSet: true, suggestion: `${pieces[1]} piece` };
  if (/\bcombo\b/.test(n)) return { looksLikeSet: true, suggestion: 'Full combo' };
  return { looksLikeSet: /\b(set|sets|co-ord|coord)\b/.test(n), suggestion: '' };
};

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Sizes the shopper can choose from. A product with no sizes is sold as "Free Size" (as on the product page). */
export const sizesOf = (p: Product) => (p.sizes || []).map(String).filter(Boolean) as ProductSize[];
export const needsSizeChoice = (p: Product) => sizesOf(p).length > 1;
export const defaultSizeFor = (p: Product): ProductSize | '' => {
  const sizes = sizesOf(p);
  if (sizes.length === 1) return sizes[0];
  return sizes.length === 0 ? ('Free Size' as ProductSize) : '';
};
/** The chosen size if this product still offers it (sizes can change while a look is open), else the default. */
export const usableSize = (p: Product, size: string): string => {
  const sizes = sizesOf(p);
  if (sizes.length === 0) return 'Free Size';
  return sizes.includes(size as ProductSize) ? size : defaultSizeFor(p);
};

/** Colours worth choosing between (placeholder "Default"/"Standard" entries are ignored). */
export const coloursOf = (p: Product): ProductColor[] =>
  (p.colors || []).filter((c) => c && c.name && !['Default', 'Standard'].includes(c.name));
export const colourByName = (p: Product, name: string): ProductColor | undefined =>
  (p.colors || []).find((c) => c && c.name === name) || (p.colors || []).find((c) => c && c.name);

/** Bag line id, built exactly like addToCart in ShopContext. */
export const bagLineId = (p: Product, size: string, color?: ProductColor) => {
  const c = color || (p.colors || []).find((x) => x && x.name) || { name: 'Standard', hex: '' };
  return `${p.id}-${size}-${c.name.replace(/\s+/g, '-').toLowerCase()}`;
};

/** Bag line id of an accessory added with its outfit: one line per accessory, size, colour and outfit. */
export const lookLineId = (p: Product, size: string, color: ProductColor | undefined, parentId: string) =>
  `${bagLineId(p, size, color)}-look-${parentId}`;

/** Pieces of an outfit in the bag (all its sizes and colours). */
export const outfitQtyIn = (cart: CartItem[], parentId: string) =>
  cart.reduce((sum, item) => sum + (!isAccessory(item.product) && String(item.product?.id) === String(parentId) ? item.quantity : 0), 0);

/**
 * Accessories are sold only with their outfit: an accessory line whose outfit is no longer in the bag is
 * removed, and there are never more of an accessory than pieces of its outfit (its sizes added together).
 * Same rule as checkLookAccessories in api/_lib/orders.js. Returns the same array when nothing changes.
 */
export const enforceLooks = (cart: CartItem[]): { cart: CartItem[]; removed: string[] } => {
  const outfit = new Map<string, number>();
  cart.forEach((item) => {
    if (!isAccessory(item.product)) outfit.set(String(item.product?.id), (outfit.get(String(item.product?.id)) || 0) + item.quantity);
  });
  const used = new Map<string, number>();
  const removed: string[] = [];
  let changed = false;
  const next = cart.flatMap((item) => {
    if (!isAccessory(item.product)) return [item];
    const parentId = String(item.lookParentId || '');
    const key = `${parentId}|${item.product?.id}`;
    const allowed = (outfit.get(parentId) || 0) - (used.get(key) || 0);
    if (!parentId || allowed <= 0) {
      changed = true;
      removed.push(item.product?.name || 'An accessory');
      return [];
    }
    const quantity = Math.min(item.quantity, allowed);
    used.set(key, (used.get(key) || 0) + quantity);
    if (quantity !== item.quantity) {
      changed = true;
      return [{ ...item, quantity }];
    }
    return [item];
  });
  return { cart: changed ? next : cart, removed };
};

/** True when this exact size and colour is already a line in the bag (adding it again only raises its quantity). */
export const lineInBag = (cart: CartItem[], p: Product, size: string, color?: ProductColor) =>
  Boolean(size) && cart.some((item) => item.id === bagLineId(p, size, color));

/** Pieces of this product already in the bag (all sizes). */
export const bagQtyFor = (cart: CartItem[], productId: string) =>
  cart.reduce((sum, item) => sum + (String(item.product?.id) === String(productId) ? item.quantity : 0), 0);

/**
 * Most pieces of one bag line the shopper can still add: never more than the stock left after what is
 * already in the bag, nor more than the per-line limit (what addToCart and the server allow).
 */
export const lineCapFor = (p: Product, cart: CartItem[], maxPerLine: number, lineId?: string) => {
  const stock = Math.max(0, Number(p.stockQuantity ?? 0));
  const sameLine = lineId ? cart.find((item) => item.id === lineId)?.quantity || 0 : 0;
  return Math.max(0, Math.min(maxPerLine - sameLine, stock - bagQtyFor(cart, String(p.id))));
};

/**
 * Bag pieces that count towards the multi-buy combo offer: outfits only. Accessories never count, so one
 * outfit plus an accessory does not unlock it. Must match priceCart in api/_lib/orders.js.
 */
export const comboPiecesIn = (cart: CartItem[]) =>
  cart.reduce((sum, item) => sum + (isAccessory(item.product) ? 0 : item.quantity), 0);

/**
 * Estimated multi-buy saving. Same rule as the bag (ShopContext) and the server (api/_lib/orders.js):
 * the percentage of the whole subtotal, once the outfit pieces (see comboPiecesIn) reach the minimum.
 */
export const comboSaving = (offer: ComboOfferConfig | null, subtotal: number, outfitPieces: number) =>
  offer && offer.enabled && outfitPieces >= offer.minItems ? Math.round((subtotal * offer.percent) / 100) : 0;
