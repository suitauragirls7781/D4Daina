import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { HeroBannerConfig, Product } from '../../types';
import { generateHeroSlidesFromProducts } from '../../context/AdminContext';
import { getCleanImageUrl } from '../../utils/imageHelper';
import { prepaidPercentApplies, PrepaidRules } from '../../utils/prepaid';

/**
 * Admin previews of storefront parts, drawn from the form the owner is editing (before it is saved).
 * They are faithful static copies of the storefront components (HeroSection "the deck", DealOfTheDaySection
 * "the ticket"): same words, same rules for what is shown, no scroll effects (the admin has none).
 * Every number in them is the real one the store would show; nothing is invented.
 */

const rupees = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const two = (value: number) => String(value).padStart(2, '0');

/** A phone outline around a preview: ink bezel, paper screen. */
export const PhoneFrame: React.FC<{ label: string; children: React.ReactNode; className?: string; screenClassName?: string }> = ({ label, children, className = '', screenClassName = '' }) => (
  <figure aria-label={label} style={{ background: "var(--aura-ink)" }} className={`mx-auto w-full max-w-[320px] rounded-[42px] p-2.5 shadow-[var(--sag-shadow-pop)] ${className}`}>
    <div className={`relative overflow-hidden rounded-[34px] bg-page ${screenClassName}`}>
      <div className="flex items-center justify-center pt-2 pb-1" aria-hidden="true">
        <span className="h-1.5 w-16 rounded-full" style={{ background: "var(--aura-ink)" }} />
      </div>
      {children}
    </div>
  </figure>
);

/** "Preview: not on the site until you save" or "Same as the site". */
export const PreviewBadge: React.FC<{ unsaved: boolean }> = ({ unsaved }) => (
  <span role="status" className={`inline-flex items-center gap-1.5 min-h-7 px-3 py-1 rounded-full text-xs leading-4 font-semibold ${unsaved ? 'border border-brand-line bg-brand-wash text-brand' : 'bg-sunken text-ink-muted'}`}>
    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
    {unsaved ? 'Preview of your changes: not on the site until you save' : 'Same as the site now'}
  </span>
);

// ---------------------------------------------------------------- hero ("the deck")

type HeroSlide = HeroBannerConfig['slides'][number];
export type DeckSlide = HeroSlide & { shownImage: string };

// The same labels the storefront treats as filled in by the code (never shown as the owner's label)
const AUTO_BADGES = new Set([
  '👑 ROYAL FESTIVE EDIT', '🌸 SUMMER GRACE ARTISAN', '✨ LUXURY REGAL ANARKALI', '🔥 BESTSELLER OF THE WEEK',
  '🌿 PURE SILK HANDBLOCK', '💎 EXCLUSIVE DESIGNER SUIT', '🔥 POPULAR PICK',
]);
const plainWords = (text: string) => text.replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s+/g, ' ').trim();
const ownerBadge = (badge?: string) => {
  const text = (badge || '').trim();
  return text && !AUTO_BADGES.has(text) ? text : '';
};
const headlineOf = (title: string) => {
  const words = plainWords(title || '').split(' ').filter(Boolean);
  if (words.length === 0) return { rest: 'Ethnic wear across', accent: 'India' };
  if (words.length === 1) return { rest: '', accent: words[0] };
  return { rest: words.slice(0, -1).join(' '), accent: words[words.length - 1] };
};

const matchProduct = (slide: HeroSlide, products: Product[]) => products.find(
  (p) => (slide.productId && String(p.id) === String(slide.productId)) || (slide.link && String(p.id) === String(slide.link)) || p.name === slide.title,
);

/** Why a slide is or is not one of the cards on the home page (the storefront's own rule, in words). */
export const heroSlideStatus = (slide: HeroSlide, products: Product[]): { shown: boolean; why: string } => {
  if (slide.bannerImage) return { shown: true, why: 'Shown: it has its own banner photo.' };
  if (!slide.image || slide.image.includes('images.unsplash.com')) return { shown: false, why: 'Not shown: it needs a photo. Link a product or upload a banner photo.' };
  if (!matchProduct(slide, products)) return { shown: false, why: 'Not shown: the linked product is not in the catalogue. Link a product or upload a banner photo.' };
  return { shown: true, why: 'Shown with the product\'s live photo and price.' };
};

/**
 * The cards the home page would deal from these slides, worked out exactly as HeroSection does: slides with a
 * banner photo or a live product, at most 6, with the product's live price and photo; when none qualifies the
 * store makes the cards from the catalogue by itself.
 */
