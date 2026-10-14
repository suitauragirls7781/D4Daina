// Link previews for product pages. WhatsApp, Instagram, Facebook, Telegram and search engines read a shared link's
// HTML without running the app, so they only ever saw the store's general title and logo. For /product/<id> the
// app shell is sent with that product's own name, price, discount, sizes and photo in its preview tags.
// Only real data from the product is used. If anything goes wrong the unchanged app shell is sent, so a shopper
// opening the page never notices this exists.
import { mediaVariant, parseMediaUrl } from '../../api/_lib/media.js';
import { isRemovedSection } from '../../api/_lib/removedSections.js';

const SITE = 'https://www.suitauragirls.in';
const PRODUCT_PATH = /^\/product\/([A-Za-z0-9_-]{3,80})$/;

const escapeAttr = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rupees = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
const clip = (text, max) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : clean;
};

/** The product's preview: title, description and photos, or null when the product cannot be shown. */
export const productPreview = (id, product) => {
  if (!product || product.hidden || product.productType === 'accessory' || isRemovedSection(product)) return null;
  const name = clip(product.name, 110);
  const price = Number(product.price) || 0;
  if (!name || price <= 0) return null;
  const mrp = Math.max(price, Number(product.originalPrice) || price);
  const off = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const sizes = (Array.isArray(product.sizes) ? product.sizes : []).map(String).filter(Boolean);
  const sizeText = sizes.length > 1 ? `Sizes ${sizes[0]} to ${sizes[sizes.length - 1]}` : sizes[0] && sizes[0] !== 'Free Size' ? `Size ${sizes[0]}` : '';
  const soldOut = product.inStock === false || Number(product.stockQuantity ?? 1) <= 0;
  const facts = [
    off > 0 ? `${rupees(price)} · ${off}% off (MRP ${rupees(mrp)})` : rupees(price),
    product.category ? String(product.category) : '',
    sizeText,
    soldOut ? 'Sold out right now' : '',
  ].filter(Boolean).join(' · ');
  const about = clip(product.seoDescription || product.description, 150);
  const photo = [...(Array.isArray(product.images) ? product.images : []), product.image].find((url) => parseMediaUrl(url));
  return {
    url: `${SITE}/product/${encodeURIComponent(id)}`,
    title: `${name} · ${rupees(price)} | Suit Aura Girls`,
    description: clip(about ? `${facts}. ${about}` : facts, 200),
    // WhatsApp shows a thumbnail only for a photo of about 300 KB or less: the 480px JPEG is well under that
    image: photo ? mediaVariant(photo, 'j480.jpg') : '',
    largeImage: photo ? mediaVariant(photo, 'j1200.jpg') : '',
    alt: name,
    price,
    soldOut,
  };
};

/** The app shell with the product's own preview tags, for a GET of /product/<id>; null when this does not apply. */
export const withProductPreview = async (request, env, shell) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const match = new URL(request.url).pathname.replace(/\/+$/, '').match(PRODUCT_PATH);
  if (!match || typeof HTMLRewriter === 'undefined' || !env?.DB) return null;
  if (!shell.ok || !(shell.headers.get('content-type') || '').includes('text/html')) return null;
  const id = match[1];
  const row = await env.DB.prepare('SELECT data FROM docs WHERE collection = ?1 AND id = ?2').bind('products', id).first();
  const preview = productPreview(id, row?.data ? JSON.parse(row.data) : null);
  if (!preview) return null;

  const set = (selector, attribute, value) => ({ selector, handler: { element(el) { el.setAttribute(attribute, value); } } });
  const rules = [
    set('meta[name="description"]', 'content', preview.description),
    set('meta[property="og:title"]', 'content', preview.title),
    set('meta[property="og:description"]', 'content', preview.description),
    set('meta[property="og:type"]', 'content', 'product'),
    set('meta[property="og:url"]', 'content', preview.url),
    set('link[rel="canonical"]', 'href', preview.url),
  ];
  if (preview.image) {
    rules.push(
      set('meta[property="og:image"]', 'content', preview.image),
      set('meta[property="og:image:alt"]', 'content', preview.alt),
      set('meta[name="twitter:image"]', 'content', preview.largeImage),
    );
  }
  let rewriter = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(preview.title); } })
    // The general logo's size does not belong to the product photo
    .on('meta[property="og:image:width"], meta[property="og:image:height"]', { element(el) { if (preview.image) el.remove(); } })
    .on('head', {
      element(el) {
        el.append([
          `<meta property="product:price:amount" content="${escapeAttr(preview.price)}" />`,
          '<meta property="product:price:currency" content="INR" />',
          `<meta property="product:availability" content="${preview.soldOut ? 'out of stock' : 'in stock'}" />`,
          `<meta name="twitter:title" content="${escapeAttr(preview.title)}" />`,
          `<meta name="twitter:description" content="${escapeAttr(preview.description)}" />`,
        ].join(''), { html: true });
      },
    });
  for (const rule of rules) rewriter = rewriter.on(rule.selector, rule.handler);
  return rewriter.transform(shell);
};
