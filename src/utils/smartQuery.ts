import { Product } from '../types';
import { fuzzyMatchProduct } from './fuzzySearch';
import { WOMEN_CATEGORY_INFO, WOMEN_CATEGORY_NAMES } from '../data/womenCategories';

/**
 * Understands shopping requests like "pink suit under ₹999", "wedding ke liye heavy suit",
 * "4XL blue suit" or "black party suits under 1200 in XL" and turns them into filters that
 * are applied to the real catalogue. Nothing is invented: products either match or they don't.
 */

export const COLOUR_FAMILIES: Record<string, string[]> = {
  Pink: ['pink', 'rose', 'blush', 'magenta', 'fuchsia', 'peach', 'rani', 'gulabi'],
  Red: ['red', 'crimson', 'maroon', 'wine', 'burgundy', 'cherry', 'laal', 'lal'],
  Blue: ['blue', 'navy', 'azure', 'sky', 'royal blue', 'teal', 'turquoise', 'aqua', 'neela'],
  Green: ['green', 'olive', 'mint', 'emerald', 'sage', 'bottle green', 'hara', 'pista'],
  Yellow: ['yellow', 'mustard', 'lemon', 'haldi', 'peela'],
  Orange: ['orange', 'rust', 'coral', 'saffron', 'kesari'],
  Purple: ['purple', 'lavender', 'violet', 'lilac', 'plum', 'mauve', 'jamuni'],
  White: ['white', 'ivory', 'cream', 'off white', 'off-white', 'pearl', 'safed'],
  Black: ['black', 'kala', 'kaala'],
  Grey: ['grey', 'gray', 'silver', 'charcoal'],
  Beige: ['beige', 'nude', 'tan', 'camel', 'khaki', 'brown', 'coffee'],
  Gold: ['gold', 'golden'],
};

export const OCCASIONS: Record<string, string[]> = {
  Wedding: ['wedding', 'shaadi', 'shadi', 'bridal', 'reception', 'heavy', 'bride'],
  Mehndi: ['mehndi', 'mehendi', 'henna'],
  Haldi: ['haldi'],
  Festive: ['festive', 'festival', 'diwali', 'eid', 'tyohar', 'navratri', 'puja', 'pooja', 'karwa'],
  Party: ['party', 'sangeet', 'cocktail', 'evening', 'night'],
  Office: ['office', 'work', 'formal', 'workwear'],
  Daily: ['daily', 'casual', 'everyday', 'regular', 'roz', 'comfortable'],
};

// What a shopper types for each category, and the words then looked for in a style: from the one list of
// categories (src/data/womenCategories.ts). Phrases ("kurta set", "night suit", "dress material") are read
// before single words, and before colours and occasions, so "night suit" is nightwear and not a party suit.
const escapeRe = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRule = (asks: string[], find: string[]): [RegExp, string[]] | null =>
  (asks.length ? [new RegExp(`\\b(${[...asks].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})\\b`), find] : null);
const rulesFor = (phrases: boolean) => WOMEN_CATEGORY_NAMES
  .map((name) => wordRule(WOMEN_CATEGORY_INFO[name].ask.filter((ask) => /[ -]/.test(ask) === phrases), WOMEN_CATEGORY_INFO[name].find))
  .filter((rule): rule is [RegExp, string[]] => Boolean(rule));
const CATEGORY_PHRASES = rulesFor(true);
const CATEGORY_WORDS = rulesFor(false);

const SIZE_ALIASES: Record<string, string> = { '2xl': 'XXL', xxl: 'XXL', '3xl': '3XL', xxxl: '3XL', '4xl': '4XL', '5xl': '5XL', xl: 'XL', xs: 'XS' };
const NUMBER_WORDS: Record<string, number> = { 'one thousand': 1000, thousand: 1000, 'ek hazar': 1000, hazar: 1000, hazaar: 1000, 'two thousand': 2000, 'do hazar': 2000, 'five hundred': 500, 'paanch sau': 500 };

export interface SmartQuery {
  colours: string[];
  occasions: string[];
  categoryWords: string[][];
  sizes: string[];
  maxPrice: number | null;
  minPrice: number | null;
  inStockOnly: boolean;
  text: string; // words left for normal text search
  understood: string[]; // human readable chips
}

const STOP = new Set(['show', 'me', 'find', 'want', 'need', 'looking', 'for', 'a', 'an', 'the', 'in', 'of', 'with', 'and', 'or', 'some', 'something', 'please', 'dikhao', 'dikha', 'do', 'chahiye', 'ke', 'ki', 'ka', 'liye', 'wala', 'wali', 'wale', 'mujhe', 'koi', 'size', 'colour', 'color', 'rang', 'under', 'below', 'less', 'than', 'upto', 'up', 'to', 'within', 'kam', 'se', 'rs', 'inr', 'rupees', 'price', 'budget', 'cheap', 'sasta', 'available', 'stock', 'wear', 'outfit', 'outfits', 'dress-up', 'style', 'styles', 'look', 'similar', 'this', 'product', 'like']);

