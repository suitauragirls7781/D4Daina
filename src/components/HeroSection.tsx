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
  const { navigateToCategory, navigateToProduct, products } = useShop();
  const { heroConfig, isLoading } = useAdmin();

  const liveProductSlides = React.useMemo<LiveHeroSlide[]>(() => {
    // 1. If live products are synced from the database, ALWAYS generate slides from real synced products!
    if (products && products.length > 0) {
      // Check if admin has explicitly customized hero slides that match real products or have real uploaded images
      const customMatchingSlides = (heroConfig?.slides || []).filter((slide) => {
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
            const liveOrigPrice = Number(matchedProd.originalPrice) || Math.round(livePrice * 1.85);
            const liveImg = matchedProd.images && matchedProd.images.length > 0
              ? matchedProd.images[0]
              : ((matchedProd as any).image || slide.image);
            return {
              ...slide,
              productId: matchedProd.id,
              title: matchedProd.name || slide.title,
              price: livePrice,
              originalPrice: liveOrigPrice,
              image: liveImg || slide.image,
              subtitle: matchedProd.fabric || (matchedProd.description ? matchedProd.description.slice(0, 65) + '...' : slide.subtitle),
              rawProduct: matchedProd,
            };
          }
          return slide;
        });
      }

      // Automatically generate live hero slides from real database products
      return generateHeroSlidesFromProducts(products).slice(0, 6);
    }

    // Fallback if products not loaded yet
    if (heroConfig?.slides && heroConfig.slides.length > 0) {
      const nonStockSlides = heroConfig.slides.filter(s => s.image && !s.image.includes('images.unsplash.com'));
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
      <div className="grid min-h-[420px] animate-pulse grid-cols-1 bg-[#FAF5EB] lg:grid-cols-12">
        <div className="aspect-[4/5] bg-[#B8935A]/10 lg:col-span-7 lg:aspect-auto" />
        <div className="hidden bg-[#3D0F1F] lg:col-span-5 lg:block" />
      </div>
    );
  }

  const currentSlide = slides[currentSlideIdx] || slides[0];
  if (!currentSlide) return null;

  const slidePrice = Number(currentSlide.price) || 1150;
  const originalPrice = Number(currentSlide.originalPrice) || Math.round(slidePrice * 1.95);
  const discountPercent = (originalPrice > 0 && !isNaN(originalPrice) && !isNaN(slidePrice))
    ? Math.max(0, Math.round(((originalPrice - slidePrice) / originalPrice) * 100))
    : 0;
  return (
    <section id="haute-couture-hero" aria-label="Featured collection" className="w-full border-y border-[#B8935A]/35 bg-[#FAF5EB]">
      <div
        className="mx-auto grid max-w-[1440px] lg:grid-cols-12"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <button
          type="button"
          onClick={() => handleSlideClick(currentSlide)}
          onTouchStart={(event) => setTouchStart(event.touches[0].clientX)}
          onTouchEnd={(event) => {
            if (touchStart === null) return;
            const delta = touchStart - event.changedTouches[0].clientX;
            if (delta > 45) handleNext();
            if (delta < -45) handlePrev();
            setTouchStart(null);
          }}
          className="group relative block w-full cursor-pointer overflow-hidden bg-[#FAF5EB] text-left lg:col-span-7"
          aria-label={`View ${currentSlide.title}`}
        >
          <div className="aspect-[4/5] max-h-[78vh] w-full">
            <img
              src={getCleanImageUrl(currentSlide.image, 1200) || ELEGANT_PLACEHOLDER_SVG}
              alt={currentSlide.title || 'Featured Suit Aura Girls design'}
              className="h-full w-full object-contain"
              loading="eager"
              decoding="async"
              onError={(event) => {
                if (!event.currentTarget.src.includes('data:image/svg+xml')) {
                  event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG;
                }
              }}
            />
          </div>
          <span className="sr-only">Open featured design</span>
        </button>

        <div className="flex min-h-[360px] flex-col justify-between bg-[#3D0F1F] px-6 py-8 text-[#FAF5EB] sm:px-10 sm:py-11 lg:col-span-5 lg:px-12 lg:py-14">
          <div>
            <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#DFBE65] sm:text-xs">
              {currentSlide.badge || 'Jaipur artisan edit'}
            </p>
            <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-[#FAF5EB]/65">
              {currentSlide.rawProduct?.category || 'Hand-finished in Jaipur'}
            </p>
            <h1 className="max-w-xl font-serif text-4xl font-medium leading-[1.04] sm:text-5xl lg:text-6xl">
              {currentSlide.title}
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-[#FAF5EB]/80 sm:text-base">
              {currentSlide.subtitle || 'A considered silhouette, crafted for the moments you make your own.'}
            </p>

            <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[#B8935A]/35 pt-5">
              <span className="font-serif text-2xl font-semibold text-[#FAF5EB] sm:text-3xl">
                ₹{slidePrice.toLocaleString('en-IN')}
              </span>
              {originalPrice > slidePrice && (
                <span className="text-sm text-[#FAF5EB]/55 line-through">
                  ₹{originalPrice.toLocaleString('en-IN')}
                </span>
              )}
              {discountPercent > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#DFBE65]">
                  Save {discountPercent}%
                </span>
              )}
            </div>

            <button
              type="button"
              id="hero-view-style-btn"
              onClick={() => handleSlideClick(currentSlide)}
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-3 bg-[#B8935A] px-6 text-xs font-bold uppercase tracking-[0.14em] text-[#3D0F1F] transition-colors hover:bg-[#DFBE65]"
            >
              Discover this design <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-10 flex items-center justify-between border-t border-[#B8935A]/35 pt-5">
            <div className="flex items-center gap-2" aria-label={`Slide ${currentSlideIdx + 1} of ${slides.length}`}>
              <span className="font-serif text-lg text-[#DFBE65]">{String(currentSlideIdx + 1).padStart(2, '0')}</span>
              <span className="text-xs text-[#FAF5EB]/45">/ {String(slides.length).padStart(2, '0')}</span>
              <span className="ml-2 max-w-[140px] truncate text-xs text-[#FAF5EB]/75">{currentSlide.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured design"
                className="flex h-10 w-10 items-center justify-center border border-[#B8935A]/50 text-[#FAF5EB] transition-colors hover:bg-[#FAF5EB]/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured design"
                className="flex h-10 w-10 items-center justify-center border border-[#B8935A]/50 text-[#FAF5EB] transition-colors hover:bg-[#FAF5EB]/10"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
