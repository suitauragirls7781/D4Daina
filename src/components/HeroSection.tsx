import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin, generateHeroSlidesFromProducts } from '../context/AdminContext';
import { HeroBannerConfig, Product } from '../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { slugToCategory } from '../utils/slugHelper';
import { prepaidPercentApplies } from '../utils/prepaid';

type LiveHeroSlide = HeroBannerConfig['slides'][number] & { rawProduct?: Product };
// Labels the code fills in by itself (auto-made slides, or linking a product in Admin). They are not the
// owner's words, so they are never shown as the eyebrow; only text the owner typed is.
const AUTO_BADGES = new Set([
  '👑 ROYAL FESTIVE EDIT',
  '🌸 SUMMER GRACE ARTISAN',
  '✨ LUXURY REGAL ANARKALI',
  '🔥 BESTSELLER OF THE WEEK',
  '🌿 PURE SILK HANDBLOCK',
  '💎 EXCLUSIVE DESIGNER SUIT',
  '🔥 POPULAR PICK',
]);
const ownerBadge = (badge?: string) => {
  const text = (badge || '').trim();
  return text && !AUTO_BADGES.has(text) ? text : '';
};
const HERO_CATEGORY_LINKS = ['All', 'Suits', 'Kurtis', 'Dresses', 'Dupatta Sets', 'Co-ord Sets', 'Anarkali', 'Festive Wear', 'Party Wear', 'Sale', 'New Arrivals', 'Best Sellers', 'Trending'] as const;

/**
 * The slides the hero shows, worked out from the admin's hero settings and the live products.
 * Exported so the home page can tell which products the hero already shows (and not repeat them in the rails below).
 */
export const buildHeroSlides = (heroConfig: HeroBannerConfig | null | undefined, products: Product[] | null | undefined): LiveHeroSlide[] => {
    // 1. If live products are synced from the database, ALWAYS generate slides from real synced products!
    if (products && products.length > 0) {
      // Admin-configured slides: linked to a live product, or carrying their own uploaded banner photo
      const customMatchingSlides = (heroConfig?.slides || []).filter((slide) => {
        if (slide.bannerImage) return true;
        if (!slide.image || slide.image.includes('images.unsplash.com')) return false;
        return products.some(
          (p) =>
            (slide.productId && String(p.id) === String(slide.productId)) ||
            (slide.link && String(p.id) === String(slide.link)) ||
            p.name === slide.title
        );
      });

      if (customMatchingSlides.length > 0) {
        return customMatchingSlides.slice(0, 6).map((slide) => {
          const matchedProd = products.find(
            (p) =>
              (slide.productId && String(p.id) === String(slide.productId)) ||
              (slide.link && String(p.id) === String(slide.link)) ||
              p.name === slide.title
          );
          if (matchedProd) {
            const livePrice = Number(matchedProd.price) || slide.price;
            const liveOrigPrice = Math.max(livePrice, Number(matchedProd.originalPrice) || livePrice);
            const liveImg = matchedProd.images && matchedProd.images.length > 0
              ? matchedProd.images[0]
              : ((matchedProd as any).image || slide.image);
            return {
              ...slide,
              productId: matchedProd.id,
              title: slide.customText ? slide.title : (matchedProd.name || slide.title),
              price: livePrice,
              originalPrice: liveOrigPrice,
              // A dedicated banner photo wins over the product's own photo
              image: slide.bannerImage || liveImg || slide.image,
              subtitle: slide.customText ? slide.subtitle : (matchedProd.fabric || (matchedProd.description ? matchedProd.description.slice(0, 65) + '...' : slide.subtitle)),
              rawProduct: matchedProd,
            };
          }
          return { ...slide, image: slide.bannerImage || slide.image };
        });
      }

      // Automatically generate live hero slides from real database products
      return generateHeroSlidesFromProducts(products).slice(0, 6);
    }

    // Fallback if products not loaded yet
    if (heroConfig?.slides && heroConfig.slides.length > 0) {
      const nonStockSlides = heroConfig.slides
        .filter((s) => s.bannerImage || (s.image && !s.image.includes('images.unsplash.com')))
        .map((s) => ({ ...s, image: s.bannerImage || s.image }));
      return nonStockSlides.slice(0, 6);
    }

    return [];
};

