import { firestore } from './_lib/firebaseAdmin.js';
import { isRemovedSection } from './_lib/removedSections.js';

const SITE = 'https://www.suitauragirls.in';
const STATIC_PATHS = ['/about', '/contact', '/size-guide', '/shipping-policy', '/return-policy', '/privacy-policy', '/terms-policy', '/cancellation-policy'];

// Identical to categoryToSlug in src/utils/slugHelper.ts, so every URL matches the app's /category/<slug> route.
const categoryToSlug = (category) => {
  if (!category || category === 'All') return 'all';
  return String(category)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
};
const escapeXml = (value) => String(value).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// The storefront lists a product only when it is not hidden, is not an accessory (accessories are sold only
// inside "Complete the look") and has at least one real photo (same rules as src/context/ShopContext.tsx and
// mapProductFromDb + hasRealProductImage in src/context/ProductContext.tsx).
const isRealImage = (url) => typeof url === 'string' && url.trim() !== '' && !url.startsWith('data:image/svg+xml') && !url.includes('placeholder.com');
const productImages = (p) => {
  let images = Array.isArray(p.images) ? p.images : [];
  if (images.length === 0) images = (Array.isArray(p.colors) ? p.colors : []).map((c) => (c && typeof c.imageUrl === 'string' ? c.imageUrl.trim() : '')).filter(Boolean);
  if (images.length === 0 && typeof p.image === 'string' && p.image.trim()) images = [p.image.trim()];
  return images;
};
const isVisible = (p) => !p.hidden && p.productType !== 'accessory' && !isRemovedSection(p) && productImages(p).some(isRealImage);

/** YYYY-MM-DD from an ISO string, epoch millis or Firestore timestamp; '' when unknown. Never in the future. */
const toDay = (value) => {
  if (!value) return '';
  let date = null;
  if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (typeof value.toDate === 'function') date = value.toDate();
  else if (typeof value.seconds === 'number') date = new Date(value.seconds * 1000);
  else if (typeof value._seconds === 'number') date = new Date(value._seconds * 1000);
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Date(Math.min(date.getTime(), Date.now())).toISOString().slice(0, 10);
};
const lastChanged = (p) => [toDay(p.updatedAt), toDay(p.createdAt)].filter(Boolean).sort().pop() || '';
const newest = (days) => days.filter(Boolean).sort().pop() || '';

/** XML sitemap built from the live catalogue: listing pages, category pages and visible products. */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).setHeader('Content-Type', 'text/plain').end('Method not allowed');
    return;
  }
  try {
    const snapshot = await firestore().collection('products')
      .select('hidden', 'productType', 'images', 'colors', 'image', 'category', 'updatedAt', 'createdAt')
      .get();
    // The document id is the product id the app uses in /product/<id>.
    const products = snapshot.docs.map((d) => ({ ...d.data(), id: d.id })).filter(isVisible);

    // Categories with at least one visible product; lastmod = the latest change among them.
    const categories = new Map();
    for (const p of products) {
      // Products saved without a category are shown under "Suits" in the store.
      const slug = categoryToSlug(p.category || 'Suits');
      if (!slug || slug === 'all') continue;
      categories.set(slug, newest([categories.get(slug) || '', lastChanged(p)]));
    }
    const catalogueDay = newest(products.map(lastChanged));

    const urls = [
      { loc: `${SITE}/`, lastmod: catalogueDay },
      { loc: `${SITE}/shop`, lastmod: catalogueDay },
      ...STATIC_PATHS.map((path) => ({ loc: `${SITE}${path}` })),
      ...[...categories].map(([slug, lastmod]) => ({ loc: `${SITE}/category/${slug}`, lastmod })),
      ...products.map((p) => ({ loc: `${SITE}/product/${encodeURIComponent(p.id)}`, lastmod: lastChanged(p) })),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${escapeXml(u.lastmod)}</lastmod>` : ''}</url>`)
      .join('\n')}\n</urlset>\n`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    console.error('Sitemap error:', error?.message);
    res.status(500).setHeader('Content-Type', 'text/plain').end('Sitemap temporarily unavailable');
  }
}
