import React, { useMemo, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ProductCard } from './ProductCard';
import { prepaidPercentText, prepaidRulesFrom } from '../utils/prepaid';
import { CheckCircle2, ChevronRight, Loader2, MessageCircleQuestion, Star, Tag } from 'lucide-react';
import { useDiscovery } from '../utils/discovery';
import { BABY_BOYS, BABY_GIRLS, KIDS_ALL, KIDS_TOYS, TOYS, departmentOf, isToy } from '../utils/kids';
import { Assurance, HowOrderWorks } from './Assurance';
import { WhatsAppIcon } from './BrandIcons';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { Product } from '../types';

/** Shared widths so every home section lines up on the same gutters. */
export const HOME_WRAP = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
/** Section rhythm: 32px on phones, 48px on desktop. */
export const HOME_SECTION = 'w-full py-8 lg:py-12';
/** One card in a horizontal product rail: two and a bit cards show on a phone, so the rail reads as swipeable. */
export const HOME_RAIL_ITEM = 'shrink-0 w-[158px] sm:w-[220px] lg:w-[250px]';
/** The rail itself: a 10px gap on phones to match the two-column product grids. */
const HOME_RAIL = 'sag-scroll-x flex gap-2.5 sm:gap-3 lg:gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1';

const photoOf = (product: Product) => (Array.isArray(product.images) ? product.images.find((src) => typeof src === 'string' && src.trim()) : '') || product.image || '';
const priceOf = (product: Product) => {
  const price = Number(product.price) || 0;
  const mrp = Math.max(price, Number(product.originalPrice) || price);
  return { price, mrp, discount: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0 };
};
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** A real link to the product (crawlable, opens in a new tab) that still navigates inside the app. */
const useProductLink = () => {
  const { navigateToProduct } = useShop();
  return (product: Product) => ({
    href: `/product/${product.id}`,
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigateToProduct(product.id);
    },
  });
};

interface HomeSectionHeaderProps {
  title: string;
  text?: string;
  eyebrow?: string;
  /** id for the h2, so the section can point at it with aria-labelledby */
  titleId?: string;
  action?: { label: string; onClick: () => void; id?: string };
  className?: string;
}

/** Home section title: serif headline on the left, one "View all" link on the right. */
export const HomeSectionHeader: React.FC<HomeSectionHeaderProps> = ({ title, text, eyebrow, titleId, action, className = 'mb-4 lg:mb-6' }) => (
  <div className={`flex items-end justify-between gap-4 ${className}`}>
    <div className="min-w-0">
      {eyebrow && <p className="sag-eyebrow mb-1">{eyebrow}</p>}
      <h2 id={titleId} className="font-display text-[22px] leading-7 lg:text-[28px] lg:leading-8 text-ink">{title}</h2>
      {text && <p className="mt-1 text-sm leading-5 text-ink-muted max-w-xl">{text}</p>}
    </div>
    {action && (
      <button type="button" id={action.id} onClick={action.onClick} className="sag-link shrink-0 -my-2.5 whitespace-nowrap">
        {action.label}
      </button>
    )}
  </div>
);

/** The four store facts, straight under the hero. The wording lives in Assurance.tsx. */
export const HomeAssuranceBand: React.FC<{ id?: string }> = ({ id = 'home-assurance' }) => (
  <section id={id} aria-label="Shopping with us" className="w-full pt-4 pb-1 lg:pt-0 lg:pb-8">
    <div className={HOME_WRAP}>
      <Assurance variant="grid" whatsappMessage="Hi Suit Aura Girls, I need some help." />
    </div>
  </section>
);

/**
 * Featured collection: admin "featured" / bestseller picks, otherwise the latest styles.
 * Phones and tablets (owner's pick 3): a pale block, the first style as one wide card and the next ones in two columns.
 */
