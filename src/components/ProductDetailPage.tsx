import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { FindMySize } from './FindMySize';
import { CompleteTheLook } from './CompleteTheLook';
import { isAccessory } from '../utils/looks';
import { KIDS_ALL, TOYS, isKids, isToy, kindOf, sortKidsSizes } from '../utils/kids';
import { DeliveryCheck } from './DeliveryCheck';
import { categoryToSlug } from '../utils/slugHelper';
import { prepaidPercentApplies } from '../utils/prepaid';
import { trackItem } from '../utils/visitorTracker';
import { doc as fsDocRef, getDoc as fsGetDoc } from 'firebase/firestore';
import { apiPost } from '../lib/api';
import { useDiscovery } from '../utils/discovery';
import { similarProducts } from '../utils/recommend';
import { toggleCompare, useShopperMemory } from '../utils/shopperMemory';
import { productColourFamilies, productOccasions } from '../utils/smartQuery';
import { useAdmin } from '../context/AdminContext';
import { useAuth } from '../context/AuthContext';
import { ProductCard } from './ProductCard';
import { ProductReviews } from './ProductReviews';
import { ShimmerPDP } from './ShimmerPDP';
import { ProductColor, ProductSize } from '../types';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { Baby, Blocks, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Heart, Lock, Minus, Plus, RotateCcw, Ruler, Share2, ShoppingBag, Star, Tag, Truck, X, Zap, GitCompare } from 'lucide-react';
import { WhatsAppIcon } from './BrandIcons';
import { BagIcon } from './BrandIcons';
import { HeartIcon, LockIcon, OrdersIcon, QualityIcon, ReturnIcon, TruckIcon } from './StoreIcons';

const MAX_QTY = 10;

type Accordion = 'details' | 'fabric' | 'shipping' | 'returns';

