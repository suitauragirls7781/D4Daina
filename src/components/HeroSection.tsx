import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin, generateHeroSlidesFromProducts } from '../context/AdminContext';
import { HeroBannerConfig, Product } from '../types';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { assuranceLine } from './Assurance';
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
/** True from Tailwind's `lg` width up: the desktop hero keeps its own layout. */
const useIsDesktop = () => {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(min-width: 1024px)').matches));
  useEffect(() => {
    const query = window.matchMedia?.('(min-width: 1024px)');
    if (!query) return;
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return desktop;
};
// A place the code fills in when the customer gave none; it is not shown as the customer's place
const reviewPlace = (location?: string) => {
  const text = (location || '').trim();
  return text && text !== 'Artisan, India' ? text : '';
};
const HERO_CATEGORY_LINKS = ['All', 'Suits', 'Kurtis', 'Dresses', 'Dupatta Sets', 'Co-ord Sets', 'Anarkali', 'Festive Wear', 'Party Wear', 'Sale', 'New Arrivals', 'Best Sellers', 'Trending'] as const;

export const HeroSection: React.FC = () => {
  const { navigateToCategory, navigateToProduct, products, storeOffers } = useShop();
  const { heroConfig, isLoading, reviewsList = [] } = useAdmin();
  const isDesktop = useIsDesktop();

  // Real customer words for the quote box: approved reviews of verified purchases only, newest first
  const verifiedReviews = React.useMemo(
    () => reviewsList
      .filter((r) => r.status === 'approved' && r.verifiedPurchase === true && String(r.comment || '').trim())
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [reviewsList],
  );

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

  // Phones and tablets: one block per screen, swiped sideways (the dots under it show the place)
  const slideWidth = 'shrink-0 w-full';
  const priceOf = (slide: LiveHeroSlide) => {
    const now = Number(slide.price) || 0;
    const was = Math.max(now, Number(slide.originalPrice) || now);
    return { now, was, off: was > now ? Math.round(((was - now) / was) * 100) : 0 };
  };

  if (isLoading && (!slides || slides.length === 0)) {
    return (
      <div className="pt-2 pb-6 lg:py-10" aria-hidden="true">
        <div className="mx-auto max-w-7xl lg:px-8 lg:grid lg:grid-cols-12 lg:gap-12 lg:items-center">
          <div className="px-4 sm:px-6 lg:px-0 lg:col-span-5">
            <div className="w-full h-[420px] lg:h-auto lg:aspect-[4/5] rounded-[28px] lg:rounded-control bg-dark lg:bg-sunken-deep" />
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
    <section id="haute-couture-hero" aria-label="Featured collection" className="w-full pt-2 pb-2 lg:py-10">
      <div className="mx-auto max-w-7xl lg:px-8 lg:grid lg:grid-cols-12 lg:gap-12 lg:items-center">
        {/* Photos: a swipeable strip. Nothing is ever drawn on a photo. */}
        <div className="min-w-0 lg:col-span-5">
          <div
            ref={stripRef}
            onScroll={onStripScroll}
            className="sag-scroll-x flex items-stretch gap-3 lg:gap-4 overflow-x-auto px-3.5 scroll-px-3.5 sm:px-6 sm:scroll-px-6 lg:px-0 lg:scroll-px-0"
          >
            {slides.map((slide, index) => {
              const money = priceOf(slide);
              const badge = ownerBadge(slide.badge);
              if (!isDesktop) {
                // Phones and tablets: one dark block per slide. Words first, then the photos, the gold button
                // and a real customer's words. Nothing is drawn on a photo.
                const current = index === currentSlideIdx;
                const linked = slide.rawProduct || (slide.productId ? products.find((p) => String(p.id) === String(slide.productId)) : undefined);
                // A second photo only when the style really has one
                const second = (linked?.images || []).filter(Boolean).find((photo, at) => at > 0 && photo !== slide.image && getCleanImageUrl(photo, 640) !== getCleanImageUrl(slide.image, 640));
                const photos = [slide.image, ...(second ? [second] : [])];
                const quote = (linked && verifiedReviews.find((r) => String(r.productId) === String(linked.id))) || verifiedReviews[0];
                const quoteRating = Math.max(0, Math.min(5, Math.round(Number(quote?.rating) || 0)));
                const place = reviewPlace(quote?.location);
                return (
                  <div key={slide.id || index} className={`${slideWidth} flex flex-col gap-2.5 rounded-[28px] bg-dark p-4 text-on-dark sm:p-6`}>
                    {badge && <p className="max-w-full truncate text-[11px] font-extrabold uppercase leading-4 tracking-[0.08em] text-highlight">{badge}</p>}
                    <p className="font-display text-[23px] font-bold leading-[1.15] text-on-dark line-clamp-3 sm:text-[30px]">{slide.title}</p>
                    {money.now > 0 && (
                      <p className="sag-num flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-[19px] font-extrabold leading-6 text-on-dark">₹{money.now.toLocaleString('en-IN')}</span>
                        {money.was > money.now && <span className="text-[13px] text-on-dark-muted line-through">₹{money.was.toLocaleString('en-IN')}</span>}
                        {money.off > 0 && <span className="text-[13px] font-extrabold text-highlight">{money.off}% off</span>}
                      </p>
                    )}
                    <p className="text-[13px] leading-[18px] text-on-dark-muted">{assuranceLine()}</p>
                    <button
                      type="button"
                      onClick={() => handleSlideClick(slide)}
                      aria-label={`View ${slide.title}`}
                      className={`mx-auto grid w-full cursor-pointer gap-2.5 ${photos.length > 1 ? 'max-w-md grid-cols-2' : 'max-w-[62%] grid-cols-1 sm:max-w-[240px]'}`}
                    >
                      {photos.map((photo, at) => (
                        <span key={at} className="block aspect-[4/5] overflow-hidden rounded-control bg-white/10">
                          <img
                            src={getCleanImageUrl(photo, 480) || ELEGANT_PLACEHOLDER_SVG}
                            alt={at === 0 ? slide.title || 'Featured Suit Aura Girls design' : ''}
                            className="h-full w-full object-cover object-top"
                            loading={index === 0 ? 'eager' : 'lazy'}
                            fetchPriority={index === 0 && at === 0 ? 'high' : 'auto'}
                            decoding="async"
                            onError={(event) => {
                              if (!event.currentTarget.src.includes('data:image/svg+xml')) event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG;
                            }}
                          />
                        </span>
                      ))}
                    </button>
                    <button
                      type="button"
                      id={current ? 'hero-view-style-btn' : undefined}
                      onClick={() => handleSlideClick(slide)}
                      className="sag-btn-primary sag-btn-buy w-full gap-1 px-3"
                    >
                      Shop now <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      id={current ? 'hero-explore-btn' : undefined}
                      onClick={() => navigateToCategory('All')}
                      className="mx-auto inline-flex h-10 cursor-pointer items-center px-3 text-[13.5px] font-bold text-on-dark underline underline-offset-4"
                    >
                      Explore collection
                    </button>
                    {quote && (
                      <figure className="mt-auto flex items-start gap-2.5 rounded-chip bg-white/10 px-3 py-2.5">
                        {quoteRating > 0 && (
                          <span className="mt-0.5 flex shrink-0 gap-px text-highlight" role="img" aria-label={`Rated ${quoteRating} out of 5`}>
                            {Array.from({ length: quoteRating }, (_, star) => <Star key={star} className="h-[11px] w-[11px] fill-current" aria-hidden="true" />)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 text-xs leading-[1.4] text-on-dark">
                          <blockquote className="line-clamp-3">“{String(quote.comment).trim()}”</blockquote>
                          <figcaption className="mt-0.5 text-on-dark-muted">
                            <b className="font-bold text-on-dark">{quote.userName}{place ? `, ${place}` : ''}</b> · Verified purchase
                          </figcaption>
                        </span>
                      </figure>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={slide.id || index}
                  type="button"
                  onClick={() => handleSlideClick(slide)}
                  className={`${slideWidth} relative block min-h-[236px] overflow-hidden rounded-[22px] bg-peach text-left cursor-pointer lg:min-h-0 lg:rounded-control lg:bg-sunken`}
                  aria-label={`View ${slide.title}`}
                >
                  <span className="absolute -right-1.5 bottom-0 block h-[92%] w-[50%] overflow-hidden rounded-t-[120px] bg-white/60 lg:static lg:h-auto lg:w-full lg:rounded-none lg:bg-transparent lg:aspect-[4/5]">
                    <img
                      src={getCleanImageUrl(slide.image, 640) || ELEGANT_PLACEHOLDER_SVG}
                      srcSet={slide.image && getCleanImageUrl(slide.image, 640) !== getCleanImageUrl(slide.image, 1000) ? `${getCleanImageUrl(slide.image, 640)} 640w, ${getCleanImageUrl(slide.image, 1000)} 1000w` : undefined}
                      sizes="(min-width: 1024px) 40vw, 50vw"
                      alt={slide.title || 'Featured Suit Aura Girls design'}
                      className="h-full w-full object-cover object-top"
                      loading={index === 0 ? 'eager' : 'lazy'}
                      fetchPriority={index === 0 ? 'high' : 'auto'}
                      decoding="async"
                      onError={(event) => {
                        if (!event.currentTarget.src.includes('data:image/svg+xml')) { event.currentTarget.removeAttribute('srcset'); event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }
                      }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Segment indicator under the photo: swipe on phones, arrows and thumbnails on desktop */}
          {count > 1 && (
            <div className="mt-2.5 flex items-center justify-center gap-[5px] px-4 h-2" aria-hidden="true">
              {slides.map((slide, index) => (
                <span key={slide.id || index} className={`h-1.5 rounded-full transition-[width] ${index === currentSlideIdx ? 'w-5 bg-brand' : 'w-1.5 bg-line'}`} />
              ))}
              <span className="sr-only">Design {currentSlideIdx + 1} of {count}</span>
            </div>
          )}
        </div>

        {/* Details sit below the photo on phones and beside it on desktop */}
        <h1 className="sr-only lg:hidden">Suit Aura Girls: {currentSlide.title}</h1>
        {isDesktop && <div className="hidden lg:block min-w-0 lg:col-span-7">
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
        </div>}
      </div>
    </section>
  );
};
