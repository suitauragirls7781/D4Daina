import React, { useMemo, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ProductCard } from './ProductCard';
import { prepaidPercentText, prepaidRulesFrom } from '../utils/prepaid';
import { ArrowRight, CheckCircle2, ChevronRight, Loader2, MessageCircleQuestion, Tag } from 'lucide-react';
import { useDiscovery } from '../utils/discovery';
import { BABY_BOYS, BABY_GIRLS, KIDS_ALL, KIDS_TOYS, TOYS, departmentOf, isToy } from '../utils/kids';
import { Assurance, HowOrderWorks } from './Assurance';
import { WhatsAppIcon } from './BrandIcons';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { getCleanImageUrl, ELEGANT_PLACEHOLDER_SVG } from '../utils/imageHelper';
import { SectionTitle } from './SectionTitle';

/** Shared widths so every home section lines up on the same gutters. */
export const HOME_WRAP = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
/** Section rhythm: space only; sections sit straight on the ivory page (no hairline, no filled block). */
export const HOME_SECTION = 'w-full py-10 lg:py-16';
/** One card in a horizontal product rail: a little under two cards show on a phone, so the rail reads as swipeable. */
export const HOME_RAIL_ITEM = 'shrink-0 w-[58%] sm:w-[250px]';
/** The rail itself: a 12px gap on phones to match the two-column product grids. */
export const HOME_RAIL = 'sag-scroll-x flex gap-3 sm:gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1';
/** Product grid: two columns on phones (12px between columns, 24px between rows), four from tablet width up. */
export const HOME_GRID = 'grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-5 md:gap-y-9';
/** Eyebrow label: small spaced capitals in emerald. */
export const HOME_EYEBROW = 'sag-eyebrow text-[10.5px] leading-4 font-semibold uppercase tracking-[0.24em]';
/** The space between a section's title and its content. */
const HOME_TITLE_GAP = 'mb-7 lg:mb-10';

/** The small-capitals link centred under a section's content ("View all"). */
export const HomeMore: React.FC<{ onClick: () => void; id?: string; className?: string; children: React.ReactNode }> = ({ onClick, id, className = 'mt-6 lg:mt-9', children }) => (
  <div className={`flex justify-center px-4 ${className}`}>
    <button type="button" id={id} onClick={onClick} className="sag-lnk whitespace-nowrap">{children}</button>
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
 * Home section title: the centred eyebrow, serif title and ornament (SectionTitle). A section in this file
 * puts its "View all" under its content with HomeMore; an `action` passed here is drawn as the same
 * small-capitals link, centred under the title.
 */
export const HomeSectionHeader: React.FC<HomeSectionHeaderProps> = ({ title, text, eyebrow, titleId, action, className = HOME_TITLE_GAP }) => (
  <div className={`flex flex-col items-center ${className}`}>
    <SectionTitle id={titleId} eyebrow={eyebrow} title={title} sub={text} />
    {action && (
      <button type="button" id={action.id} onClick={action.onClick} className="sag-lnk mt-1 whitespace-nowrap">
        {action.label}
        <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </button>
    )}
  </div>
);

/** The link under a product grid, centred. */
export const HomeViewAllButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'View all styles' }) => (
  <HomeMore onClick={onClick}>
    {label}
    <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
  </HomeMore>
);

/** The four store facts, straight under the hero, as four small glass tiles. The wording lives in Assurance.tsx. */
export const HomeAssuranceBand: React.FC<{ id?: string }> = ({ id = 'home-assurance' }) => (
  <section id={id} aria-label="Shopping with us" className="w-full pt-6 pb-2 lg:pt-10 lg:pb-4">
    <div className={HOME_WRAP}>
      <Assurance variant="grid" whatsappMessage="Hi Suit Aura Girls, I need some help." />
    </div>
  </section>
);

/**
 * Featured collection: admin "featured" / bestseller picks, otherwise the latest styles.
 * The emerald band of the page: the first two styles as arch-topped photos (the second set lower) beside the
 * title, the real number of styles in stock and an ivory button; the other picks follow as a grid of product cards.
 */
