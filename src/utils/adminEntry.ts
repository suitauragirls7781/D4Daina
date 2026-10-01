/**
 * The private admin link. The whole admin panel lives under it in the address bar (/drdaina,
 * /drdaina/orders, /drdaina/products/new ...). Inside the app the panel's pages are still called
 * /admin/...; the router translates between the two, and a real /admin address never opens anything
 * (it shows the store's ordinary "page not found", signed in or not).
 */
export const ADMIN_ENTRY = 'drdaina';
/** Every slug that opens the sign-in form. */
export const ADMIN_ENTRIES = ['drdaina', 'd4daina'];
// Older links that no longer open anything
const RETIRED = ['', 'sag-vault', 'admin-vault'];

/** The entry slug in use: the owner's own slug from Settings → Security, otherwise the default one. */
export const adminEntrySlug = (configured?: string | null) => {
  const slug = String(configured || '').trim().toLowerCase().replace(/^\/+/, '');
  return RETIRED.includes(slug) ? ADMIN_ENTRY : slug;
};

const savedSlug = () => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('sag_admin_security_v2') : null;
    return adminEntrySlug(saved ? JSON.parse(saved).secretPathSlug : '');
  } catch {
    return ADMIN_ENTRY;
  }
};

const entrySlugs = (configured?: string | null) => [...new Set([...ADMIN_ENTRIES, configured === undefined ? savedSlug() : adminEntrySlug(configured)])];
const trim = (pathname: string) => pathname.replace(/\/+$/, '') || '/';
/** The entry slug an address is under ('' when it is not an admin address). */
const slugOf = (pathname: string, configured?: string | null) => {
  const path = trim(pathname);
  return entrySlugs(configured).find((slug) => path === `/${slug}` || path.startsWith(`/${slug}/`)) || '';
};

// The slug the admin came in through (addresses are built with it)
let activeSlug = '';

/** True on the sign-in link itself (an app path or a browser address). */
export const isAdminEntryPath = (pathname: string, configured?: string | null) => {
  const path = trim(pathname);
  return entrySlugs(configured).some((slug) => path === `/${slug}`);
};

/** True on any admin address in the browser (the private link and everything under it). */
export const isAdminAreaPath = (pathname: string) => Boolean(slugOf(pathname));

/** Browser address → the path the app works with. A typed /admin address becomes "not found". */
export const toAppPath = (pathname: string) => {
  const path = trim(pathname);
  const slug = slugOf(path);
  if (slug) {
    activeSlug = slug;
    return path === `/${slug}` ? path : `/admin${path.slice(slug.length + 1)}`;
  }
  if (/^\/admin(\/|$)/.test(path)) return '/page-not-found';
  return pathname;
};

/** App path → the address shown in the browser (/admin/orders → /drdaina/orders). */
export const toBrowserPath = (target: string) => {
  if (!/^\/admin(\/|\?|$)/.test(target)) return target;
  const rest = target.slice('/admin'.length);
  return `/${activeSlug || savedSlug()}${rest === '/' ? '' : rest}`;
};
