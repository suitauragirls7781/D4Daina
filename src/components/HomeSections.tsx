import React, { useMemo, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ProductCard } from './ProductCard';
import { prepaidPercentText, prepaidRulesFrom } from '../utils/prepaid';
import { CheckCircle2, ChevronRight, Loader2, MessageCircleQuestion, Tag } from 'lucide-react';
import { useDiscovery } from '../utils/discovery';
import { BABY_BOYS, BABY_GIRLS, KIDS_ALL, KIDS_TOYS, TOYS, departmentOf, isToy } from '../utils/kids';
import { Assurance, HowOrderWorks } from './Assurance';
import { WhatsAppIcon } from './BrandIcons';
import { createSupportWhatsAppUrl } from '../utils/storeContact';

/** Shared widths so every home section lines up on the same gutters. */
export const HOME_WRAP = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
/** Section rhythm: space only; sections sit straight on the night backdrop (no hairline, no filled block). */
export const HOME_SECTION = 'w-full py-[18px] lg:py-10';
/** One card in a horizontal product rail: two and a bit cards show on a phone, so the rail reads as swipeable. */
export const HOME_RAIL_ITEM = 'shrink-0 w-[150px] sm:w-[200px] lg:w-[240px]';
/** The rail itself: a 12px gap on phones to match the two-column product grids. */
export const HOME_RAIL = 'sag-scroll-x flex gap-3 lg:gap-6 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1';
/** Product grid: two columns on phones (12px between columns, 18px between rows), four from tablet width up. */
export const HOME_GRID = 'grid grid-cols-2 gap-x-3 gap-y-[18px] md:grid-cols-4 md:gap-x-4 md:gap-y-7 lg:gap-x-6 lg:gap-y-10';
/** Eyebrow label: small spaced capitals in gold. */
export const HOME_EYEBROW = 'text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale';
/** Quiet gold text link ("View all"). */
const HOME_LINK = 'inline-flex min-h-9 items-center text-[13px] leading-5 font-semibold text-sale cursor-pointer hover:text-brand-dark transition-colors';

interface HomeSectionHeaderProps {
  title: string;
  text?: string;
  eyebrow?: string;
  /** id for the h2, so the section can point at it with aria-labelledby */
  titleId?: string;
  action?: { label: string; onClick: () => void; id?: string };
  className?: string;
}

/** Home section title: serif headline on the left, one gold "View all" link on the right. */
export const HomeSectionHeader: React.FC<HomeSectionHeaderProps> = ({ title, text, eyebrow, titleId, action, className = 'mb-4 lg:mb-7' }) => (
  <div className={`flex items-end justify-between gap-4 ${className}`}>
    <div className="min-w-0">
      {eyebrow && <p className={`${HOME_EYEBROW} mb-1.5`}>{eyebrow}</p>}
      <h2 id={titleId} className="font-display text-[20px] leading-6 lg:text-[28px] lg:leading-9 text-ink">{title}</h2>
      {text && <p className="mt-1 text-[13px] leading-5 text-ink-muted max-w-xl">{text}</p>}
    </div>
    {action && (
      <button type="button" id={action.id} onClick={action.onClick} className={`${HOME_LINK} shrink-0 -my-2 whitespace-nowrap`}>
        {action.label}
      </button>
    )}
  </div>
);

/** One outline button under a product grid: full width on phones, centred on desktop. */
export const HomeViewAllButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'View all styles' }) => (
  <div className="mt-5 flex justify-center lg:mt-9">
    <button type="button" onClick={onClick} className="sag-btn-outline w-full sm:w-auto sm:min-w-[280px]">{label}</button>
  </div>
);

/** The four store facts, straight under the hero, as four small glass tiles. The wording lives in Assurance.tsx. */
export const HomeAssuranceBand: React.FC<{ id?: string }> = ({ id = 'home-assurance' }) => (
  <section id={id} aria-label="Shopping with us" className="w-full py-1 lg:py-3">
    <div className={HOME_WRAP}>
      <Assurance variant="grid" whatsappMessage="Hi Suit Aura Girls, I need some help." />
    </div>
  </section>
);

/**
 * Featured collection: admin "featured" / bestseller picks, otherwise the latest styles.
 * A grid of product cards on the backdrop (two columns on phones) and one glass "View all styles" pill under it.
 */