export const resolveDeck = (slides: HeroSlide[], products: Product[]): { cards: DeckSlide[]; automatic: boolean } => {
  if (products.length === 0) {
    const cards = slides.filter((s) => s.bannerImage || (s.image && !s.image.includes('images.unsplash.com')))
      .slice(0, 6).map((s) => ({ ...s, shownImage: s.bannerImage || s.image }));
    return { cards, automatic: false };
  }
  const custom = slides.filter((slide) => heroSlideStatus(slide, products).shown);
  if (custom.length === 0) {
    return { cards: generateHeroSlidesFromProducts(products).slice(0, 6).map((s) => ({ ...s, shownImage: s.bannerImage || s.image })), automatic: true };
  }
  const cards = custom.slice(0, 6).map((slide) => {
    const p = matchProduct(slide, products);
    if (!p) return { ...slide, shownImage: slide.bannerImage || slide.image };
    const price = Number(p.price) || slide.price;
    const liveImg = p.images?.[0] || (p as Product & { image?: string }).image || slide.image;
    return {
      ...slide,
      productId: p.id,
      title: slide.customText ? slide.title : (p.name || slide.title),
      price,
      originalPrice: Math.max(price, Number(p.originalPrice) || price),
      shownImage: slide.bannerImage || liveImg || slide.image,
    };
  });
  return { cards, automatic: false };
};

/** The deck as a shopper sees it: the pile of photo cards and, under them, the words of the top card. */
export const HeroDeckPreview: React.FC<{ cards: DeckSlide[]; index: number; onIndex: (next: number) => void; offers: PrepaidRules & { prepaidDiscount?: number } }> = ({ cards, index, onIndex, offers }) => {
  const count = cards.length;
  if (count === 0) {
    return <p className="px-6 py-16 text-center text-sm leading-5 text-ink-muted">No card to show. The home page would leave the hero out.</p>;
  }
  const cur = ((index % count) + count) % count;
  const top = cards[cur];
  const price = Number(top.price) || 0;
  const mrp = Math.max(price, Number(top.originalPrice) || price);
  const off = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const caption = plainWords(ownerBadge(top.badge)) || 'New season';
  const head = headlineOf(top.title);
  const onlineOffer = price <= 0 ? '' : prepaidPercentApplies(offers, price)
    ? `Extra ${offers.prepaidPercent}% off with online payment`
    : Number(offers.prepaidDiscount) > 0 ? `Extra ₹${offers.prepaidDiscount} off on online payment` : '';
  // The two cards that peek out behind the top one
  const behind = [1, 2].filter((n) => n < count).map((n) => cards[(cur + n) % count]);

  return (
    <div className="px-5 pt-3 pb-6">
      <div className="relative mx-auto w-[76%] aspect-[3/4]" aria-hidden="true">
        {behind.map((card, n) => ({ card, slot: n + 1 })).reverse().map(({ card, slot }) => (
          <span key={`${card.id}-${slot}`} className="absolute inset-0 overflow-hidden rounded-[22px] bg-sunken"
            style={{ transform: slot === 2 ? 'translate(14%, 4%) rotate(7deg) scale(.92)' : 'translate(-10%, 2%) rotate(-5deg) scale(.95)', opacity: 0.9 }}>
            {card.shownImage && <img src={getCleanImageUrl(card.shownImage, 320)} alt="" className="w-full h-full object-cover object-top" />}
          </span>
        ))}
        <span key={top.id} className="absolute inset-0 overflow-hidden rounded-[22px] bg-sunken shadow-[0_18px_40px_-18px_rgba(17,16,19,.45)] motion-safe:animate-in motion-safe:fade-in">
          {top.shownImage && <img src={getCleanImageUrl(top.shownImage, 480)} alt="" className="w-full h-full object-cover object-top" />}
        </span>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] leading-4 font-bold uppercase tracking-[0.16em] text-ink-muted truncate">{caption}</p>
          {count > 1 && (
            <span className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => onIndex(cur - 1)} aria-label="Previous card in the preview" className="w-9 h-9 rounded-full border border-line bg-surface flex items-center justify-center cursor-pointer hover:bg-sunken"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-bold text-ink sag-num px-1">{two(cur + 1)} / {two(count)}</span>
              <button type="button" onClick={() => onIndex(cur + 1)} aria-label="Next card in the preview" className="w-9 h-9 rounded-full border border-line bg-surface flex items-center justify-center cursor-pointer hover:bg-sunken"><ChevronRight className="w-4 h-4" /></button>
            </span>
          )}
        </div>
        <p className="mt-2 font-display text-[30px] leading-[0.98] text-ink break-words">{head.rest} <em>{head.accent}</em></p>
        {price > 0 && (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2 sag-num">
            <b className="text-lg font-extrabold text-ink">{rupees(price)}</b>
            {mrp > price && <s className="text-sm text-ink-muted">{rupees(mrp)}</s>}
            {off > 0 && <span className="text-sm font-bold text-sale">{off}% off</span>}
          </p>
        )}
        {onlineOffer && <p className="mt-1 text-[13px] font-semibold text-sale">{onlineOffer}</p>}
        <div className="mt-4 flex items-center gap-4" aria-hidden="true">
          <span className="inline-flex h-11 items-center rounded-full bg-brand px-5 text-sm font-bold text-[color:var(--sag-on-gold)]">Shop now →</span>
          <span className="text-sm font-bold text-ink underline underline-offset-4">Explore</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- deal of the day ("the ticket")

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number };
const readTimeLeft = (endMs: number): TimeLeft | null => {
  const diff = endMs - Date.now();
  if (!endMs || !Number.isFinite(diff) || diff <= 0) return null;
  return { days: Math.floor(diff / 86400000), hours: Math.floor((diff / 3600000) % 24), minutes: Math.floor((diff / 60000) % 60), seconds: Math.floor((diff / 1000) % 60) };
};

