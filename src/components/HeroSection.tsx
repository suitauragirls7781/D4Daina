import React, { useState, useEffect } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin, generateHeroSlidesFromProducts } from '../context/AdminContext';
import { HeroBannerConfig, Product } from '../types';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { slugToCategory } from '../utils/slugHelper';

type LiveHeroSlide = HeroBannerConfig['slides'][number] & { rawProduct?: Product };
const HERO_CATEGORY_LINKS = ['All', 'Suits', 'Kurtis', 'Dresses', 'Dupatta Sets', 'Co-ord Sets', 'Anarkali', 'Festive Wear', 'Party Wear', 'Sale', 'New Arrivals', 'Best Sellers', 'Trending'] as const;

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
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!slides || slides.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setCurrentSlideIdx((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [slides, isPaused]);

  useEffect(() => {
    if (currentSlideIdx >= slides.length) {
      setCurrentSlideIdx(0);
    }
  }, [slides.length, currentSlideIdx]);

  const handlePrev = () => {
    setCurrentSlideIdx((prev) => (prev - 1 + (slides?.length || 1)) % (slides?.length || 1));
  };

  const handleNext = () => {
    setCurrentSlideIdx((prev) => (prev + 1) % (slides?.length || 1));
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
      <div className="bg-[#F3EEF8] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl grid gap-6 lg:grid-cols-12 animate-pulse">
          <div className="aspect-[4/5] rounded-3xl bg-white/70 lg:col-span-7" />
          <div className="hidden rounded-3xl bg-white/60 lg:col-span-5 lg:block" />
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
  const swipe = {
    onTouchStart: (event: React.TouchEvent) => setTouchStart(event.touches[0].clientX),
    onTouchEnd: (event: React.TouchEvent) => {
      if (touchStart === null) return;
      const delta = touchStart - event.changedTouches[0].clientX;
      if (delta > 45) handleNext();
      if (delta < -45) handlePrev();
      setTouchStart(null);
    },
  };

  return (
    <section id="haute-couture-hero" aria-label="Featured collection" className="relative w-full overflow-hidden bg-[#F3EEF8]">
      {/* Soft brand backdrop (plain shapes, never over the photo) */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#E6DDF0]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#F7E4EA]/70" />

      <div
        className="relative mx-auto max-w-7xl px-4 pt-4 pb-7 sm:px-6 sm:pt-6 lg:px-8 lg:py-12 grid lg:gap-10 lg:grid-cols-12 lg:items-center"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Photo */}
        <div className="relative lg:col-span-7">
          <button
            type="button"
            onClick={() => handleSlideClick(currentSlide)}
            {...swipe}
            className="group relative block w-full overflow-hidden rounded-[28px] bg-white text-left cursor-pointer shadow-[0_30px_60px_-36px_rgba(75,29,63,0.55)] ring-1 ring-[#4B1D3F]/10"
            aria-label={`View ${currentSlide.title}`}
          >
            <div className="relative aspect-[4/5] w-full sm:aspect-square lg:aspect-[4/5] xl:aspect-[5/5.6]">
              <img
                key={currentSlide.image}
                src={getCleanImageUrl(currentSlide.image, 1200) || ELEGANT_PLACEHOLDER_SVG}
                alt={currentSlide.title || 'Featured Suit Aura Girls design'}
                className="sag-kenburns h-full w-full object-cover object-top"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                onError={(event) => {
                  if (!event.currentTarget.src.includes('data:image/svg+xml')) event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG;
                }}
              />
            </div>
          </button>
        </div>

        {/* Details: compact card on phones (tucked under the photo), full panel on desktop */}
        <div className="relative z-10 -mt-10 mx-3 sm:mx-8 lg:mx-0 lg:mt-0 lg:col-span-5">
          <div className="rounded-3xl bg-white px-5 py-4 sm:px-7 sm:py-6 lg:bg-transparent lg:p-0 shadow-[0_18px_40px_-24px_rgba(42,26,38,0.45)] lg:shadow-none border border-[#4B1D3F]/10 lg:border-0">
            <div className="flex items-center justify-between gap-3">
              <p className="sag-eyebrow truncate">{currentSlide.badge || 'New season edit'}</p>
              {count > 1 && (
                <p className="shrink-0 text-xs tabular-nums text-[#2A1A26]/55">
                  <span className="font-semibold text-[#4B1D3F]">{String(currentSlideIdx + 1).padStart(2, '0')}</span> / {String(count).padStart(2, '0')}
                </p>
              )}
            </div>

            <div key={currentSlide.id || currentSlideIdx} className="sag-slide-in">
              <h1 className="mt-1.5 lg:mt-4 font-serif text-[24px] leading-[1.15] sm:text-4xl lg:text-5xl xl:text-[56px] lg:leading-[1.04] text-[#4B1D3F] line-clamp-2 lg:line-clamp-3">
                {currentSlide.title}
              </h1>
              <p className="hidden lg:block mt-4 max-w-md text-[15px] leading-relaxed text-[#2A1A26]/70 line-clamp-2">
                {currentSlide.subtitle || 'Considered silhouettes and hand-finished details, made for the moments you make your own.'}
              </p>
            </div>

            {slidePrice > 0 && (
              <div className="mt-2.5 lg:mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-xl lg:text-3xl font-semibold text-[#2A1A26]">₹{slidePrice.toLocaleString('en-IN')}</span>
                {originalPrice > slidePrice && <span className="text-sm text-[#2A1A26]/55 line-through">₹{originalPrice.toLocaleString('en-IN')}</span>}
                {discountPercent > 0 && <span className="rounded-full bg-[#F7E4EA] px-2.5 py-0.5 text-xs font-semibold text-[#8A2E55]">{discountPercent}% off</span>}
                {storeOffers.prepaidDiscount > 0 && (
                  <span className="hidden sm:inline-flex rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                    Extra ₹{storeOffers.prepaidDiscount} off on online payment
                  </span>
                )}
              </div>
            )}

            <div className="mt-4 lg:mt-8 flex gap-2.5">
              <button
                type="button"
                id="hero-view-style-btn"
                onClick={() => handleSlideClick(currentSlide)}
                className="sag-btn-primary flex-1 lg:flex-none inline-flex h-12 items-center justify-center gap-2 px-7 text-xs font-semibold uppercase tracking-[0.16em] cursor-pointer"
              >
                Shop now <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                id="hero-explore-btn"
                onClick={() => navigateToCategory('All')}
                className="sag-btn-outline inline-flex h-12 items-center justify-center px-5 lg:px-7 text-xs font-semibold uppercase tracking-[0.16em] cursor-pointer"
              >
                <span className="lg:hidden">Explore</span>
                <span className="hidden lg:inline">Explore collection</span>
              </button>
            </div>

            {count > 1 && (
              <div className="mt-4 lg:mt-10">
                {/* Desktop: the other designs as small photos */}
                <div className="hidden lg:flex flex-wrap gap-3 mb-5" role="tablist" aria-label="Featured designs">
                  {slides.map((slide, index) => (
                    <button
                      key={slide.id || index}
                      type="button"
                      role="tab"
                      aria-selected={index === currentSlideIdx}
                      aria-label={`Show ${slide.title}`}
                      onClick={() => setCurrentSlideIdx(index)}
                      className={`h-20 w-16 overflow-hidden rounded-xl bg-white transition-all cursor-pointer ${index === currentSlideIdx ? 'ring-2 ring-[#4B1D3F] ring-offset-2 ring-offset-[#F3EEF8]' : 'opacity-60 hover:opacity-100 ring-1 ring-[#4B1D3F]/10'}`}
                    >
                      <img src={getCleanImageUrl(slide.image, 160)} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 items-center gap-1.5" role="tablist" aria-label="Slide progress">
                    {slides.map((slide, index) => (
                      <button
                        key={slide.id || index}
                        type="button"
                        role="tab"
                        aria-selected={index === currentSlideIdx}
                        aria-label={`Show ${slide.title}`}
                        onClick={() => setCurrentSlideIdx(index)}
                        className="relative h-1 flex-1 max-w-16 overflow-hidden rounded-full bg-[#4B1D3F]/15 cursor-pointer"
                      >
                        <span
                          key={index === currentSlideIdx ? `on-${currentSlideIdx}` : 'off'}
                          className={`absolute inset-y-0 left-0 rounded-full bg-[#4B1D3F] ${index < currentSlideIdx ? 'w-full' : index === currentSlideIdx ? (isPaused ? 'w-full' : 'sag-hero-progress') : 'w-0'}`}
                        />
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={handlePrev} aria-label="Previous design" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#4B1D3F]/20 bg-white text-[#4B1D3F] hover:bg-[#4B1D3F] hover:text-white transition-colors cursor-pointer">
                      <ChevronLeft className="h-4 w-4 text-current" />
                    </button>
                    <button type="button" onClick={handleNext} aria-label="Next design" className="flex h-10 w-10 items-center justify-center rounded-full border border-[#4B1D3F]/20 bg-white text-[#4B1D3F] hover:bg-[#4B1D3F] hover:text-white transition-colors cursor-pointer">
                      <ChevronRight className="h-4 w-4 text-current" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
