import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pause } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { useAdmin, generateHeroSlidesFromProducts } from '../context/AdminContext';
import { HeroBannerConfig, Product } from '../types';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { categoryToSlug, slugToCategory } from '../utils/slugHelper';
import { WOMEN_CATEGORY_NAMES } from '../data/womenCategories';
import { prepaidPercentApplies } from '../utils/prepaid';
import { frameInsets } from './HomeSections';
import { useCardDeck } from './useCardDeck';
import { Icon, Odometer, clamp, setVar, useNoPin, useScrollFx } from '../aura';

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
const plainWords = (text: string) => text.replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim();

/**
 * A slide's title as the headline: its last word is the serif accent, and the type gets one step smaller as the
 * title gets longer (a short title the owner typed stands very large; a product's full name still fits).
 * A slide without a title carries the store's own line.
 */
const headlineOf = (title: string) => {
  const words = plainWords(title || '').split(' ').filter(Boolean);
  if (words.length === 0) return { rest: 'Ethnic wear across', accent: 'India', size: 'lg' };
  const length = words.join(' ').length;
  const size = length <= 18 ? 'xl' : length <= 34 ? 'lg' : length <= 54 ? 'md' : 'sm';
  if (words.length === 1) return { rest: '', accent: words[0], size };
  return { rest: words.slice(0, -1).join(' '), accent: words[words.length - 1], size };
};
const two = (value: number) => String(value).padStart(2, '0');
/** How long a card stays on top before the deck deals the next one by itself. */
const DEAL_EVERY_MS = 6000;