/**
 * The deal ticket as the home page draws it: the white part (photo, "Deal of the day", the name, the clock only
 * for a real end time) and the ink stub (the real discount, price, MRP, "You save", the button).
 */
export const DealTicketPreview: React.FC<{ product: Product; photo?: string; endMs: number; timerOn: boolean }> = ({ product, photo, endMs, timerOn }) => {
  const [left, setLeft] = useState<TimeLeft | null>(() => readTimeLeft(endMs));
  useEffect(() => {
    setLeft(readTimeLeft(endMs));
    if (!timerOn || !endMs) return undefined;
    const t = window.setInterval(() => setLeft(readTimeLeft(endMs)), 1000);
    return () => window.clearInterval(t);
  }, [endMs, timerOn]);

  const price = Number(product.price) || 0;
  const mrp = Math.max(price, Number(product.originalPrice) || price);
  const off = mrp > price && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const soldOut = !product.inStock || Math.max(0, Number(product.stockQuantity) || 0) <= 0;
  const image = photo || product.images?.find(Boolean) || (product as Product & { image?: string }).image || '';
  const showClock = Boolean(timerOn && left);

  return (
    <div className="flex items-stretch rounded-[24px] overflow-hidden" aria-label="Deal of the day ticket preview" role="img">
      <div className="relative flex-[1.15] min-w-0 bg-surface p-3 flex flex-col gap-2">
        <span className="block aspect-[4/5] w-full overflow-hidden rounded-[16px] bg-sunken">
          {image && <img src={getCleanImageUrl(image, 320)} alt="" className="w-full h-full object-cover object-top" />}
        </span>
        <span className="text-[10px] leading-3 font-bold uppercase tracking-[0.16em] text-ink-muted">Deal of the day</span>
        <span className="text-[13px] leading-[17px] font-extrabold text-ink line-clamp-2">{product.name}</span>
        {showClock && left && (
          <span className="mt-auto">
            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Ends in</span>
            <span className="mt-0.5 flex gap-1.5 sag-num">
              {([['days', left.days], ['hrs', left.hours], ['min', left.minutes], ['sec', left.seconds]] as const).map(([k, v]) => (
                <span key={k} className="flex flex-col items-center">
                  <b className="text-[15px] leading-5 font-extrabold text-ink">{two(v)}</b>
                  <small className="text-[9px] text-ink-muted">{k}</small>
                </span>
              ))}
            </span>
          </span>
        )}
        {/* The perforation: two notches and a dashed line */}
        <span className="absolute -right-2.5 -top-2.5 w-5 h-5 rounded-full bg-sunken" aria-hidden="true" />
        <span className="absolute -right-2.5 -bottom-2.5 w-5 h-5 rounded-full bg-sunken" aria-hidden="true" />
      </div>
      <div style={{ background: "var(--aura-ink)", color: "var(--aura-paper)" }} className="flex-1 min-w-0 p-3 flex flex-col justify-between gap-3 border-l-2 border-dashed border-line/40">
        <div>
          {off > 0 ? (
            <p className="font-display leading-none sag-num"><span className="text-[44px] tracking-[-0.04em]">{off}</span><small className="text-xl">%</small> <em className="text-2xl">off</em></p>
          ) : (
            <p className="text-[26px] leading-8 font-extrabold sag-num">{rupees(price)}</p>
          )}
          {off > 0 && (
            <p className="mt-2 flex flex-col gap-0.5 sag-num">
              <b className="text-lg leading-6 font-extrabold">{rupees(price)}</b>
              <s className="text-[13px] opacity-75">{rupees(mrp)}</s>
              <span className="text-[12px] font-semibold opacity-75">You save {rupees(mrp - price)}</span>
            </p>
          )}
        </div>
        <span className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full bg-page px-2 text-[12px] font-bold text-ink">{soldOut ? 'Sold out' : 'View deal →'}</span>
      </div>
    </div>
  );
};
