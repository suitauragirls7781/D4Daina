import React, { useMemo, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useShop } from '../context/ShopContext';
import { ProductCard } from './ProductCard';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { ArrowRight, CheckCircle2, Headphones, Loader2, Lock, PackageCheck, RotateCcw, Sparkles, Truck } from 'lucide-react';
import { BABY_BOYS, BABY_GIRLS, KIDS_ALL, KIDS_TOYS, TOYS, departmentOf, isToy } from '../utils/kids';
import { LockIcon, QualityIcon, ReturnIcon, SupportIcon, TruckIcon } from './StoreIcons';

const SectionHeader: React.FC<{ eyebrow: string; title: string; text?: string; action?: { label: string; onClick: () => void }; center?: boolean }> = ({ eyebrow, title, text, action, center }) => (
  <div className={`flex gap-4 mb-7 sm:mb-10 ${center ? 'flex-col items-center text-center' : 'items-end justify-between'}`}>
    <div className={center ? 'max-w-xl' : ''}>
      <p className="sag-eyebrow">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-[#4B1D3F]">{title}</h2>
      {text && <p className="mt-2 text-sm sm:text-[15px] text-[#2A1A26]/65 max-w-lg">{text}</p>}
    </div>
    {action && (
      <button onClick={action.onClick} className="hidden sm:inline-flex shrink-0 items-center gap-1.5 text-sm text-[#4B1D3F] hover:gap-2.5 transition-all cursor-pointer">
        {action.label} <ArrowRight className="w-4 h-4" />
      </button>
    )}
  </div>
);

/** Featured collection: admin "featured" / bestseller picks, otherwise the latest styles. */
export const FeaturedCollection: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const items = useMemo(() => {
    const live = products.filter((p) => p.inStock && departmentOf(p) === 'women');
    const picked = live.filter((p) => p.isFeatured || p.isBestSeller);
    return (picked.length >= 2 ? picked : live).slice(0, 8);
  }, [products]);
  if (items.length === 0) return null;
  return (
    <section id="featured-collection" className="w-full bg-white py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="Featured" title="The featured collection" text="Pieces our studio is proud of this season." action={{ label: 'View all', onClick: () => navigateToCategory('All') }} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {items.map((product, index) => (
            <div key={product.id} className={index >= 4 ? 'hidden sm:block' : ''}>
              <ProductCard product={product} />
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center sm:hidden">
          <button onClick={() => navigateToCategory('All')} className="sag-btn-outline h-11 px-7 text-xs font-semibold uppercase tracking-[0.14em] cursor-pointer">View all styles</button>
        </div>
      </div>
    </section>
  );
};