/**
 * Hero, "the deck": the owner's slides are a pile of large round-cornered photo cards. The top card is the
 * look on show; the next two peek out behind it, a little turned. The shopper drags the top card away (it
 * follows the finger, tilts, and is dealt or springs back: src/components/useCardDeck.ts), or uses the arrows
 * or the arrow keys; the deck also deals by itself every 6 seconds, shown by the thin line that fills (it
 * waits while the pointer, the keyboard focus or a finger is on the hero, and while the hero is off screen).
 * With each card the words exchange: the owner's badge text, the title as the headline, the real price and
 * "% off"; "Shop now" opens the look on show. Nothing is drawn on a photo.
 * Scrolling tucks the fan together and lets the deck recede (one CSS variable from the shared scroll engine).
 * With reduced motion, without sticky support or on a very short screen the deck is still: the cards lie
 * fanned and the previous / next buttons change the look at once.
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
  const count = slides.length;
  const still = useNoPin();
  const wrap = useRef<HTMLElement>(null);
  const deckEl = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  // The direction of the last change (the words come up from below for the next look, down for the previous)
  const [stepDir, setStepDir] = useState<1 | -1>(1);
  // Nothing animates in before the shopper (or the clock) has changed the look once
  const [moved, setMoved] = useState(false);
  const [paused, setPaused] = useState(false);
  // Photos of the cards deeper in the pile are asked for only after the first screen is up
  const [warm, setWarm] = useState(false);
  const asked = useRef(new Set<string>());
  const insets = useRef({ hs: 0 });
  const cur = count > 0 ? index % count : 0;

  const onChange = (next: number, dir: 1 | -1) => { setIndex(next); setStepDir(dir); setMoved(true); setWarm(true); };
  // Why the deck is waiting (pointer over it, focus inside, a finger down, off screen, the pause button), kept
  // as `data-hold` on the section: it only stops the line that fills, and the line's end deals the next card
  const holds = useRef(new Set<string>());
  const hold = (why: string, on: boolean) => {
    if (on) holds.current.add(why); else holds.current.delete(why);
    const el = wrap.current;
    if (!el) return;
    if (holds.current.size > 0) el.dataset.hold = Array.from(holds.current).join(' '); else delete el.dataset.hold;
  };
  const deck = useCardDeck(deckEl, slides.map((slide, i) => slide.id || i).join('|'), !still, onChange, (active) => hold('drag', active));
  const goNext = () => { if (still) onChange((cur + 1) % count, 1); else deck.next(-1); };
  const goPrev = () => { if (still) onChange((cur - 1 + count) % count, -1); else deck.prev(); };

  useScrollFx(wrap, ({ y, top, height }) => {
    if (still) return;
    setVar(deckEl.current, '--k', clamp((y - (top - insets.current.hs)) / Math.max(1, height * 0.8)));
  }, [still, count > 0], {
    measure: (el, { vh, top }) => {
      const frame = frameInsets();
      insets.current.hs = frame.hs;
      // What scrolls away above the hero when the page is at its top: the hero is that much shorter, so it
      // fits the first screen
      const above = top - frame.hs;
      setVar(el, '--hs', `${frame.hs}px`);
      setVar(el, '--hx', `${above > 0 && above < vh * 0.3 ? Math.round(above) : 0}px`);
      setVar(el, '--tb', `${frame.tb}px`);
      deck.measure();
    },
  });

  useEffect(() => {
    const el = wrap.current;
    if (!el || count < 2) return undefined;
    const timer = window.setTimeout(() => setWarm(true), 2600);
    let watch: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      watch = new IntersectionObserver((entries) => hold('off', !entries[entries.length - 1].isIntersecting), { threshold: 0.4 });
      watch.observe(el);
    }
    return () => { window.clearTimeout(timer); watch?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // The keyboard focus follows the look: when the focused card leaves the top of the pile, the new top card
  // takes the focus (a card under the pile is hidden, and a hidden element drops the focus without a word)
  useLayoutEffect(() => {
    const pile = deckEl.current;
    const section = wrap.current;
    if (!pile || !section) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.hasAttribute('data-card') && pile.contains(active) && active.dataset.slot !== '0') {
      pile.querySelector<HTMLElement>('[data-card][data-slot="0"]')?.focus({ preventScroll: true });
    }
    if (holds.current.has('focus') && !section.contains(document.activeElement)) hold('focus', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

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
  // The same destination as an address, for the card's link
  const hrefOf = (slide: LiveHeroSlide) => {
    if (slide.productId) return `/product/${slide.productId}`;
    const targetLink = slide.link || 'All';
    if (products.some((p) => p.id === targetLink)) return `/product/${targetLink}`;
    const category = HERO_CATEGORY_LINKS.find((candidate) => candidate === slugToCategory(targetLink));
    return !category || category === 'All' ? '/shop' : `/category/${categoryToSlug(category)}`;
  };

  if (isLoading && count === 0) {
    return (
      <div className="h3v-in" aria-hidden="true">
        <div className="h3v-stage"><div className="h3v-deck"><span className="h3v-c" data-slot="0"><span className="h3v-ph" /></span></div></div>
        <div className="flex flex-col gap-3 pt-4">
          <div className="h-3 w-28 rounded-full bg-sunken" />
          <div className="h-9 w-3/4 rounded-2xl bg-sunken" />
          <div className="h-12 w-40 rounded-full bg-sunken" />
        </div>
      </div>
    );
  }
  if (count === 0) return null;

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
  const rupees = (value: number) => `₹${value.toLocaleString('en-IN')}`;

  const slotOf = (i: number) => (i - cur + count) % count;
  const photo = (slide: LiveHeroSlide, i: number) => {
    const slot = slotOf(i);
    const key = slide.id || String(i);
    // The top three are on the first screen; the one under them and the one that "previous" brings back follow
    if (slot <= 2 || (warm && (slot === 3 || slot === count - 1))) asked.current.add(key);
    if (!asked.current.has(key)) return null;
    const first = i === 0;
    const small = getCleanImageUrl(slide.image, 640);
    const mid = getCleanImageUrl(slide.image, 828);
    const wide = getCleanImageUrl(slide.image, 1100);
    return (
      <img
        src={small || ELEGANT_PLACEHOLDER_SVG}
        srcSet={slide.image && small && small !== wide ? `${small} 640w, ${mid} 828w, ${wide} 1100w` : undefined}
        sizes="(min-width: 900px) 500px, (min-width: 640px) 440px, 76vw"
        alt={slot === 0 ? (slide.title || 'Featured Suit Aura Girls design') : ''}
        loading={first ? 'eager' : 'lazy'}
        fetchPriority={first ? 'high' : 'low'}
        decoding="async"
        draggable={false}
        onError={(event) => {
          if (!event.currentTarget.src.includes('data:image/svg+xml')) { event.currentTarget.removeAttribute('srcset'); event.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }
        }}
      />
    );
  };

  const shown = slides[cur];
  const w = wordsOf(shown);
  const head = headlineOf(shown.title);
  // The words of one slide, laid out but not shown: the block keeps the height of the tallest slide, so the
  // buttons under it never move when the look changes
  const sizer = (slide: LiveHeroSlide, i: number) => {
    const sw = wordsOf(slide);
    const sh = headlineOf(slide.title);
    return (
      <div key={slide.id || i} className="h3v-sz" aria-hidden="true">
        <p className="h3v-hl" data-z={sh.size}>{sh.rest} <em>{sh.accent}</em></p>
        {sw.slidePrice > 0 && <p className="h3v-pr">{rupees(sw.slidePrice)}</p>}
        {sw.onlineOffer && <p className="h3v-of">{sw.onlineOffer}</p>}
      </div>
    );
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (count < 2 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); goNext(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); goPrev(); }
  };
  const openCard = (event: React.MouseEvent<HTMLAnchorElement>, slide: LiveHeroSlide) => {
    // A drag ends in a click: that click never opens the card
    if (deck.dragged()) { event.preventDefault(); return; }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    handleSlideClick(slide);
  };

  return (
    <section
      ref={wrap}
      id="haute-couture-hero"
      aria-label="Featured collection"
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      data-th="paper"
      data-still={still ? '' : undefined}
      className="hm-hero h3v"
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') hold('hover', true); }}
      onPointerLeave={() => hold('hover', false)}
      onPointerDown={(event) => { if (event.pointerType !== 'mouse') hold('touch', true); }}
      onPointerUp={() => hold('touch', false)}
      onPointerCancel={() => hold('touch', false)}
      onFocus={() => hold('focus', true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hold('focus', false); }}
    >
      <div className="h3v-in">
        <div className="h3v-stage">
          <div ref={deckEl} className={`h3v-deck${count > 1 ? ' h3v-many' : ''}`}>
            {slides.map((slide, i) => {
              const slot = slotOf(i);
              return (
                <a
                  key={slide.id || i}
                  href={hrefOf(slide)}
                  data-card=""
                  data-slot={Math.min(slot, 3)}
                  data-cur={count > 1 && !still ? 'Drag' : 'View'}
                  className="h3v-c"
                  draggable={false}
                  tabIndex={slot === 0 ? 0 : -1}
                  aria-hidden={slot === 0 ? undefined : true}
                  aria-label={`View ${slide.title}`}
                  onClick={(event) => openCard(event, slide)}
                >
                  <span className="h3v-ph">{photo(slide, i)}</span>
                </a>
              );
            })}
          </div>
        </div>

        <div className="h3v-txt" data-dir={stepDir} data-mv={moved ? '' : undefined}>
          {count > 1 && (
            <div className="h3v-segs" aria-hidden="true">
              {slides.map((slide, i) => (
                <span key={slide.id || i} className={i < cur ? 'on' : undefined}>
                  {i === cur && <i key={cur} onAnimationEnd={() => { if (!still && !paused) deck.next(-1); }} style={{ animationDuration: `${DEAL_EVERY_MS}ms` }} />}
                </span>
              ))}
            </div>
          )}
          <p key={`l${cur}`} className="h3v-lbl aura-lbl h3v-a">{w.caption}</p>
          {count > 1 && (
            <div className="h3v-bar" role="group" aria-label="Change the look">
              <button type="button" className="h3v-ar" aria-label="Previous look" onClick={goPrev}><Icon name="arrow" size={18} className="rotate-180" /></button>
              <span className="h3v-ct aura-num" aria-label={`Look ${cur + 1} of ${count}`}>
                <Odometer value={two(cur + 1)} roll={false} /><small aria-hidden="true">/ {two(count)}</small>
              </span>
              <button type="button" className="h3v-ar" aria-label="Next look" onClick={goNext}><Icon name="arrow" size={18} /></button>
              {!still && (
                <button
                  type="button"
                  className="h3v-ar h3v-pp"
                  aria-label={paused ? 'Play: change the look every few seconds' : 'Pause: stop changing the look'}
                  aria-pressed={paused}
                  onClick={() => { hold('user', !paused); setPaused(!paused); }}
                >
                  {paused ? <Icon name="play" size={16} /> : <Pause size={16} strokeWidth={1.6} aria-hidden="true" />}
                </button>
              )}
            </div>
          )}
          <div className="h3v-words">
            {count > 1 && slides.map(sizer)}
            <div className="h3v-live">
              <h1 key={`h${cur}`} className="h3v-hl h3v-a" data-z={head.size}>
                <span className="sr-only">Suit Aura Girls: </span>
                {head.rest} <em>{head.accent}</em>
              </h1>
              {w.slidePrice > 0 && (
                <p className="h3v-pr aura-num">
                  <span className="sr-only">Price {rupees(w.slidePrice)}</span>
                  <b aria-hidden="true"><Odometer value={rupees(w.slidePrice)} roll={false} /></b>
                  {w.originalPrice > w.slidePrice && <s key={`s${cur}`} className="h3v-a">{rupees(w.originalPrice)}</s>}
                  {w.discountPercent > 0 && <span key={`d${cur}`} className="h3v-off h3v-a">{w.discountPercent}% off</span>}
                </p>
              )}
              {w.onlineOffer && <p key={`o${cur}`} className="h3v-of aura-sa h3v-a">{w.onlineOffer}</p>}
            </div>
          </div>
          <div className="h3v-cta">
            <button type="button" id="hero-view-style-btn" onClick={() => handleSlideClick(shown)} className="aura-btn">
              Shop now <Icon name="arrow" />
            </button>
            <button type="button" id="hero-explore-btn" onClick={() => navigateToCategory('All')} aria-label="Explore collection" className="aura-lk">
              Explore
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
