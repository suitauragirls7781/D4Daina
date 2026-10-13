import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { FindMySize } from './FindMySize';
import { CompleteTheLook } from './CompleteTheLook';
import { isAccessory } from '../utils/looks';
import { DeliveryCheck } from './DeliveryCheck';
import { categoryToSlug } from '../utils/slugHelper';
import { prepaidPercentApplies } from '../utils/prepaid';
import { trackItem } from '../utils/visitorTracker';
import { doc as fsDocRef, getDoc as fsGetDoc } from 'firebase/firestore';
import { apiPost } from '../lib/api';
import { useDiscovery } from '../utils/discovery';
import { similarProducts } from '../utils/recommend';
import { toggleCompare, useShopperMemory } from '../utils/shopperMemory';
import { productOccasions } from '../utils/smartQuery';
import { useAdmin } from '../context/AdminContext';
import { useAuth } from '../context/AuthContext';
import { ProductCard } from './ProductCard';
import { ProductReviews } from './ProductReviews';
import { ShimmerPDP } from './ShimmerPDP';
import { Product, ProductColor, ProductSize } from '../types';
import { getCleanImageUrl, productPhoto, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { useBackToClose } from '../utils/backClose';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { AlertCircle, Bell, ChevronLeft, ChevronRight, Eye, GitCompare, Share2, Star, Tag } from 'lucide-react';
import { AuraTitle, Icon, Odometer, Seg, clamp, flyToBag, prefersReducedMotion, setVar, useScrollFx } from '../aura';
import { WhatsAppIcon } from './BrandIcons';
import { Assurance, assuranceFacts } from './Assurance';

const MAX_QTY = 10;

type InfoRow = 'details' | 'shipping' | 'returns';
type BuyAction = 'add' | 'buy';

const inr = (value: number) => `₹${value.toLocaleString('en-IN')}`;

/**
 * Bottom sheet: white, 28px top corners, a bold title row with a round close button.
 * Closes on scrim tap and Escape, keeps keyboard focus inside. It is rendered only while open.
 */
const BottomSheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
      if (!items.length) return;
      const active = document.activeElement;
      if (!panel.current.contains(active)) return;
      if (e.shiftKey && (active === items[0] || active === panel.current)) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && active === items[items.length - 1]) { e.preventDefault(); items[0].focus(); }
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[color:var(--sag-scrim)] sag-fade" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] sm:mb-6 bg-surface px-5 pt-2.5 pb-[calc(18px+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom focus:outline-none"
      >
        <div className="flex justify-center sm:hidden" aria-hidden="true"><span className="w-10 h-1 rounded-full bg-sunken-deep" /></div>
        <div className="flex items-center justify-between gap-3 pt-2 pb-3">
          <h2 className="aura-h2 aura-h-sm">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 w-11 h-11 shrink-0 rounded-full flex items-center justify-center bg-sunken text-ink cursor-pointer">
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const ProductDetailPage: React.FC = () => {
  const {
    products = [], selectedProductId, selectedProduct, addToCart, buyNow, toggleWishlist, isInWishlist,
    setIsSizeGuideOpen, setActivePage, navigateToCategory, showToast, isLoading, coupons = [], comboOffer,
    storeOffers, freeShippingThreshold, setIsCartDrawerOpen,
  } = useShop();
  const prepaidDiscount = storeOffers?.prepaidDiscount || 0;
  const { reviewsList = [] } = useAdmin();
  const { user } = useAuth();

  const product = useMemo(() => {
    const found = products.find((p) => String(p.id) === String(selectedProductId))
      || (selectedProduct && String(selectedProduct.id) === String(selectedProductId) ? selectedProduct : undefined);
    // Accessories are sold only inside their outfit's "Complete the look", never on a page of their own
    return found && !isAccessory(found) ? found : undefined;
  }, [products, selectedProductId, selectedProduct]);

  const [imageIdx, setImageIdx] = useState(0);
  // Phones: the name and the price sit above the photo, so they are on the first screen
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia) && window.matchMedia('(max-width: 899px)').matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(max-width: 899px)');
    const onChange = () => setPhone(query.matches);
    onChange();
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  const [size, setSize] = useState<ProductSize | null>(null);
  const [color, setColor] = useState<ProductColor | null>(null);
  const [qty, setQty] = useState(1);
  const [findSizeOpen, setFindSizeOpen] = useState(false);
  const [restockAsk, setRestockAsk] = useState(false);
  // Real counts for today (server-counted, one per visitor); shown only when meaningful
  const [todayStats, setTodayStats] = useState<{ views: number; wishlists: number } | null>(null);
  useEffect(() => {
    setTodayStats(null);
    const productId = selectedProductId ? String(selectedProductId) : "";
    if (!productId) return;
    const day = new Date().toISOString().slice(0, 10);
    fsGetDoc(fsDocRef(db, 'product_daily', `${day}_${productId}`))
      .then((snap) => { if (snap.exists()) setTodayStats({ views: Number(snap.data().views) || 0, wishlists: Number(snap.data().wishlists) || 0 }); })
      .catch(() => {});
  }, [selectedProductId]);
  const [restockEmail, setRestockEmail] = useState('');
  const { features } = useDiscovery();
  const { compare: compareIds } = useShopperMemory();
  const [open, setOpen] = useState<InfoRow | null>('details');
  const [lightbox, setLightbox] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  // Display only: the size / colour / quantity that was last added, so the button can offer "View bag" for it
  const [addedKey, setAddedKey] = useState('');
  const [needSize, setNeedSize] = useState(false);
  // Size sheet: which bar button opened it (null = closed)
  const [sheetAction, setSheetAction] = useState<BuyAction | null>(null);
  // The phone's Back button closes the full-size photo or the size sheet instead of leaving the product
  useBackToClose(lightbox, () => setLightbox(false));
  useBackToClose(sheetAction !== null, () => setSheetAction(null));
  const [sheetError, setSheetError] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  // Photo strip: native scroll-snap; the active photo is read from the scroll position
  const strip = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef(0);
  const scrollLock = useRef(0);
  // Small photos under the main photo (phones and tablets); the active one is kept in view
  const thumbs = useRef<HTMLDivElement>(null);
  // Photos that have finished loading, and a short "changing photo" moment after the shopper picks one
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [switching, setSwitching] = useState(false);
  // Big photos the shopper has actually looked at. Only these are downloaded: the photos of colours nobody
  // picked stay as the small picture the row below already has.
  const [viewedImages, setViewedImages] = useState<Record<string, boolean>>({});
  const switchTimer = useRef(0);
  // The page (the scroll engine reads its place), the photo frame that becomes a little smaller on phones as the page
  // scrolls, and the main buttons: once they have scrolled away above the screen the desktop buy pill comes in
  const pageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaAway, setCtaAway] = useState(false);
  // The strip's width, read on resize only (the sideways parallax needs it on every scroll frame)
  const stripWidth = useRef(0);
  const barPhoto = useRef<HTMLImageElement>(null);
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);
  // A swipe is not a tap on the backdrop: the viewer stays open
  const swipedAt = useRef(0);
  // Left and right arrow keys change the photo in the full-size viewer (the count is read when the key is pressed)
  const photoCount = useRef(1);
  // The reviews, "Complete the look" and the rails of other styles are put on the page right after the first
  // screen has been painted (they are all far below it), so the name, price and photo never wait for them
  const [belowShown, setBelowShown] = useState(false);
  useEffect(() => {
    let timer = 0;
    const frame = window.requestAnimationFrame(() => { timer = window.setTimeout(() => setBelowShown(true), 0); });
    const late = window.setTimeout(() => setBelowShown(true), 1500);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); window.clearTimeout(late); };
  }, []);

  useEffect(() => {
    setImageIdx(0);
    setQty(1);
    setNeedSize(false);
    setAddedKey('');
    setJustAdded(false);
    setSheetAction(null);
    setDescOpen(false);
    setSize(product?.sizes?.length === 1 ? product.sizes[0] : null);
    setColor(product?.colors?.[0] || null);
    if (product?.id) {
      try {
        const list: string[] = JSON.parse(localStorage.getItem('sag_recently_browsed') || '[]');
        localStorage.setItem('sag_recently_browsed', JSON.stringify([String(product.id), ...list.filter((id) => id !== String(product.id))].slice(0, 12)));
      } catch {}
      trackItem('product_view', String(product.id));
      document.title = product.seoTitle?.trim() || `${product.name} | Suit Aura Girls`;
    }
    strip.current?.scrollTo({ left: 0 });
    window.scrollTo({ top: 0 });
  }, [product?.id]);

  // Search/share metadata and Product structured data, built only from real product fields.
  useEffect(() => {
    if (!product) return;
    const url = `https://www.suitauragirls.in/product/${product.id}`;
    const description = (product.seoDescription?.trim() || product.description || `${product.name} — ${product.category} by Suit Aura Girls.`).slice(0, 160);
    const image = product.images?.find(Boolean) || product.image || '';
    const setMeta = (selector: string, attr: string, value: string) => document.querySelector(selector)?.setAttribute(attr, value);
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', product.seoTitle?.trim() || `${product.name} | Suit Aura Girls`);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:type"]', 'content', 'product');
    if (image) setMeta('meta[property="og:image"]', 'content', getCleanImageUrl(image, 1200));
    setMeta('link[rel="canonical"]', 'href', url);
    setMeta('meta[property="og:url"]', 'content', url);

    const approved = reviewsList.filter((r) => String(r.productId) === String(product.id) && r.status === 'approved');
    const data: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description,
      sku: product.sku || String(product.id),
      category: product.category,
      brand: { '@type': 'Brand', name: 'Suit Aura Girls' },
      image: (product.images || []).filter(Boolean).slice(0, 6).map((img) => getCleanImageUrl(img, 1200)),
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'INR',
        price: Number(product.price) || 0,
        availability: product.inStock && Number(product.stockQuantity ?? 0) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
      },
    };
    if (approved.length) {
      data.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: (approved.reduce((s, r) => s + (Number(r.rating) || 0), 0) / approved.length).toFixed(1),
        reviewCount: approved.length,
      };
    }
    let script = document.getElementById('product-jsonld') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = 'product-jsonld';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
    // Breadcrumb: Home › Category › Product
    const origin = window.location.origin;
    const crumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        product.productType === 'accessory'
          ? { '@type': 'ListItem', position: 2, name: 'Shop', item: `${origin}/shop` }
          : { '@type': 'ListItem', position: 2, name: product.category, item: `${origin}/category/${categoryToSlug(product.category)}` },
        { '@type': 'ListItem', position: 3, name: product.name, item: `${origin}/product/${product.id}` },
      ],
    };
    let crumbScript = document.getElementById('breadcrumb-jsonld') as HTMLScriptElement | null;
    if (!crumbScript) {
      crumbScript = document.createElement('script');
      crumbScript.type = 'application/ld+json';
      crumbScript.id = 'breadcrumb-jsonld';
      document.head.appendChild(crumbScript);
    }
    crumbScript.textContent = JSON.stringify(crumbs);
    return () => {
      document.getElementById('product-jsonld')?.remove();
      document.getElementById('breadcrumb-jsonld')?.remove();
      setMeta('meta[property="og:type"]', 'content', 'website');
      setMeta('meta[name="description"]', 'content', "Shop elegant women's suits, kurtis, dresses, anarkali and ethnic fashion at Suit Aura Girls.");
    };
  }, [product?.id, product?.price, product?.stockQuantity, reviewsList.length]);

  const recentlyViewed = useMemo(() => {
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('sag_recently_browsed') || '[]');
      return ids
        .filter((id) => id !== String(product?.id))
        .map((id) => products.find((p) => String(p.id) === id))
        .filter((p): p is NonNullable<typeof p> => Boolean(p && p.inStock))
        .slice(0, 4);
    } catch {
      return [];
    }
  }, [product?.id, products]);

  // Image viewer: Escape closes it, the page behind does not scroll
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step && photoCount.current > 1) setImageIdx((idx) => (idx + step + photoCount.current) % photoCount.current);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [lightbox]);

  useEffect(() => () => { if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current); }, []);
  useEffect(() => () => window.clearTimeout(switchTimer.current), []);
  // The colour is the one in the photo on screen (each colour has its own photo); the bag and the order carry it
  useEffect(() => {
    const shown = (product?.images || []).filter(Boolean)[imageIdx];
    const match = (product?.colors || []).find((c) => c && c.name && c.imageUrl && c.imageUrl === shown);
    if (match) setColor(match);
  }, [imageIdx, product]);

  useEffect(() => {
    const shown = (product?.images || []).filter(Boolean)[imageIdx];
    if (shown) setViewedImages((seen) => (seen[shown] ? seen : { ...seen, [shown]: true }));
  }, [imageIdx, product]);

  // Keep the small photo of the one on screen visible in its row
  useEffect(() => {
    const row = thumbs.current;
    const item = row?.children[imageIdx] as HTMLElement | undefined;
    if (!row || !item) return;
    const left = item.offsetLeft - row.offsetLeft - (row.clientWidth - item.clientWidth) / 2;
    row.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [imageIdx]);

  // Desktop: the sticky photo column sits 16px under the site header, whatever height the header really has
  const [stickyTop, setStickyTop] = useState(96);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header.sticky, header.fixed, [data-site-header]') || document.querySelector<HTMLElement>('body header');
    if (!header) return;
    const measure = () => setStickyTop(Math.round(header.getBoundingClientRect().height) + 16);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const hasProduct = Boolean(product);
  // Phones: the photo frame scales down a little while the first screen scrolls away (transform only, one variable)
  useScrollFx(pageRef, ({ y, vh, vw }) => setVar(frameRef.current, '--s', vw < 900 ? 1 - clamp(y / Math.max(1, vh)) * 0.07 : 1, 4), [hasProduct]);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const read = () => { stripWidth.current = el.clientWidth; };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasProduct]);
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setCtaAway(false); return; }
    const watch = new IntersectionObserver(([entry]) => setCtaAway(!entry.isIntersecting && entry.boundingClientRect.top < 90), { rootMargin: '-90px 0px -20px 0px' });
    watch.observe(el);
    return () => watch.disconnect();
  }, [product?.id, hasProduct]);

  if (isLoading && !product) return <ShimmerPDP />;

  if (!product) {
    return (
      <div data-aura="" className="min-h-[60vh] flex flex-col items-center justify-center gap-7 px-5 py-12 text-center">
        <AuraTitle as="h1" align="center" size="lg" label="Suit Aura Girls" title="This style is no longer" accent="available" sub="It may have sold out or been removed. Explore what is in stock now." />
        <button onClick={() => navigateToCategory('All')} className="aura-btn">Shop all styles <Icon name="arrow" /></button>
      </div>
    );
  }

  const images = (Array.isArray(product.images) ? product.images.filter(Boolean) : []).length
    ? product.images.filter(Boolean)
    : [product.image || ELEGANT_PLACEHOLDER_SVG];
  photoCount.current = images.length;
  const colors = (product.colors || []).filter((c) => c && c.name);
  // Accessories are sold only through "Complete the look": no size finder, size chart, compare or similar outfits
  const accessoryPage = isAccessory(product);
  const womenSizing = !accessoryPage;
  const sizes = (product.sizes || []) as ProductSize[];
  // A single "Free Size" (one-size pieces) needs no choosing
  const oneSize = sizes.length === 1 && sizes[0] === 'Free Size';
  const sizeWord = 'Size';
  const chooseSizeText = 'Please choose a size';
  const price = Number(product.price) || 0;
  // The online payment percent is mentioned only when this product's price qualifies for it
  const prepaidPercentHere = prepaidPercentApplies(storeOffers, price);
  const mrp = Math.max(price, Number(product.originalPrice) || price);
  const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const stock = Math.max(0, Number(product.stockQuantity ?? 0));
  const soldOut = product.inStock === false || stock <= 0;
  const maxQty = Math.max(1, Math.min(MAX_QTY, stock));
  const fav = isInWishlist(product.id);
  const reviews = reviewsList.filter((r) => String(r.productId) === String(product.id) && r.status === 'approved' && String(r.comment || '').trim());
  const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length : 0;
  const bestCoupon = [...coupons].sort((a, b) => b.discountValue - a.discountValue)[0];
  const related = similarProducts(product, products, 4);
  const inCompare = compareIds.includes(String(product.id));
  // Product facts: only what was entered for this product
  const occasionText = product.occasion || productOccasions(product).join(', ');
  const facts = ([
    product.fabric && ['Fabric', product.fabric],
    product.fit && ['Fit', product.fit],
    occasionText && ['Occasion', occasionText],
    colors.length > 0 && colors[0].name !== 'Default' && [colors.length > 1 ? 'Colours' : 'Colour', colors.map((c) => c.name).join(', ')],
    sizes.length > 0 && !oneSize && ['Sizes', sizes.join(', ')],
    product.washCare && ['Care', product.washCare],
  ].filter(Boolean) as Array<[string, string]>);
  const description = String(product.description || '').trim();
  // Offers: only the ones that are live, as plain lines in one quiet box
  const prepaidLines = [
    prepaidDiscount > 0 && `₹${prepaidDiscount} off at checkout when you pay online`,
    prepaidPercentHere && `${storeOffers.prepaidPercent}% off this style at checkout when you pay online`,
    storeOffers.codEnabled && `Cash on delivery available: pay ₹${storeOffers.codCharge} online to confirm, the rest in cash at delivery`,
  ].filter(Boolean) as string[];
  const comboHere = comboOffer && !accessoryPage ? comboOffer : null;
  const hasOffers = prepaidLines.length > 0 || Boolean(comboHere) || Boolean(bestCoupon);
  const assurance = assuranceFacts();

  const shareWhatsApp = () => {
    const url = `${window.location.origin}/product/${product.id}`;
    const text = `${product.name} — ₹${price.toLocaleString('en-IN')}${discount ? ` (${discount}% off)` : ''}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
  const onCompare = () => {
    const r = toggleCompare(String(product.id));
    if (r.full) showToast('You can compare up to 4 styles. Remove one first.', 'info');
    else showToast(r.added ? 'Added to compare.' : 'Removed from compare.', 'info');
  };

  const markLoaded = (img: string) => setLoadedImages((done) => (done[img] ? done : { ...done, [img]: true }));

  /** Shows photo `idx` and moves the strip to it. */
  const showImage = (idx: number, smooth = true) => {
    if (idx !== imageIdx) {
      setSwitching(true);
      window.clearTimeout(switchTimer.current);
      switchTimer.current = window.setTimeout(() => setSwitching(false), 350);
    }
    setImageIdx(idx);
    const el = strip.current;
    const slide = el?.children[idx] as HTMLElement | undefined;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !slide || !first) return;
    // While the strip travels to the chosen photo, the photos it passes must not become "active"
    scrollLock.current = Date.now() + 600;
    el.scrollTo({ left: slide.offsetLeft - first.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
  };
  const gpRef = useRef<HTMLDivElement>(null);
  const onStripScroll = () => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const el = strip.current;
      if (!el) return;
      const slides = Array.from(el.children) as HTMLElement[];
      if (!slides.length) return;
      // Each photo lags a little behind its slide while the strip moves (transform only; the part it uncovers is off screen)
      const w = stripWidth.current;
      if (w > 0 && !prefersReducedMotion()) {
        const x = el.scrollLeft;
        // Aura Kinetic: the small segment under the photo travels with the finger
        setVar(gpRef.current, '--gp', clamp(x / w, 0, slides.length - 1));
        slides.forEach((slide, i) => {
          const layer = slide.firstElementChild as HTMLElement | null;
          const d = x - i * w;
          const shift = Math.abs(d) < w ? Math.round(d * 0.14 * 10) / 10 : 0;
          if (layer && layer.dataset.x !== String(shift)) { layer.dataset.x = String(shift); layer.style.transform = shift ? `translate3d(${shift}px,0,0)` : ''; }
        });
      }
      if (Date.now() < scrollLock.current) return;
      let idx = 0;
      if (el.scrollLeft > 0 && el.scrollLeft >= el.scrollWidth - el.clientWidth - 2) {
        idx = slides.length - 1;
      } else {
        const origin = slides[0].offsetLeft;
        let best = Infinity;
        slides.forEach((slide, i) => {
          const distance = Math.abs(slide.offsetLeft - origin - el.scrollLeft);
          if (distance < best) { best = distance; idx = i; }
        });
      }
      setImageIdx((current) => (current === idx ? current : idx));
    });
  };
  const go = (delta: number) => showImage((imageIdx + delta + images.length) % images.length, false);
  const openViewer = (idx: number) => { setImageIdx(idx); setLightbox(true); };
  // Full-size viewer: a sideways swipe (or the arrow keys) shows the next or the previous photo
  const viewerSwipe = {
    onPointerDown: (e: React.PointerEvent) => { swipeFrom.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e: React.PointerEvent) => {
      const from = swipeFrom.current;
      swipeFrom.current = null;
      if (!from || images.length < 2) return;
      const dx = e.clientX - from.x;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(e.clientY - from.y) * 1.4) { swipedAt.current = Date.now(); go(dx < 0 ? 1 : -1); }
    },
    onPointerCancel: () => { swipeFrom.current = null; },
  };

  const swatches = colors.filter((c) => c.name !== 'Default');
  const pickColour = (c: ProductColor) => {
    const idx = c.imageUrl ? images.indexOf(c.imageUrl) : -1;
    if (idx >= 0) showImage(idx);
    setColor(c);
  };

  const sizeMissing = (chosen: ProductSize | null) => sizes.length > 0 && !chosen && !oneSize;
  const bagKey = (chosen: ProductSize | null | undefined) => `${chosen || ''}|${color?.name || ''}|${qty}`;
  // The same choice is already in the bag: the add button turns into a way to open the bag
  const inBagNow = !justAdded && addedKey !== '' && addedKey === bagKey(size);
  const openBag = () => setIsCartDrawerOpen(true);

  const requireSize = (chosen: ProductSize | null = size) => {
    if (sizeMissing(chosen)) {
      setNeedSize(true);
      document.getElementById('pdp-size-selector')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('Please choose a size.', 'info');
      return false;
    }
    return true;
  };

  const onAdd = (sizeOverride?: ProductSize) => {
    const chosen = sizeOverride ?? size;
    if (soldOut || !requireSize(chosen)) return false;
    addToCart(product, (chosen || 'Free Size') as ProductSize, color || undefined, qty, false);
    setJustAdded(true);
    setAddedKey(bagKey(chosen));
    setTimeout(() => setJustAdded(false), 1800);
    return true;
  };

  const onBuy = (sizeOverride?: ProductSize) => {
    const chosen = sizeOverride ?? size;
    if (soldOut || !requireSize(chosen)) return;
    buyNow(product, (chosen || 'Free Size') as ProductSize, color || undefined, qty);
  };

  // Adds and, only when the style really went into the bag, its photo flies to the bag (the bag never waits for the flight)
  const addAndFly = (sizeOverride?: ProductSize, from?: Element | null) => {
    if (!onAdd(sizeOverride)) return;
    const start = from || strip.current?.children[imageIdx] || null;
    const photo = getCleanImageUrl(images[imageIdx] || images[0], 160);
    // The bag sits in the header on this page: if the header has slid away it comes back first, then the photo flies to it
    const header = document.querySelector('header.aura-hd');
    const away = Boolean(header?.classList.contains('hide'));
    header?.classList.remove('hide');
    if (away) window.setTimeout(() => { flyToBag(start, photo); }, 380); else flyToBag(start, photo);
  };

  /** Buy bar buttons: with no size chosen yet they open the size sheet instead of scrolling the page. */
  const fromBar = (action: BuyAction) => {
    if (soldOut) return;
    if (sizeMissing(size)) {
      setSheetError(false);
      setSheetAction(action);
      return;
    }
    if (action === 'add') addAndFly(undefined, barPhoto.current); else onBuy();
  };
  const confirmSheet = () => {
    if (!size) { setSheetError(true); return; }
    const action = sheetAction;
    setSheetAction(null);
    if (action === 'add') addAndFly(size, barPhoto.current); else if (action === 'buy') onBuy(size);
  };
  const pickSize = (s: ProductSize) => { setSize(s); setNeedSize(false); setSheetError(false); };

  const share = async () => {
    const url = `${window.location.origin}/product/${product.id}`;
    try {
      if (navigator.share) await navigator.share({ title: product.name, url });
      else {
        await navigator.clipboard.writeText(url);
        showToast('Link copied.', 'success');
      }
    } catch {}
  };

  const notifyRestock = async () => {
    const email = user?.email || restockEmail.trim();
    if (!user?.email && !restockAsk) { setRestockAsk(true); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showToast('Please enter a valid email address.', 'error'); return; }
    try {
      await apiPost('/api/alerts', { action: 'restock-subscribe', productId: String(product.id), size: size || '', colour: color?.name || '', email });
      setRestockAsk(false);
      showToast(`We will email ${email} when it is back${size ? ` in size ${size}` : ''}.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Could not save your request. Please try again.', 'error');
    }
  };


  // The quiet bold underlined link (Size guide, Read more) and the round sand button of the photo viewer
  const quietLink = 'sag-link inline-flex items-center min-h-11 text-[14px] font-bold cursor-pointer';
  const iconBtn = 'rounded-full flex items-center justify-center bg-sunken text-ink cursor-pointer';
  const badgeText = (product.isNewArrival || product.isBestSeller) && !soldOut ? (product.isNewArrival ? 'New' : 'Bestseller') : '';
  const toReviews = () => document.getElementById('pdp-reviews')?.scrollIntoView({ behavior: 'smooth' });
  const total = inr(price * qty);

  const detailRows: Array<{ key: InfoRow; title: string; body: React.ReactNode }> = [
    {
      key: 'details',
      title: 'Product details',
      body: (
        <>
          {facts.length > 0 && (
            <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-y-2.5 text-[15px] leading-[1.4]">
              {facts.map(([label, value]) => (
                <React.Fragment key={label}>
                  <dt className="pr-3 text-ink-muted">{label}</dt>
                  <dd className="font-medium text-ink break-words">{value}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
          {description && (
            <div className={facts.length > 0 ? 'mt-4' : ''}>
              <p className={`whitespace-pre-line break-words ${descOpen ? '' : 'line-clamp-5'}`}>{description}</p>
              {description.length > 220 && (
                <button type="button" onClick={() => setDescOpen((v) => !v)} aria-expanded={descOpen} className={quietLink}>{descOpen ? 'Show less' : 'Read more'}</button>
              )}
            </div>
          )}
          {facts.length === 0 && !description && <p>Details on request — ask us on WhatsApp.</p>}
        </>
      ),
    },
    {
      key: 'shipping',
      title: 'Shipping',
      body: (
        <div className="space-y-2">
          <p>We ship across India. Every order is prepaid online and a tracking number is emailed when it ships.</p>
          {freeShippingThreshold > 0 && <p>Free shipping on orders above ₹{freeShippingThreshold.toLocaleString('en-IN')}.</p>}
          <button onClick={() => setActivePage('shipping-policy')} className={quietLink}>Read the shipping policy</button>
        </div>
      ),
    },
    {
      key: 'returns',
      title: 'Returns & exchanges',
      body: (
        <div className="space-y-2">
          <p>Once your order is delivered you can request a return from your account. Our team will contact you to arrange it.</p>
          <button onClick={() => setActivePage('return-policy')} className={quietLink}>Read the return policy</button>
        </div>
      ),
    },
  ];

  // Sizes: one white pill with the ink indicator that slides to the chosen size. Many or long sizes (ages) do not
  // fit one pill: they are white pills that wrap. The red ring appears only after the shopper tried to go on without a size.
  const onePill = sizes.length <= 6 && sizes.every((s) => String(s).length <= 4);
  const sizeChips = (error: boolean) => (onePill ? (
    <div className={`pdp-size ${error && !size ? 'err' : ''}`}>
      <Seg ariaLabel={sizeWord} variant="box" options={sizes as string[]} value={size as string | null} onChange={(s) => pickSize(s as ProductSize)} className="aura-num" />
    </div>
  ) : (
    <div role="group" aria-label={sizeWord} className={`pdp-size wrap ${error && !size ? 'err' : ''}`}>
      {sizes.map((s) => (
        <button key={s} type="button" onClick={() => pickSize(s)} aria-pressed={size === s} className="sag-chip aura-num h-[46px] min-w-[46px] px-4 whitespace-nowrap text-[15px] font-bold cursor-pointer">
          {s}
        </button>
      ))}
    </div>
  ));

  const sizeLinks = womenSizing && (
    <span className="flex items-center gap-4 shrink-0">
      {features.findMySize && <button type="button" onClick={() => setFindSizeOpen((v) => !v)} aria-expanded={findSizeOpen} className={quietLink}>Find my size</button>}
      <button type="button" onClick={() => setIsSizeGuideOpen(true)} className={quietLink}>Size guide</button>
    </span>
  );

  // A rail of cards under the page: the first word of the title is bold, the rest is the serif accent
  const rail = (title: string, items: Product[]) => {
    const at = title.indexOf(' ');
    return (
      <div className="pdp-sec">
        <AuraTitle title={at > 0 ? title.slice(0, at) : title} accent={at > 0 ? title.slice(at + 1) : undefined} size="lg" />
        <div className="pdp-rail">
          {items.map((p) => <div key={p.id}><ProductCard product={p} compact /></div>)}
        </div>
      </div>
    );
  };
  // The four facts the store stands behind (worded once in Assurance.tsx)
  const factRows: Array<{ key: string; icon: 'lock' | 'returns' | 'truck' | 'chat'; text: string; page?: 'return-policy' | 'shipping-policy'; href?: string }> = [
    { key: 'payment', icon: 'lock', text: assurance.payment },
    { key: 'returns', icon: 'returns', text: assurance.returns, page: 'return-policy' },
    { key: 'delivery', icon: 'truck', text: assurance.delivery, page: 'shipping-policy' },
    { key: 'help', icon: 'chat', text: 'Chat with us on WhatsApp', href: createSupportWhatsAppUrl(`Hi Suit Aura Girls, I have a question about "${product.name}".`) },
  ];
  const addLabel = justAdded ? <><Icon name="check" size={18} /> Added to bag</> : inBagNow ? 'View bag' : <><Icon name="bag" size={19} /> Add to bag</>;

  // The style's label, name and price: above the photo on phones, at the top of the buy box on wider screens
  const head = (
    <>
      <p className="aura-lbl">{badgeText ? <>{badgeText} · {product.category}</> : product.category}</p>
      <div className="pdp-hrow mt-2.5 flex items-start gap-2">
        <h1 className="pdp-n">{product.name}</h1>
        <div className="pdp-acts flex shrink-0 gap-1.5">
          <button type="button" onClick={() => toggleWishlist(product)} aria-label={fav ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={fav} className="pdp-ic">
            <Icon name="heart" size={21} filled={fav} className={fav ? 'sag-beat text-accent' : ''} />
          </button>
          <button type="button" onClick={share} aria-label="Share this style" className="pdp-ic">
            <Share2 className="w-5 h-5" strokeWidth={1.6} />
          </button>
        </div>
      </div>

      <p className="pdp-pr aura-num">
        {/* No roll on arrival: the price is readable in the first frame */}
        <Odometer value={inr(price)} className="pdp-big" roll={false} />
        {mrp > price && <span className="text-[16px] text-ink-muted"><span className="sr-only">MRP </span><span className="line-through">₹{mrp.toLocaleString('en-IN')}</span></span>}
        {discount > 0 && <span className="aura-tag">{discount}% off</span>}
      </p>
    </>
  );

  return (
    <div ref={pageRef} id="product-detail-page" data-aura="" className="pdp-page" style={{ '--pdp-top': `${stickyTop}px` } as React.CSSProperties}>
      <div className="pdp-w">
        {/* Breadcrumb: quiet, at the bottom on phones; at the top on desktop */}
        <nav aria-label="Breadcrumb" className="pdp-crumb">
          <button onClick={() => setActivePage('home')} className="min-h-11 min-w-11 -mx-1.5 px-1.5 inline-flex items-center justify-center hover:text-ink cursor-pointer shrink-0">Home</button>
          <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
          <button onClick={() => navigateToCategory((product.productType === 'accessory' ? 'All' : product.category) as any)} className="min-h-11 min-w-11 -mx-1.5 px-1.5 inline-flex items-center justify-center hover:text-ink cursor-pointer shrink-0">{product.productType === 'accessory' ? 'Shop' : product.category}</button>
          <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="text-ink truncate">{product.name}</span>
        </nav>

        {/* Phones: the gallery, the buy box, the details, the reviews in one column.
            Desktop: the gallery left (it stays in view), the buy box and the details right; the reviews across. */}
        <div className="pdp">
          {phone && <div className="pdp-top">{head}</div>}
          {/* Gallery: a strip to swipe inside a 26px frame; under it "1 / N" and the small photos */}
          <div className="pdp-g">
            <div className="pdp-gi">
              <div ref={frameRef} className="pdp-st">
                <div className="pdp-fr">
                  <div ref={strip} onScroll={onStripScroll} className="pdp-sl">
                    {images.map((img, idx) => (
                      <button
                        key={img + idx}
                        type="button"
                        onClick={() => openViewer(idx)}
                        aria-label={images.length > 1 ? `Open photo ${idx + 1} of ${images.length} full size` : 'Open full-size image'}
                        className="pdp-s active:[transform:none]!"
                      >
                        <span>
                          {idx === 0 ? (
                            <img {...productPhoto(img)} sizes="(min-width: 900px) 560px, 100vw" alt={product.name} data-vt-hero="" style={{ viewTransitionName: 'pdp-hero' } as React.CSSProperties} fetchPriority="high" decoding="async" draggable={false} onLoad={() => markLoaded(img)} onError={() => markLoaded(img)} />
                          ) : (
                            <>
                              {/* Until this photo is looked at, its place holds the small picture the row below already downloaded */}
                              <img src={getCleanImageUrl(img, 160)} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} />
                              {(idx === imageIdx || viewedImages[img]) && (
                                <img {...productPhoto(img)} sizes="(min-width: 900px) 560px, 100vw" alt={`${product.name}, photo ${idx + 1}`} decoding="async" draggable={false} onLoad={() => markLoaded(img)} onError={() => markLoaded(img)} />
                              )}
                            </>
                          )}
                        </span>
                        {/* Shown only while this photo is loading, or for a moment after the shopper picks it */}
                        {idx === imageIdx && (switching || !loadedImages[img]) && (
                          <span className="sag-photo-loading" role="status" aria-label="Loading photo"><span className="sag-photo-spinner" /></span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {images.length > 1 && (
                <>
                  <div ref={gpRef} className="kx-gp" aria-hidden="true" style={{ '--gn': images.length } as React.CSSProperties}><i /></div>
                  <div className="pdp-m">
                    <span><Icon name="pinch" size={18} className="shrink-0 text-ink" /> Swipe for more photos</span>
                    <span className="pdp-ix" aria-label={`Photo ${imageIdx + 1} of ${images.length}`}><Odometer value={imageIdx + 1} roll={false} /> / {images.length}</span>
                  </div>
                  <div ref={thumbs} className="pdp-th">
                    {images.map((img, idx) => (
                      <button key={img + idx} type="button" onClick={() => showImage(idx)} aria-label={`Show photo ${idx + 1}`} aria-current={idx === imageIdx}>
                        <img src={getCleanImageUrl(img, 160)} alt="" loading="lazy" decoding="async" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Buy box: the same at every width */}
          <div className="pdp-d">
            {!phone && head}
            {/* Rating: only with real approved reviews */}
            <p className="pdp-tax aura-num">
              {reviews.length > 0 && (
                <>
                  <button type="button" onClick={toReviews} className="-my-3 py-3 inline-flex items-center gap-1 font-bold text-ink cursor-pointer" aria-label={`Rated ${avgRating.toFixed(1)} out of 5 from ${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}`}>
                    <Star className="w-4 h-4 fill-star text-star" aria-hidden="true" />
                    <span>{avgRating.toFixed(1)} ({reviews.length})</span>
                  </button>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {mrp > price && (
                <>
                  <span className="font-bold text-sale">You save ₹{(mrp - price).toLocaleString('en-IN')}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>Inclusive of all taxes</span>
            </p>

            {/* Offers: only the ones that are live, as plain lines on a blush card */}
            {hasOffers && (
              <ul data-rv="" aria-label="Offers" className="pdp-off aura-num">
                <li className="aura-lbl text-ink!" aria-hidden="true">Offers</li>
                {prepaidLines.map((line) => (
                  <li key={line} className="flex items-start gap-2.5"><Tag className="mt-0.5 w-[18px] h-[18px] shrink-0" strokeWidth={1.6} aria-hidden="true" /><span className="min-w-0">{line}</span></li>
                ))}
                {comboHere && (
                  <li className="flex items-start gap-2.5"><Tag className="mt-0.5 w-[18px] h-[18px] shrink-0" strokeWidth={1.6} aria-hidden="true" /><span className="min-w-0">Buy {comboHere.minItems} or more outfits and save {comboHere.percent}%</span></li>
                )}
                {bestCoupon && (
                  <li className="flex items-start gap-2.5">
                    <Tag className="mt-0.5 w-[18px] h-[18px] shrink-0" strokeWidth={1.6} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue}` : `${bestCoupon.discountValue}%`} off with a coupon
                        {bestCoupon.minOrderValue ? ` on orders above ₹${bestCoupon.minOrderValue.toLocaleString('en-IN')}` : ''}
                      </span>
                      <span className="mt-2 flex items-center gap-2">
                        <span className="pdp-code">{bestCoupon.code}</span>
                        <button type="button" onClick={() => navigator.clipboard?.writeText(bestCoupon.code).then(() => showToast(`Code ${bestCoupon.code} copied.`, 'success')).catch(() => {})}
                          aria-label={`Copy code ${bestCoupon.code}`}
                          className="pdp-copy">
                          <Icon name="copy" size={15} /> Copy
                        </button>
                      </span>
                    </span>
                  </li>
                )}
              </ul>
            )}

            {/* Real counts for today, same thresholds as before. No line (and no empty band) when there is nothing to say. */}
            {todayStats && (todayStats.wishlists >= 2 || todayStats.views >= 5) && (
              <p className="mt-4 flex items-center gap-2 text-[14px] leading-5 text-ink-muted">
                {todayStats.wishlists >= 2
                  ? <><Icon name="heart" size={18} className="shrink-0 text-accent" /> {todayStats.wishlists} people saved this today</>
                  : <><Eye className="w-[18px] h-[18px] shrink-0 text-ink" strokeWidth={1.6} aria-hidden="true" /> {todayStats.views} people viewed this today</>}
              </p>
            )}

            {swatches.length > 0 && (
              <div className="pdp-fld">
                <p className="pdp-fld-h aura-lbl">Colour{color?.name && color.name !== 'Default' && <b>{color.name}</b>}</p>
                <div role="group" aria-label="Colour" className="pdp-sw">
                  {swatches.map((c) => (
                    <button key={c.name} type="button" onClick={() => pickColour(c)} aria-label={c.name} title={c.name} aria-pressed={color?.name === c.name}>
                      <i style={{ backgroundColor: c.hex || undefined }} />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sizes.length > 0 && !oneSize && (
              <div id="pdp-size-selector" className="pdp-fld scroll-mt-28">
                <div className="pdp-fld-h">
                  <p className={needSize && !size ? 'pdp-need' : 'aura-lbl'} aria-live="polite">
                    {needSize && !size ? <><AlertCircle className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />{chooseSizeText}</> : <>{sizeWord}{size && <b key={size} className="pdp-picked"> · {size}</b>}</>}
                  </p>
                  {sizeLinks}
                </div>
                {sizeChips(needSize)}
                {findSizeOpen && womenSizing && (
                  <FindMySize sizes={sizes} onPick={(sz) => { pickSize(sz as ProductSize); setFindSizeOpen(false); }} onClose={() => setFindSizeOpen(false)} onOpenChart={() => setIsSizeGuideOpen(true)} />
                )}
              </div>
            )}

            {!soldOut && (
              <div className="pdp-fld">
                <p className="pdp-fld-h aura-lbl">Quantity{stock <= 5 && <span className="normal-case tracking-normal text-[14px] font-bold text-sale">Only {stock} left</span>}</p>
                <div className="pdp-qrow">
                  <div className="pdp-qty" role="group" aria-label="Quantity">
                    <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity"><Icon name="minus" size={16} strokeWidth={2} /></button>
                    <span aria-live="polite"><Odometer value={qty} roll={false} /></span>
                    <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Increase quantity"><Icon name="plus" size={16} strokeWidth={2} /></button>
                  </div>
                  <div className="pdp-tt aura-num">
                    {qty > 1 ? <>₹{price.toLocaleString('en-IN')} × {qty}</> : 'Total'}
                    <b><Odometer value={total} roll={false} /></b>
                  </div>
                </div>
              </div>
            )}

            {soldOut && <p className="mt-6 text-[15px] leading-5 font-bold text-danger">This style is sold out right now.</p>}
            {soldOut && restockAsk && !user?.email && (
              <form onSubmit={(e) => { e.preventDefault(); notifyRestock(); }} className="mt-3 sag-drop">
                <label htmlFor="pdp-restock-email" className="aura-lbl mb-2 block">Email for the restock alert</label>
                <div className="flex gap-2">
                  <input id="pdp-restock-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required autoFocus value={restockEmail} onChange={(e) => setRestockEmail(e.target.value)} placeholder="you@example.com"
                    className="sag-input h-[54px] flex-1 min-w-0 px-4 text-[16px]" />
                  <button type="submit" className="aura-btn aura-btn-line shrink-0 px-5">Notify me</button>
                </div>
              </form>
            )}

            {/* The two actions as full-width pills: "Buy now" in ink, "Add to bag" as a line. The added photo flies to the bag. */}
            <div ref={ctaRef} className={`pdp-cta ${soldOut ? 'mt-4!' : ''}`}>
              {soldOut ? (
                <button type="button" onClick={notifyRestock} className="aura-btn aura-btn-w">
                  <Bell className="w-[18px] h-[18px]" strokeWidth={1.6} aria-hidden="true" /> Notify me when back
                </button>
              ) : (
                <>
                  <button id="pdp-buy-now" type="button" onClick={() => onBuy()} className="aura-btn aura-btn-w aura-num">Buy now · ₹{(price * qty).toLocaleString('en-IN')}</button>
                  <button id="pdp-add-to-bag" type="button" onClick={() => (inBagNow ? openBag() : addAndFly())} className="aura-btn aura-btn-line aura-btn-w">{addLabel}</button>
                </>
              )}
            </div>

            {/* What the store stands behind: a forest card */}
            <div data-rv="" className="pdp-conf">
              <p className="pdp-conf-h"><span aria-hidden="true"><Icon name={factRows[0].icon} size={24} /></span><span className="min-w-0">{factRows[0].text}</span></p>
              <ul>
                {factRows.slice(1).map((fact) => {
                  const inner = (
                    <>
                      <span aria-hidden="true"><Icon name={fact.icon} size={19} /></span>
                      <span className="min-w-0">{fact.text}</span>
                      {(fact.href || fact.page) && <Icon name="arrow" size={17} />}
                    </>
                  );
                  return (
                    <li key={fact.key} className="min-w-0">
                      {fact.href ? <a href={fact.href} target="_blank" rel="noopener noreferrer" className="pdp-conf-r">{inner}</a>
                        : fact.page ? <button type="button" onClick={() => { setActivePage(fact.page!); window.scrollTo(0, 0); }} className="pdp-conf-r">{inner}</button>
                        : <span className="pdp-conf-r">{inner}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* PIN code check: a white card */}
            <div data-rv="" className="aura-card mt-3 px-4">
              <DeliveryCheck product={product} quantity={qty} className="py-4" />
            </div>

            {/* Details: rows with a plus that turns into a minus, one open at a time, opening with a springy ease */}
            <div className="pdp-acc">
              {detailRows.map((item) => {
                const isOpen = open === item.key;
                return (
                  <div key={item.key}>
                    <h2 id={item.key === 'details' ? 'pdp-details-title' : undefined} className="m-0 text-[16px]! leading-[1.25]! tracking-normal!">
                      <button type="button" onClick={() => setOpen(isOpen ? null : item.key)} aria-expanded={isOpen} className="pdp-acc-b active:[transform:none]!">
                        <span className="flex-1 min-w-0">{item.title}</span>
                        <i aria-hidden="true" />
                      </button>
                    </h2>
                    <div className={`pdp-acc-p ${isOpen ? 'on' : ''}`}>
                      <div><div>{item.body}</div></div>
                    </div>
                  </div>
                );
              })}
              <div>
                <button type="button" onClick={toReviews} className="pdp-acc-b aura-num active:[transform:none]!">
                  <span className="flex-1 min-w-0">Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}</span>
                  <Icon name="arrow" size={18} className="shrink-0 rotate-90" />
                </button>
              </div>
            </div>
          </div>

          {/* Reviews: after the details on phones, full width under both columns on desktop */}
          <div className="pdp-wide min-w-0 mt-12 px-4 min-[900px]:px-0 min-[900px]:mt-16">
            {belowShown && <ProductReviews key={product.id} product={product} />}
          </div>
        </div>

        {/* Complete the look: its own section, only on combo / set products */}
        <div className="mt-12 px-4 min-[900px]:px-0 empty:hidden">
          {belowShown && <CompleteTheLook product={product} selectedSize={size} selectedColor={color} quantity={qty} onNeedSize={() => { requireSize(); }} />}
        </div>

        {belowShown && related.length > 0 && !accessoryPage && rail('Similar styles', related)}
        {belowShown && recentlyViewed.length > 0 && rail('Recently viewed', recentlyViewed)}

        <div className="mt-10 px-4 min-[900px]:px-0 flex flex-wrap items-center justify-center gap-2.5">
          {features.compare && !accessoryPage && (
            <button type="button" onClick={onCompare} aria-pressed={inCompare} className="aura-btn aura-btn-line aura-btn-sm">
              {inCompare ? <Icon name="check" size={18} /> : <GitCompare className="w-[18px] h-[18px]" strokeWidth={1.6} aria-hidden="true" />} {inCompare ? 'In compare' : 'Compare'}
            </button>
          )}
          <button type="button" onClick={shareWhatsApp} className="aura-btn aura-btn-line aura-btn-sm">
            <WhatsAppIcon className="w-[18px] h-[18px]" /> Share on WhatsApp
          </button>
        </div>
      </div>

      {/* The buy bar. Phones: a solid ink bar at the bottom (the tab bar is away on this page): the photo, the name and
          the rolling total, the buttons. Desktop: an ink pill at the bottom right once the main buttons are out of sight. */}
      <div className={`pdp-buy ${ctaAway ? 'on' : ''}`}>
        {soldOut ? (
          <button type="button" onClick={notifyRestock} className="aura-btn aura-btn-w">
            <Bell className="w-[18px] h-[18px]" strokeWidth={1.6} aria-hidden="true" /> Notify me when back
          </button>
        ) : (
          <>
            <img ref={barPhoto} src={getCleanImageUrl(images[imageIdx] || images[0], 160)} alt="" />
            <p className="aura-num">
              <span>{size && !oneSize ? <>{sizeWord} {size}{qty > 1 ? ` · Qty ${qty}` : ''} · </> : qty > 1 ? <>Qty {qty} · </> : null}{product.name}</span>
              <span><span className="sr-only">Total </span><Odometer value={total} roll={false} /></span>
            </p>
            <button type="button" onClick={() => (inBagNow ? openBag() : fromBar('add'))} className="aura-btn aura-btn-line">
              {justAdded ? <><Icon name="check" size={18} /> Added</> : inBagNow ? 'View bag' : 'Add to bag'}
            </button>
            <button type="button" onClick={() => fromBar('buy')} className="aura-btn">Buy now</button>
          </>
        )}
      </div>
      {/* Size sheet: opened by a bar button when no size is chosen yet. The shopper picks, then confirms. */}
      {sheetAction && (
        <BottomSheet title="Choose your size" onClose={() => setSheetAction(null)}>
          <div className="flex items-center gap-3 rounded-[22px] bg-sunken p-2.5">
            <img src={getCleanImageUrl(images[imageIdx] || images[0], 160)} alt="" className="w-14 aspect-[4/5] shrink-0 rounded-[14px] object-cover object-top" />
            <div className="min-w-0">
              <p className="text-[14px] leading-[1.35] font-medium text-ink line-clamp-2">{product.name}</p>
              <p className="aura-num mt-1 flex flex-wrap items-center gap-x-2">
                <span className="text-[17px] leading-5 font-extrabold text-ink">₹{(price * qty).toLocaleString('en-IN')}</span>
                {discount > 0 && <span className="text-[13px] font-bold text-sale">{discount}% off</span>}
                {qty > 1 && <span className="text-[13px] text-ink-muted">for {qty}</span>}
              </p>
            </div>
          </div>
          <div className="pdp-fld-h mt-3">
            <p className={sheetError && !size ? 'pdp-need' : 'aura-lbl'} role={sheetError && !size ? 'alert' : undefined}>
              {sheetError && !size ? <><AlertCircle className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />{chooseSizeText}</> : <>{sizeWord}{size && <b key={size} className="pdp-picked normal-case tracking-normal text-ink"> · {size}</b>}</>}
            </p>
            {womenSizing && <button type="button" onClick={() => setIsSizeGuideOpen(true)} className={`${quietLink} shrink-0`}>Size guide</button>}
          </div>
          <div className="rounded-full bg-sunken p-1 has-[.wrap]:rounded-[22px] has-[.wrap]:bg-transparent has-[.wrap]:p-0">{sizeChips(sheetError)}</div>
          <button type="button" onClick={confirmSheet} className="aura-btn aura-btn-w mt-5">{sheetAction === 'add' ? 'Add to bag' : 'Buy now'}</button>
          <Assurance variant="line" className="mt-3" />
        </BottomSheet>
      )}

      {/* Photo viewer: the photo on a white sheet, round sand controls */}
      {lightbox && (
<div className="pdp-vw fixed inset-0 z-[80] bg-surface flex items-center justify-center sag-fade" role="dialog" aria-modal="true" aria-label="Image viewer" onClick={() => { if (Date.now() - swipedAt.current > 400) setLightbox(false); }} {...viewerSwipe}>
          <button type="button" onClick={() => setLightbox(false)} aria-label="Close" autoFocus className={`absolute top-3 right-3 z-10 w-12 h-12 ${iconBtn}`}>
            <Icon name="close" />
          </button>
          {images.length > 1 && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous image" className={`absolute left-2 z-10 w-12 h-12 max-[639px]:top-auto max-[639px]:bottom-3 ${iconBtn}`}><ChevronLeft className="w-[22px] h-[22px]" strokeWidth={1.6} /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next image" className={`absolute right-2 z-10 w-12 h-12 max-[639px]:top-auto max-[639px]:bottom-3 ${iconBtn}`}><ChevronRight className="w-[22px] h-[22px]" strokeWidth={1.6} /></button>
              <span className="aura-num aura-tag absolute bottom-6 left-1/2 -translate-x-1/2 z-10" aria-hidden="true">{imageIdx + 1} / {images.length}</span>
            </>
          )}
          <img key={imageIdx} src={getCleanImageUrl(images[imageIdx], 1800)} alt={product.name} draggable={false} className="pdp-vw-ph max-h-[92vh] max-w-[94vw] rounded-[22px] object-contain max-[639px]:max-h-[calc(100dvh-150px)]" onClick={(e) => e.stopPropagation()} />
        </div>

      )}
    </div>
  );
};
