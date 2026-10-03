import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { FindMySize } from './FindMySize';
import { CompleteTheLook } from './CompleteTheLook';
import { isAccessory } from '../utils/looks';
import { KIDS_ALL, isKids, isToy, kindOf, sortKidsSizes } from '../utils/kids';
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
import { ProductReviews, Stars } from './ProductReviews';
import { ShimmerPDP } from './ShimmerPDP';
import { Product, ProductColor, ProductSize } from '../types';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { Baby, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, GitCompare, Heart, Minus, Plus, Share2, Tag, X } from 'lucide-react';
import { WhatsAppIcon } from './BrandIcons';
import { LockIcon, ReturnIcon, TruckIcon } from './StoreIcons';
import { Assurance, assuranceFacts } from './Assurance';

const MAX_QTY = 10;

type InfoRow = 'shipping' | 'returns';
type BuyAction = 'add' | 'buy';

const inr = (value: number) => `₹${value.toLocaleString('en-IN')}`;

/**
 * Bottom sheet: white, rounded top corners, grab handle, title row with a close button.
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
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 sag-fade" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85dvh] overflow-y-auto bg-white rounded-t-[20px] shadow-[var(--sag-shadow-bar)] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom focus:outline-none"
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-sunken-deep" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base leading-[22px] font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
            <X className="w-5 h-5" />
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
  const [open, setOpen] = useState<InfoRow | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  // Display only: the size / colour / quantity that was last added, so the button can offer "View bag" for it
  const [addedKey, setAddedKey] = useState('');
  const [needSize, setNeedSize] = useState(false);
  // Size sheet: which bar button opened it (null = closed)
  const [sheetAction, setSheetAction] = useState<BuyAction | null>(null);
  const [sheetError, setSheetError] = useState(false);
  const [moreOffers, setMoreOffers] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  // Photo strip: native scroll-snap; the active photo is read from the scroll position
  const strip = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef(0);
  const scrollLock = useRef(0);

  useEffect(() => {
    setImageIdx(0);
    setQty(1);
    setNeedSize(false);
    setAddedKey('');
    setJustAdded(false);
    setSheetAction(null);
    setMoreOffers(false);
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(false); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [lightbox]);

  useEffect(() => () => { if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current); }, []);

  // Desktop: the sticky photo column sits 16px under the site header, whatever height the header really has
  const [stickyTop, setStickyTop] = useState(96);
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header.sticky');
    if (!header) return;
    const measure = () => setStickyTop(Math.round(header.getBoundingClientRect().height) + 16);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  if (isLoading && !product) return <ShimmerPDP />;

  if (!product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 text-center bg-surface">
        <h1 className="font-display text-[28px] leading-8 text-ink">This style is no longer available</h1>
        <p className="text-sm text-ink-muted">It may have sold out or been removed. Explore what is in stock now.</p>
        <button onClick={() => navigateToCategory('All')} className="sag-btn-primary px-8 cursor-pointer">Shop all styles</button>
      </div>
    );
  }

  const images = (Array.isArray(product.images) ? product.images.filter(Boolean) : []).length
    ? product.images.filter(Boolean)
    : [product.image || ELEGANT_PLACEHOLDER_SVG];
  const colors = (product.colors || []).filter((c) => c && c.name);
  // Accessories are sold only through "Complete the look": no size finder, size chart, compare or similar outfits
  const accessoryPage = isAccessory(product);
  // Kids wear is sized by age and toys are one size: the women's size finder and size chart don't apply
  const kidsPage = isKids(product);
  const toyPage = isToy(product);
  const womenSizing = !accessoryPage && !kidsPage && !toyPage;
  const sizes = (kidsPage ? sortKidsSizes((product.sizes || []).map(String)) : (product.sizes || [])) as ProductSize[];
  // A single "Free Size" (toys, one-size pieces) needs no choosing
  const oneSize = sizes.length === 1 && sizes[0] === 'Free Size';
  const sizeWord = kidsPage ? 'Age' : 'Size';
  const chooseSizeText = kidsPage ? 'Please choose an age' : 'Please choose a size';
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
  const kind = (kidsPage || toyPage) ? String(kindOf(product) || '') : '';
  const occasionText = product.occasion || productOccasions(product).join(', ');
  const facts = ([
    product.fabric && [toyPage ? 'Material' : 'Fabric', product.fabric],
    !toyPage && product.fit && ['Fit', product.fit],
    !toyPage && occasionText && ['Occasion', occasionText],
    colors.length > 0 && colors[0].name !== 'Default' && [colors.length > 1 ? 'Colours' : 'Colour', colors.map((c) => c.name).join(', ')],
    kind && ['Type', kind],
    kidsPage && product.category && ['For', product.category],
    toyPage && product.ageRange && ['Suitable for', product.ageRange],
    sizes.length > 0 && !oneSize && [kidsPage ? 'Ages' : 'Sizes', sizes.join(', ')],
    product.washCare && ['Care', product.washCare],
  ].filter(Boolean) as Array<[string, string]>);
  const description = String(product.description || '').trim();
  // Offers: the pay-online lines are shown; the combo and the best coupon sit behind a disclosure
  const prepaidLines = [
    prepaidDiscount > 0 && `₹${prepaidDiscount} off at checkout when you pay online`,
    prepaidPercentHere && `${storeOffers.prepaidPercent}% off this style at checkout when you pay online`,
  ].filter(Boolean) as string[];
  const comboHere = comboOffer && !accessoryPage ? comboOffer : null;
  const extraOffers = (comboHere ? 1 : 0) + (bestCoupon ? 1 : 0);
  const showExtraOffers = extraOffers > 0 && (moreOffers || prepaidLines.length === 0);
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

  /** Shows photo `idx` and moves the strip to it. */
  const showImage = (idx: number, smooth = true) => {
    setImageIdx(idx);
    const el = strip.current;
    const slide = el?.children[idx] as HTMLElement | undefined;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !slide || !first) return;
    // While the strip travels to the chosen photo, the photos it passes must not become "active"
    scrollLock.current = Date.now() + 600;
    el.scrollTo({ left: slide.offsetLeft - first.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
  };
  const onStripScroll = () => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const el = strip.current;
      if (!el || Date.now() < scrollLock.current) return;
      const slides = Array.from(el.children) as HTMLElement[];
      if (!slides.length) return;
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

  const pickColor = (c: ProductColor) => {
    setColor(c);
    if (c.imageUrl) {
      const idx = images.indexOf(c.imageUrl);
      if (idx >= 0) showImage(idx);
    }
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
      showToast(kidsPage ? "Please choose your child's age size." : 'Please choose a size.', 'info');
      return false;
    }
    return true;
  };

  const onAdd = (sizeOverride?: ProductSize) => {
    const chosen = sizeOverride ?? size;
    if (soldOut || !requireSize(chosen)) return;
    addToCart(product, (chosen || 'Free Size') as ProductSize, color || undefined, qty, false);
    setJustAdded(true);
    setAddedKey(bagKey(chosen));
    setTimeout(() => setJustAdded(false), 1800);
  };

  const onBuy = (sizeOverride?: ProductSize) => {
    const chosen = sizeOverride ?? size;
    if (soldOut || !requireSize(chosen)) return;
    buyNow(product, (chosen || 'Free Size') as ProductSize, color || undefined, qty);
  };

  /** Buy bar buttons: with no size chosen yet they open the size sheet instead of scrolling the page. */
  const fromBar = (action: BuyAction) => {
    if (soldOut) return;
    if (sizeMissing(size)) {
      setSheetError(false);
      setSheetAction(action);
      return;
    }
    if (action === 'add') onAdd(); else onBuy();
  };
  const confirmSheet = () => {
    if (!size) { setSheetError(true); return; }
    const action = sheetAction;
    setSheetAction(null);
    if (action === 'add') onAdd(size); else if (action === 'buy') onBuy(size);
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

  const infoRows: Array<{ key: InfoRow; title: string; body: React.ReactNode }> = [
    {
      key: 'shipping',
      title: 'Shipping',
      body: (
        <div className="space-y-2">
          <p>We ship across India. Every order is prepaid online and a tracking number is emailed when it ships.</p>
          {freeShippingThreshold > 0 && <p>Free shipping on orders above ₹{freeShippingThreshold.toLocaleString('en-IN')}.</p>}
          <button onClick={() => setActivePage('shipping-policy')} className="sag-link">Read the shipping policy</button>
        </div>
      ),
    },
    {
      key: 'returns',
      title: 'Returns & exchanges',
      body: (
        <div className="space-y-2">
          <p>Once your order is delivered you can request a return from your account. Our team will contact you to arrange it.</p>
          <button onClick={() => setActivePage('return-policy')} className="sag-link">Read the return policy</button>
        </div>
      ),
    },
  ];

  // The red border appears only after the shopper tried to go on without a size
  const sizeChips = (error: boolean) => (
    <div className="flex flex-wrap gap-2">
      {sizes.map((s) => (
        <button key={s} type="button" onClick={() => pickSize(s)} aria-pressed={size === s} className={`sag-chip ${error && !size ? 'is-error' : ''}`}>{s}</button>
      ))}
    </div>
  );

  const rail = (title: string, items: Product[]) => (
    <section className="mt-8 lg:mt-12">
      <h2 className="text-[17px] leading-6 font-semibold text-ink">{title}</h2>
      <div className="sag-scroll-x scroll-px-4 sm:scroll-px-0 mt-3 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-3 overflow-x-auto lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible">
        {items.map((p) => (
          <div key={p.id} className="w-[44%] sm:w-52 shrink-0 lg:w-auto min-w-0"><ProductCard product={p} compact /></div>
        ))}
      </div>
    </section>
  );

  return (
    <div id="product-detail-page" className="bg-surface pb-4 md:pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col">
        {/* Breadcrumb: quiet, at the bottom on phones; at the top from tablet width */}
        <nav aria-label="Breadcrumb" className="order-last md:order-first mt-2 md:mt-0 md:py-2 -mx-1.5 px-1.5 text-xs text-ink-muted flex items-center gap-1 overflow-hidden">
          <button onClick={() => setActivePage('home')} className="min-h-11 min-w-11 -mx-1.5 px-1.5 inline-flex items-center justify-center hover:text-ink cursor-pointer shrink-0">Home</button>
          <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
          {kidsPage && (
            <>
              <button onClick={() => navigateToCategory(KIDS_ALL as any)} className="min-h-11 min-w-11 -mx-1.5 px-1.5 inline-flex items-center justify-center hover:text-ink cursor-pointer shrink-0">Kids</button>
              <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
            </>
          )}
          <button onClick={() => navigateToCategory((product.productType === 'accessory' ? 'All' : product.category) as any)} className="min-h-11 min-w-11 -mx-1.5 px-1.5 inline-flex items-center justify-center hover:text-ink cursor-pointer shrink-0">{product.productType === 'accessory' ? 'Shop' : product.category}</button>
          <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="text-ink truncate">{product.name}</span>
        </nav>

        {/* One grid, every block once. Phone: photos, buy box, reviews, details. Desktop: photos left; buy box and details right; reviews across. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-x-12">
          {/* Photos */}
          <div className="min-w-0 pt-2 md:pt-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">
            <div style={{ top: stickyTop }} className="lg:sticky lg:flex lg:gap-3 min-w-0">
              {images.length > 1 && (
                <div className="sag-scroll-x hidden lg:flex flex-col gap-2 overflow-y-auto max-h-[640px] w-20 shrink-0">
                  {images.map((img, idx) => (
                    <button
                      key={img + idx}
                      type="button"
                      onClick={() => showImage(idx)}
                      aria-label={`Show image ${idx + 1}`}
                      aria-current={idx === imageIdx}
                      className={`shrink-0 w-20 aspect-[4/5] rounded-chip overflow-hidden border-2 cursor-pointer ${idx === imageIdx ? 'border-ink' : 'border-transparent hover:border-control'}`}
                    >
                      <img src={getCleanImageUrl(img, 160)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div
                  ref={strip}
                  onScroll={onStripScroll}
                  className="sag-scroll-x scroll-px-4 sm:scroll-px-0 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto overscroll-x-contain"
                >
                  {images.map((img, idx) => (
                    <button
                      key={img + idx}
                      type="button"
                      onClick={() => { setImageIdx(idx); setLightbox(true); }}
                      aria-label={images.length > 1 ? `Open photo ${idx + 1} of ${images.length} full size` : 'Open full-size image'}
                      className={`shrink-0 ${images.length > 1 ? 'w-[84vw] sm:w-[58%]' : 'w-full sm:w-[58%]'} lg:w-full aspect-[4/5] rounded-control overflow-hidden bg-sunken cursor-zoom-in active:[transform:none]!`}
                    >
                      {idx === 0 ? (
                        <img src={getCleanImageUrl(img, 1100)} alt={product.name} data-vt-hero="" style={{ viewTransitionName: 'pdp-hero' } as React.CSSProperties} className="w-full h-full object-cover object-top" fetchPriority="high" decoding="async" />
                      ) : (
                        <img src={getCleanImageUrl(img, 1100)} alt={`${product.name}, photo ${idx + 1}`} className="w-full h-full object-cover object-top" loading="lazy" decoding="async" />
                      )}
                    </button>
                  ))}
                </div>
                {images.length > 1 && (
                  <div className="mt-2 h-5 flex items-center gap-3" aria-hidden="true">
                    <span className="flex flex-1 gap-1">
                      {images.map((_, idx) => <span key={idx} className={`h-[3px] flex-1 max-w-8 rounded-full ${idx === imageIdx ? 'bg-ink' : 'bg-line'}`} />)}
                    </span>
                    <span className="sag-num text-xs leading-4 text-ink-muted">{imageIdx + 1} / {images.length}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Buy box */}
          <div className="min-w-0 lg:col-start-2 lg:row-start-1">
            <div className="mt-2 lg:mt-0 flex items-start gap-1">
              <h1 className="flex-1 min-w-0 pt-2.5 font-sans text-lg leading-6 lg:text-[22px] lg:leading-7 font-semibold text-ink line-clamp-2">{product.name}</h1>
              <button
                type="button"
                onClick={() => toggleWishlist(product)}
                aria-label={fav ? 'Remove from wishlist' : 'Add to wishlist'}
                aria-pressed={fav}
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer ${fav ? 'bg-accent-tint text-accent' : 'text-ink hover:bg-sunken'}`}
              >
                <Heart className={`w-[22px] h-[22px] ${fav ? 'fill-accent text-accent' : ''}`} strokeWidth={1.75} />
              </button>
              <button type="button" onClick={share} aria-label="Share this style" className="-mr-2 w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-ink hover:bg-sunken cursor-pointer">
                <Share2 className="w-[22px] h-[22px]" strokeWidth={1.75} />
              </button>
            </div>

            {/* Rating: only with real approved reviews. The row keeps its height either way. */}
            <div className="min-h-5 flex items-center">
              {reviews.length > 0 && (
                <button onClick={() => document.getElementById('pdp-reviews')?.scrollIntoView({ behavior: 'smooth' })} className="-my-3 py-3 inline-flex items-center gap-1.5 text-sm leading-5 text-ink cursor-pointer">
                  <Stars rating={avgRating} />
                  <span className="sag-num underline underline-offset-2 decoration-line">{avgRating.toFixed(1)} · {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</span>
                </button>
              )}
            </div>

            <div className="sag-num mt-2 flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-[28px] leading-8 font-bold text-ink">₹{price.toLocaleString('en-IN')}</span>
              {mrp > price && <span className="text-[15px] leading-5 text-ink-faint"><span className="sr-only">MRP </span><span className="line-through">₹{mrp.toLocaleString('en-IN')}</span></span>}
              {discount > 0 && <span className="text-[15px] leading-5 font-bold text-sale">{discount}% off</span>}
            </div>
            <p className="sag-num mt-0.5 text-[13px] leading-[18px] text-ink-muted">
              {mrp > price && <span className="font-semibold text-sale">You save ₹{(mrp - price).toLocaleString('en-IN')} · </span>}Inclusive of all taxes
            </p>
            {toyPage && product.ageRange && (
              <p className="mt-2 flex items-center gap-1.5 text-sm leading-5 text-ink"><Baby className="w-4 h-4 shrink-0" aria-hidden="true" /> Suitable for {product.ageRange}</p>
            )}

            {/* Offers: only the ones that are live */}
            {(prepaidLines.length > 0 || extraOffers > 0) && (
              <div className="mt-4">
                {prepaidLines.length > 0 && (
                  <div className="rounded-control bg-sale-tint px-3 py-2.5 flex items-start gap-2.5 text-sm leading-5 font-semibold text-sale">
                    <Tag className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">{prepaidLines.map((line) => <span key={line} className="block">{line}</span>)}</span>
                  </div>
                )}
                {extraOffers > 0 && prepaidLines.length > 0 && (
                  <button type="button" onClick={() => setMoreOffers((v) => !v)} aria-expanded={moreOffers} className="sag-link gap-1">
                    {extraOffers} more {extraOffers === 1 ? 'offer' : 'offers'} <ChevronDown className={`w-4 h-4 transition-transform ${moreOffers ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                )}
                {showExtraOffers && (
                  <ul className={`space-y-2 text-sm leading-5 text-ink ${prepaidLines.length > 0 ? 'sag-drop' : ''}`}>
                    {comboHere && (
                      <li className="rounded-control bg-sale-tint px-3 py-2.5 flex items-start gap-2.5 font-semibold text-sale">
                        <Tag className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> Buy {comboHere.minItems} or more outfits and save {comboHere.percent}%
                      </li>
                    )}
                    {bestCoupon && (
                      <li className="flex items-center justify-between gap-3 rounded-control border-[1.5px] border-dashed border-sale-line bg-sale-tint pl-3 pr-1.5 py-1.5">
                        <span className="min-w-0">
                          <span className="block text-[13px] leading-[18px] font-bold text-ink break-all">{bestCoupon.code}</span>
                          <span className="sag-num block text-[13px] leading-[18px] text-sale">{bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue}` : `${bestCoupon.discountValue}%`} off{bestCoupon.minOrderValue ? ` on orders above ₹${bestCoupon.minOrderValue.toLocaleString('en-IN')}` : ''}</span>
                        </span>
                        <button type="button" onClick={() => navigator.clipboard?.writeText(bestCoupon.code).then(() => showToast(`Code ${bestCoupon.code} copied.`, 'success')).catch(() => {})}
                          aria-label={`Copy code ${bestCoupon.code}`}
                          className="shrink-0 h-11 px-3 rounded-chip text-sm font-semibold text-ink inline-flex items-center gap-1.5 hover:bg-white cursor-pointer">
                          <Copy className="w-4 h-4" aria-hidden="true" /> Copy
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Real counts for today, same thresholds as before. No line (and no empty band) when there is nothing to say. */}
            {todayStats && (todayStats.wishlists >= 2 || todayStats.views >= 5) && (
              <p className="mt-3 flex items-center gap-1.5 text-[13px] leading-[18px] text-ink-muted">
                {todayStats.wishlists >= 2
                  ? <><Heart className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {todayStats.wishlists} people saved this today</>
                  : <><Eye className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {todayStats.views} people viewed this today</>}
              </p>
            )}

            {colors.length > 1 && (
              <div className="mt-4">
                <p className="text-sm leading-5 text-ink"><span className="text-ink-muted">Colour:</span> <span className="font-semibold">{color?.name}</span></p>
                <div className="sag-scroll-x scroll-px-4 sm:scroll-px-0 mt-2 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2.5 overflow-x-auto pt-1 pb-1">
                  {colors.map((c) => {
                    const selected = color?.name === c.name;
                    return (
                      <button key={c.name} type="button" onClick={() => pickColor(c)} aria-label={c.name} aria-pressed={selected} className="shrink-0 w-[64px] flex flex-col items-center cursor-pointer">
                        {c.imageUrl ? (
                          <span className={`block w-[60px] rounded-[12px] p-0.5 border-2 ${selected ? 'border-ink' : 'border-transparent'}`}>
                            <img src={getCleanImageUrl(c.imageUrl, 160)} alt="" loading="lazy" className="block w-full aspect-[4/5] rounded-[8px] object-cover object-top bg-sunken" />
                          </span>
                        ) : (
                          <span className={`flex w-12 h-12 rounded-full p-0.5 border-2 ${selected ? 'border-ink' : 'border-transparent'}`}>
                            <span className="block w-full h-full rounded-full border border-line" style={{ backgroundColor: c.hex || '#eee' }} />
                          </span>
                        )}
                        <span className={`mt-1 w-full truncate text-center text-xs leading-4 ${selected ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {sizes.length > 0 && !oneSize && (
              <div id="pdp-size-selector" className="mt-3 scroll-mt-24">
                <div className="flex items-center justify-between gap-3 min-h-11">
                  <p className={`text-sm leading-5 ${needSize && !size ? 'text-danger font-semibold' : 'text-ink'}`} aria-live="polite">
                    {needSize && !size ? chooseSizeText : <><span className="text-ink-muted">{sizeWord}:</span> <span className="font-semibold">{size || 'Select'}</span></>}
                  </p>
                  {womenSizing && (
                    <span className="flex items-center gap-4 shrink-0">
                      {features.findMySize && <button type="button" onClick={() => setFindSizeOpen((v) => !v)} aria-expanded={findSizeOpen} className="sag-link">Find my size</button>}
                      <button type="button" onClick={() => setIsSizeGuideOpen(true)} className="sag-link">Size guide</button>
                    </span>
                  )}
                </div>
                {sizeChips(needSize)}
                {kidsPage && (
                  <p className="mt-2.5 flex items-start gap-2 text-[13px] leading-[18px] text-ink-muted">
                    <Baby className="w-4 h-4 shrink-0 text-ink" aria-hidden="true" />
                    <span><span className="font-semibold text-ink">Sized by age · {sizes[0]} to {sizes[sizes.length - 1]}.</span> If your child is between two sizes, pick the bigger one.</span>
                  </p>
                )}
              </div>
            )}

            {findSizeOpen && sizes.length > 0 && womenSizing && (
              <FindMySize sizes={sizes} onPick={(sz) => { pickSize(sz as ProductSize); setFindSizeOpen(false); }} onClose={() => setFindSizeOpen(false)} onOpenChart={() => setIsSizeGuideOpen(true)} />
            )}

            {!soldOut && (
              <div className="mt-4 flex items-center gap-4">
                <div className="inline-flex items-center rounded-control border-[1.5px] border-control bg-white" role="group" aria-label="Quantity">
                  <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity" className="w-11 h-11 flex items-center justify-center text-ink disabled:text-sunken-deep cursor-pointer disabled:cursor-not-allowed">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="sag-num w-8 text-center text-[15px] font-semibold text-ink" aria-live="polite">{qty}</span>
                  <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Increase quantity" className="w-11 h-11 flex items-center justify-center text-ink disabled:text-sunken-deep cursor-pointer disabled:cursor-not-allowed">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="sag-num text-sm leading-5 min-w-0">
                  {qty > 1 && (
                    <p className="text-ink">₹{price.toLocaleString('en-IN')} × {qty} = <span className="font-semibold">₹{(price * qty).toLocaleString('en-IN')}</span></p>
                  )}
                  {stock <= 5 && <p className="font-semibold text-sale">Only {stock} left</p>}
                </div>
              </div>
            )}

            {soldOut && <p className="mt-4 text-sm leading-5 font-semibold text-danger">This style is sold out right now.</p>}
            {soldOut && restockAsk && !user?.email && (
              <form onSubmit={(e) => { e.preventDefault(); notifyRestock(); }} className="mt-3 sag-drop">
                <label htmlFor="pdp-restock-email" className="sag-label">Email for the restock alert</label>
                <div className="flex gap-2">
                  <input id="pdp-restock-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" required autoFocus value={restockEmail} onChange={(e) => setRestockEmail(e.target.value)} placeholder="you@example.com"
                    className="sag-input flex-1 min-w-0" />
                  <button type="submit" className="sag-btn-outline shrink-0 px-4 text-sm cursor-pointer">Notify me</button>
                </div>
              </form>
            )}

            {/* Inline buttons from tablet width; on phones the fixed bar below carries them */}
            <div className="mt-6 hidden md:block">
              <div className="flex gap-3">
                {soldOut ? (
                  <button type="button" onClick={notifyRestock} className="sag-btn-primary flex-1 gap-2 cursor-pointer">
                    <Bell className="w-[18px] h-[18px]" aria-hidden="true" /> Notify me when back
                  </button>
                ) : (
                  <>
                    <button id="pdp-add-to-bag" type="button" onClick={() => (inBagNow ? openBag() : onAdd())} className="sag-btn-outline flex-1 gap-2 cursor-pointer">
                      {justAdded ? <><Check className="w-[18px] h-[18px]" aria-hidden="true" /> Added to bag</> : inBagNow ? 'View bag' : 'Add to bag'}
                    </button>
                    <button id="pdp-buy-now" type="button" onClick={() => onBuy()} className="sag-btn-primary flex-[1.3] cursor-pointer">Buy now</button>
                  </>
                )}
              </div>
              <Assurance variant="line" className="mt-3" />
            </div>

            {/* What the store stands behind, and the PIN code check, in one block */}
            <div className="mt-6 rounded-card border border-brand-line bg-brand-wash px-4">
              <div className="sag-row border-brand-line">
                <span className="shrink-0 flex text-brand"><LockIcon className="w-5 h-5" mono /></span>
                <span className="flex-1 min-w-0">
                  {assurance.payment}
                  <span className="block text-[13px] leading-[18px] font-normal text-ink-muted">Your order is confirmed only after the payment is verified.</span>
                </span>
              </div>
              <button type="button" onClick={() => { setActivePage('return-policy'); window.scrollTo(0, 0); }} className="sag-row border-brand-line w-full text-left cursor-pointer">
                <span className="shrink-0 flex text-brand"><ReturnIcon className="w-5 h-5" mono /></span>
                <span className="flex-1 min-w-0">{assurance.returns}</span>
                <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => { setActivePage('shipping-policy'); window.scrollTo(0, 0); }} className="sag-row border-brand-line w-full text-left cursor-pointer">
                <span className="shrink-0 flex text-brand"><TruckIcon className="w-5 h-5" mono /></span>
                <span className="flex-1 min-w-0">
                  {assurance.delivery}
                  <span className="sag-num block text-[13px] leading-[18px] font-normal text-ink-muted">
                    A tracking number is emailed when your order ships.{freeShippingThreshold > 0 ? ` Free shipping on orders above ${inr(freeShippingThreshold)}.` : ''}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
              </button>
              <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I have a question about "${product.name}".`)} target="_blank" rel="noopener noreferrer" className="sag-row border-brand-line">
                <span className="shrink-0 flex"><WhatsAppIcon className="w-5 h-5" /></span>
                <span className="flex-1 min-w-0">
                  {assurance.help}
                  <span className="block text-[13px] leading-[18px] font-normal text-ink-muted">Ask us about size, fabric or delivery.</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
              </a>
              <DeliveryCheck product={product} quantity={qty} className="border-t border-brand-line py-3" />
            </div>
          </div>

          {/* Reviews: before the details on phones, full width under both columns on desktop */}
          <div className="min-w-0 lg:col-span-2 lg:row-start-3">
            <ProductReviews key={product.id} product={product} />
          </div>

          {/* Details */}
          <div className="min-w-0 lg:col-start-2 lg:row-start-2">
            <section aria-labelledby="pdp-details-title" className="mt-8">
              <h2 id="pdp-details-title" className="text-[17px] leading-6 font-semibold text-ink">{toyPage ? 'About this toy' : 'Product details'}</h2>
              {facts.length > 0 && (
                <dl className="mt-3 grid grid-cols-[104px_minmax(0,1fr)] text-sm leading-5 border-b border-line">
                  {facts.map(([label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="border-t border-line py-2.5 pr-3 text-ink-muted">{label}</dt>
                      <dd className="border-t border-line py-2.5 text-ink break-words">{value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
              {description && (
                <div className="mt-3">
                  <p className={`text-[15px] leading-[22px] text-ink whitespace-pre-line break-words ${descOpen ? '' : 'line-clamp-5'}`}>{description}</p>
                  {description.length > 220 && (
                    <button type="button" onClick={() => setDescOpen((v) => !v)} aria-expanded={descOpen} className="sag-link">{descOpen ? 'Show less' : 'Read more'}</button>
                  )}
                </div>
              )}
              {facts.length === 0 && !description && (
                <p className="mt-3 text-sm leading-5 text-ink-muted">Details on request — ask us on WhatsApp.</p>
              )}
            </section>

            <div className="mt-4 border-b border-line">
              {infoRows.map((item) => {
                const isOpen = open === item.key;
                return (
                  <div key={item.key} className="border-t border-line">
                    <button type="button" onClick={() => setOpen(isOpen ? null : item.key)} aria-expanded={isOpen} className="w-full min-h-14 flex items-center justify-between gap-3 text-left cursor-pointer">
                      <span className="text-base leading-[22px] font-semibold text-ink">{item.title}</span>
                      <ChevronDown className={`w-5 h-5 shrink-0 text-ink transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {isOpen && <div className="pb-3 text-sm leading-5 text-ink-muted sag-drop">{item.body}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Complete the look: its own section, only on combo / set products */}
        <CompleteTheLook product={product} selectedSize={size} selectedColor={color} quantity={qty} onNeedSize={() => { requireSize(); }} />

        {related.length > 0 && !accessoryPage && rail(kidsPage ? `More ${product.category}` : toyPage ? 'More toys' : 'Similar styles', related)}
        {recentlyViewed.length > 0 && rail('Recently viewed', recentlyViewed)}

        <div className="mt-6 flex flex-wrap items-center gap-x-6">
          {features.compare && !accessoryPage && (
            <button type="button" onClick={onCompare} aria-pressed={inCompare} className="sag-link gap-1.5">
              {inCompare ? <Check className="w-4 h-4" aria-hidden="true" /> : <GitCompare className="w-4 h-4" aria-hidden="true" />} {inCompare ? 'In compare' : 'Compare'}
            </button>
          )}
          <button type="button" onClick={shareWhatsApp} className="sag-link gap-1.5">
            <WhatsAppIcon className="w-4 h-4" /> Share on WhatsApp
          </button>
        </div>
      </div>

      {/* Phone buy bar: the price and both buttons stay on screen */}
      <div className="sag-bar md:hidden fixed left-0 right-0 bottom-0 z-40">
        {soldOut ? (
          <button type="button" onClick={notifyRestock} className="sag-btn-primary w-full gap-2 cursor-pointer">
            <Bell className="w-[18px] h-[18px]" aria-hidden="true" /> Notify me when back
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <p className="sag-num shrink-0 min-w-[60px] pr-1">
              <span className="block text-base leading-5 font-bold text-ink">₹{(price * qty).toLocaleString('en-IN')}</span>
              {discount > 0
                ? <span className="block text-xs leading-4 font-semibold text-sale">{discount}% off</span>
                : <span className="block text-xs leading-4 text-ink-muted">incl. taxes</span>}
            </p>
            <button type="button" onClick={() => (inBagNow ? openBag() : fromBar('add'))} className="sag-btn-outline flex-1 min-w-0 px-2 text-[15px] gap-1.5 whitespace-nowrap cursor-pointer">
              {justAdded ? <><Check className="w-4 h-4" aria-hidden="true" /> Added</> : inBagNow ? 'View bag' : 'Add to bag'}
            </button>
            <button type="button" onClick={() => fromBar('buy')} className="sag-btn-primary flex-[1.3] min-w-0 px-2 whitespace-nowrap cursor-pointer">Buy now</button>
          </div>
        )}
      </div>

      {/* Size sheet: opened by a bar button when no size is chosen yet. The shopper picks, then confirms. */}
      {sheetAction && (
        <BottomSheet title={kidsPage ? "Choose your child's age" : 'Choose your size'} onClose={() => setSheetAction(null)}>
          <div className="flex items-center gap-3">
            <img src={getCleanImageUrl(images[0], 160)} alt="" className="w-14 aspect-[4/5] shrink-0 rounded-chip object-cover object-top bg-sunken" />
            <div className="min-w-0">
              <p className="text-sm leading-5 font-medium text-ink line-clamp-2">{product.name}</p>
              <p className="sag-num mt-0.5 flex items-baseline gap-1.5">
                <span className="text-base leading-5 font-bold text-ink">₹{(price * qty).toLocaleString('en-IN')}</span>
                {discount > 0 && <span className="text-[13px] font-bold text-sale">{discount}% off</span>}
                {qty > 1 && <span className="text-[13px] text-ink-muted">for {qty}</span>}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 min-h-11">
            <p className={`text-sm leading-5 ${sheetError && !size ? 'text-danger font-semibold' : 'text-ink'}`} role={sheetError && !size ? 'alert' : undefined}>
              {sheetError && !size ? chooseSizeText : <><span className="text-ink-muted">{sizeWord}:</span> <span className="font-semibold">{size || 'Select'}</span></>}
            </p>
            {womenSizing && <button type="button" onClick={() => setIsSizeGuideOpen(true)} className="sag-link shrink-0">Size guide</button>}
          </div>
          {sizeChips(sheetError)}
          {kidsPage && <p className="mt-2.5 text-[13px] leading-[18px] text-ink-muted">If your child is between two sizes, pick the bigger one.</p>}
          <button type="button" onClick={confirmSheet} className="sag-btn-primary mt-4 w-full cursor-pointer">{sheetAction === 'add' ? 'Add to bag' : 'Buy now'}</button>
          <Assurance variant="line" className="mt-3" />
        </BottomSheet>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-dark/95 flex items-center justify-center sag-fade" role="dialog" aria-modal="true" aria-label="Image viewer" onClick={() => setLightbox(false)}>
          <button type="button" onClick={() => setLightbox(false)} aria-label="Close" autoFocus className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5 text-white" />
          </button>
          {images.length > 1 && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous image" className="absolute left-3 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center cursor-pointer"><ChevronLeft className="w-5 h-5 text-white" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next image" className="absolute right-3 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center cursor-pointer"><ChevronRight className="w-5 h-5 text-white" /></button>
              <span className="sag-num absolute bottom-5 left-1/2 -translate-x-1/2 text-[13px] text-on-dark-muted" aria-hidden="true">{imageIdx + 1} / {images.length}</span>
            </>
          )}
          <img src={getCleanImageUrl(images[imageIdx], 1800)} alt={product.name} className="max-h-[92vh] max-w-[94vw] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};
