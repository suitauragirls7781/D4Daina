import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { ProductCard } from './ProductCard';
import { prepaidPercentText, prepaidRulesFrom } from '../utils/prepaid';
import { CheckCircle2, ChevronRight, Loader2, MessageCircleQuestion, X } from 'lucide-react';
import { useDiscovery } from '../utils/discovery';
import { isAccessory } from '../utils/looks';
import { assuranceFacts, HowOrderWorks } from './Assurance';
import { WhatsAppIcon } from './BrandIcons';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { getCleanImageUrl, productPhoto, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { preloadImage } from '../utils/pageTransition';
import { SectionTitle } from './SectionTitle';
import { Product, ProductSize } from '../types';
import { AuraTitle, Icon, Odometer, clamp, flyToBag, revealOnce, setVar, useColumnDrift, useNoPin, useReducedMotion, useScrollFx } from '../aura';
import type { IconName } from '../aura';

/** Shared widths so every home section lines up on the same gutters. */
export const HOME_WRAP = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
/** Section rhythm: space only; a section is transparent and takes its colour from the page's backdrop (data-th). */
export const HOME_SECTION = 'w-full py-14 lg:py-20';
/** One card in a horizontal product rail: a little under two cards show on a phone, so the rail reads as swipeable. */
export const HOME_RAIL_ITEM = 'shrink-0 w-[58%] sm:w-[250px]';
/** The rail itself: a 12px gap on phones to match the two-column product grids. */
export const HOME_RAIL = 'sag-scroll-x flex gap-3 sm:gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1';
/** Product grid: two columns on phones, four from tablet width up. */
export const HOME_GRID = 'grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-5 md:gap-y-9';
/** Small capitals label above a title. */
export const HOME_EYEBROW = 'aura-lbl';
/** The space between a section's title and its content. */
const HOME_TITLE_GAP = 'mb-7 lg:mb-10';
/** The narrower column of the Aura story sections (the mockup's 1120px). */
const STORY_WRAP = 'mx-auto w-full max-w-[1120px]';

/**
 * What the site frame keeps on screen: the header that stays at the top (`hs`) and the phone tab bar (`tb`),
 * in px. Read only in a measure pass (never on a scroll frame): the pinned sections of the homepage keep
 * their content clear of both.
 */
export const frameInsets = () => {
  if (typeof document === 'undefined') return { hs: 0, tb: 0 };
  let hs = 0;
  const header = document.querySelector<HTMLElement>('#app-main-content header') || document.querySelector<HTMLElement>('header');
  if (header) {
    const style = getComputedStyle(header);
    if ((style.position === 'sticky' || style.position === 'fixed') && style.display !== 'none') hs = Math.min(header.offsetHeight, 140);
  }
  let tb = 0;
  const nav = document.getElementById('mobile-app-bottom-navbar');
  if (nav) {
    const rect = nav.getBoundingClientRect();
    if (rect.height > 0 && getComputedStyle(nav).position === 'fixed') tb = clamp(window.innerHeight - rect.top, 0, 120);
  }
  return { hs, tb };
};

/** The bold link under a section's content ("View all"). */
export const HomeMore: React.FC<{ onClick: () => void; id?: string; className?: string; children: React.ReactNode }> = ({ onClick, id, className = 'mt-6 lg:mt-9', children }) => (
  <div className={`flex px-4 sm:px-6 lg:px-8 ${className}`}>
    <button type="button" id={id} onClick={onClick} className="aura-lk whitespace-nowrap">{children}</button>
  </div>
);

interface HomeSectionHeaderProps {
  title: string;
  text?: string;
  eyebrow?: string;
  /** id for the h2, so the section can point at it with aria-labelledby */
  titleId?: string;
  action?: { label: string; onClick: () => void; id?: string };
  className?: string;
}

/**
 * Home section title: the small capitals label, the big title with its accent word (SectionTitle). An `action`
 * passed here is drawn as the bold link under the title.
 */
export const HomeSectionHeader: React.FC<HomeSectionHeaderProps> = ({ title, text, eyebrow, titleId, action, className = HOME_TITLE_GAP }) => (
  <div className={`flex flex-col items-start ${className}`}>
    <SectionTitle id={titleId} eyebrow={eyebrow} title={title} sub={text} />
    {action && (
      <button type="button" id={action.id} onClick={action.onClick} className="aura-lk mt-1 whitespace-nowrap">
        {action.label}
        <Icon name="arrow" size={18} />
      </button>
    )}
  </div>
);

/** The link under a product grid. */
export const HomeViewAllButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'View all styles' }) => (
  <HomeMore onClick={onClick}>
    {label}
    <Icon name="arrow" size={18} />
  </HomeMore>
);

