import { Product, ProductSize } from '../types';

/**
 * Kids & Toys: two sections of their own next to the women's catalogue.
 * - Kids wear: category "Baby Girls" or "Baby Boys", productType 'kids', sizes by age ("1-2 Y" ... "14-15 Y").
 * - Toys: category "Toys", productType 'toy', one size, a toy type (Cars, Bikes...) and a suitable age.
 * They are normal products (bag, checkout, stock and the server's re-pricing work unchanged); the admin adds
 * them from their own pages (Admin → Kids Wear / Toys), never from the women's product form.
 */
export type Department = 'women' | 'kids' | 'toys';

export const BABY_GIRLS = 'Baby Girls';
export const BABY_BOYS = 'Baby Boys';
export const TOYS = 'Toys';
/** Kids wear is always one of these two categories. */
export const KIDS_CATEGORIES = [BABY_GIRLS, BABY_BOYS] as const;
/** Shop page / URL name that shows all kids wear (girls and boys together). */
export const KIDS_ALL = 'Kids';
/** The Kids & Toys page (/category/kids-toys): every kids style and toy, kept apart from the women's shop. */
export const KIDS_TOYS = 'Kids & Toys';
/** Listings that belong to the Kids & Toys page; every other listing shows women's styles only. */
export const KIDS_TOYS_LISTINGS: readonly string[] = [KIDS_TOYS, KIDS_ALL, BABY_GIRLS, BABY_BOYS, TOYS];
export const isKidsToysListing = (category?: string | null) => KIDS_TOYS_LISTINGS.includes(String(category || ''));

/** Age sizes for kids wear, youngest first (the admin ticks the ones in stock). */
export const KIDS_SIZES: ProductSize[] = [
  '1-2 Y', '2-3 Y', '3-4 Y', '4-5 Y', '5-6 Y', '6-7 Y', '7-8 Y',
  '8-9 Y', '9-10 Y', '10-11 Y', '11-12 Y', '12-13 Y', '13-14 Y', '14-15 Y',
];
/** The two-year steps (1-2, 3-4, 5-6 ...) the admin can tick in one go. */
export const KIDS_SIZE_PAIRS: ProductSize[] = ['1-2 Y', '3-4 Y', '5-6 Y', '7-8 Y', '9-10 Y', '11-12 Y', '13-14 Y', '14-15 Y'];

/** Kinds of kids wear (the admin can also type their own). */
export const KIDS_TYPES = ['Frocks & Dresses', 'Ethnic Wear', 'Tops & T-shirts', 'Shirts', 'Bottoms', 'Co-ord Sets', 'Party Wear', 'Nightwear', 'Winter Wear'] as const;
/** Kinds of toys (the admin can also type their own). */
export const TOY_TYPES = ['Cars', 'Bikes', 'Dolls', 'Soft Toys', 'Puzzles & Games', 'Educational', 'Remote Control', 'Outdoor', 'Musical'] as const;
/** Suitable ages for toys. */
export const TOY_AGES = ['0+ years', '1+ years', '2+ years', '3+ years', '5+ years', '8+ years', '12+ years'] as const;
/** Toys are sold as one piece (the server checks the size against product.sizes). */
export const TOY_SIZE: ProductSize = 'Free Size';

export const isKids = (p?: Pick<Product, 'productType' | 'category'> | null) =>
  p?.productType === 'kids' || (KIDS_CATEGORIES as readonly string[]).includes(String(p?.category || ''));
export const isToy = (p?: Pick<Product, 'productType' | 'category'> | null) =>
  p?.productType === 'toy' || String(p?.category || '') === TOYS;
export const departmentOf = (p?: Pick<Product, 'productType' | 'category'> | null): Department =>
  (isToy(p) ? 'toys' : isKids(p) ? 'kids' : 'women');

/** "Frocks & Dresses", "Cars"... (the product's subcategory). */
export const kindOf = (p: Product) => String(p.subcategory || '').trim();

const ageStart = (size: string) => Number(String(size).split('-')[0]) || 0;
/** Kids age sizes in age order, other sizes after them. */
export const sortKidsSizes = (sizes: string[]) =>
  [...sizes].sort((a, b) => {
    const ka = KIDS_SIZES.includes(a as ProductSize), kb = KIDS_SIZES.includes(b as ProductSize);
    if (ka && kb) return ageStart(a) - ageStart(b);
    return ka ? -1 : kb ? 1 : 0;
  });

/** Kids sizes that fit a child of this age ("5 years" → 4-5 Y and 5-6 Y). */
export const kidsSizesForAge = (age: number) =>
  KIDS_SIZES.filter((size) => {
    const [from, to] = String(size).replace(' Y', '').split('-').map(Number);
    return age >= from && age <= to;
  });