export const FeaturedCollection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const items = useMemo(() => {
    const live = products.filter((p) => p.inStock && departmentOf(p) === 'women');
    const picked = live.filter((p) => p.isFeatured || p.isBestSeller);
    return (picked.length >= 2 ? picked : live).slice(0, 8);
  }, [products]);
  if (items.length === 0) return null;
  return (
    <section id="featured-collection" aria-labelledby="featured-collection-title" className={HOME_SECTION}>
      <div className={HOME_WRAP}>
        <HomeSectionHeader titleId="featured-collection-title" title="Featured collection" action={{ label: 'View all', onClick: () => navigateToCategory('All') }} />
        <div className={HOME_GRID}>
          {items.map((product, index) => (
            // Phones show four styles; from tablet width up all eight
            <div key={product.id} className={index >= 4 ? 'hidden md:block' : ''}>
              <ProductCard product={product} />
            </div>
          ))}
        </div>
        <HomeViewAllButton onClick={() => navigateToCategory('All')} />
      </div>
    </section>
  );
};

/** New arrivals: a swipe row of product cards on the backdrop, at every width. */
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
          <HomeSectionHeader titleId="new-arrivals-title" title="New arrivals" action={{ label: 'View all', onClick: () => navigateToCategory('New Arrivals') }} />
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
    <section id="kids-corner" aria-labelledby="kids-corner-title" className={HOME_SECTION}>
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
                    className="sag-chip shrink-0 h-10 px-4 text-[13px]">
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
        <div className="sag-glass rounded-[26px]! p-4 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="min-w-0 max-w-2xl">
            <p className={HOME_EYEBROW}>Offers live now</p>
            <h2 id="offer-banner-title" className="mt-2 font-display text-[21px] leading-7 lg:text-[30px] lg:leading-9 text-ink break-words">{headline}</h2>
            {offers.length > 0 && (
              <ul className="mt-3.5 space-y-2">
                {offers.map((offer) => (
                  <li key={offer} className="flex items-start gap-2 text-[13px] leading-5 text-ink">
                    <Tag className="w-4 h-4 mt-0.5 text-sale shrink-0" strokeWidth={1.5} aria-hidden="true" />
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
                className="sag-btn-outline h-12 sm:px-6 max-w-full"
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
    <section id="home-ask-assistant" aria-label="Help choosing a style" className="w-full py-[18px] lg:py-8 min-[1440px]:hidden">
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
      <div className={`${HOME_WRAP} lg:grid lg:grid-cols-12 lg:gap-10 lg:items-center`}>
        <div className="lg:col-span-5 mb-4 lg:mb-0">
          <h2 id="why-shop-title" className="font-display text-[20px] leading-6 lg:text-[28px] lg:leading-9 text-ink">Why shop with us</h2>
          <p className="hidden lg:block mt-2 text-sm leading-6 text-ink-muted max-w-xl">Pay online by UPI with Google Pay, PhonePe, Paytm or any UPI app. Your order is confirmed only after the payment is verified, and our team is on WhatsApp if you need help.</p>
        </div>
        <div className="lg:col-span-7">
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
        {/* One glass panel: the title, one muted line, a glass WhatsApp pill (phones and tablets), then the email field */}
        <div className="sag-glass rounded-[26px]! p-4 sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="lg:max-w-md">
            <h2 id="newsletter-title" className="font-display text-[20px] leading-6 lg:text-[28px] lg:leading-9 text-ink">
              <span className="lg:hidden">Questions before you buy?</span>
              <span className="hidden lg:inline">Hear about new styles first</span>
            </h2>
            <p className="mt-1.5 text-[13px] leading-5 text-ink-muted lg:hidden">Ask us about size, colour or delivery on WhatsApp.</p>
            <p className="mt-2 hidden text-sm leading-6 text-ink-muted lg:block">New collections, restocks and offers by email. A few emails, never spam.</p>
            <a
              href={createSupportWhatsAppUrl('Hi Suit Aura Girls, I have a question before I buy.')}
              target="_blank"
              rel="noopener noreferrer"
              className="sag-btn-outline mt-4 w-full gap-2 lg:hidden"
            >
              <WhatsAppIcon className="h-4 w-4" mono /> Chat on WhatsApp
            </a>
          </div>
          {status === 'done' ? (
            <p role="status" className="mt-3 lg:mt-0 flex items-center gap-2 border border-line bg-white/[0.08] px-4 py-3 text-[13px] leading-5 text-ink">
              <CheckCircle2 className="w-[18px] h-[18px] shrink-0 text-sale" strokeWidth={1.5} aria-hidden="true" /> You are subscribed. Thank you!
            </p>
          ) : (
            <form onSubmit={submit} className="mt-3 lg:mt-0 flex gap-2 lg:flex-1 lg:max-w-lg">
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
