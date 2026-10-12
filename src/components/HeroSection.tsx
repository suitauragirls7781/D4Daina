import React, { useRef } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin, generateHeroSlidesFromProducts } from '../context/AdminContext';
import { HeroBannerConfig, Product } from '../types';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { slugToCategory } from '../utils/slugHelper';
import { WOMEN_CATEGORY_NAMES } from '../data/womenCategories';
import { prepaidPercentApplies } from '../utils/prepaid';
import { assuranceFacts } from './Assurance';
import { frameInsets } from './HomeSections';
import { Icon, clamp, setVar, smooth, useNoPin, useScrollFx } from '../aura';

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
const HERO_CATEGORY_LINKS: readonly string[] = ['All', ...WOMEN_CATEGORY_NAMES, 'Sale', 'New Arrivals', 'Best Sellers', 'Trending'];

/** The badge as plain words: emoji and the joiners that belong to them are removed. */
const plainWords = (text: string) => text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();

// The store's own short line (the header says "Ethnic wear · Delivery across India"), as the two-line headline
const STORE_HEADLINE = { first: 'Ethnic wear', second: 'across', accent: 'India' };

/**
 * The two lines of the big headline. A short title the owner gave the first slide is used as it is (its last
 * word becomes the accent); a long one (a product's full name) cannot be set that large, so the store's own
 * line stands there and the slide's real title is shown with its price under the photo.
 */
const headlineFrom = (title: string) => {
  const words = plainWords(title || '').split(' ').filter(Boolean);
  if (words.length < 2 || words.length > 4 || words.join(' ').length > 22) return STORE_HEADLINE;
  const accent = words[words.length - 1];
  const rest = words.slice(0, -1);
  const cut = rest.length === 1 ? 1 : Math.ceil(rest.length / 2);
  return { first: rest.slice(0, cut).join(' '), second: rest.slice(cut).join(' '), accent };
};