/**
 * Kinetic band: rows of very large words that slide sideways with the scroll (and drift slowly by
 * themselves), every second row the other way. Words alternate filled, outlined and serif italic. Pass only
 * true facts of the store. With reduced motion the words are simply set as wrapped lines.
 * `bare` draws it as a plain block inside another section (no colour of its own).
 */
export const KineticBand: React.FC<{
  rows: string[][];
  label: string;
  id?: string;
  theme?: 'paper' | 'ink' | 'blush' | 'forest' | 'rose' | 'sand';
  bare?: boolean;
  /** A solid ink strip of its own, whatever the page's colour is at that moment. */
  solid?: boolean;
  className?: string;
}> = ({ rows, label, id, theme = 'ink', bare = false, solid = false, className = '' }) => {
  const ref = useRef<HTMLElement | null>(null);
  const rowEls = useRef<HTMLElement[]>([]);
  const widths = useRef<number[]>([]);
  const still = useReducedMotion();
  const base = useMemo(() => rows.filter((row) => row.length > 0), [rows]);
  // A row must be long enough to fill a wide screen: a short list is said again (the repeats are hidden from screen readers)
  const lines = useMemo(() => base.map((row) => {
    let words = row;
    while (words.length < 4) words = words.concat(row);
    return words;
  }), [base]);

  useScrollFx(ref, ({ y, velocity, time }) => {
    if (still) return;
    for (let i = 0; i < rowEls.current.length; i += 1) {
      const w = widths.current[i] || 1;
      const dir = i % 2 ? 1 : -1;
      const off = (((time * 0.03 + y * 0.55) % w) + w) % w;
      rowEls.current[i].style.transform = `translate3d(${(dir < 0 ? -off : off - w).toFixed(1)}px,0,0) skewX(${clamp(-velocity * 0.22 * dir, -7, 7).toFixed(2)}deg)`;
    }
  }, [still, lines.length], {
    always: !still,
    measure: (el) => {
      rowEls.current = Array.from(el.querySelectorAll<HTMLElement>('.aura-mq-r'));
      widths.current = rowEls.current.map((row) => ((row.firstElementChild as HTMLElement | null)?.scrollWidth || 4) / 4);
    },
  });

  if (lines.length === 0) return null;
  const Tag = (bare ? 'div' : 'section') as 'section';
  return (
    <Tag ref={ref} id={id} role={bare ? 'group' : undefined} aria-label={label} data-th={bare || solid ? undefined : theme} className={`${still ? 'hm-mq-still' : 'aura-mq'} ${solid && !bare ? 'aura-dk bg-dark' : ''} ${className}`}>
      {still ? base.map((words, r) => (
        <p key={r} className="aura-mq-i">
          {words.map((word, i) => (
            <Fragment key={i}><span className={['', 'o', 's'][(i + r) % 3]}>{word}</span>{i < words.length - 1 && <i aria-hidden="true" />}</Fragment>
          ))}
        </p>
      )) : lines.map((words, r) => (
        <div key={r} className="aura-mq-r">
          <div className="aura-mq-i">
            {[0, 1, 2, 3].map((copy) => words.map((word, i) => (
              <Fragment key={`${copy}-${i}`}><span className={['', 'o', 's'][(i + r) % 3]} aria-hidden={copy > 0 || i >= base[r].length || undefined}>{word}</span><i aria-hidden="true" /></Fragment>
            )))}
          </div>
        </div>
      ))}
    </Tag>
  );
};

/** The offers that are live right now, worded once (the offers section, the kinetic band and the ticket read it). */
export const useLiveOffers = () => {
  const { products = [], coupons = [], storeOffers, comboOffer, freeShippingThreshold } = useShop();
  const prepaidDiscount = storeOffers?.prepaidDiscount || 0;
  const prepaidPercentLine = prepaidPercentText(prepaidRulesFrom(storeOffers));
  const saleCount = products.filter((p) => p.inStock && (p.isSale || (p.originalPrice > p.price))).length;
  const bestCoupon = [...coupons].sort((a, b) => b.discountValue - a.discountValue)[0];

  const offers: string[] = [];
  if (comboOffer) offers.push(`${comboOffer.percent}% off when you buy ${comboOffer.minItems}+ outfits`);
  if (bestCoupon) offers.push(`Code ${bestCoupon.code}: ${bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue} off` : `${bestCoupon.discountValue}% off`}${bestCoupon.minOrderValue ? ` above ₹${bestCoupon.minOrderValue.toLocaleString('en-IN')}` : ''}`);
  if (prepaidDiscount > 0) offers.push(`₹${prepaidDiscount} off every prepaid order`);
  if (prepaidPercentLine) offers.push(prepaidPercentLine);
  if (freeShippingThreshold > 0) offers.push(`Free shipping above ₹${freeShippingThreshold.toLocaleString('en-IN')}`);

  const headline = comboOffer
    ? `Save ${comboOffer.percent}% on ${comboOffer.minItems} or more`
    : bestCoupon
    ? `${bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue}` : `${bestCoupon.discountValue}%`} off with ${bestCoupon.code}`
    : saleCount > 0
    ? 'Now on offer'
    : prepaidDiscount > 0
    ? `₹${prepaidDiscount} off prepaid orders`
    : prepaidPercentLine || offers[0];

  // The coupon is drawn as a ticket, so its line is left out of the list under it
  const otherOffers = bestCoupon ? offers.filter((offer) => !offer.startsWith(`Code ${bestCoupon.code}:`)) : offers;
  return { offers, otherOffers, bestCoupon, headline, saleCount };
};