export const HeroSection: React.FC = () => {
  const { navigateToCategory, navigateToProduct, products, storeOffers } = useShop();
  const { heroConfig, isLoading } = useAdmin();

  const slides = React.useMemo(() => buildHeroSlides(heroConfig, products), [heroConfig, products]);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const ignoreScrollUntil = useRef(0);
  const idxRef = useRef(0);
  idxRef.current = currentSlideIdx;

  /** Shows slide `index`: the photo strip scrolls to it and the text follows. */
  const goTo = useCallback((index: number) => {
    const total = slides.length || 1;
    const target = ((index % total) + total) % total;
    setCurrentSlideIdx(target);
    const strip = stripRef.current;
    const slide = strip?.children[target] as HTMLElement | undefined;
    if (!strip || !slide) return;
    const reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    // While the strip glides to its new place, its scroll events must not pick a slide on the way
    ignoreScrollUntil.current = Date.now() + 700;
    strip.scrollTo({ left: slide.offsetLeft - (strip.children[0] as HTMLElement).offsetLeft, behavior: reduced ? 'auto' : 'smooth' });
  }, [slides.length]);

  // Slides never change by themselves: only a swipe, an arrow or a thumbnail moves them.

  useEffect(() => {
    if (currentSlideIdx >= slides.length) {
      setCurrentSlideIdx(0);
    }
  }, [slides.length, currentSlideIdx]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const handlePrev = () => goTo(idxRef.current - 1);
  const handleNext = () => goTo(idxRef.current + 1);

  // A swipe on the strip: the slide nearest the left edge becomes the current one
  const onStripScroll = () => {
    if (Date.now() < ignoreScrollUntil.current) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const strip = stripRef.current;
      if (!strip || strip.children.length === 0) return;
      const origin = (strip.children[0] as HTMLElement).offsetLeft;
      let nearest = 0;
      let best = Infinity;
      Array.from(strip.children).forEach((child, index) => {
        const distance = Math.abs((child as HTMLElement).offsetLeft - origin - strip.scrollLeft);
        if (distance < best) { best = distance; nearest = index; }
      });
      if (nearest !== idxRef.current) setCurrentSlideIdx(nearest);
    });
  };

  const handleSlideClick = (slide: LiveHeroSlide) => {
    if (slide.productId) {
      navigateToProduct(slide.productId);
      return;
    }
    const targetLink = slide.link || 'All';
    const matchedProduct = products.find(p => p.id === targetLink);
    if (matchedProduct) {
      navigateToProduct(matchedProduct.id);
    } else {
      const category = HERO_CATEGORY_LINKS.find((candidate) => candidate === slugToCategory(targetLink));
      navigateToCategory(category || 'All');
    }
  };

  // On a phone the next photo peeks in from the right, so the strip reads as swipeable
  const slideWidth = 'shrink-0 w-[84%] sm:w-[56%] lg:w-full';

  if (isLoading && (!slides || slides.length === 0)) {
    return (
      <div className="bg-white pt-2 pb-6 lg:py-10" aria-hidden="true">
        <div className="mx-auto max-w-7xl lg:px-8 lg:grid lg:grid-cols-12 lg:gap-12 lg:items-center">
          <div className="px-4 sm:px-6 lg:px-0 lg:col-span-5">
            <div className={`${slideWidth} aspect-[4/5] rounded-control bg-sunken-deep`} />
          </div>
          <div className="px-4 sm:px-6 lg:px-0 mt-8 lg:mt-0 lg:col-span-7 space-y-3">
            <div className="h-8 w-3/4 rounded-badge bg-sunken-deep" />
            <div className="h-6 w-1/3 rounded-badge bg-sunken-deep" />
            <div className="h-[52px] w-full max-w-md rounded-control bg-sunken-deep" />
          </div>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentSlideIdx] || slides[0];
  if (!currentSlide) return null;

  const slidePrice = Number(currentSlide.price) || 0;
  const originalPrice = Math.max(slidePrice, Number(currentSlide.originalPrice) || slidePrice);
  const discountPercent = originalPrice > slidePrice ? Math.round(((originalPrice - slidePrice) / originalPrice) * 100) : 0;
  const count = slides.length;
  // The admin's own badge text, or nothing
  const eyebrow = ownerBadge(currentSlide.badge);
  // The percent offer is shown only when this product's price qualifies for it
  const onlineOffer = slidePrice <= 0
    ? ''
    : prepaidPercentApplies(storeOffers, slidePrice)
    ? `Extra ${storeOffers.prepaidPercent}% off with online payment`
    : storeOffers.prepaidDiscount > 0
    ? `Extra ₹${storeOffers.prepaidDiscount} off on online payment`
    : '';
  const arrow = 'flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-control bg-white text-ink hover:bg-sunken transition-colors cursor-pointer';

  return (
    <section id="haute-couture-hero" aria-label="Featured collection" className="w-full bg-white pt-2 pb-6 lg:py-10">
      <div className="mx-auto max-w-7xl lg:px-8 lg:grid lg:grid-cols-12 lg:gap-12 lg:items-center">
        {/* Photos: a swipeable strip. Nothing is ever drawn on a photo. */}
        <div className="min-w-0 lg:col-span-5">
          <div
            ref={stripRef}
            onScroll={onStripScroll}
            className="sag-scroll-x flex gap-2 lg:gap-4 overflow-x-auto px-4 sm:px-6 lg:px-0 lg:scroll-px-0"
          >
            {slides.map((slide, index) => (
              <button
                key={slide.id || index}
                type="button"
                onClick={() => handleSlideClick(slide)}
                className={`${slideWidth} block overflow-hidden rounded-control bg-sunken text-left cursor-pointer`}
                aria-label={`View ${slide.title}`}
              >
                <span className="block aspect-[4/5] w-full">
                  <img
                    src={getCleanImageUrl(slide.image, index === 0 ? 1000 : 800) || ELEGANT_PLACEHOLDER_SVG}
                    alt={slide.title || 'Featured Suit Aura Girls design'}
                    className="h-full w-full object-cover object-top"
                    loading={index === 0 ? 'eager' : 'lazy'}
                    fetchPriority={index === 0 ? 'high' : 'auto'}
                    decoding="async"
                    onError={(event) => {
                      if (!event.currentTarget.src.includes('data:image/svg+xml')) event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG;
                    }}
                  />
                </span>
              </button>
            ))}
          </div>

          {/* Segment indicator under the photo: swipe on phones, arrows and thumbnails on desktop */}
          {count > 1 && (
            <div className="mt-2 flex items-center gap-3 px-4 sm:px-6 lg:px-0 h-5">
              <div className="flex flex-1 items-center gap-1" aria-hidden="true">
                {slides.map((slide, index) => (
                  <span key={slide.id || index} className={`h-[3px] flex-1 max-w-10 rounded-full ${index === currentSlideIdx ? 'bg-ink' : 'bg-line'}`} />
                ))}
              </div>
              <p className="sag-num shrink-0 text-xs leading-4 text-ink-muted">
                <span className="sr-only">Design </span>{currentSlideIdx + 1} / {count}
              </p>
            </div>
          )}
        </div>

        {/* Details sit below the photo on phones and beside it on desktop */}
        <div className="min-w-0 px-4 sm:px-6 lg:px-0 mt-3 lg:mt-0 lg:col-span-7">
          {eyebrow && <p className="sag-eyebrow hidden sm:block mb-2 truncate">{eyebrow}</p>}

          {/* Two lines are reserved on phones so a change of slide never moves the buttons. The slide title is a full
              product name, so the size is a step smaller than a page title: a usual name fits in the two lines whole. */}
          <h1 className="font-display text-2xl leading-[30px] sm:text-[32px] sm:leading-[1.15] lg:text-[40px] lg:leading-[1.12] text-ink line-clamp-2 min-h-[60px] sm:min-h-0">
            {currentSlide.title}
          </h1>
          {currentSlide.subtitle && (
            <p className="mt-1 lg:mt-3 max-w-xl text-sm leading-5 lg:text-[15px] lg:leading-[22px] text-ink-muted line-clamp-1 lg:line-clamp-2">
              {currentSlide.subtitle}
            </p>
          )}

          {slidePrice > 0 && (
            <div className="sag-num mt-2 lg:mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xl leading-6 lg:text-[28px] lg:leading-8 font-bold text-ink">₹{slidePrice.toLocaleString('en-IN')}</span>
              {originalPrice > slidePrice && <span className="text-sm lg:text-[15px] text-ink-faint line-through">₹{originalPrice.toLocaleString('en-IN')}</span>}
              {discountPercent > 0 && <span className="text-sm lg:text-[15px] font-bold text-sale">{discountPercent}% off</span>}
            </div>
          )}
          {onlineOffer && <p className="mt-1 text-[13px] leading-[18px] font-semibold text-sale">{onlineOffer}</p>}

          <div className="mt-4 lg:mt-7 flex gap-2.5 sm:max-w-md">
            <button
              type="button"
              id="hero-view-style-btn"
              onClick={() => handleSlideClick(currentSlide)}
              className="sag-btn-primary flex-1 px-3"
            >
              Shop now
            </button>
            <button
              type="button"
              id="hero-explore-btn"
              onClick={() => navigateToCategory('All')}
              className="sag-btn-outline flex-1 px-3 text-[15px] whitespace-nowrap"
            >
              Explore collection
            </button>
          </div>

          {count > 1 && (
            <div className="hidden lg:flex items-center gap-4 mt-10">
              <div className="flex flex-wrap gap-3" role="tablist" aria-label="Featured designs">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id || index}
                    type="button"
                    role="tab"
                    aria-selected={index === currentSlideIdx}
                    aria-label={`Show ${slide.title}`}
                    onClick={() => goTo(index)}
                    className={`h-20 w-16 overflow-hidden rounded-chip bg-sunken cursor-pointer border-2 ${index === currentSlideIdx ? 'border-ink' : 'border-transparent hover:border-control'}`}
                  >
                    <img src={getCleanImageUrl(slide.image, 160)} alt="" className="h-full w-full object-cover object-top" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={handlePrev} aria-label="Previous design" className={arrow}>
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
                </button>
                <button type="button" onClick={handleNext} aria-label="Next design" className={arrow}>
                  <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