/**
 * Hero, the opening of the scroll story. The first slide is pinned: a tall wrapper with a sticky stage. At
 * rest: the small label, a two-line headline in very large light type and the photo inside an arch, with a
 * thin thread drawn around it; under it the store's facts in one line and "Scroll". Scrolling opens the arch
 * into a full-width round-cornered photo (clip-path from --o), the headline becomes bold (--wt), the facts
 * leave (--c) and the slide's real title, price and buttons come up in their place (--b). Only CSS variables
 * are written, from the shared scroll engine; nothing is taken from the scroll.
 * The other slides follow right after as a swipe row of large round-cornered cards (photo, title, real
 * price, link). Nothing is drawn on a photo. Without pinning (reduced motion, no sticky, a very short
 * screen) the first slide is a plain block with everything visible.
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
  const still = useNoPin();
  const wrap = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const photoFrame = useRef<HTMLDivElement>(null);
  const threadPath = useRef<SVGPathElement>(null);
  const row = useRef<HTMLUListElement>(null);
  // Sizes cached by the measure pass (never read on a scroll frame)
  const size = useRef({ hs: 0, pinH: 1, x: 0, y: 0, w: 0, h: 0, gutter: 10, drawn: -1, cta: false });

  useScrollFx(wrap, ({ y, top, height }) => {
    const g = size.current;
    const pin = stage.current;
    if (still || !pin) return;
    const p = clamp((y - (top - g.hs)) / Math.max(1, height - g.pinH));
    const o = smooth(clamp(p / 0.72));
    setVar(pin, '--o', o);
    setVar(pin, '--wt', o, 2);
    setVar(pin, '--c', 1 - clamp(p / 0.22));
    const b = clamp((p - 0.5) / 0.34);
    setVar(pin, '--b', b);
    const cta = b > 0.6;
    if (cta !== g.cta) { g.cta = cta; pin.classList.toggle('cta', cta); }
    // The thread follows the arch as it opens
    const step = Math.round(o * 1000);
    if (step !== g.drawn && threadPath.current && g.w > 0) {
      g.drawn = step;
      const gap = 6;
      const inset = (1 - o) * 0.19 * g.w;
      const xl = g.x + inset - gap;
      const xr = g.x + g.w - inset + gap;
      const yt = g.y - gap;
      const yb = g.y + g.h + gap;
      const r = Math.min(26 + gap + (1 - o) * 240, (xr - xl) / 2);
      const rb = 30;
      const ex = g.gutter;
      const ey = Math.min(yb + 50, g.pinH);
      const n = (v: number) => v.toFixed(1);
      threadPath.current.setAttribute('d', `M${n(xl + rb)} ${n(yb)}H${n(xr - rb)}Q${n(xr)} ${n(yb)} ${n(xr)} ${n(yb - rb)}V${n(yt + r)}A${n(r)} ${n(r)} 0 0 0 ${n(xr - r)} ${n(yt)}H${n(xl + r)}A${n(r)} ${n(r)} 0 0 0 ${n(xl)} ${n(yt + r)}V${n(yb - rb)}Q${n(xl)} ${n(yb)} ${n(xl + rb)} ${n(yb)}C${n(xl - 10)} ${n(yb + 2)} ${n(ex)} ${n(yb + 6)} ${n(ex)} ${n(ey)}V${n(g.pinH)}`);
    }
  }, [still, slides.length > 0], {
    measure: (el, { vh, vw, top }) => {
      const g = size.current;
      const insets = frameInsets();
      // What scrolls away above the hero when the page is at its top (the announcement strip): the stage is
      // that much shorter, so the whole hero fits the first screen
      const above = top - insets.hs;
      setVar(el, '--hs', `${insets.hs}px`);
      setVar(el, '--hx', `${above > 0 && above < vh * 0.3 ? Math.round(above) : 0}px`);
      setVar(el, '--tb', `${insets.tb}px`);
      const pin = stage.current;
      const frame = photoFrame.current;
      if (!pin || !frame) return;
      g.hs = insets.hs;
      g.pinH = pin.offsetHeight;
      g.x = frame.offsetLeft;
      g.y = frame.offsetTop;
      g.w = frame.offsetWidth;
      g.h = frame.offsetHeight;
      // The same gutter the page's thread runs in (src/aura/Thread.tsx), so the two lines meet
      g.gutter = Math.max(10, (vw - 1120) / 2 - 8);
      g.drawn = -1;
    },
  });

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
      navigateToCategory((category || 'All') as any);
    }
  };

  if (isLoading && (!slides || slides.length === 0)) {
    return (
      <div className="w-full px-3.5 pb-10 pt-8" aria-hidden="true">
        <div className="mx-auto flex max-w-[1120px] flex-col items-center gap-4">
          <div className="h-3 w-28 rounded-full bg-sunken" />
          <div className="h-12 w-3/4 rounded-2xl bg-sunken" />
          <div className="aspect-[4/5] w-[62%] max-w-[420px] rounded-t-full rounded-b-[26px] bg-sunken" />
        </div>
      </div>
    );
  }

  const lead = slides[0];
  if (!lead) return null;

  // What one slide says under (never on) its photo: the owner's badge text, the real price and the real offer
  const wordsOf = (slide: LiveHeroSlide) => {
    const slidePrice = Number(slide.price) || 0;
    const originalPrice = Math.max(slidePrice, Number(slide.originalPrice) || slidePrice);
    const discountPercent = originalPrice > slidePrice ? Math.round(((originalPrice - slidePrice) / originalPrice) * 100) : 0;
    // The admin's own badge text as the label, or the plain "New season"
    const caption = plainWords(ownerBadge(slide.badge)) || 'New season';
    // The percent offer is shown only when this product's price qualifies for it
    const onlineOffer = slidePrice <= 0
      ? ''
      : prepaidPercentApplies(storeOffers, slidePrice)
      ? `Extra ${storeOffers.prepaidPercent}% off with online payment`
      : storeOffers.prepaidDiscount > 0
      ? `Extra ₹${storeOffers.prepaidDiscount} off on online payment`
      : '';
    return { slidePrice, originalPrice, discountPercent, caption, onlineOffer };
  };
  const priceLine = (slide: LiveHeroSlide, className: string) => {
    const w = wordsOf(slide);
    if (w.slidePrice <= 0) return null;
    return (
      <span className={`aura-num flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
        <b className="text-[17px] font-extrabold leading-6">₹{w.slidePrice.toLocaleString('en-IN')}</b>
        {w.originalPrice > w.slidePrice && <s className="aura-mu text-[13px]">₹{w.originalPrice.toLocaleString('en-IN')}</s>}
        {w.discountPercent > 0 && <span className="aura-sa text-[13px] font-bold">{w.discountPercent}% off</span>}
      </span>
    );
  };
  const photo = (slide: LiveHeroSlide, sizes: string, eager: boolean) => {
    const small = getCleanImageUrl(slide.image, 640);
    const mid = getCleanImageUrl(slide.image, 828);
    const wide = getCleanImageUrl(slide.image, 1100);
    return (
      <img
        src={small || ELEGANT_PLACEHOLDER_SVG}
        srcSet={slide.image && small && small !== wide ? `${small} 640w, ${mid} 828w, ${wide} 1100w` : undefined}
        sizes={sizes}
        alt={slide.title || 'Featured Suit Aura Girls design'}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        decoding="async"
        draggable={false}
        onError={(event) => {
          if (!event.currentTarget.src.includes('data:image/svg+xml')) { event.currentTarget.removeAttribute('srcset'); event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }
        }}
      />
    );
  };

  const lw = wordsOf(lead);
  const head = headlineFrom(lead.title);
  const secondLine = [head.second, head.accent].filter(Boolean).join(' ');
  const longest = Math.max(head.first.length, secondLine.length, 6);
  const facts = assuranceFacts();
  const factLine = [facts.payment, facts.returns, facts.delivery];
  const rest = slides.slice(1);

  const headline = (
    <h1 className="hm-hl" style={{ '--n': longest } as React.CSSProperties}>
      <span className="sr-only">Suit Aura Girls: </span>
      {head.first}<br />{head.second && `${head.second} `}<em>{head.accent}</em>
    </h1>
  );
  // The first slide's own words: its real title, price, offer and the two actions
  const leadWords = (
    <>
      <p className="line-clamp-1 max-w-full text-[16px] font-bold leading-[1.25] lg:line-clamp-2 lg:text-[19px]">{lead.title}</p>
      {priceLine(lead, 'justify-center lg:justify-start')}
      {lw.onlineOffer && <p className="aura-sa text-[13px] font-semibold leading-[18px]">{lw.onlineOffer}</p>}
      <span className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 lg:justify-start">
        <button type="button" id="hero-view-style-btn" onClick={() => handleSlideClick(lead)} className="aura-btn">
          Shop now <Icon name="arrow" />
        </button>
        <button type="button" id="hero-explore-btn" onClick={() => navigateToCategory('All')} aria-label="Explore collection" className="aura-lk">
          Explore
        </button>
      </span>
    </>
  );
  const factsLine = (
    <p className="hm-facts">
      {factLine.map((fact, i) => <React.Fragment key={fact}>{i > 0 && <i aria-hidden="true" />}{fact}</React.Fragment>)}
    </p>
  );

  const more = rest.length > 0 && (
    <section id="hero-more-designs" aria-label="Featured designs" data-thread="left" className="w-full pb-14 pt-10 lg:pb-20 lg:pt-14">
      <div className="mx-auto flex w-full max-w-[1120px] items-end justify-between gap-3 px-[18px] pb-4 lg:px-0">
        <p className="aura-lbl">More to see · {String(rest.length).padStart(2, '0')}</p>
        {rest.length > 3 && (
          <div className="hidden items-center gap-2 lg:flex">
            <button type="button" aria-label="Previous design" onClick={() => row.current?.scrollBy({ left: -340, behavior: 'smooth' })} className="aura-rnd aura-btn-line">
              <Icon name="arrow" className="rotate-180" />
            </button>
            <button type="button" aria-label="Next design" onClick={() => row.current?.scrollBy({ left: 340, behavior: 'smooth' })} className="aura-rnd aura-btn-line">
              <Icon name="arrow" />
            </button>
          </div>
        )}
      </div>
      <ul ref={row} className="hm-hs sag-scroll-x">
        {rest.map((slide, index) => {
          const w = wordsOf(slide);
          return (
            <li key={slide.id || index} className="hm-hs-c" data-rv="card">
              <button type="button" onClick={() => handleSlideClick(slide)} aria-label={`View ${slide.title}`} className="block w-full cursor-pointer text-left">
                <span className="hm-hs-ph aura-sk">{photo(slide, '(min-width: 900px) 320px, 72vw', false)}</span>
                <span className="aura-lbl mt-3.5 block">{w.caption}</span>
                <span className="mt-1.5 block text-[17px] font-bold leading-[1.25] tracking-[-0.01em] line-clamp-2">{slide.title}</span>
                {priceLine(slide, 'mt-1.5')}
                {w.onlineOffer && <span className="aura-sa mt-0.5 block text-[13px] font-semibold leading-[18px]">{w.onlineOffer}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  if (still) {
    return (
      <>
        <section id="haute-couture-hero" aria-label="Featured collection" data-th="paper" className="w-full px-3.5 pb-8 pt-6 lg:px-8 lg:pt-10">
          <div className="hm-hero-still mx-auto grid w-full max-w-[1120px] gap-5 lg:grid-cols-2 lg:items-center lg:gap-x-14">
            <div className="text-center lg:text-left">
              <p className="aura-lbl">{lw.caption}</p>
              {headline}
            </div>
            <button type="button" onClick={() => handleSlideClick(lead)} aria-label={`View ${lead.title}`} className="hm-hero-ph aura-sk lg:col-start-2 lg:row-span-2 lg:row-start-1">
              {photo(lead, '(min-width: 1024px) 540px, 94vw', true)}
            </button>
            <div className="flex flex-col items-center gap-2.5 text-center lg:items-start lg:text-left">
              {leadWords}
              <div className="mt-4">{factsLine}</div>
            </div>
          </div>
        </section>
        {more}
      </>
    );
  }

  return (
    <>
      <section ref={wrap} id="haute-couture-hero" aria-label="Featured collection" data-th="paper" className="hm-hero">
        <div ref={stage} className="hm-hero-pin">
          <svg className="aura-thr hm-hero-th" aria-hidden="true" focusable="false"><path ref={threadPath} pathLength={1} /></svg>
          <div className="hm-hero-txt">
            <p className="aura-lbl">{lw.caption}</p>
            {headline}
          </div>
          <div ref={photoFrame} className="hm-hero-fr">
            <button type="button" onClick={() => handleSlideClick(lead)} aria-label={`View ${lead.title}`} className="hm-hero-clip">
              {photo(lead, '(min-width: 900px) 46vw, 96vw', true)}
            </button>
          </div>
          <div className="hm-hero-bot">
            <div className="hm-hero-a">
              {factsLine}
              <div className="hm-cue" aria-hidden="true"><span />Scroll</div>
            </div>
            <div className="hm-hero-b">{leadWords}</div>
          </div>
        </div>
      </section>
      {more}
    </>
  );
};