/**
 * The store's facts as the kinetic band under the hero: the four facts of Assurance.tsx in the first row,
 * the offers that are live (else the names of the categories that have styles) in the second.
 */
export const HomeAssuranceBand: React.FC<{ id?: string }> = ({ id = 'home-assurance' }) => {
  const { products = [] } = useShop();
  const { offers } = useLiveOffers();
  const rows = useMemo(() => {
    const facts = assuranceFacts();
    const count = new Map<string, number>();
    products.forEach((p) => { if (p.inStock && p.category) count.set(p.category, (count.get(p.category) || 0) + 1); });
    const names = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 8);
    return [[facts.payment, facts.returns, facts.delivery, 'Chat with us on WhatsApp'], offers.length > 0 ? offers : names];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, offers.join('|')]);
  return <KineticBand id={id} label="Shopping with us" solid rows={rows} />;
};

/**
 * Featured collection: admin "featured" / bestseller picks, otherwise the latest styles, as a bento grid of
 * product cards (the first one large, a wide one further down), with the real number of styles in stock.
 */
export const FeaturedCollection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const { items, liveCount } = useMemo(() => {
    const live = products.filter((p) => p.inStock);
    const picked = live.filter((p) => p.isFeatured || p.isBestSeller);
    return { items: (picked.length >= 2 ? picked : live).slice(0, 8), liveCount: live.length };
  }, [products]);
  // Aura Kinetic: the two columns travel a few pixels against each other while the grid crosses the screen
  const grid = useRef<HTMLDivElement>(null);
  useColumnDrift(grid, 14);
  if (items.length === 0) return null;
  // A lone card would look lost as a wide one: the wide card needs a row of its own to end the grid well
  const wideAt = items.length >= 8 ? 5 : -1;
  return (
    <section id="featured-collection" aria-labelledby="featured-collection-title" data-th="paper" className="w-full px-2.5 pb-20 pt-[90px] lg:px-8">
      <div className={STORY_WRAP}>
        <span data-thread="knot" aria-hidden="true" className="ml-[80%] block h-0 w-0" />
        <AuraTitle
          id="featured-collection-title"
          label="In stock now"
          title="Featured"
          accent="collection"
          accentBreak
          sub={<span className="aura-num">{liveCount} women's {liveCount === 1 ? 'style' : 'styles'} in stock right now.</span>}
          className="px-2 pb-6"
        />
        <div ref={grid} data-thread="right" className="hm-ed-grid">
          {items.map((product, index) => (
            <ProductCard key={product.id} product={product} layout={index === 0 && items.length >= 3 ? 'big' : index === wideAt ? 'wide' : undefined} />
          ))}
        </div>
        <button type="button" onClick={() => navigateToCategory('All')} data-rv className="aura-btn aura-btn-w mt-[22px]">
          View all styles <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
};

/** One card of the new arrivals gallery: a big round photo, the name, the real price line and the round add button. */
const GalleryCard: React.FC<{ product: Product; eager: boolean }> = ({ product, eager }) => {
  const { isInWishlist, toggleWishlist, navigateToProduct, addToCart, cart, setIsCartDrawerOpen } = useShop();
  const [picking, setPicking] = useState(false);
  const frame = useRef<HTMLAnchorElement>(null);
  // The tick stays for as long as this style is in the bag
  const inBag = cart.some((item) => String(item.product?.id) === String(product.id));

  const images = Array.isArray(product.images) ? product.images.filter((img) => typeof img === 'string' && img.trim()) : [];
  const primary = images[0] || product.image || ELEGANT_PLACEHOLDER_SVG;
  const price = Number(product.price) || 0;
  const mrp = Math.max(price, Number(product.originalPrice) || price);
  const discount = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const soldOut = product.inStock === false || Number(product.stockQuantity ?? 0) <= 0;
  const sizes = (product.sizes || []) as ProductSize[];
  const fav = isInWishlist(product.id);
  const href = `/product/${product.id}`;

  const add = (size: ProductSize) => {
    addToCart(product, size, product.colors?.[0], 1, false);
    setPicking(false);
    // The bag already has the style: the flight is only the picture of it
    if (!isAccessory(product)) void flyToBag(frame.current, getCleanImageUrl(primary, 160));
  };
  const onAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (soldOut) return;
    // Already in the bag: open it instead of adding again
    if (inBag) { setIsCartDrawerOpen(true); return; }
    if (sizes.length <= 1) add(sizes[0] || ('Free Size' as ProductSize));
    else setPicking((v) => !v);
  };
  const openProduct = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    // The photo travels to the product page (utils/pageTransition, flight)
    frame.current?.querySelector('img')?.setAttribute('data-vt-source', '');
    const hero = productPhoto(primary);
    preloadImage(hero.src, 280, hero).then(() => navigateToProduct(product.id));
  };

  return (
    <article id={`product-card-${product.id}`} className="hm-gc">
      <div className="relative">
        {/* Nothing is drawn on the photo but the heart */}
        <a ref={frame} href={href} onClick={openProduct} tabIndex={-1} aria-hidden="true" draggable={false} className="hm-gc-f aura-sk">
          <img
            src={getCleanImageUrl(primary, 640)}
            srcSet={getCleanImageUrl(primary, 480) !== getCleanImageUrl(primary, 828) ? `${getCleanImageUrl(primary, 480)} 480w, ${getCleanImageUrl(primary, 640)} 640w, ${getCleanImageUrl(primary, 828)} 828w` : undefined}
            sizes="(min-width: 900px) 28vw, 94vw"
            alt={product.name}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            className={soldOut ? 'opacity-60 grayscale-[35%]' : ''}
            onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) { e.currentTarget.removeAttribute('srcset'); e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; } }}
          />
        </a>
        <button
          id={`wishlist-btn-${product.id}`}
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleWishlist(product); }}
          aria-label={fav ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          aria-pressed={fav}
          className="absolute right-1.5 top-1.5 flex h-[46px] w-[46px] cursor-pointer items-center justify-center rounded-full"
        >
          <span className="aura-lt flex h-[34px] w-[34px] items-center justify-center rounded-full bg-surface text-ink">
            <Icon name="heart" size={18} filled={fav} strokeWidth={1.8} className={fav ? 'text-accent' : ''} />
          </span>
        </button>
      </div>

      {picking ? (
        <div className="hm-gc-b" role="group" aria-label={`Choose a size for ${product.name}`} onClick={(e) => e.stopPropagation()}>
          <div className="min-w-0 flex-1">
            <p className="aura-mu text-[13px] font-bold leading-4">Choose a size</p>
            <div className="hm-gc-sz mt-2">
              {sizes.map((size) => (
                <button key={size} type="button" onClick={() => add(size)} className="hm-gc-s">{size}</button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setPicking(false)} aria-label="Cancel" className="aura-rnd aura-btn-line hm-gc-x">
            <X className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="hm-gc-b">
          <div className="min-w-0 flex-1">
            <h3 className="hm-gc-n" title={product.name}>
              <a href={href} onClick={openProduct} draggable={false}>{product.name}</a>
            </h3>
            <p className="hm-gc-p aura-num">
              <b>₹{price.toLocaleString('en-IN')}</b>
              {mrp > price && <s>₹{mrp.toLocaleString('en-IN')}</s>}
              {discount > 0 && <em>{discount}% off</em>}
            </p>
          </div>
          {soldOut ? (
            <>
              <span className="aura-tag">Sold out</span>
              <button id={`add-to-bag-${product.id}`} type="button" disabled aria-label={`${product.name} is sold out`} className="sr-only">Sold out</button>
            </>
          ) : (
            <button
              id={`add-to-bag-${product.id}`}
              type="button"
              onClick={onAdd}
              aria-label={inBag ? `${product.name} is in your bag. Open bag` : `Add ${product.name} to bag`}
              className={`aura-rnd ${inBag ? 'ok' : ''}`}
            >
              <Icon name="plus" />
              <Icon name="check" draw strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}
    </article>
  );
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * New arrivals: a pinned sideways gallery. Scrolling down moves the row of large cards sideways, the counter
 * rolls and a thin bar fills; a sideways drag with the finger moves it too. Nothing is taken from the scroll:
 * the section is a tall wrapper with a sticky stage, and the row is moved by a transform. Without pinning
 * (reduced motion, no sticky, a very short screen) it is a normal swipe row with snap.
 */
export const NewArrivalsRail: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const items = useMemo(() => {
    const live = products.filter((p) => p.inStock);
    const fresh = live.filter((p) => p.isNewArrival);
    return (fresh.length > 0 ? fresh : live).slice(0, 10);
  }, [products]);

  const still = useNoPin();
  const wrap = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  // Sizes cached by the measure pass: how far the row travels, over how much scroll, the cards' step
  const size = useRef({ distance: 0, travel: 0, step: 1, card: 1, pad: 18, photos: [] as HTMLElement[], count: 0 });
  const shownRef = useRef(1);
  const [shown, setShown] = useState(1);
  const drag = useRef<{ x: number; y: number; on: boolean } | null>(null);
  const dragged = useRef(false);

  useScrollFx(wrap, ({ y, top, vw }) => {
    const g = size.current;
    const row = track.current;
    if (still || !row || g.travel <= 0) return;
    const p = clamp((y - top) / g.travel);
    const x = -p * g.distance;
    row.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    // Each photo slides a little inside its frame as its card crosses the screen
    for (let i = 0; i < g.photos.length; i += 1) {
      const fromCentre = g.pad + i * g.step + x + g.card / 2 - vw / 2;
      if (Math.abs(fromCentre) < vw) g.photos[i].style.transform = `translate3d(${clamp(-fromCentre * 0.085, -g.card * 0.11, g.card * 0.11).toFixed(1)}px,0,0)`;
    }
    const next = clamp(Math.round((-x + vw * 0.25) / g.step), 0, Math.max(0, g.count - 1)) + 1;
    if (next !== shownRef.current) { shownRef.current = next; setShown(next); }
    setVar(bar.current, 'transform', `scaleX(${p.toFixed(4)})`);
  }, [still, items.length], {
    measure: (el, { vh }) => {
      const insets = frameInsets();
      setVar(el, '--hs', `${insets.hs}px`);
      setVar(el, '--tb', `${insets.tb}px`);
      const row = track.current;
      if (still || !row || !view.current || !stage.current) return;
      const g = size.current;
      const first = row.children[0] as HTMLElement | undefined;
      const second = row.children[1] as HTMLElement | undefined;
      g.card = first ? first.offsetWidth : 1;
      g.pad = first ? first.offsetLeft : 18;
      g.step = first && second ? second.offsetLeft - first.offsetLeft : g.card + 14;
      g.photos = Array.from(row.querySelectorAll<HTMLElement>('.hm-gc-f img'));
      g.count = g.photos.length;
      g.distance = Math.max(0, row.scrollWidth - view.current.clientWidth);
      // The extra scroll of the pinned part: never more than a screen and a half
      g.travel = Math.min(g.distance, vh * 1.5);
      const height = `${Math.round(stage.current.offsetHeight + g.travel)}px`;
      if (el.style.height !== height) el.style.height = height;
    },
  });

  if (items.length === 0) return null;

  const title = (
    <div className="hm-hg-hd">
      <AuraTitle id="new-arrivals-title" label="Just in" title="New" accent="arrivals" titleClassName="hm-hg-h" />
      {still ? (
        <p className="aura-num aura-mu shrink-0 pb-1 text-[14px] font-semibold">{items.length} {items.length === 1 ? 'style' : 'styles'}</p>
      ) : (
        <p className="hm-hg-ix aura-num" aria-label={`Style ${shown} of ${items.length}`}>
          <Odometer value={pad2(shown)} roll={false} />
          <small aria-hidden="true">/ {pad2(items.length)}</small>
        </p>
      )}
    </div>
  );
  const cards = (
    <>
      {items.map((product, index) => <GalleryCard key={product.id} product={product} eager={index < 2} />)}
      <button type="button" onClick={() => navigateToCategory('New Arrivals')} className="hm-gc-all">
        <span className="aura-rnd" aria-hidden="true"><Icon name="arrow" /></span>
        <span>View all<span className="sr-only"> new arrivals</span></span>
      </button>
    </>
  );

  if (still) {
    return (
      <section id="new-arrivals-rail" aria-labelledby="new-arrivals-title" data-th="ink" className="hm-hg hm-hg-still">
        {title}
        <div className="hm-hg-vp"><div className="hm-hg-tr">{cards}</div></div>
      </section>
    );
  }

  return (
    <section ref={wrap} id="new-arrivals-rail" aria-labelledby="new-arrivals-title" data-th="ink" className="hm-hg aura-pin-wrap">
      <div ref={stage} className="aura-pin hm-hg-pin">
        {title}
        <div
          ref={view}
          className="hm-hg-vp"
          onPointerDown={(e) => { if (e.pointerType !== 'mouse') drag.current = { x: e.clientX, y: e.clientY, on: false }; }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x;
            if (!d.on) {
              if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - d.y)) d.on = true;
              else return;
            }
            // The row is tied to the page's scroll, so a sideways drag simply scrolls the page by the matching amount
            const g = size.current;
            window.scrollBy({ top: -dx * (g.travel / Math.max(1, g.distance)), behavior: 'instant' as ScrollBehavior });
            d.x = e.clientX;
          }}
          onPointerUp={() => { dragged.current = Boolean(drag.current?.on); drag.current = null; if (dragged.current) window.setTimeout(() => { dragged.current = false; }, 60); }}
          onPointerCancel={() => { drag.current = null; }}
          onClickCapture={(e) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); } }}
        >
          <div ref={track} className="hm-hg-tr">{cards}</div>
        </div>
        <div className="hm-hg-bar" aria-hidden="true"><i ref={bar} /></div>
      </div>
    </section>
  );
};

