import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin, generateHeroSlidesFromProducts } from '../context/AdminContext';
import { HeroBannerConfig, Product } from '../types';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
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
const SLIDE_MS = 6000;
const HERO_CATEGORY_LINKS =['All', 'Suits', 'Kurtis', 'Dresses', 'Dupatta Sets', 'Co-ord Sets', 'Anarkali', 'Festive Wear', 'Party Wear', 'Sale', 'New Arrivals', 'Best Sellers', 'Trending'] as const;

/** The badge as plain words: emoji and the joiners that belong to them are removed. */
const plainWords = (text: string) => text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();

/**
 * Hero, "magazine" composition (owner's pick 4-2). Per slide a collage: a narrow vertical caption, the main
 * photo and a second real photo framed in white over its bottom-right corner; the words sit on white under
 * the collage (beside it on desktop). Nothing is drawn on a photo.
 */
export const HeroSection: React.FC = () => {
  const { navigateToCategory, navigateToProduct, products, storeOffers } = useShop();
  const { heroConfig, isLoading } = useAdmin();

  const liveProductSlides = React.useMemo<LiveHeroSlide[]>(() => {
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
  }, [heroConfig, products]);

  const slides = liveProductSlides;
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const ignoreScrollUntil = useRef(0);
  const idxRef = useRef(0);
  idxRef.current = currentSlideIdx;
  // curtain: the slide whose photo opens like a curtain (changes by button or timer, not by swipe);
  // leaving: the slide just left, which keeps its drift so it does not jump while it glides away
  const [fx, setFx] = useState({ curtain: -1, leaving: -1 });
  const [hold, setHold] = useState(() => ({
    hover: false,
    touch: false,
    focus: false,
    hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
  }));
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));

  /** Shows slide `index`: the photo strip scrolls to it and the text follows. */
  const goTo = useCallback((index: number) => {
    const total = slides.length || 1;
    const target = ((index % total) + total) % total;
    if (target !== idxRef.current) setFx({ curtain: target, leaving: idxRef.current });
    setCurrentSlideIdx(target);
    const strip = stripRef.current;
    const slide = strip?.children[target] as HTMLElement | undefined;
    if (!strip || !slide) return;
    const reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    // While the strip glides to its new place, its scroll events must not pick a slide on the way
    ignoreScrollUntil.current = Date.now() + 700;
    strip.scrollTo({ left: slide.offsetLeft - (strip.children[0] as HTMLElement).offsetLeft, behavior: reduced ? 'auto' : 'smooth' });
  }, [slides.length]);

  // Slides change by themselves every 6 seconds, except while the shopper is pointing at, touching or
  // tabbing through the hero, while the tab is hidden, and never under reduced motion.
  const running = slides.length > 1 && !reduced && !hold.hover && !hold.touch && !hold.focus && !hold.hidden;
  useEffect(() => {
    const onVisibility = () => setHold((h) => ({ ...h, hidden: document.visibilityState === 'hidden' }));
    document.addEventListener('visibilitychange', onVisibility);
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReduced(Boolean(query?.matches));
    query?.addEventListener?.('change', onMotion);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      query?.removeEventListener?.('change', onMotion);
    };
  }, []);
  // Any change of slide (swipe, marks, arrows, thumbnails) starts the 6 seconds again
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => goTo(idxRef.current + 1), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [running, currentSlideIdx, goTo]);

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
      if (nearest !== idxRef.current) {
        setFx({ curtain: -1, leaving: idxRef.current });
        setCurrentSlideIdx(nearest);
      }
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

  if (isLoading && (!slides || slides.length === 0)) {
    return (
      <div className="w-full px-4 pt-[18px] pb-[22px] md:px-6 lg:px-8 lg:py-10" aria-hidden="true">
        <div className="mx-auto max-w-2xl lg:grid lg:max-w-7xl lg:grid-cols-[55fr_45fr] lg:items-center lg:gap-12">
          <div className="pb-[22%] pl-7">
            <div className="aspect-[4/5] w-[78%] bg-sunken" />
          </div>
          <div className="mt-4 flex flex-col items-start gap-3 lg:mt-0">
            <div className="h-8 w-3/4 bg-sunken" />
            <div className="h-6 w-1/3 bg-sunken" />
            <div className="h-12 w-40 bg-sunken" />
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
  // The admin's own badge text as the vertical caption, or the plain "New season"
  const caption = plainWords(ownerBadge(currentSlide.badge)) || 'New season';
  // The percent offer is shown only when this product's price qualifies for it
  const onlineOffer = slidePrice <= 0
    ? ''
    : prepaidPercentApplies(storeOffers, slidePrice)
    ? `Extra ${storeOffers.prepaidPercent}% off with online payment`
    : storeOffers.prepaidDiscount > 0
    ? `Extra ₹${storeOffers.prepaidDiscount} off on online payment`
    : '';
  const arrow = 'flex h-11 w-11 items-center justify-center border border-line bg-surface text-ink hover:border-ink transition-colors cursor-pointer';

  /** The second picture of a slide's collage, always a real one: another photo of the same product, else the next slide's photo. */
  const secondPhoto = (slide: LiveHeroSlide, index: number): string => {
    const product = slide.rawProduct || (slide.productId ? products.find((p) => String(p.id) === String(slide.productId)) : undefined);
    const own = (product?.images || []).find((url) => url && url !== slide.image);
    if (own) return own;
    const next = count > 1 ? slides[(index + 1) % count]?.image : '';
    return next && next !== slide.image ? next : '';
  };

  return (
    <section
      id="haute-couture-hero"
      aria-label="Featured collection"
      className="w-full px-4 pt-[18px] pb-[22px] md:px-6 lg:px-8 lg:py-10"
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHold((h) => ({ ...h, hover: true })); }}
      onPointerLeave={() => setHold((h) => (h.hover ? { ...h, hover: false } : h))}
      onTouchStart={() => setHold((h) => ({ ...h, touch: true }))}
      onTouchEnd={() => setHold((h) => ({ ...h, touch: false }))}
      onTouchCancel={() => setHold((h) => ({ ...h, touch: false }))}
      onFocus={(event) => { if ((event.target as HTMLElement).matches?.(':focus-visible')) setHold((h) => ({ ...h, focus: true })); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHold((h) => (h.focus ? { ...h, focus: false } : h)); }}
    >
      <div className="mx-auto max-w-2xl lg:grid lg:max-w-7xl lg:grid-cols-[55fr_45fr] lg:items-center lg:gap-12">
        {/* Collage: the vertical caption, then a swipeable strip of two-photo compositions. Nothing is drawn on a photo. */}
        <div className="flex min-w-0 items-stretch gap-3 lg:gap-4">
          <div className="relative w-4 shrink-0" aria-hidden="true">
            <span className="absolute left-0 top-0 max-h-full truncate text-[11px] font-medium uppercase leading-4 tracking-[0.3em] text-sale [writing-mode:vertical-rl] rotate-180">
              {caption}
            </span>
          </div>
          <div
            ref={stripRef}
            onScroll={onStripScroll}
            className="sag-scroll-x scroll-px-0! flex min-w-0 flex-1 items-start overflow-x-auto"
          >
            {slides.map((slide, index) => {
              const small = getCleanImageUrl(slide.image, 640);
              const mid = getCleanImageUrl(slide.image, 828);
              const wide = getCleanImageUrl(slide.image, 1100);
              const second = secondPhoto(slide, index);
              const secondSmall = second ? getCleanImageUrl(second, 320) : '';
              const secondMid = second ? getCleanImageUrl(second, 480) : '';
              const secondWide = second ? getCleanImageUrl(second, 640) : '';
              return (
                <button
                  key={slide.id || index}
                  type="button"
                  onClick={() => handleSlideClick(slide)}
                  className={`relative block w-full shrink-0 cursor-pointer text-left ${second ? 'pb-[22%]' : ''}`}
                  aria-label={`View ${slide.title}`}
                >
                  <span className={`block aspect-[4/5] overflow-hidden bg-sunken ${second ? 'w-[78%]' : 'w-full'}`}>
                    <span className={`block h-full w-full overflow-hidden ${index === fx.curtain && index === currentSlideIdx ? 'sag-curtain' : ''}`}>
                      <img
                        src={small || ELEGANT_PLACEHOLDER_SVG}
                        srcSet={slide.image && small && small !== wide ? `${small} 640w, ${mid} 828w, ${wide} 1100w` : undefined}
                        sizes="(min-width: 1280px) 520px, (min-width: 1024px) 40vw, (min-width: 768px) 500px, 70vw"
                        alt={slide.title || 'Featured Suit Aura Girls design'}
                        className={`h-full w-full object-cover object-top ${index === currentSlideIdx || index === fx.leaving ? 'sag-drift' : ''}`}
                        loading={index === 0 ? 'eager' : 'lazy'}
                        fetchPriority={index === 0 ? 'high' : 'auto'}
                        decoding="async"
                        onError={(event) => {
                          if (!event.currentTarget.src.includes('data:image/svg+xml')) { event.currentTarget.removeAttribute('srcset'); event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }
                        }}
                      />
                    </span>
                  </span>
                  {second && (
                    <span className="absolute bottom-0 right-0 block aspect-[4/5] w-[46%] overflow-hidden border-[6px] border-surface bg-sunken lg:border-8">
                      <img
                        src={secondMid || ELEGANT_PLACEHOLDER_SVG}
                        srcSet={secondSmall && secondSmall !== secondWide ? `${secondSmall} 320w, ${secondMid} 480w, ${secondWide} 640w` : undefined}
                        sizes="(min-width: 1280px) 310px, (min-width: 1024px) 24vw, (min-width: 768px) 300px, 42vw"
                        alt=""
                        className="h-full w-full object-cover object-top"
                        loading={index === 0 ? 'eager' : 'lazy'}
                        decoding="async"
                        onError={(event) => {
                          if (!event.currentTarget.src.includes('data:image/svg+xml')) { event.currentTarget.removeAttribute('srcset'); event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }
                        }}
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Words: left-aligned under the collage; beside it and vertically centred on desktop */}
        <div className="mt-4 min-w-0 lg:mt-0">
          {/* Re-made per slide, so the title, price and buttons arrive one after another */}
          <div key={currentSlide.id || currentSlideIdx} className="sag-stagger">
          {/* Three lines are reserved below desktop so a change of slide never moves the buttons */}
          <h1 className="sag-lines font-display font-medium text-[30px] leading-[1.12] text-ink min-h-[3.36em] md:text-[36px] lg:min-h-0 lg:text-[44px] lg:leading-[1.1]">
            <span className="sr-only">Suit Aura Girls: </span>
            <span className="sag-line-up" style={{ '--sag-line-delay': '120ms' } as React.CSSProperties}>
              <span className="line-clamp-3">{currentSlide.title}</span>
            </span>
          </h1>
          {currentSlide.subtitle && (
            <p className="mt-3 max-w-xl text-[15px] leading-[22px] text-ink-muted line-clamp-2 max-lg:hidden">
              {currentSlide.subtitle}
            </p>
          )}

          {slidePrice > 0 && (
            <p className="sag-num mt-2.5 flex flex-wrap items-baseline gap-x-[7px] gap-y-1 lg:mt-5">
              <span className="text-[22px] font-semibold leading-7 text-ink lg:text-[28px] lg:leading-8">₹{slidePrice.toLocaleString('en-IN')}</span>
              {originalPrice > slidePrice && <span className="text-[12.5px] text-ink-muted line-through lg:text-sm">₹{originalPrice.toLocaleString('en-IN')}</span>}
              {discountPercent > 0 && <span className="text-[12.5px] font-semibold text-sale lg:text-sm">{discountPercent}% off</span>}
            </p>
          )}
          {onlineOffer && <p className="mt-1 text-xs leading-[18px] text-sale">{onlineOffer}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 lg:mt-7">
            <button
              type="button"
              id="hero-view-style-btn"
              onClick={() => handleSlideClick(currentSlide)}
              className="sag-btn-primary gap-2 px-6 whitespace-nowrap"
            >
              Shop now
              <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.25} aria-hidden="true" />
            </button>
            <button
              type="button"
              id="hero-explore-btn"
              onClick={() => navigateToCategory('All')}
              aria-label="Explore collection"
              className="sag-link cursor-pointer text-sm font-medium whitespace-nowrap"
            >
              Explore
            </button>
          </div>
          </div>

          {/* Place marks: thin lines, the current one fills while its slide is shown; then the slide number */}
          {count > 1 && (
            <div className="mt-3 flex items-center gap-3 lg:mt-6 lg:max-w-md">
              <div className="flex min-w-0 flex-1 gap-1.5">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id || index}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`Show design ${index + 1} of ${count}: ${slide.title}`}
                    aria-current={index === currentSlideIdx ? 'true' : undefined}
                    className="flex h-8 min-w-0 flex-1 cursor-pointer items-center"
                  >
                    <span className="relative block h-px w-full overflow-hidden bg-line">
                      {index === currentSlideIdx && (
                        <span
                          key={`${currentSlideIdx}-${running}`}
                          className={`absolute inset-0 bg-ink ${running ? 'sag-progress' : ''}`}
                          style={{ '--sag-progress-time': `${SLIDE_MS / 1000}s` } as React.CSSProperties}
                        />
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <span className="sag-num shrink-0 text-[11px] leading-4 tracking-[0.08em] text-ink-muted" aria-hidden="true">
                {String(currentSlideIdx + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
              </span>
            </div>
          )}

          {count > 1 && (
            <div className="mt-6 hidden items-center gap-4 lg:flex">
              <div className="flex flex-wrap gap-2.5" role="tablist" aria-label="Featured designs">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id || index}
                    type="button"
                    role="tab"
                    aria-selected={index === currentSlideIdx}
                    aria-label={`Show ${slide.title}`}
                    onClick={() => goTo(index)}
                    className={`h-20 w-16 cursor-pointer overflow-hidden border bg-sunken transition-opacity ${index === currentSlideIdx ? 'border-ink' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  >
                    <img src={getCleanImageUrl(slide.image, 160)} alt="" className="h-full w-full object-cover object-top" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={handlePrev} aria-label="Previous design" className={arrow}>
                  <ChevronLeft className="h-5 w-5" strokeWidth={1.25} />
                </button>
                <button type="button" onClick={handleNext} aria-label="Next design" className={arrow}>
                  <ChevronRight className="h-5 w-5" strokeWidth={1.25} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