export const parseSmartQuery = (raw: string): SmartQuery => {
  let q = ` ${String(raw || '').toLowerCase().replace(/[₹,]/g, ' ').replace(/\s+/g, ' ')} `;
  Object.entries(NUMBER_WORDS).forEach(([w, n]) => { q = q.replace(new RegExp(`\\b${w}\\b`, 'g'), String(n)); });
  const out: SmartQuery = { colours: [], occasions: [], categoryWords: [], sizes: [], maxPrice: null, minPrice: null, inStockOnly: false, text: '', understood: [] };
  const consume = (re: RegExp) => { q = q.replace(re, ' '); };

  // Price
  const between = q.match(/(\d{3,6})\s*(?:-|to|se)\s*(\d{3,6})/);
  if (between) {
    out.minPrice = Math.min(+between[1], +between[2]);
    out.maxPrice = Math.max(+between[1], +between[2]);
    consume(/(\d{3,6})\s*(?:-|to|se)\s*(\d{3,6})/);
  } else {
    const under = q.match(/(?:under|below|less than|upto|up to|within|max|budget)\s*(\d{3,6})|(\d{3,6})\s*(?:se kam|tak|ke andar|or less|max)/);
    if (under) { out.maxPrice = +(under[1] || under[2]); consume(/(?:under|below|less than|upto|up to|within|max|budget)\s*\d{3,6}|\d{3,6}\s*(?:se kam|tak|ke andar|or less|max)/); }
    const above = q.match(/(?:above|over|more than|min)\s*(\d{3,6})|(\d{3,6})\s*(?:se upar|se zyada|plus)/);
    if (above) { out.minPrice = +(above[1] || above[2]); consume(/(?:above|over|more than|min)\s*\d{3,6}|\d{3,6}\s*(?:se upar|se zyada|plus)/); }
    if (!under && !above) {
      const bare = q.match(/\b(\d{3,5})\b/);
      if (bare && !/\b\d{3,5}\s*(xl|cm|inch)/.test(q)) { out.maxPrice = +bare[1]; consume(/\b\d{3,5}\b/); }
    }
  }
  if (out.maxPrice !== null) out.understood.push(out.minPrice ? `₹${out.minPrice}–₹${out.maxPrice}` : `Under ₹${out.maxPrice}`);
  else if (out.minPrice !== null) out.understood.push(`Above ₹${out.minPrice}`);

  const readCategories = (rules: Array<[RegExp, string[]]>, labels: string[]) => rules.forEach(([re, words]) => {
    const g = new RegExp(re.source, 'g');
    const m = q.match(g);
    if (m) { out.categoryWords.push(words); labels.push(m[0].replace(/s$/, '').replace(/^\w/, (c) => c.toUpperCase())); consume(g); }
  });
  // Product type, the phrases (their labels are shown with the single words, further down)
  const phraseLabels: string[] = [];
  readCategories(CATEGORY_PHRASES, phraseLabels);

  // Sizes (only unambiguous tokens, plus "size m"/"m size")
  q = q.replace(/\b(xxxl|xxl|xl|xs|[2-5]xl)\b/g, (m) => { const s = SIZE_ALIASES[m]; if (s && !out.sizes.includes(s)) out.sizes.push(s); return ' '; });
  q = q.replace(/\bsize\s+(s|m|l)\b|\b(s|m|l)\s+size\b/g, (_m, a, b) => { const s = String(a || b).toUpperCase(); if (!out.sizes.includes(s)) out.sizes.push(s); return ' '; });
  q = q.replace(/\bfree size\b/g, () => { out.sizes.push('Free Size'); return ' '; });
  out.sizes.filter((s) => !/ Y$/.test(s)).forEach((s) => out.understood.push(`Size ${s}`));

  // Colours
  Object.entries(COLOUR_FAMILIES).forEach(([family, words]) => {
    words.forEach((w) => {
      const re = new RegExp(`\\b${w}\\b`, 'g');
      if (re.test(q)) { if (!out.colours.includes(family)) out.colours.push(family); consume(re); }
    });
  });
  out.colours.forEach((c) => out.understood.push(c));

  // Occasions
  Object.entries(OCCASIONS).forEach(([name, words]) => {
    words.forEach((w) => {
      const re = new RegExp(`\\b${w}\\b`, 'g');
      if (re.test(q)) { if (!out.occasions.includes(name)) out.occasions.push(name); consume(re); }
    });
  });
  out.occasions.forEach((o) => out.understood.push(o === 'Daily' ? 'Daily wear' : o === 'Office' ? 'Office wear' : o));

  // Product type
  out.understood.push(...phraseLabels);
  readCategories(CATEGORY_WORDS, out.understood);

  if (/\b(in stock|available|ready)\b/.test(q)) { out.inStockOnly = true; out.understood.push('In stock'); consume(/\b(in stock|available|ready)\b/g); }

  out.text = q.split(' ').filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w)).join(' ').trim();
  return out;
};