/**
 * Offers that are live right now. A live coupon is a ticket on rose: an ink ticket with punched sides, the
 * real code written letter by letter when it comes into view, what it gives, and "Copy code". The other live
 * offers follow as plain lines. Without any live offer the section is not drawn.
 */
export const OfferBanner: React.FC = () => {
  const { navigateToCategory, showToast } = useShop();
  const { offers, otherOffers, bestCoupon, headline, saleCount } = useLiveOffers();
  const codeLine = useRef<HTMLParagraphElement>(null);
  const [written, setWritten] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = bestCoupon ? String(bestCoupon.code) : '';

  useEffect(() => {
    const el = codeLine.current;
    if (!el || written) return undefined;
    return revealOnce(el, () => setWritten(true));
  }, [written, code]);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (offers.length === 0 && saleCount === 0) return null;

  const copy = () => {
    if (!bestCoupon) return;
    navigator.clipboard?.writeText(bestCoupon.code).then(() => { setCopied(true); showToast(`Code ${bestCoupon.code} copied.`, 'success'); }).catch(() => {});
  };

  return (
    <section id="offer-banner" aria-labelledby="offer-banner-title" data-th={bestCoupon ? 'rose' : 'sand'} className="w-full px-4 py-20 lg:py-24">
      <div className="mx-auto w-full max-w-[640px]">
        <AuraTitle id="offer-banner-title" label="Offers live now" title={<span className="break-words">{headline}</span>} size="lg" className="mb-7" />
        {bestCoupon && (
          <div data-rv className="hm-tk aura-dk">
            <p className="aura-lbl">Coupon code</p>
            <p ref={codeLine} className={`hm-tk-code ${written ? 'wr' : ''}`} style={{ '--n': Math.max(4, code.length) } as React.CSSProperties}>
              <span className="sr-only">{code}</span>
              {[...code].map((letter, i) => <b key={i} aria-hidden="true" style={{ '--i': i } as React.CSSProperties}>{letter}</b>)}
              <u aria-hidden="true" />
            </p>
            <p className="aura-num text-[16px] font-semibold leading-6">
              {bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue} off` : `${bestCoupon.discountValue}% off`}
              {bestCoupon.minOrderValue ? <span> on orders above ₹{bestCoupon.minOrderValue.toLocaleString('en-IN')}</span> : null}
            </p>
            <p className="hm-tk-note">Enter the code in your bag before you pay.</p>
            <button type="button" onClick={copy} className={`aura-btn hm-tk-copy ${copied ? 'ok' : ''}`}>
              {copied ? <Icon name="check" draw className="in" strokeWidth={2.2} /> : <Icon name="copy" />}
              <span>{copied ? 'Copied' : 'Copy code'}<span className="sr-only"> {code}</span></span>
            </button>
          </div>
        )}
        {otherOffers.length > 0 && (
          <ul className={`hm-of ${bestCoupon ? 'mt-6' : ''}`}>
            {otherOffers.map((offer) => (
              <li key={offer} data-rv>
                <i aria-hidden="true" />
                <span className="aura-num min-w-0 break-words">{offer}</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => navigateToCategory(saleCount > 0 ? 'Sale' : 'All')} data-rv className="aura-btn aura-btn-w mt-7 sm:mx-auto sm:w-auto sm:min-w-[260px]">
          {saleCount > 0 ? 'Shop offers' : 'Shop now'} <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
};

/**
 * The shopping assistant as a plain row in the page. The floating "?" button is not shown over product
 * cards, prices or photos, so below 1440px this row is how the home page opens it (SmartAssistant listens
 * for the event). Shown only while the assistant feature is switched on.
 */
export const AskAssistantRow: React.FC = () => {
  const { features } = useDiscovery();
  if (!features.assistant) return null;
  return (
    <section id="home-ask-assistant" aria-label="Help choosing a style" className="w-full pt-2 pb-12 lg:pb-16 min-[1440px]:hidden">
      <div className={HOME_WRAP}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('sag-open-assistant'))}
          className="aura-card aura-lt flex min-h-[72px] w-full cursor-pointer items-center gap-3.5 px-5 py-3.5 text-left"
        >
          <MessageCircleQuestion className="h-[22px] w-[22px] shrink-0 text-accent" strokeWidth={1.6} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold leading-5 text-ink">Need help choosing? Ask SuitAura</span>
            <span className="block text-[13px] leading-[18px] text-ink-muted">Tell us a colour, size or budget and see matching styles from our store.</span>
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-ink-muted" strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};

// One true sentence, made only from the four facts and the way an order is confirmed. *word* = the accent.
const STATEMENT = 'Pay by UPI with Google Pay, PhonePe, Paytm or any UPI app. Your order is confirmed only after the payment is *verified.* Returns and exchange within *7* *days,* delivery across *India.*';

/**
 * Why shop with us, on forest: a shield that assembles itself, the same four facts as everywhere else
 * (Assurance.tsx, never a second set of claims) as a list with round icon chips joined by a thin line that
 * draws as the list scrolls by, one statement whose words light up one after another, and "How your order works".
 */
export const WhyShop: React.FC = () => {
  const { setActivePage } = useShop();
  const section = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const statement = useRef<HTMLParagraphElement>(null);
  const place = useRef({ listTop: 0, listHeight: 1, textTop: 0, textHeight: 1, words: [] as HTMLElement[], lit: -1 });
  const facts = assuranceFacts();
  const open = (page: 'return-policy' | 'shipping-policy') => { setActivePage(page); window.scrollTo(0, 0); };
  const rows: Array<{ key: string; icon: IconName; title: string; text: string; onClick?: () => void; href?: string }> = [
    { key: 'payment', icon: 'lock', title: facts.payment, text: 'Google Pay, PhonePe, Paytm or any UPI app.' },
    { key: 'returns', icon: 'returns', title: facts.returns, text: 'Read the return policy', onClick: () => open('return-policy') },
    { key: 'delivery', icon: 'truck', title: facts.delivery, text: 'Read the shipping policy', onClick: () => open('shipping-policy') },
    { key: 'help', icon: 'chat', title: 'Chat with us on WhatsApp', text: 'Questions about size, colour or delivery? Ask us.', href: createSupportWhatsAppUrl('Hi Suit Aura Girls, I need some help.') },
  ];
  const words = useMemo(() => STATEMENT.split(/\s+/).map((word) => ({ text: word.replace(/\*/g, ''), key: word.includes('*') })), []);

  useScrollFx(section, ({ el, y, vh, top }) => {
    const g = place.current;
    // The line between the icon chips draws down as the list crosses the screen
    setVar(el, '--tl', clamp((y + vh * 0.62 - top - g.listTop) / g.listHeight));
    // The statement's words light up one after another
    const p = clamp((y + vh * 0.82 - top - g.textTop) / (g.textHeight + vh * 0.3));
    const lit = Math.round(p * g.words.length);
    if (lit !== g.lit) {
      g.lit = lit;
      for (let i = 0; i < g.words.length; i += 1) g.words[i].classList.toggle('lit', i < lit);
    }
  }, [], {
    measure: (el) => {
      const g = place.current;
      const base = el.getBoundingClientRect().top;
      if (list.current) { const r = list.current.getBoundingClientRect(); g.listTop = r.top - base; g.listHeight = Math.max(1, r.height); }
      if (statement.current) {
        const r = statement.current.getBoundingClientRect();
        g.textTop = r.top - base;
        g.textHeight = Math.max(1, r.height);
        g.words = Array.from(statement.current.querySelectorAll<HTMLElement>('span'));
        g.lit = -1;
      }
    },
  });

  const body = (row: (typeof rows)[number]) => (
    <>
      <span className="hm-tr-ic" aria-hidden="true"><Icon name={row.icon} draw /></span>
      <span className="min-w-0 flex-1">
        <b>{row.title}</b>
        <span className={row.onClick ? 'hm-tr-go' : ''}>{row.text}{row.onClick && <Icon name="arrow" size={16} />}</span>
      </span>
    </>
  );

  return (
    <section ref={section} id="why-shop-with-us" aria-labelledby="why-shop-title" data-th="forest" className="w-full px-5 pb-[90px] pt-[100px] lg:px-8">
      <div className={STORY_WRAP}>
        <div data-rv className="hm-shw" aria-hidden="true">
          <svg className="hm-shd" viewBox="0 0 96 96" focusable="false">
            <path className="s-l" d="M48 8 18 20v26c0 20 13 34 30 42" />
            <path className="s-r" d="M48 8l30 12v26c0 20-13 34-30 42" />
            <rect className="s-b" x="34" y="44" width="28" height="22" rx="5" />
            <path className="s-k" pathLength={1} d="M39 44v-7a9 9 0 0 1 18 0v7" />
            <circle className="s-d" cx="48" cy="55" r="3" />
          </svg>
        </div>
        <AuraTitle id="why-shop-title" label="Suit Aura Girls" title="Why shop" accent="with us" className="mb-[46px]" />
        <ol ref={list} className="hm-tr-l">
          {rows.map((row) => (
            <li key={row.key} data-rv>
              {row.href ? (
                <a href={row.href} target="_blank" rel="noopener noreferrer">{body(row)}</a>
              ) : row.onClick ? (
                <button type="button" onClick={row.onClick}>{body(row)}</button>
              ) : (
                <div>{body(row)}</div>
              )}
            </li>
          ))}
        </ol>
        <p ref={statement} className="hm-stmt">
          {words.map((word, i) => <Fragment key={i}><span className={word.key ? 'k' : undefined}>{word.text}</span>{' '}</Fragment>)}
        </p>
        <div data-rv className="mt-16 max-w-[560px]">
          <HowOrderWorks />
        </div>
      </div>
    </section>
  );
};

export const NewsletterSignup: React.FC = () => {
  const { showToast } = useShop();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    setStatus('saving');
    try {
      await addDoc(collection(db, 'leads'), { email: email.trim().toLowerCase(), phone: null, source: 'newsletter', createdAt: new Date().toISOString(), offerSent: false });
      setStatus('done');
    } catch {
      setStatus('idle');
      showToast('Could not subscribe right now. Please try again.', 'error');
    }
  };

  return (
    <section id="newsletter-section" aria-labelledby="newsletter-title" data-th="sand" className="w-full px-3 py-16 lg:py-24">
      {/* One big white block: the title, one muted line, the WhatsApp button (phones and tablets), then the email field */}
      <div data-rv="card" className="aura-card aura-blk aura-lt mx-auto flex max-w-[720px] flex-col items-start px-5 py-10 sm:px-12 sm:py-14">
        <AuraTitle
          id="newsletter-title"
          label="Stay in touch"
          size="lg"
          title={<>
            <span className="lg:hidden">Questions before you <em>buy?</em></span>
            <span className="hidden lg:inline">Hear about new styles <em>first</em></span>
          </>}
        />
        <p className="aura-sub mt-4 lg:hidden">Ask us about size, colour or delivery on WhatsApp.</p>
        <p className="aura-sub mt-4 hidden lg:block">New collections, restocks and offers by email. A few emails, never spam.</p>
        <a
          href={createSupportWhatsAppUrl('Hi Suit Aura Girls, I have a question before I buy.')}
          target="_blank"
          rel="noopener noreferrer"
          className="aura-btn aura-btn-line aura-btn-w mt-6 lg:hidden"
        >
          <WhatsAppIcon className="h-[18px] w-[18px]" mono /> Chat on WhatsApp
        </a>
        {status === 'done' ? (
          <p role="status" className="mt-6 flex items-center gap-2.5 rounded-2xl bg-sunken px-4 py-3.5 text-left text-[14px] font-semibold leading-5 text-ink">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" strokeWidth={1.6} aria-hidden="true" /> You are subscribed. Thank you!
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 flex w-full max-w-lg gap-2 lg:mt-7">
            <label htmlFor="newsletter-email" className="sr-only">Email address</label>
            <input
              id="newsletter-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              className="sag-input h-[54px] min-w-0 flex-1 w-auto px-4 text-[16px]"
            />
            <button
              type="submit"
              disabled={status === 'saving'}
              className="aura-btn shrink-0 px-5 lg:px-8"
            >
              {status === 'saving' && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.6} aria-hidden="true" />}
              <span className="lg:hidden">Get offers</span>
              <span className="hidden lg:inline">Subscribe</span>
            </button>
          </form>
        )}
      </div>
    </section>
  );
};
