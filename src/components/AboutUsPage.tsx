import React, { useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { ActivePage } from '../types';
import { getCleanImageUrl } from '../utils/imageHelper';
import { STORE_ADDRESS_LINES, STORE_MAPS_URL } from '../utils/storeContact';
import { LockIcon, PinIcon, ReturnIcon, StoreIconProps, SupportIcon, TruckIcon } from './StoreIcons';

type PromiseItem = { icon: React.FC<StoreIconProps>; title: string; text: string; page: ActivePage; link: string };

// Every promise here is taken from the store's own policy pages and contact details.
const PROMISES: PromiseItem[] = [
  { icon: TruckIcon, title: 'Delivery across India', text: 'Most orders are dispatched within 24–48 business hours, with tracking on every parcel.', page: 'shipping-policy', link: 'Shipping policy' },
  { icon: ReturnIcon, title: '7-day returns & exchanges', text: 'Size not right? Request a return or exchange within 7 days of delivery.', page: 'return-policy', link: 'Returns policy' },
  { icon: LockIcon, title: 'Secure prepaid checkout', text: 'Pay safely by UPI, card or net banking through a trusted payment gateway.', page: 'privacy-policy', link: 'Privacy policy' },
  { icon: SupportIcon, title: 'Real people to help', text: 'Talk to our team on WhatsApp, phone or email, Monday to Saturday.', page: 'contact', link: 'Contact us' },
];

export const AboutUsPage: React.FC = () => {
  const { setActivePage, navigateToCategory, products = [] } = useShop();

  // A real photo from the store's own catalogue (no stock imagery)
  const storyImage = useMemo(() => {
    const withPhoto = products.find((p) => p.inStock && p.productType !== 'toy' && (p.images?.[0] || p.image));
    return withPhoto ? { src: getCleanImageUrl(withPhoto.images?.[0] || withPhoto.image, 900), alt: withPhoto.name } : null;
  }, [products]);

  return (
    <div id="about-us-page" className="bg-[#FBF7F3] pb-14 sm:pb-20">
      {/* Title band */}
      <div className="bg-[#F3EEF8] border-b border-[#4B1D3F]/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10 sm:pt-8 sm:pb-16">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-[#2A1A26]/60">
            <button onClick={() => setActivePage('home')} className="hover:text-[#4B1D3F] cursor-pointer">Home</button>
            <ChevronRight className="w-3.5 h-3.5 text-[#4B1D3F]/40" />
            <span className="text-[#4B1D3F] font-medium">About us</span>
          </nav>
          <div className="mt-8 sm:mt-12 text-center max-w-3xl mx-auto">
            <p className="sag-eyebrow">Our story</p>
            <h1 className="font-serif text-[38px] leading-[1.05] sm:text-6xl text-[#4B1D3F] mt-3">Elegance That Feels Like You</h1>
            <p className="mt-5 text-[15px] sm:text-base leading-7 text-[#2A1A26]/75">
              Suit Aura Girls was born from a singular passion: celebrating modern Indian womanhood with ethnic silhouettes that harmonize regal heritage with supreme everyday comfort.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16 pt-10 sm:pt-16">
        {/* Story */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center" aria-labelledby="about-story-title">
          <div className="order-2 md:order-1 space-y-4">
            <p className="sag-eyebrow">Who we are</p>
            <h2 id="about-story-title" className="font-serif text-3xl sm:text-4xl text-[#4B1D3F]">A boutique from Asansol, for women across India</h2>
            <p className="text-[15px] leading-7 text-[#2A1A26]/75">
              We bring together suits, kurtis, anarkalis and co-ord sets chosen for how they look, feel and move, from easy everyday pieces to festive favourites.
            </p>
            <p className="text-[15px] leading-7 text-[#2A1A26]/75">
              We believe luxury should never be cumbersome. Our silhouettes are designed to flatter all Indian body shapes in sizes from S to 5XL with graceful drapes that move effortlessly with you.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-2">
              <button onClick={() => navigateToCategory('All')} className="sag-btn-primary inline-flex items-center gap-2 h-12 px-6 text-sm font-semibold cursor-pointer">
                Explore the collection <ArrowRight className="w-4 h-4 text-white" />
              </button>
              <button onClick={() => setActivePage('size-guide')} className="sag-btn-outline inline-flex items-center h-12 px-6 text-sm font-semibold cursor-pointer">
                Size guide
              </button>
            </div>
          </div>

          <div className="order-1 md:order-2">
            {storyImage ? (
              <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-[#F3EEF8] shadow-[var(--sag-shadow)]">
                <img src={storyImage.src} alt={storyImage.alt} loading="lazy" className="w-full h-full object-cover object-top" />
              </div>
            ) : (
              <div className="aspect-[4/5] rounded-3xl bg-[#F3EEF8] border border-[#4B1D3F]/10 flex items-center justify-center p-10">
                <img src="/suit-aura-logo-480.webp" alt="Suit Aura Girls" width={480} height={240} className="w-3/4 h-auto" />
              </div>
            )}
          </div>
        </section>

        {/* Promises (all backed by the store's policies) */}
        <section aria-labelledby="about-promises-title">
          <div className="text-center max-w-2xl mx-auto">
            <p className="sag-eyebrow">Shopping with us</p>
            <h2 id="about-promises-title" className="font-serif text-3xl sm:text-4xl text-[#4B1D3F] mt-2">What you can count on</h2>
          </div>
          <div className="mt-8 grid grid-cols-1 min-[460px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {PROMISES.map(({ icon: Icon, title, text, page, link }) => (
              <div key={title} className="sag-card rounded-3xl p-5 sm:p-6 flex flex-col">
                <span className="w-12 h-12 rounded-full bg-[#F3EEF8] flex items-center justify-center"><Icon className="w-7 h-7" /></span>
                <h3 className="font-serif text-[22px] leading-tight text-[#4B1D3F] mt-4">{title}</h3>
                <p className="text-sm leading-6 text-[#2A1A26]/70 mt-2 flex-1">{text}</p>
                <button onClick={() => setActivePage(page)} className="mt-4 self-start inline-flex items-center gap-1 text-sm font-semibold text-[#4B1D3F] hover:underline underline-offset-4 cursor-pointer">
                  {link} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Visit */}
        <section className="rounded-3xl bg-[#4B1D3F] text-white p-6 sm:p-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-center" aria-labelledby="about-visit-title">
          <div className="flex items-start gap-4">
            <span className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center shrink-0"><PinIcon mono className="w-6 h-6 text-white" /></span>
            <div>
              <h2 id="about-visit-title" className="font-serif text-3xl text-white">Find our store</h2>
              <p className="mt-2 text-[15px] leading-7 text-white/80">{STORE_ADDRESS_LINES.join(' ')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center h-12 px-6 rounded-full bg-white text-[#4B1D3F] text-sm font-semibold hover:bg-[#F3EEF8] transition-colors">
              Open in Google Maps
            </a>
            <button onClick={() => setActivePage('contact')} className="inline-flex items-center h-12 px-6 rounded-full border border-white/35 text-white text-sm font-semibold hover:bg-white/10 transition-colors cursor-pointer">
              Contact us
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