export const ProductDetailPage: React.FC = () => {
  const {
    products = [], selectedProductId, selectedProduct, addToCart, buyNow, toggleWishlist, isInWishlist,
    setIsSizeGuideOpen, setActivePage, navigateToCategory, showToast, isLoading, coupons = [], comboOffer,
    storeOffers, freeShippingThreshold,
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
  const [open, setOpen] = useState<Accordion | null>('details');
  const [lightbox, setLightbox] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const [needSize, setNeedSize] = useState(false);

  useEffect(() => {
    setImageIdx(0);
    setQty(1);
    setNeedSize(false);
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

  if (isLoading && !product) return <ShimmerPDP />;

  if (!product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 text-center bg-[#FBF7F3]">
        <h1 className="font-serif text-3xl text-[#4B1D3F]">This style is no longer available</h1>
        <p className="text-sm text-[#2A1A26]/65">It may have sold out or been removed. Explore what is in stock now.</p>
        <button onClick={() => navigateToCategory('All')} className="sag-btn-primary h-12 px-8 text-xs uppercase tracking-[0.16em] cursor-pointer">Shop all styles</button>
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
  // "Why you'll love it": only facts entered for this product
  const highlights = [
    product.fabric && `${toyPage ? 'Material' : 'Fabric'}: ${product.fabric}`,
    !toyPage && product.fit && `Fit: ${product.fit}`,
    !toyPage && (product.occasion || productOccasions(product).length > 0) && `Made for: ${product.occasion || productOccasions(product).join(', ')}`,
    colors.length > 0 && colors[0].name !== 'Default' && `Colour: ${colors.map((c) => c.name).join(', ')}`,
    kidsPage && kindOf(product) && `Type: ${kindOf(product)}`,
    toyPage && kindOf(product) && `Type: ${kindOf(product)}`,
    toyPage && product.ageRange && `Suitable for: ${product.ageRange}`,
    sizes.length > 0 && !oneSize && `${kidsPage ? 'Ages' : 'Sizes'}: ${sizes.join(', ')}`,
    product.washCare && `Care: ${product.washCare}`,
  ].filter(Boolean) as string[];
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

  const go = (delta: number) => setImageIdx((i) => (i + delta + images.length) % images.length);

  const pickColor = (c: ProductColor) => {
    setColor(c);
    if (c.imageUrl) {
      const idx = images.indexOf(c.imageUrl);
      if (idx >= 0) setImageIdx(idx);
    }
  };

  const requireSize = () => {
    if (sizes.length > 0 && !size && !oneSize) {
      setNeedSize(true);
      document.getElementById('pdp-size-selector')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast(kidsPage ? "Please choose your child's age size." : 'Please choose a size.', 'info');
      return false;
    }
    return true;
  };

  const onAdd = () => {
    if (soldOut || !requireSize()) return;
    addToCart(product, (size || 'Free Size') as ProductSize, color || undefined, qty, false);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
  };

  const onBuy = () => {
    if (soldOut || !requireSize()) return;
    buyNow(product, (size || 'Free Size') as ProductSize, color || undefined, qty);
  };

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

  const accordionItems: Array<{ key: Accordion; title: string; body: React.ReactNode }> = [
    {
      key: 'details',
      title: toyPage ? 'About this toy' : 'Product details',
      body: (
        <div className="space-y-3">
          {product.description && <p>{product.description}</p>}
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
            {(kidsPage || toyPage) && kindOf(product) && <><dt className="text-[#2A1A26]/65">Type</dt><dd>{kindOf(product)}</dd></>}
            {kidsPage && <><dt className="text-[#2A1A26]/65">For</dt><dd>{product.category}</dd></>}
            {product.fit && <><dt className="text-[#2A1A26]/65">Fit</dt><dd>{product.fit}</dd></>}
            {product.occasion && <><dt className="text-[#2A1A26]/65">Occasion</dt><dd>{product.occasion}</dd></>}
          </dl>
        </div>
      ),
    },
    {
      key: 'fabric',
      title: toyPage ? 'Material & care' : 'Fabric & care',
      body: (
        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
          <dt className="text-[#2A1A26]/65">{toyPage ? 'Material' : 'Fabric'}</dt><dd>{product.fabric || 'Details on request — ask us on WhatsApp.'}</dd>
          {toyPage && product.ageRange && <><dt className="text-[#2A1A26]/65">Suitable for</dt><dd>{product.ageRange}</dd></>}
          {product.washCare && <><dt className="text-[#2A1A26]/65">Care</dt><dd>{product.washCare}</dd></>}
        </dl>
      ),
    },
    {
      key: 'shipping',
      title: 'Shipping',
      body: (
        <div className="space-y-2">
          <p>We ship across India. Every order is prepaid online and a tracking number is emailed when it ships.</p>
          {freeShippingThreshold > 0 && <p>Free shipping on orders above ₹{freeShippingThreshold.toLocaleString('en-IN')}.</p>}
          <button onClick={() => setActivePage('shipping-policy')} className="text-[#4B1D3F] underline underline-offset-2 cursor-pointer">Read the shipping policy</button>
        </div>
      ),
    },
    {
      key: 'returns',
      title: 'Returns & exchanges',
      body: (
        <div className="space-y-2">
          <p>Once your order is delivered you can request a return from your account. Our team will contact you to arrange it.</p>
          <button onClick={() => setActivePage('return-policy')} className="text-[#4B1D3F] underline underline-offset-2 cursor-pointer">Read the return policy</button>
        </div>
      ),
    },
  ];

  return (
    <div id="product-detail-page" className="bg-[#FBF7F3] pb-28 md:pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="py-4 text-xs text-[#2A1A26]/65 flex items-center gap-1.5 overflow-hidden">
          <button onClick={() => setActivePage('home')} className="hover:text-[#4B1D3F] cursor-pointer shrink-0">Home</button>
          <ChevronRight className="w-3 h-3 shrink-0" />
          {kidsPage && (
            <>
              <button onClick={() => navigateToCategory(KIDS_ALL as any)} className="hover:text-[#4B1D3F] cursor-pointer shrink-0">Kids</button>
              <ChevronRight className="w-3 h-3 shrink-0" />
            </>
          )}
          <button onClick={() => navigateToCategory((product.productType === 'accessory' ? 'All' : product.category) as any)} className="hover:text-[#4B1D3F] cursor-pointer shrink-0">{product.productType === 'accessory' ? 'Shop' : product.category}</button>
          <ChevronRight className="w-3 h-3 shrink-0" />
          <span className="text-[#2A1A26] truncate">{product.name}</span>
        </nav>

        <div className="grid gap-6 lg:gap-12 lg:grid-cols-12">
          {/* Gallery (min-w-0: the photo strip scrolls inside the screen, however many photos there are) */}
          <div className="lg:col-span-7 min-w-0">
            <div className="lg:sticky lg:top-36 flex flex-col-reverse gap-3 lg:flex-row min-w-0">
              {images.length > 1 && (
                <div className="sag-scroll-x flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto lg:max-h-[640px] lg:w-20 shrink-0 min-w-0 max-w-full scroll-px-0 pb-1 lg:pb-0">
                  {images.map((img, idx) => (
                    <button
                      key={img + idx}
                      onClick={() => setImageIdx(idx)}
                      aria-label={`Show image ${idx + 1}`}
                      aria-current={idx === imageIdx}
                      className={`shrink-0 w-16 lg:w-20 aspect-[4/5] rounded-xl overflow-hidden border-2 transition-colors cursor-pointer ${idx === imageIdx ? 'border-[#4B1D3F]' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    >
                      <img src={getCleanImageUrl(img, 160)} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              <div
                className="relative flex-1 min-w-0 aspect-[4/5] -mx-4 sm:mx-0 rounded-none sm:rounded-3xl overflow-hidden bg-[#F3EEF8]"
                onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
                onTouchEnd={(e) => {
                  if (touchX === null) return;
                  const d = touchX - e.changedTouches[0].clientX;
                  if (d > 45) go(1);
                  if (d < -45) go(-1);
                  setTouchX(null);
                }}
              >
                <button type="button" onClick={() => setLightbox(true)} className="block w-full h-full cursor-zoom-in" aria-label="Open full-size image">
                  <img key={images[imageIdx]} src={getCleanImageUrl(images[imageIdx], 1100)} alt={product.name} data-vt-hero="" style={{ viewTransitionName: 'pdp-hero' } as React.CSSProperties} className="w-full h-full object-cover object-top sag-fade" fetchPriority="high" />
                </button>
                {images.length > 1 && (
                  <span className="absolute top-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[#4B1D3F] lg:hidden" aria-hidden="true">{imageIdx + 1} / {images.length}</span>
                )}
                {images.length > 1 && images.length <= 8 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 lg:hidden" aria-hidden="true">
                    {images.map((_, idx) => <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === imageIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`} />)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="lg:col-span-5 min-w-0">
            <p className="sag-eyebrow">{(kidsPage || toyPage) && kindOf(product) ? `${toyPage ? TOYS : product.category} · ${kindOf(product)}` : product.category}</p>
            <div className="mt-2 flex items-start justify-between gap-3">
              <h1 className="font-serif text-[28px] sm:text-4xl text-[#2A1A26] leading-[1.15]">{product.name}</h1>
              <button
                type="button"
                onClick={() => toggleWishlist(product)}
                aria-label={fav ? 'Remove from wishlist' : 'Add to wishlist'}
                aria-pressed={fav}
                className={`md:hidden mt-1 w-11 h-11 shrink-0 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${fav ? 'border-[#C2477A]/30 bg-[#F7E4EA]' : 'border-[#4B1D3F]/15 bg-white'}`}
              >
                {fav ? <Heart className="w-5 h-5 fill-[#C2477A] text-[#C2477A]" /> : <HeartIcon className="w-[22px] h-[22px]" />}
              </button>
            </div>

            {reviews.length > 0 && (
              <button onClick={() => document.getElementById('pdp-reviews')?.scrollIntoView({ behavior: 'smooth' })} className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#2A1A26]/70 cursor-pointer">
                <span className="flex">{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-4 h-4 ${i <= Math.round(avgRating) ? 'fill-[#C5A46D] text-[#C5A46D]' : 'text-[#C5A46D]/40'}`} />)}</span>
                <span>{avgRating.toFixed(1)} · {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</span>
              </button>
            )}

            <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[32px] leading-none font-semibold text-[#4B1D3F]">₹{price.toLocaleString('en-IN')}</span>
              {mrp > price && <span className="text-base text-[#2A1A26]/55">MRP <span className="line-through">₹{mrp.toLocaleString('en-IN')}</span></span>}
              {discount > 0 && <span className="rounded-full bg-[#F7E4EA] px-2.5 py-0.5 text-xs font-semibold text-[#8A2E55]">{discount}% off</span>}
            </div>
            <p className="mt-1.5 text-xs text-[#2A1A26]/65">
              {mrp > price && <span className="font-semibold text-emerald-700">You save ₹{(mrp - price).toLocaleString('en-IN')} · </span>}Inclusive of all taxes
            </p>
            {toyPage && (
              <div className="mt-4 flex flex-wrap gap-2" aria-label="About this toy">
                {product.ageRange && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3EEF8] px-3 py-1.5 text-sm text-[#4B1D3F]"><Baby className="w-4 h-4" /> Suitable for {product.ageRange}</span>}
                {kindOf(product) && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F7E4EA] px-3 py-1.5 text-sm text-[#8A2E55]"><Blocks className="w-4 h-4" /> {kindOf(product)}</span>}
                {product.fabric && <span className="inline-flex items-center rounded-full border border-[#4B1D3F]/15 bg-white px-3 py-1.5 text-sm text-[#2A1A26]/80">Material: {product.fabric}</span>}
              </div>
            )}
            {kidsPage && sizes.length > 0 && !oneSize && (
              <div className="mt-4 rounded-2xl bg-[#F3EEF8] px-4 py-3 text-sm text-[#2A1A26]/80 flex items-start gap-2.5">
                <Baby className="w-5 h-5 shrink-0 text-[#4B1D3F] mt-0.5" />
                <p>
                  <span className="font-medium text-[#4B1D3F]">Sized by age · {sizes[0]} to {sizes[sizes.length - 1]}</span>
                  <span className="block">Choose your child's age. If they are between two sizes, pick the bigger one.</span>
                </p>
              </div>
            )}
            {todayStats && (todayStats.wishlists >= 2 || todayStats.views >= 5) && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#F3EEF8] px-3 py-1 text-xs text-[#4B1D3F]">
                {todayStats.wishlists >= 2 ? `${todayStats.wishlists} people saved this today` : `${todayStats.views} people viewed this today`}
              </p>
            )}

            {colors.length > 1 && (
              <div className="mt-6">
                <p className="text-sm text-[#2A1A26]"><span className="text-[#2A1A26]/65">Colour:</span> {color?.name}</p>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {colors.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => pickColor(c)}
                      aria-label={c.name}
                      aria-pressed={color?.name === c.name}
                      className={`w-10 h-10 rounded-full p-0.5 border-2 transition-colors cursor-pointer ${color?.name === c.name ? 'border-[#4B1D3F]' : 'border-transparent hover:border-[#4B1D3F]/30'}`}
                    >
                      <span className="block w-full h-full rounded-full bg-cover bg-center border border-black/5" style={{ backgroundColor: c.hex || '#eee', backgroundImage: c.imageUrl ? `url(${getCleanImageUrl(c.imageUrl, 80)})` : undefined }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sizes.length > 0 && !oneSize && (
              <div id="pdp-size-selector" className="mt-6">
                <div className="flex items-center justify-between">
                  <p className={`text-sm ${needSize ? 'text-rose-700' : 'text-[#2A1A26]'}`}>
                    <span className="text-[#2A1A26]/65">{sizeWord}:</span> {size || (needSize ? (kidsPage ? 'Please choose an age' : 'Please choose a size') : 'Select')}
                  </p>
                  <span className="flex items-center gap-3">
                    {features.findMySize && womenSizing && <button onClick={() => setFindSizeOpen((v) => !v)} className="text-xs font-semibold text-[#4B1D3F] underline underline-offset-2 cursor-pointer">Find my size</button>}
                    {womenSizing && (
                      <button onClick={() => setIsSizeGuideOpen(true)} className="inline-flex items-center gap-1 text-xs text-[#4B1D3F] underline underline-offset-2 cursor-pointer">
                        <Ruler className="w-3.5 h-3.5" /> Size guide
                      </button>
                    )}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {sizes.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSize(s); setNeedSize(false); }}
                      aria-pressed={size === s}
                      className={`min-w-[52px] h-11 px-3 rounded-full border text-sm transition-colors cursor-pointer ${size === s ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : `bg-white text-[#2A1A26] hover:border-[#4B1D3F] ${needSize ? 'border-rose-300' : 'border-[#4B1D3F]/20'}`}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {findSizeOpen && sizes.length > 0 && womenSizing && (
              <FindMySize sizes={sizes} onPick={(sz) => { setSize(sz as ProductSize); setNeedSize(false); setFindSizeOpen(false); }} onClose={() => setFindSizeOpen(false)} onOpenChart={() => setIsSizeGuideOpen(true)} />
            )}

            {!soldOut && (
              <div className="mt-6 flex items-center gap-4">
                <div className="inline-flex items-center rounded-full border border-[#4B1D3F]/20 bg-white">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Decrease quantity" className="w-11 h-11 flex items-center justify-center disabled:opacity-30 cursor-pointer">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">{qty}</span>
                  <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} aria-label="Increase quantity" className="w-11 h-11 flex items-center justify-center disabled:opacity-30 cursor-pointer">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-sm">
                  {qty > 1 && (
                    <p className="text-[#2A1A26]">
                      ₹{price.toLocaleString('en-IN')} × {qty} = <span className="font-semibold text-[#4B1D3F]">₹{(price * qty).toLocaleString('en-IN')}</span>
                    </p>
                  )}
                  <p className="text-[#2A1A26]/65">{stock <= 5 ? `Only ${stock} left` : 'In stock'}</p>
                </div>
              </div>
            )}

            <div className="mt-6 hidden md:flex gap-3">
              {soldOut ? (
                <button onClick={notifyRestock} className="sag-btn-primary flex-1 h-12 text-xs font-semibold uppercase tracking-[0.16em] inline-flex items-center justify-center gap-2 cursor-pointer">
                  <Bell className="w-4 h-4" /> Notify me when back
                </button>
              ) : (
                <>
                  <button id="pdp-add-to-bag" onClick={onAdd} className="sag-btn-outline flex-1 h-12 text-xs font-semibold uppercase tracking-[0.16em] inline-flex items-center justify-center gap-2 cursor-pointer">
                    {justAdded ? <><Check className="w-4 h-4" /> Added to bag</> : <><BagIcon className="w-[18px] h-[18px]" /> Add to bag</>}
                  </button>
                  <button id="pdp-buy-now" onClick={onBuy} className="sag-btn-primary flex-1 h-12 text-xs font-semibold uppercase tracking-[0.16em] inline-flex items-center justify-center gap-2 cursor-pointer">
                    <Zap className="w-4 h-4" /> Buy now
                  </button>
                </>
              )}
              <button onClick={() => toggleWishlist(product)} aria-label={fav ? 'Remove from wishlist' : 'Add to wishlist'} aria-pressed={fav}
                className="w-12 h-12 shrink-0 rounded-full border border-[#4B1D3F]/20 bg-white flex items-center justify-center hover:bg-[#F7E4EA] cursor-pointer">
                <Heart className={`w-5 h-5 ${fav ? 'fill-[#C2477A] text-[#C2477A]' : 'text-[#4B1D3F]'}`} />
              </button>
            </div>
            {!accessoryPage && (
              <ul className="mt-5 grid grid-cols-3 gap-2" aria-label="Our promises">
                {[
                  [LockIcon, 'Secure payment', 'UPI · cards'],
                  [ReturnIcon, '7-day returns', '& exchange'],
                  [TruckIcon, 'Pan-India', 'delivery'],
                ].map(([Icon, title, sub]) => {
                  const I = Icon as React.FC<{ className?: string; live?: boolean }>;
                  return (
                    <li key={title as string} className="flex flex-col items-center text-center rounded-2xl bg-white border border-[#4B1D3F]/10 px-2 py-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-white to-[#F3EEF8] ring-1 ring-[#4B1D3F]/10"><I className="h-6 w-6" live /></span>
                      <span className="mt-1.5 text-[12px] font-semibold leading-tight text-[#2A1A26]">{title as string}</span>
                      <span className="text-[11px] leading-tight text-[#2A1A26]/60">{sub as string}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {soldOut && <p className="mt-4 text-sm text-rose-700 md:mt-3">This style is sold out right now.</p>}
            {soldOut && restockAsk && !user?.email && (
              <form onSubmit={(e) => { e.preventDefault(); notifyRestock(); }} className="mt-3 flex gap-2 sag-drop">
                <input type="email" required value={restockEmail} onChange={(e) => setRestockEmail(e.target.value)} placeholder="Your email for the restock alert" aria-label="Email for restock alert"
                  className="flex-1 min-w-0 h-11 rounded-full border border-[#4B1D3F]/15 px-4 text-sm focus:outline-none focus:border-[#4B1D3F]/50" />
                <button type="submit" className="sag-btn-primary h-11 px-5 text-xs font-semibold uppercase tracking-[0.12em] cursor-pointer">Notify me</button>
              </form>
            )}
            {(bestCoupon || comboOffer || prepaidDiscount > 0 || prepaidPercentHere) && (
              <div className="mt-5 rounded-2xl border border-[#4B1D3F]/10 bg-white p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#4B1D3F]"><Tag className="h-4 w-4" /> Offers for you</p>
                <ul className="mt-3 space-y-2.5 text-sm text-[#2A1A26]/80">
                  {prepaidDiscount > 0 && (
                    <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> ₹{prepaidDiscount} off at checkout when you pay online</li>
                  )}
                  {prepaidPercentHere && (
                    <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {storeOffers.prepaidPercent}% off this style at checkout when you pay online</li>
                  )}
                  {comboOffer && !accessoryPage && (
                    <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> Buy {comboOffer.minItems} or more outfits and save {comboOffer.percent}%</li>
                  )}
                  {bestCoupon && (
                    <li className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#C5A46D] bg-[#FBF7F3] px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="font-semibold tracking-wider text-[#4B1D3F]">{bestCoupon.code}</span>
                        <span className="block text-xs text-[#2A1A26]/65">{bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue}` : `${bestCoupon.discountValue}%`} off{bestCoupon.minOrderValue ? ` on orders above ₹${bestCoupon.minOrderValue.toLocaleString('en-IN')}` : ''}</span>
                      </span>
                      <button onClick={() => navigator.clipboard?.writeText(bestCoupon.code).then(() => showToast(`Code ${bestCoupon.code} copied.`, 'success')).catch(() => {})} className="shrink-0 h-8 px-3 rounded-full bg-[#4B1D3F] text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer">
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )}


            {highlights.length > 0 && (
              <div className="mt-6 rounded-2xl bg-[#F3EEF8]/70 p-4 sm:p-5">
                <p className="font-serif text-xl text-[#4B1D3F]">{kidsPage || toyPage ? 'Quick facts' : "Why you'll love it"}</p>
                <ul className="mt-2.5 grid gap-2">
                  {highlights.map((h) => (
                    <li key={h} className="flex items-start gap-2.5 text-sm text-[#2A1A26]/80"><Check className="w-4 h-4 mt-0.5 text-[#4B1D3F] shrink-0" /><span>{h}</span></li>
                  ))}
                </ul>
              </div>
            )}

            <DeliveryCheck product={product} quantity={qty} className="mt-7" />

            <div className="mt-6 space-y-2.5">
              {accordionItems.map((item) => {
                const Icon = ({ details: OrdersIcon, fabric: QualityIcon, shipping: TruckIcon, returns: ReturnIcon } as const)[item.key];
                const isOpen = open === item.key;
                return (
                  <div key={item.key} className={`rounded-2xl border bg-white transition-colors ${isOpen ? 'border-[#4B1D3F]/25 shadow-[0_10px_28px_-22px_rgba(42,26,38,0.55)]' : 'border-[#4B1D3F]/10'}`}>
                    <button onClick={() => setOpen(isOpen ? null : item.key)} aria-expanded={isOpen} className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isOpen ? 'bg-[#F3EEF8]' : 'bg-[#FBF7F3]'}`}>
                        <Icon className="w-6 h-6" live={false} />
                      </span>
                      <span className="flex-1 text-[15px] font-medium text-[#2A1A26]">{item.title}</span>
                      <ChevronDown className={`w-4 h-4 text-[#4B1D3F] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isOpen && <div className="px-4 pb-5 pt-0.5 text-sm leading-relaxed text-[#2A1A26]/75 sag-drop">{item.body}</div>}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2 sm:flex sm:flex-wrap">
              <a href={createSupportWhatsAppUrl(`Hi Suit Aura Girls, I have a question about "${product.name}".`)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-3 sm:px-4 rounded-full border whitespace-nowrap border-[#4B1D3F]/15 bg-white text-sm text-[#2A1A26] hover:bg-[#F3EEF8]">
                <WhatsAppIcon className="w-4 h-4" /> Ask on WhatsApp
              </a>
              <button onClick={shareWhatsApp} className="inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-3 sm:px-4 rounded-full border whitespace-nowrap border-[#4B1D3F]/15 bg-white text-sm text-[#2A1A26] hover:bg-[#F3EEF8] cursor-pointer">
                <WhatsAppIcon className="w-4 h-4" /> Share on WhatsApp
              </button>
              <button onClick={share} className="inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-3 sm:px-4 rounded-full border whitespace-nowrap border-[#4B1D3F]/15 bg-white text-sm text-[#2A1A26] hover:bg-[#F3EEF8] cursor-pointer">
                <Share2 className="w-4 h-4" /> Share
              </button>
              {features.compare && !accessoryPage && <button onClick={onCompare} aria-pressed={inCompare} className={`inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-3 sm:px-4 rounded-full border whitespace-nowrap text-sm cursor-pointer ${inCompare ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'border-[#4B1D3F]/15 bg-white text-[#2A1A26] hover:bg-[#F3EEF8]'}`}>
                {inCompare ? <Check className="w-4 h-4" /> : <GitCompare className="w-4 h-4" />} {inCompare ? 'In compare' : 'Compare'}
              </button>}
            </div>
          </div>
        </div>

        {/* Complete the look: its own section, only on combo / set products */}
        <CompleteTheLook product={product} selectedSize={size} selectedColor={color} quantity={qty} onNeedSize={requireSize} />

        {/* Reviews */}
        <ProductReviews key={product.id} product={product} />

        {recentlyViewed.length > 0 && (
          <section className="mt-16 sm:mt-20">
            <p className="sag-eyebrow">Recently viewed</p>
            <h2 className="mt-2 mb-6 font-serif text-3xl text-[#4B1D3F]">Pick up where you left off</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              {recentlyViewed.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}

        {related.length > 0 && !accessoryPage && (
          <section className="mt-16 sm:mt-20">
            <p className="sag-eyebrow">{kidsPage ? 'For little ones' : toyPage ? 'Play time' : 'You may also like'}</p>
            <h2 className="mt-2 mb-6 font-serif text-3xl text-[#4B1D3F]">{kidsPage ? `More ${product.category}` : toyPage ? 'More toys' : 'Similar styles'}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              {related.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </section>
        )}
      </div>

      {/* Mobile sticky actions: price + size on one line, then two clear buttons */}
      <div className="md:hidden fixed left-0 right-0 bottom-0 z-40 bg-white border-t border-[#4B1D3F]/10 shadow-[0_-10px_30px_-20px_rgba(42,26,38,0.5)] px-3 pt-2 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <p className="flex items-baseline gap-1.5 whitespace-nowrap min-w-0">
            <span className="text-[17px] font-semibold text-[#4B1D3F]">₹{(price * qty).toLocaleString('en-IN')}</span>
            {mrp > price && qty === 1 && <span className="text-xs text-[#2A1A26]/45 line-through">₹{mrp.toLocaleString('en-IN')}</span>}
            {discount > 0 && qty === 1 && <span className="text-xs font-semibold text-[#8A2E55]">{discount}% off</span>}
            {qty > 1 && <span className="text-xs text-[#2A1A26]/65">({qty} pcs)</span>}
          </p>
          {oneSize || !sizes.length ? null : size ? (
            <button type="button" onClick={requireSize} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F3EEF8] px-2.5 py-1 text-xs font-semibold text-[#4B1D3F] cursor-pointer">
              {sizeWord} {size} <ChevronDown className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button type="button" onClick={requireSize} className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#F7E4EA] px-2.5 py-1 text-xs font-semibold text-[#8A2E55] cursor-pointer">
              {kidsPage ? 'Choose age' : 'Choose size'} <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {soldOut ? (
          <button onClick={notifyRestock} className="sag-btn-primary w-full h-12 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer">
            <Bell className="w-4 h-4" /> Notify me when back
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={onAdd} className={`h-12 rounded-full border text-xs font-semibold uppercase tracking-[0.12em] inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${justAdded ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-[#4B1D3F]/25 bg-white text-[#4B1D3F] active:bg-[#F3EEF8]'}`}>
              {justAdded ? <><Check className="w-4 h-4" /> Added</> : <><BagIcon className="w-[18px] h-[18px]" live={false} /> Add to bag</>}
            </button>
            <button onClick={onBuy} className="sag-btn-primary h-12 text-xs font-semibold uppercase tracking-[0.14em] inline-flex items-center justify-center gap-2 cursor-pointer">
              <Zap className="w-4 h-4" /> Buy now
            </button>
          </div>
        )}
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-[#2A1A26]/95 flex items-center justify-center sag-fade" role="dialog" aria-modal="true" aria-label="Image viewer" onClick={() => setLightbox(false)}>
          <button onClick={() => setLightbox(false)} aria-label="Close" className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5 text-white" />
          </button>
          {images.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous image" className="absolute left-3 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center cursor-pointer"><ChevronLeft className="w-5 h-5 text-white" /></button>
              <button onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next image" className="absolute right-3 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center cursor-pointer"><ChevronRight className="w-5 h-5 text-white" /></button>
            </>
          )}
          <img src={getCleanImageUrl(images[imageIdx], 1800)} alt={product.name} className="max-h-[92vh] max-w-[94vw] object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};