export const hasStructure = (sq: SmartQuery) =>
  sq.colours.length + sq.occasions.length + sq.categoryWords.length + sq.sizes.length > 0 || sq.maxPrice !== null || sq.minPrice !== null || sq.inStockOnly;

const productText = (p: Product) => [p.name, p.category, p.subcategory, p.description, p.fabric, p.fit, p.occasion, ...(p.tags || []), ...(p.colors || []).map((c) => c.name)].join(' ').toLowerCase();
const colourText = (p: Product) => [(p.colors || []).map((c) => c.name).join(' '), p.name, (p.tags || []).join(' ')].join(' ').toLowerCase();

export const productColourFamilies = (p: Product) => {
  const text = colourText(p);
  return Object.entries(COLOUR_FAMILIES).filter(([, words]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(text))).map(([f]) => f);
};

export const productOccasions = (p: Product) => {
  const text = [p.occasion, (p.tags || []).join(' '), p.name, p.description].join(' ').toLowerCase();
  const found = Object.entries(OCCASIONS).filter(([, words]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(text))).map(([o]) => o);
  if (p.isFestive && !found.includes('Festive')) found.push('Festive');
  return found;
};

export const isAvailable = (p: Product) => p.inStock !== false && Number(p.stockQuantity ?? 0) > 0;

/** True when the product satisfies every part of the request that was understood. */
export const matchesSmartQuery = (p: Product, sq: SmartQuery) => {
  if (sq.inStockOnly && !isAvailable(p)) return false;
  if (sq.maxPrice !== null && p.price > sq.maxPrice) return false;
  if (sq.minPrice !== null && p.price < sq.minPrice) return false;
  if (sq.sizes.length && !sq.sizes.some((s) => (p.sizes || []).map(String).includes(s))) return false;
  if (sq.colours.length) {
    const fam = productColourFamilies(p);
    if (!sq.colours.some((c) => fam.includes(c))) return false;
  }
  if (sq.occasions.length) {
    const occ = productOccasions(p);
    if (!sq.occasions.some((o) => occ.includes(o))) return false;
  }
  if (sq.categoryWords.length) {
    const text = productText(p);
    if (!sq.categoryWords.every((words) => words.some((w) => text.includes(w)))) return false;
  }
  if (sq.text && !fuzzyMatchProduct(p, sq.text)) return false;
  return true;
};

/**
 * The search test the listing page applies to ?q= (ShopPage): an understood request
 * ("red lehenga under 1500") uses the smart filters, anything else the fuzzy text match.
 * The header suggestions use it too, so both show the same styles for the same words.
 */
export const searchQueryMatcher = (raw: string): ((p: Product) => boolean) => {
  if (!raw.trim()) return () => true;
  const sq = parseSmartQuery(raw);
  return hasStructure(sq) ? (p) => matchesSmartQuery(p, sq) : (p) => fuzzyMatchProduct(p, raw);
};

/**
 * Best real matches for a request. When nothing matches exactly, the closest alternatives are
 * returned with `exact: false` (the price/size limits are kept; colour/occasion/type are relaxed).
 */
export const smartSearch = (products: Product[], raw: string, limit = 8) => {
  const sq = parseSmartQuery(raw);
  const pool = products.filter((p) => !p.hidden);
  const exact = pool.filter((p) => matchesSmartQuery(p, sq));
  const rank = (list: Product[]) => [...list].sort((a, b) => Number(isAvailable(b)) - Number(isAvailable(a)) || a.price - b.price);
  if (exact.length) return { sq, exact: true, products: rank(exact).slice(0, limit) };
  const relaxed = pool.filter((p) => matchesSmartQuery(p, { ...sq, colours: [], occasions: [], categoryWords: [], text: '' }) && isAvailable(p));
  const score = (p: Product) =>
    (sq.colours.some((c) => productColourFamilies(p).includes(c)) ? 2 : 0)
    + (sq.occasions.some((o) => productOccasions(p).includes(o)) ? 2 : 0)
    + (sq.categoryWords.some((ws) => ws.some((w) => productText(p).includes(w))) ? 1 : 0);
  return { sq, exact: false, products: [...relaxed].sort((a, b) => score(b) - score(a) || a.price - b.price).slice(0, limit) };
};