/** New arrivals as a swipeable rail. */
export const NewArrivalsRail: React.FC = () => {
  const { products = [], navigateToCategory } = useShop();
  const items = useMemo(() => {
    const live = products.filter((p) => p.inStock && departmentOf(p) === 'women');
    const fresh = live.filter((p) => p.isNewArrival);
    return (fresh.length > 0 ? fresh : live).slice(0, 12);
  }, [products]);
  if (items.length === 0) return null;
  return (
    <section id="new-arrivals-rail" className="w-full bg-[#FBF7F3] py-12 sm:py-16">
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="Just in" title="New arrivals" action={{ label: 'Shop new', onClick: () => navigateToCategory('New Arrivals') }} />
        </div>
        <div className="sag-scroll-x flex gap-3 sm:gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-2">
          {items.map((product) => (
            <div key={product.id} className="shrink-0 w-[62vw] max-w-[260px] sm:w-[240px] lg:w-[270px]">
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
    <section id="kids-corner" aria-labelledby="kids-corner-title" className="w-full bg-[#F3EEF8]/60 py-12 sm:py-16">
      <div className="max-w-7xl mx-auto">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <p className="sag-eyebrow">For the little ones</p>
              <h2 id="kids-corner-title" className="mt-2 font-serif text-3xl sm:text-4xl text-[#4B1D3F]">{hasKids && groups.some((g) => g.key === TOYS) ? 'Kids & toys' : hasKids ? 'Kids wear' : 'Toys'}</h2>
              <p className="mt-2 text-sm sm:text-[15px] text-[#2A1A26]/65 max-w-lg">{hasKids ? 'Outfits for baby girls and boys, sized by age from 1 to 15 years.' : 'Fun picks for every age.'}</p>
            </div>
            <button onClick={() => navigateToCategory((groups.length > 1 ? KIDS_TOYS : current.key === TOYS ? TOYS : KIDS_ALL) as any)} className="shrink-0 inline-flex items-center gap-1.5 text-sm text-[#4B1D3F] hover:gap-2.5 transition-all cursor-pointer">
              View all <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {groups.length > 1 && (
            <div className="sag-scroll-x flex gap-2 overflow-x-auto pb-1 mb-5" role="tablist" aria-label="Kids and toys">
              {groups.map((g, i) => {
                const active = g.key === current.key;
                return (
                  <button key={g.key} role="tab" aria-selected={active} onClick={() => setTab(i)}
                    className={`shrink-0 h-10 px-4 rounded-full border text-sm transition-colors cursor-pointer ${active ? 'bg-[#4B1D3F] border-[#4B1D3F] text-white' : 'bg-white border-[#4B1D3F]/15 text-[#2A1A26] hover:bg-[#F3EEF8]'}`}>
                    {g.label} <span className="opacity-60">({g.items.length})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div key={current.key} className="sag-scroll-x sag-fade flex gap-3 sm:gap-5 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-2" role="tabpanel" aria-label={current.label}>
          {current.items.slice(0, 12).map((product) => (
            <div key={product.id} className="shrink-0 w-[62vw] max-w-[260px] sm:w-[240px] lg:w-[270px]">
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
  const saleCount = products.filter((p) => p.inStock && (p.isSale || (p.originalPrice > p.price))).length;
  const bestCoupon = [...coupons].sort((a, b) => b.discountValue - a.discountValue)[0];

  const offers: string[] = [];
  if (comboOffer) offers.push(`${comboOffer.percent}% off when you buy ${comboOffer.minItems}+ outfits`);
  if (bestCoupon) offers.push(`Code ${bestCoupon.code}: ${bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue} off` : `${bestCoupon.discountValue}% off`}${bestCoupon.minOrderValue ? ` above ₹${bestCoupon.minOrderValue.toLocaleString('en-IN')}` : ''}`);
  if (prepaidDiscount > 0) offers.push(`₹${prepaidDiscount} off every prepaid order`);
  if (freeShippingThreshold > 0) offers.push(`Free shipping above ₹${freeShippingThreshold.toLocaleString('en-IN')}`);
  if (offers.length === 0 && saleCount === 0) return null;

  const headline = comboOffer
    ? `Save ${comboOffer.percent}% on ${comboOffer.minItems} or more`
    : bestCoupon
    ? `${bestCoupon.discountType === 'fixed' ? `₹${bestCoupon.discountValue}` : `${bestCoupon.discountValue}%`} off with ${bestCoupon.code}`
    : saleCount > 0
    ? 'Now on offer'
    : `₹${prepaidDiscount} off prepaid orders`;

  return (
    <section id="offer-banner" className="w-full bg-white py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-[#4B1D3F] px-6 py-10 sm:px-12 sm:py-14 lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#F7E4EA]/10" aria-hidden="true" />
          <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full border border-[#C5A46D]/40" aria-hidden="true" />
          <div className="relative max-w-xl">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#E8D2A4]">Offers</p>
            <h2 className="mt-3 font-serif text-4xl sm:text-5xl text-white leading-[1.05]">{headline}</h2>
            {offers.length > 0 && (
              <ul className="mt-5 space-y-2">
                {offers.map((offer) => (
                  <li key={offer} className="flex items-start gap-2 text-sm text-white/85">
                    <Sparkles className="w-4 h-4 mt-0.5 text-[#E8D2A4] shrink-0" />
                    <span>{offer}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:flex-col lg:min-w-[220px]">
            <button
              onClick={() => navigateToCategory(saleCount > 0 ? 'Sale' : 'All')}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-8 text-xs font-semibold uppercase tracking-[0.16em] text-[#4B1D3F] hover:bg-[#F7E4EA] transition-colors cursor-pointer"
            >
              {saleCount > 0 ? 'Shop offers' : 'Shop now'} <ArrowRight className="w-4 h-4 text-[#4B1D3F]" />
            </button>
            {bestCoupon && (
              <button
                onClick={() => navigator.clipboard?.writeText(bestCoupon.code).then(() => showToast(`Code ${bestCoupon.code} copied.`, 'success')).catch(() => {})}
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/40 px-8 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                Copy code {bestCoupon.code}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/** Service promises stated plainly; details live on the policy pages. */
export const WhyShop: React.FC = () => {
  const { setActivePage } = useShop();
  const features = [
    { icon: LockIcon, title: 'Secure payments', text: 'Pay safely online by UPI, card or net banking.' },
    { icon: TruckIcon, title: 'Tracked delivery', text: 'Shipped across India with a tracking number emailed to you.', link: 'shipping-policy' },
    { icon: ReturnIcon, title: 'Easy returns', text: 'Request a return from your account after delivery.', link: 'return-policy' },
    { icon: QualityIcon, title: 'Quality checked', text: 'Every piece is inspected and packed by hand in our studio.' },
    { icon: SupportIcon, title: 'Real support', text: 'Talk to our team on WhatsApp about sizing, orders or anything else.', href: createSupportWhatsAppUrl('Hi Suit Aura Girls, I need some help.') },
  ];
  return (
    <section id="why-shop-with-us" className="w-full bg-[#F3EEF8] py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader eyebrow="Our promise" title="Why shop with us" center />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-5">
          {features.map(({ icon: Icon, title, text, link, href }, index) => {
            const body = (
              <>
                <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-white to-[#F3EEF8] ring-1 ring-[#4B1D3F]/10 shadow-[0_6px_16px_-10px_rgba(75,29,63,0.45)] flex items-center justify-center">
                  <Icon className="w-8 h-8 sm:w-9 sm:h-9" live />
                </span>
                <h3 className="mt-3 sm:mt-4 font-serif text-lg sm:text-xl text-[#2A1A26] leading-tight">{title}</h3>
                <p className="mt-1 text-[13px] sm:text-sm leading-relaxed text-[#2A1A26]/65">{text}</p>
                {(link || href) && <span className="mt-auto pt-3 inline-flex items-center gap-1 text-xs text-[#4B1D3F] font-semibold">Learn more <ArrowRight className="w-3.5 h-3.5" /></span>}
              </>
            );
            const cls = `sag-card p-4 sm:p-6 text-left flex flex-col h-full ${index === features.length - 1 && features.length % 2 === 1 ? 'col-span-2 lg:col-span-1' : ''}`;
            if (href) return <a key={title} href={href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:border-[#4B1D3F]/30 transition-colors`}>{body}</a>;
            if (link) return <button key={title} onClick={() => setActivePage(link as any)} className={`${cls} hover:border-[#4B1D3F]/30 transition-colors cursor-pointer`}>{body}</button>;
            return <div key={title} className={cls}>{body}</div>;
          })}
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
    <section id="newsletter-section" className="w-full bg-[#FBF7F3] py-14 sm:py-20">
      <div className="max-w-2xl mx-auto px-4 text-center">
        <p className="sag-eyebrow">Newsletter</p>
        <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-[#4B1D3F]">First look at every new drop</h2>
        <p className="mt-3 text-sm sm:text-[15px] text-[#2A1A26]/65">New collections, restocks and offers — a few thoughtful emails, never spam.</p>
        {status === 'done' ? (
          <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-5 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="w-4 h-4" /> You are subscribed. Thank you!
          </p>
        ) : (
          <form onSubmit={submit} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <label htmlFor="newsletter-email" className="sr-only">Email address</label>
            <input
              id="newsletter-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              className="w-full sm:flex-1 h-12 shrink-0 rounded-full border border-[#4B1D3F]/15 bg-white px-5 text-[15px] focus:outline-none focus:border-[#4B1D3F]/50"
            />
            <button type="submit" disabled={status === 'saving'} className="sag-btn-primary h-12 px-8 text-xs font-semibold uppercase tracking-[0.16em] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
              {status === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />} Subscribe
            </button>
          </form>
        )}
      </div>
    </section>
  );
};