export const FeaturedCollection: React.FC = () => {
  const { products = [], navigateToCategory, navigateToProduct } = useShop();
  const { items, liveCount } = useMemo(() => {
    const live = products.filter((p) => p.inStock && departmentOf(p) === 'women');
    const picked = live.filter((p) => p.isFeatured || p.isBestSeller);
    return { items: (picked.length >= 2 ? picked : live).slice(0, 10), liveCount: live.length };
  }, [products]);
  if (items.length === 0) return null;
  const band = items.length >= 2 ? items.slice(0, 2) : [];
  const rest = band.length > 0 ? items.slice(2) : items;
  return (
    <section id="featured-collection" aria-labelledby="featured-collection-title" className={band.length > 0 ? `w-full ${rest.length > 0 ? 'pb-10 lg:pb-16' : ''}` : HOME_SECTION}>
      {band.length > 0 ? (
        <div className="sag-on-emerald px-4 py-14 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-20">
            {/* Nothing is drawn on a photo: each one opens its own style */}
            <div className="grid grid-cols-2 items-start gap-[22px] px-1.5 pt-1.5 lg:gap-9">
              {band.map((product, index) => {
                const photoUrl = product.images?.find(Boolean) || product.image || '';
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => navigateToProduct(product.id)}
                    aria-label={`View ${product.name}`}
                    className={`relative block w-full cursor-pointer ${index === 1 ? 'mt-11' : ''}`}
                  >
                    <span className="sag-arch sag-zoom block aspect-[3/4.3] w-full overflow-hidden bg-sunken">
                      <img
                        src={photoUrl ? getCleanImageUrl(photoUrl, 640) : ELEGANT_PLACEHOLDER_SVG}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full rounded-none object-cover object-top"
                      />
                    </span>
                    <span className="sag-arch-line" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col items-start gap-4">
              <SectionTitle align="left" id="featured-collection-title" eyebrow="In stock now" title="Featured collection" />
              <p className="sag-num max-w-[38ch] text-[14px] leading-6 text-ink-muted">
                {liveCount} women's {liveCount === 1 ? 'style' : 'styles'} in stock right now.
              </p>
              <button type="button" onClick={() => navigateToCategory('All')} className="sag-btn-light mt-1">View all styles</button>
            </div>
          </div>
        </div>
      ) : (
        <div className={HOME_WRAP}>
          <HomeSectionHeader titleId="featured-collection-title" eyebrow="In stock now" title="Featured collection" />
        </div>
      )}
      {rest.length > 0 && (
        <div className={`${HOME_WRAP} ${band.length > 0 ? 'pt-10 lg:pt-16' : ''}`}>
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-9 lg:grid-cols-4">
            {rest.map((product, index) => (
              // Phones show four styles, tablets six, desktop all eight
              <div key={product.id} className={index >= 6 ? 'hidden lg:block' : index >= 4 ? 'hidden sm:block' : ''}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
          {band.length === 0 && <HomeViewAllButton onClick={() => navigateToCategory('All')} />}
        </div>
      )}
    </section>
  );
};

/** New arrivals: a swipe row of product cards on the page, at every width, with "View all" centred under it. */
export const NewArrivalsRail: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const items = useMemo(() => {
    const live = products.filter((p) => p.inStock && departmentOf(p) === 'women');
    const fresh = live.filter((p) => p.isNewArrival);
    return (fresh.length > 0 ? fresh : live).slice(0, 12);
  }, [products]);
  if (items.length === 0) return null;
  return (
    <section id="new-arrivals-rail" aria-labelledby="new-arrivals-title" className={HOME_SECTION}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader titleId="new-arrivals-title" eyebrow="Just in" title="New arrivals" />
        </div>
        <div className={HOME_RAIL}>
          {items.map((product) => (
            <div key={product.id} className={HOME_RAIL_ITEM}>
              <ProductCard product={product} compact />
            </div>
          ))}
        </div>
        <HomeMore onClick={() => navigateToCategory('New Arrivals')}>
          View all <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </HomeMore>
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
    <section id="kids-corner" aria-labelledby="kids-corner-title" className={HOME_SECTION}>
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <HomeSectionHeader
            titleId="kids-corner-title"
            eyebrow="For little ones"
            title={hasKids && groups.some((g) => g.key === TOYS) ? 'Kids & toys' : hasKids ? 'Kids wear' : 'Toys'}
            text={hasKids ? 'Outfits for baby girls and boys, sized by age from 1 to 15 years.' : 'Toys for every age.'}
            className={groups.length > 1 ? 'mb-5' : undefined}
          />
          {groups.length > 1 && (
            <div className="sag-scroll-x flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 mb-6 [justify-content:safe_center]" role="tablist" aria-label="Kids and toys">
              {groups.map((g, i) => {
                const active = g.key === current.key;
                return (
                  <button key={g.key} type="button" role="tab" aria-selected={active} data-selected={active} onClick={() => setTab(i)}
                    className="sag-chip shrink-0 h-11 px-4 text-[13px]">
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
        <HomeMore onClick={() => navigateToCategory((groups.length > 1 ? KIDS_TOYS : current.key === TOYS ? TOYS : KIDS_ALL) as any)}>
          View all <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </HomeMore>
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

  // The coupon is drawn as a ticket, so its line is left out of the list under it
  const otherOffers = bestCoupon ? offers.filter((offer) => !offer.startsWith(`Code ${bestCoupon.code}:`)) : offers;

  return (
    <section id="offer-banner" aria-labelledby="offer-banner-title" className={HOME_SECTION}>
      <div className={HOME_WRAP}>
        <SectionTitle id="offer-banner-title" eyebrow="Offers live now" title={<span className="break-words">{headline}</span>} className="mb-7 lg:mb-10" />
        <div className="mx-auto max-w-[640px]">
          {bestCoupon && (
            // A ticket: the real code, a dashed champagne divider, what it gives, and "Copy"
            <div className="sag-glass grid grid-cols-[auto_1fr_auto] items-center gap-3 py-4 pl-4 pr-2 sm:gap-4 sm:pl-[18px] sm:pr-3">
              <p className="sag-caps max-w-[40vw] break-all border-r border-dashed border-[color:var(--sag-champagne)] pr-3 font-display text-[22px] font-semibold uppercase leading-none tracking-[0.06em] text-brand sm:max-w-none sm:pr-4 sm:text-[28px]">{bestCoupon.code}</p>
              <p className="sag-num min-w-0">
                <span className="block text-[14px] font-semibold leading-[1.3] text-ink">{bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue} off` : `${bestCoupon.discountValue}% off`}</span>
                {bestCoupon.minOrderValue ? <span className="block text-[13px] leading-[18px] text-ink-muted">On orders above ₹{bestCoupon.minOrderValue.toLocaleString('en-IN')}</span> : null}
              </p>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(bestCoupon.code).then(() => showToast(`Code ${bestCoupon.code} copied.`, 'success')).catch(() => {})}
                className="sag-lnk mx-1.5"
              >
                Copy<span className="sr-only"> code {bestCoupon.code}</span>
              </button>
            </div>
          )}
          {otherOffers.length > 0 && (
            <ul className={`sag-glass divide-y divide-line px-4 ${bestCoupon ? 'mt-3' : ''}`}>
              {otherOffers.map((offer) => (
                <li key={offer} className="flex items-start gap-2.5 py-3 text-[13.5px] leading-5 text-ink">
                  <Tag className="w-4 h-4 mt-0.5 text-sale shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span className="sag-num min-w-0 break-words">{offer}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={() => navigateToCategory(saleCount > 0 ? 'Sale' : 'All')} className="sag-btn-primary h-12 w-full px-8 sm:w-auto sm:min-w-[240px]">
              {saleCount > 0 ? 'Shop offers' : 'Shop now'}
            </button>
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
    <section id="home-ask-assistant" aria-label="Help choosing a style" className="w-full pt-2 pb-10 lg:pb-14 min-[1440px]:hidden">
      <div className={HOME_WRAP}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('sag-open-assistant'))}
          className="sag-glass w-full min-h-[64px] flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-90 cursor-pointer"
        >
          <MessageCircleQuestion className="w-[21px] h-[21px] shrink-0 text-sale" strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-5 font-medium text-ink">Need help choosing? Ask SuitAura</span>
            <span className="block text-[13px] leading-[18px] text-ink-muted">Tell us a colour, size or budget and see matching styles from our store.</span>
          </span>
          <ChevronRight className="w-[18px] h-[18px] shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};

/**
 * Why shop with us: the same four facts as everywhere else (Assurance.tsx), never a second set of claims.
 * Phones and tablets: the plain grid of facts, then the "How your order works" box; desktop: the facts as rows. The facts
 * are left out here (phones and tablets) when the band under the hero (or the promises strip) already shows them on this page.
 */
export const WhyShop: React.FC = () => {
  const { homepageSections = [] } = useAdmin();
  const factsShownAbove = homepageSections.some((s) => s.enabled !== false && (s.key === 'hero' || s.key === 'artisanalPromises'));
  return (
    <section id="why-shop-with-us" aria-labelledby="why-shop-title" className={HOME_SECTION}>
      <div className={HOME_WRAP}>
        <SectionTitle id="why-shop-title" eyebrow="Suit Aura Girls" title="Why shop with us" className="mb-7 lg:mb-8" />
        <p className="hidden lg:block mx-auto mb-10 text-center text-sm leading-6 text-ink-muted max-w-xl">Pay online by UPI with Google Pay, PhonePe, Paytm or any UPI app. Your order is confirmed only after the payment is verified, and our team is on WhatsApp if you need help.</p>
        <div className="mx-auto max-w-3xl">
          <div className="sag-glass hidden px-5 py-1 lg:block">
            <Assurance variant="full" className="border-y-0!" whatsappMessage="Hi Suit Aura Girls, I need some help." />
          </div>
          <div className="lg:hidden flex flex-col gap-3">
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
    <section id="newsletter-section" aria-labelledby="newsletter-title" className={HOME_SECTION}>
      <div className={HOME_WRAP}>
        {/* One white panel, centred: the title with its ornament, one muted line, the WhatsApp button (phones and tablets), then the email field */}
        <div className="sag-glass mx-auto flex max-w-2xl flex-col items-center px-4 py-8 text-center sm:px-10 sm:py-12">
          <SectionTitle
            id="newsletter-title"
            eyebrow="Stay in touch"
            title={<>
              <span className="lg:hidden">Questions before you buy?</span>
              <span className="hidden lg:inline">Hear about new styles first</span>
            </>}
          />
          <p className="mt-3 text-[13.5px] leading-5 text-ink-muted lg:hidden">Ask us about size, colour or delivery on WhatsApp.</p>
          <p className="mt-3 hidden text-sm leading-6 text-ink-muted lg:block">New collections, restocks and offers by email. A few emails, never spam.</p>
          <a
            href={createSupportWhatsAppUrl('Hi Suit Aura Girls, I have a question before I buy.')}
            target="_blank"
            rel="noopener noreferrer"
            className="sag-btn-outline mt-5 w-full gap-2 lg:hidden"
          >
            <WhatsAppIcon className="h-4 w-4" mono /> Chat on WhatsApp
          </a>
          {status === 'done' ? (
            <p role="status" className="mt-5 flex items-center gap-2 border border-line bg-sunken px-4 py-3 text-left text-[13px] leading-5 text-ink">
              <CheckCircle2 className="w-[18px] h-[18px] shrink-0 text-sale" strokeWidth={1.5} aria-hidden="true" /> You are subscribed. Thank you!
            </p>
          ) : (
            <form onSubmit={submit} className="mt-4 flex w-full max-w-lg gap-2 lg:mt-6">
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
                className="sag-btn-primary shrink-0 gap-2 px-4 lg:px-7"
              >
                {status === 'saving' && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />}
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
