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
 * photo and a second real photo in a thin translucent frame over its bottom-right corner; the words sit under
 * the collage (beside it on desktop), all inside one glass panel. Nothing is drawn on a photo.
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
  const idxRef = useRef(0);
  idxRef.current = currentSlideIdx;
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [hold, setHold] = useState(() => ({
    hover: false,
    touch: false,
    focus: false,
    hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
  }));
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));

  /** Shows slide `index`: its photo fades in over the last one and its words follow. */
  const goTo = useCallback((index: number) => {
    const total = slides.length || 1;
    setCurrentSlideIdx(((index % total) + total) % total);
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

  const handlePrev = () => goTo(idxRef.current - 1);
  const handleNext = () => goTo(idxRef.current + 1);

  // A sideways swipe on the photo shows the next or the previous slide
  const onSwipeStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    swipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onSwipeEnd = (event: React.TouchEvent) => {
    const start = swipeStart.current;
    const touch = event.changedTouches[0];
    swipeStart.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.4) goTo(idxRef.current + (dx < 0 ? 1 : -1));
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

  const FRAME = 'mx-auto max-w-7xl lg:grid lg:grid-cols-12 lg:items-stretch';
  const PHOTO = 'relative aspect-[4/5] w-full overflow-hidden rounded-none bg-sunken lg:col-span-7 lg:aspect-auto lg:h-[min(78vh,760px)]';
  const BODY = 'flex min-w-0 flex-col px-4 pt-4 pb-2 sm:px-6 lg:col-span-5 lg:justify-center lg:px-14 lg:py-12';

  if (isLoading && (!slides || slides.length === 0)) {
    return (
      <div className="w-full" aria-hidden="true">
        <div className={FRAME}>
          <div className={PHOTO} />
          <div className={BODY}>
            <div className="mt-3 flex flex-col items-start gap-3.5">
              <div className="h-3 w-24 rounded-none bg-sunken" />
              <div className="h-10 w-3/4 rounded-none bg-sunken" />
              <div className="h-6 w-1/3 rounded-none bg-sunken" />
              <div className="h-[52px] w-44 rounded-lg bg-sunken" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentSlide = slides[currentSlideIdx] || slides[0];
  if (!currentSlide) return null;

  const count = slides.length;
  const arrow = 'flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink hover:border-brand hover:text-brand transition-colors cursor-pointer';

  return (
    <section
      id="haute-couture-hero"
      aria-label="Featured collection"
      className="w-full"
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHold((h) => ({ ...h, hover: true })); }}
      onPointerLeave={() => setHold((h) => (h.hover ? { ...h, hover: false } : h))}
      onTouchStart={() => setHold((h) => ({ ...h, touch: true }))}
      onTouchEnd={() => setHold((h) => ({ ...h, touch: false }))}
      onTouchCancel={() => setHold((h) => ({ ...h, touch: false }))}
      onFocus={(event) => { if ((event.target as HTMLElement).matches?.(':focus-visible')) setHold((h) => ({ ...h, focus: true })); }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHold((h) => (h.focus ? { ...h, focus: false } : h)); }}
    >
      <div className={FRAME}>
        {/* The photos lie on top of one another and cross-fade; the one shown zooms very slowly. Nothing is drawn on a photo. */}
        <div className={PHOTO} onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
          {slides.map((slide, index) => {
            const small = getCleanImageUrl(slide.image, 640);
            const mid = getCleanImageUrl(slide.image, 828);
            const wide = getCleanImageUrl(slide.image, 1100);
            const on = index === currentSlideIdx;
            return (
              <button
                key={slide.id || index}
                type="button"
                onClick={() => handleSlideClick(slide)}
                className={`sag-hero-slide absolute inset-0 block h-full w-full cursor-pointer overflow-hidden ${on ? 'is-on' : 'pointer-events-none'}`}
                aria-label={`View ${slide.title}`}
                aria-hidden={on ? undefined : true}
                tabIndex={on ? undefined : -1}
              >
                <img
                  src={small || ELEGANT_PLACEHOLDER_SVG}
                  srcSet={slide.image && small && small !== wide ? `${small} 640w, ${mid} 828w, ${wide} 1100w` : undefined}
                  sizes="(min-width: 1280px) 750px, (min-width: 1024px) 58vw, 100vw"
                  alt={slide.title || 'Featured Suit Aura Girls design'}
                  className="h-full w-full rounded-none object-cover object-top"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  fetchPriority={index === 0 ? 'high' : 'auto'}
                  decoding="async"
                  onError={(event) => {
                    if (!event.currentTarget.src.includes('data:image/svg+xml')) { event.currentTarget.removeAttribute('srcset'); event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }
                  }}
                />
              </button>
            );
          })}
        </div>

        <div className={BODY}>
          {/* Place marks: the slide number, then thin lines; the current one fills while its slide is shown */}
          {count > 1 && (
            <div className="flex items-center gap-2.5">
              <span className="sag-num min-w-[46px] shrink-0 text-[11px] font-semibold leading-4 tracking-[0.14em] text-ink-muted" aria-hidden="true">
                {String(currentSlideIdx + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
              </span>
              <div className="flex min-w-0 flex-1 gap-2">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id || index}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`Show design ${index + 1} of ${count}: ${slide.title}`}
                    aria-current={index === currentSlideIdx ? 'true' : undefined}
                    className="flex h-11 min-w-0 flex-1 cursor-pointer items-center"
                  >
                    <span className="relative block h-0.5 w-full overflow-hidden rounded-none bg-line">
                      {index < currentSlideIdx && <span className="absolute inset-0 bg-brand" />}
                      {index === currentSlideIdx && (
                        <span
                          key={`${currentSlideIdx}-${running}`}
                          className={`absolute inset-0 bg-brand ${running ? 'sag-progress' : ''}`}
                          style={{ '--sag-progress-time': `${SLIDE_MS / 1000}s` } as React.CSSProperties}
                        />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The words of every slide share one place, so a change of slide never moves the page; the ones
              shown are made again each time, so the eyebrow, title, price and actions rise in one after another */}
          <div className={`grid ${count > 1 ? 'mt-2 lg:mt-5' : 'mt-1'}`}>
            {slides.map((slide, index) => {
              const on = index === currentSlideIdx;
              const slidePrice = Number(slide.price) || 0;
              const originalPrice = Math.max(slidePrice, Number(slide.originalPrice) || slidePrice);
              const discountPercent = originalPrice > slidePrice ? Math.round(((originalPrice - slidePrice) / originalPrice) * 100) : 0;
              // The admin's own badge text as the eyebrow, or the plain "New season"
              const caption = plainWords(ownerBadge(slide.badge)) || 'New season';
              // The percent offer is shown only when this product's price qualifies for it
              const onlineOffer = slidePrice <= 0
                ? ''
                : prepaidPercentApplies(storeOffers, slidePrice)
                ? `Extra ${storeOffers.prepaidPercent}% off with online payment`
                : storeOffers.prepaidDiscount > 0
                ? `Extra ₹${storeOffers.prepaidDiscount} off on online payment`
                : '';
              const Title = on ? 'h1' : 'p';
              const short = String(slide.title || '').length <= 26;
              return (
                <div
                  key={`${slide.id || index}-${on ? 'on' : 'off'}`}
                  aria-hidden={on ? undefined : true}
                  className={`[grid-area:1/1] flex min-w-0 flex-col items-start ${on ? 'sag-stagger' : 'invisible'}`}
                >
                  <p className="sag-eyebrow sag-caps text-[10.5px] font-semibold uppercase leading-4 tracking-[0.24em]">{caption}</p>
                  <Title className={`mt-2.5 font-display text-ink ${short ? 'text-[38px] leading-[1.03] lg:text-[60px] lg:leading-none' : 'text-[30px] leading-[1.08] lg:text-[44px] lg:leading-[1.05]'}`}>
                    {on && <span className="sr-only">Suit Aura Girls: </span>}
                    <span className="line-clamp-3">{slide.title}</span>
                  </Title>
                  {slide.subtitle && (
                    <p className="mt-3 max-w-[36ch] text-[15px] leading-[22px] text-ink-muted line-clamp-2 max-lg:hidden">
                      {slide.subtitle}
                    </p>
                  )}

                  {slidePrice > 0 && (
                    <p className="sag-num mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 lg:mt-5">
                      <span className="text-[20px] font-semibold leading-7 text-ink lg:text-[24px] lg:leading-8">₹{slidePrice.toLocaleString('en-IN')}</span>
                      {originalPrice > slidePrice && <span className="text-[13px] text-ink-muted line-through lg:text-sm">₹{originalPrice.toLocaleString('en-IN')}</span>}
                      {discountPercent > 0 && <span className="text-[13px] font-semibold text-accent lg:text-sm">{discountPercent}% off</span>}
                    </p>
                  )}
                  {onlineOffer && <p className="mt-1 text-[13px] leading-[18px] text-sale">{onlineOffer}</p>}

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 lg:mt-7">
                    <button
                      type="button"
                      id={on ? 'hero-view-style-btn' : undefined}
                      tabIndex={on ? undefined : -1}
                      onClick={() => handleSlideClick(slide)}
                      className="sag-btn-primary gap-2.5 px-6 whitespace-nowrap"
                    >
                      Shop now
                      <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={1.25} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      id={on ? 'hero-explore-btn' : undefined}
                      tabIndex={on ? undefined : -1}
                      onClick={() => navigateToCategory('All')}
                      aria-label="Explore collection"
                      className="sag-lnk"
                    >
                      Explore
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {count > 1 && (
            <div className="mt-8 hidden items-center gap-4 lg:flex">
              <div className="flex flex-wrap gap-2.5" role="tablist" aria-label="Featured designs">
                {slides.map((slide, index) => (
                  <button
                    key={slide.id || index}
                    type="button"
                    role="tab"
                    aria-selected={index === currentSlideIdx}
                    aria-label={`Show ${slide.title}`}
                    onClick={() => goTo(index)}
                    className={`h-[70px] w-14 cursor-pointer overflow-hidden rounded-lg border bg-sunken transition-opacity ${index === currentSlideIdx ? 'border-brand' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  >
                    <img src={getCleanImageUrl(slide.image, 160)} alt="" className="h-full w-full rounded-none object-cover object-top" loading="lazy" decoding="async" />
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