export const FeaturedCollection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const { reviewsList = [] } = useAdmin();
  const linkTo = useProductLink();
  const items = useMemo(() => {
    const live = products.filter((p) => p.inStock && departmentOf(p) === 'women');
    const picked = live.filter((p) => p.isFeatured || p.isBestSeller);
    return (picked.length >= 2 ? picked : live).slice(0, 8);
  }, [products]);
  const lead = items[0];
  // Stars only from approved customer reviews, as on the product card
  const leadRating = useMemo(() => {
    if (!lead) return null;
    let sum = 0;
    let count = 0;
    for (const r of reviewsList) {
      const value = Number(r.rating);
      if (r.status !== 'approved' || String(r.productId) !== String(lead.id) || !(value >= 1 && value <= 5)) continue;
      sum += value;
      count += 1;
    }
    return count ? { avg: sum / count, count } : null;
  }, [reviewsList, lead]);
  if (!lead) return null;
  const leadPhoto = photoOf(lead);
  const leadPrice = priceOf(lead);
  const leadBadge = lead.isNewArrival ? 'New' : lead.isBestSeller ? 'Bestseller' : lead.isTrending ? 'Trending' : '';
  return (
    <section id="featured-collection" aria-labelledby="featured-collection-title" className="w-full py-4 lg:py-12">
      <div className={HOME_WRAP}>
        <div className="rounded-[28px] bg-lilac p-3.5 sm:p-5 lg:rounded-none lg:bg-transparent lg:p-0">
          <HomeSectionHeader titleId="featured-collection-title" title="Featured collection" text="Styles we love right now." className="mb-3 lg:mb-6" action={{ label: 'View all', onClick: () => navigateToCategory('All') }} />
          <a {...linkTo(lead)} className="mb-2.5 flex items-stretch gap-3 rounded-[20px] bg-surface p-2 shadow-[var(--sag-shadow)] lg:hidden">
            <span className="block w-[46%] shrink-0 self-start overflow-hidden rounded-[14px] bg-sunken aspect-[4/5]">
              <img
                src={leadPhoto ? getCleanImageUrl(leadPhoto, 480) : ELEGANT_PLACEHOLDER_SVG}
                alt={lead.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover object-top"
                onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 py-1">
              {leadBadge && <span><span className="sag-badge bg-accent-tint text-accent">{leadBadge}</span></span>}
              <span className="block text-[13.5px] font-bold leading-[18px] text-ink">{lead.name}</span>
              {leadRating && (
                <span className="flex items-center gap-1.5 text-xs leading-5 text-ink-muted">
                  <span className="sr-only">Rated {leadRating.avg.toFixed(1)} out of 5 from {leadRating.count} {leadRating.count === 1 ? 'review' : 'reviews'}</span>
                  <span aria-hidden="true" className="inline-flex items-center gap-0.5 rounded-md bg-ok px-1.5 text-[11px] font-bold leading-[18px] text-white">
                    {leadRating.avg.toFixed(1)} <Star className="h-2.5 w-2.5 fill-white text-white" />
                  </span>
                  <span aria-hidden="true">({leadRating.count})</span>
                </span>
              )}
              <span className="sag-num flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-[16px] font-extrabold leading-5 text-ink">{rupees(leadPrice.price)}</span>
                {leadPrice.mrp > leadPrice.price && <span className="text-[13px] text-ink-faint line-through">{rupees(leadPrice.mrp)}</span>}
                {leadPrice.discount > 0 && <span className="whitespace-nowrap text-[13px] font-bold text-sale">{leadPrice.discount}% off</span>}
              </span>
              <span className="mt-0.5 inline-flex h-9 items-center justify-center self-start rounded-full bg-brand px-4 text-[13px] font-bold text-white">Shop now</span>
            </span>
          </a>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-8">
            {items.map((product, index) => (
              // The first style is the wide card above until desktop; phones show four under it, tablets six
              <div key={product.id} className={index === 0 || index >= 7 ? 'hidden lg:block' : index >= 5 ? 'hidden md:block' : ''}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/**
 * New arrivals as a swipeable rail. Phones and tablets (owner's pick 3): a dark block "Just in" with larger
 * photos, the name and price under each in light text. Desktop keeps the product cards on the pale band.
 */
export const NewArrivalsRail: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const linkTo = useProductLink();
  const items = useMemo(() => {
    const live = products.filter((p) => p.inStock && departmentOf(p) === 'women');
    const fresh = live.filter((p) => p.isNewArrival);
    return (fresh.length > 0 ? fresh : live).slice(0, 12);
  }, [products]);
  if (items.length === 0) return null;
  return (
    <section id="new-arrivals-rail" aria-label="New arrivals" className="w-full py-4 lg:py-12 lg:mt-5 lg:rounded-[28px] lg:bg-mint">
      <div className="px-4 sm:px-6 lg:hidden">
        <div className="rounded-[28px] bg-dark py-4 text-on-dark">
          <div className="flex items-center justify-between gap-3 px-4">
            <h2 className="font-display text-[22px] leading-7 text-on-dark">Just in</h2>
            <button type="button" onClick={() => navigateToCategory('New Arrivals')} className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-sun px-4 text-[13px] font-bold text-ink">
              View all
            </button>
          </div>
          <ul className="sag-scroll-x mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {items.map((product) => {
              const photo = photoOf(product);
              const { price, mrp, discount } = priceOf(product);
              return (
                <li key={product.id} className="w-[170px] shrink-0">
                  <a {...linkTo(product)} className="block rounded-[16px]">
                    <span className="block aspect-[4/5] w-full overflow-hidden rounded-[16px] bg-white/10">
                      <img
                        src={photo ? getCleanImageUrl(photo, 480) : ELEGANT_PLACEHOLDER_SVG}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover object-top"
                        onError={(e) => { if (!e.currentTarget.src.startsWith('data:')) e.currentTarget.src = ELEGANT_PLACEHOLDER_SVG; }}
                      />
                    </span>
                    <span className="mt-1.5 block text-[13px] font-semibold leading-[17px] text-on-dark line-clamp-2">{product.name}</span>
                    <span className="sag-num mt-1 flex flex-wrap items-baseline gap-x-1.5">
                      <span className="text-[15px] font-extrabold leading-5 text-on-dark">{rupees(price)}</span>
                      {mrp > price && <span className="text-[12.5px] text-on-dark-muted line-through">{rupees(mrp)}</span>}
                      {discount > 0 && <span className="whitespace-nowrap text-[12.5px] font-bold text-highlight">{discount}% off</span>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="hidden lg:block max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader titleId="new-arrivals-title" title="New arrivals" text="Just in this week." action={{ label: 'View all', onClick: () => navigateToCategory('New Arrivals') }} />
        </div>
        <div className={HOME_RAIL}>
          {items.map((product) => (
            <div key={product.id} className={HOME_RAIL_ITEM}>
              <ProductCard product={product} compact />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/** Kids & Toys: Baby Girls, Baby Boys and Toys in one home section; each tab appears only when it has styles in stock. */
export const KidsCorner: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const groups = useMemo(() => [
    { key: BABY_GIRLS, label: 'Baby Girls', items: products.filter((p) => p.category === BABY_GIRLS && p.inStock) },
    { key: BABY_BOYS, label: 'Baby Boys', items: products.filter((p) => p.category === BABY_BOYS && p.inStock) },
    { key: TOYS, label: 'Toys', items: products.filter((p) => isToy(p) && p.inStock) },
  ].filter((g) => g.items.length > 0), [products]);
  const [tab, setTab] = useState(0);
  if (groups.length === 0) return null;
  const current = groups[Math.min(tab, groups.length - 1)];
  const hasKids = groups.some((g) => g.key !== TOYS);
  return (
    <section id="kids-corner" aria-labelledby="kids-corner-title" className={`${HOME_SECTION} mt-5 rounded-[28px] bg-sky`}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader
            titleId="kids-corner-title"
            title={hasKids && groups.some((g) => g.key === TOYS) ? 'Kids & toys' : hasKids ? 'Kids wear' : 'Toys'}
            text={hasKids ? 'Outfits for baby girls and boys, sized by age from 1 to 15 years.' : 'Toys for every age.'}
            action={{ label: 'View all', onClick: () => navigateToCategory((groups.length > 1 ? KIDS_TOYS : current.key === TOYS ? TOYS : KIDS_ALL) as any) }}
          />
          {groups.length > 1 && (
            <div className="sag-scroll-x flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 mb-4" role="tablist" aria-label="Kids and toys">
              {groups.map((g, i) => {
                const active = g.key === current.key;
                return (
                  <button key={g.key} type="button" role="tab" aria-selected={active} data-selected={active} onClick={() => setTab(i)}
                    className="sag-chip shrink-0 h-11 text-sm">
                    {g.label}&nbsp;<span className="sag-num font-normal">({g.items.length})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div key={current.key} className={`${HOME_RAIL} sag-fade`} role="tabpanel" aria-label={current.label}>
          {current.items.slice(0, 12).map((product) => (
            <div key={product.id} className={HOME_RAIL_ITEM}>
              <ProductCard product={product} compact />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/** Offer banner built only from offers that are live right now. */
export const OfferBanner: React.FC = () => {
  const { products = [], coupons = [], storeOffers, comboOffer, freeShippingThreshold, navigateToCategory, showToast } = useShop();
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
  if (offers.length === 0 && saleCount === 0) return null;

  const headline = comboOffer
    ? `Save ${comboOffer.percent}% on ${comboOffer.minItems} or more`
    : bestCoupon
    ? `${bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue}` : `${bestCoupon.discountValue}%`} off with ${bestCoupon.code}`
    : saleCount > 0
    ? 'Now on offer'
    : prepaidDiscount > 0
    ? `₹${prepaidDiscount} off prepaid orders`
    : prepaidPercentLine || offers[0];

  return (
    <section id="offer-banner" aria-labelledby="offer-banner-title" className={HOME_SECTION}>
      <div className={HOME_WRAP}>
        <div className="rounded-card border border-sale-line bg-sale-tint p-5 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="min-w-0 max-w-2xl">
            <p className="text-xs leading-4 font-semibold text-sale">Offers live now</p>
            <h2 id="offer-banner-title" className="mt-1 font-display text-[26px] leading-8 lg:text-[34px] lg:leading-10 text-ink break-words">{headline}</h2>
            {offers.length > 0 && (
              <ul className="mt-4 space-y-2">
                {offers.map((offer) => (
                  <li key={offer} className="flex items-start gap-2 text-sm leading-5 text-ink">
                    <Tag className="w-4 h-4 mt-0.5 text-sale shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{offer}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:flex-col lg:min-w-[240px] lg:shrink-0">
            <button type="button" onClick={() => navigateToCategory(saleCount > 0 ? 'Sale' : 'All')} className="sag-btn-primary h-12 sm:px-8">
              {saleCount > 0 ? 'Shop offers' : 'Shop now'}
            </button>
            {bestCoupon && (
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(bestCoupon.code).then(() => showToast(`Code ${bestCoupon.code} copied.`, 'success')).catch(() => {})}
                className="sag-btn-outline h-12 text-[15px] sm:px-6 max-w-full"
              >
                <span className="truncate">Copy code {bestCoupon.code}</span>
              </button>
            )}
          </div>
        </div>
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
    <section id="home-ask-assistant" aria-label="Help choosing a style" className="w-full pb-8 min-[1440px]:hidden">
      <div className={HOME_WRAP}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('sag-open-assistant'))}
          className="w-full min-h-[64px] flex items-center gap-3 rounded-card border border-line bg-white px-4 py-3 text-left hover:bg-sunken transition-colors cursor-pointer"
        >
          <MessageCircleQuestion className="w-[22px] h-[22px] shrink-0 text-ink" strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-5 font-semibold text-ink">Need help choosing? Ask SuitAura</span>
            <span className="block text-[13px] leading-[18px] text-ink-muted">Tell us a colour, size or budget and see matching styles from our store.</span>
          </span>
          <ChevronRight className="w-5 h-5 shrink-0 text-ink-muted" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};

/**
 * Why shop with us: the same four facts as everywhere else (Assurance.tsx), never a second set of claims.
 * Phones and tablets (owner's pick 2): the dark block of facts, then the "How your order works" card. The facts
 * are left out here when the band under the hero (or the promises strip) already shows them on this page.
 */
export const WhyShop: React.FC = () => {
  const { homepageSections = [] } = useAdmin();
  const factsShownAbove = homepageSections.some((s) => s.enabled !== false && (s.key === 'hero' || s.key === 'artisanalPromises'));
  return (
    <section id="why-shop-with-us" aria-labelledby="why-shop-title" className="w-full py-4 lg:py-12">
      <div className={`${HOME_WRAP} lg:grid lg:grid-cols-12 lg:gap-10 lg:items-center`}>
        <div className="lg:col-span-5 mb-3 lg:mb-6">
          <h2 id="why-shop-title" className="font-display text-[22px] leading-7 lg:text-[28px] lg:leading-8 text-ink">Why shop with us</h2>
          <p className="hidden lg:block mt-1 text-sm leading-5 text-ink-muted max-w-xl">Pay online by UPI with Google Pay, PhonePe, Paytm or any UPI app. Your order is confirmed only after the payment is verified, and our team is on WhatsApp if you need help.</p>
        </div>
        <div className="lg:col-span-7">
          <div className="hidden lg:block">
            <Assurance variant="full" whatsappMessage="Hi Suit Aura Girls, I need some help." />
          </div>
          <div className="lg:hidden flex flex-col gap-2.5">
            {!factsShownAbove && <Assurance variant="grid" whatsappMessage="Hi Suit Aura Girls, I need some help." />}
            <HowOrderWorks />
          </div>
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
    <section id="newsletter-section" aria-labelledby="newsletter-title" className="w-full py-4 lg:py-12 lg:rounded-t-[28px] lg:bg-lilac">
      <div className={HOME_WRAP}>
        {/* Phones and tablets (owner's pick 2): a dark block, WhatsApp first, the email field under it. Desktop keeps the pale card. */}
        <div className="rounded-[28px] bg-dark p-4 sm:p-6 text-on-dark lg:rounded-card lg:border lg:border-brand-line lg:bg-brand-wash lg:p-10 lg:text-ink lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="lg:max-w-md">
            <h2 id="newsletter-title" className="font-display text-[22px] leading-7 lg:text-[28px] lg:leading-8 text-on-dark lg:text-ink">
              <span className="lg:hidden">Questions before you buy?</span>
              <span className="hidden lg:inline">Hear about new styles first</span>
            </h2>
            <p className="mt-1 text-sm leading-5 text-on-dark-muted lg:hidden">Ask us about size, colour or delivery on WhatsApp.</p>
            <p className="mt-1 hidden text-sm leading-5 text-ink-muted lg:block">New collections, restocks and offers by email. A few emails, never spam.</p>
            <a
              href={createSupportWhatsAppUrl('Hi Suit Aura Girls, I have a question before I buy.')}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex h-[46px] w-full items-center justify-center gap-2 rounded-full bg-sun px-5 text-[15px] font-bold text-ink lg:hidden"
            >
              <WhatsAppIcon className="h-[18px] w-[18px]" /> Chat on WhatsApp
            </a>
          </div>
          {status === 'done' ? (
            <p role="status" className="mt-3 lg:mt-0 flex items-center gap-2 rounded-control border border-ok-line bg-ok-tint px-4 py-3 text-sm font-semibold text-ok">
              <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" /> You are subscribed. Thank you!
            </p>
          ) : (
            <form onSubmit={submit} className="mt-2.5 lg:mt-0 flex gap-2 lg:gap-3 lg:flex-1 lg:max-w-lg">
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
                className="sag-input flex-1 w-auto min-w-0"
              />
              <button
                type="submit"
                disabled={status === 'saving'}
                className="shrink-0 inline-flex h-[46px] sm:h-[52px] cursor-pointer items-center justify-center gap-2 rounded-full bg-surface px-4 text-[14px] font-bold text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-70 lg:bg-brand lg:px-7 lg:text-[16px] lg:text-white lg:hover:bg-brand-dark"
              >
                {status === 'saving' && <Loader2 className="w-[18px] h-[18px] animate-spin" aria-hidden="true" />}
                <span className="lg:hidden">Get offers</span>
                <span className="hidden lg:inline">Subscribe</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};
