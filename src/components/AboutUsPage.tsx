import React, { useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { ActivePage } from '../types';
import { getCleanImageUrl } from '../utils/imageHelper';
import { STORE_ADDRESS_LINES, STORE_MAPS_URL } from '../utils/storeContact';
import { LockIcon, PinIcon, ReturnIcon, StoreIconProps, SupportIcon, TruckIcon } from './StoreIcons';
import { HelpCard, InfoPageHeader } from './PolicyPages';

type PromiseItem = { icon: React.FC<StoreIconProps>; title: string; text: string; page: ActivePage; link: string };

// Every promise here is taken from the store's own policy pages and contact details.
const PROMISES: PromiseItem[] = [
  { icon: TruckIcon, title: 'Delivery across India', text: 'Most orders are dispatched within 24–48 business hours, with tracking on every parcel.', page: 'shipping-policy', link: 'Shipping policy' },
  { icon: ReturnIcon, title: '7-day returns & exchange', text: 'Size not right? Request a return or exchange within 7 days of delivery.', page: 'return-policy', link: 'Returns policy' },
  { icon: LockIcon, title: 'Secure prepaid checkout', text: 'Pay safely by UPI (Google Pay, PhonePe, Paytm or any UPI app) through a trusted payment gateway.', page: 'privacy-policy', link: 'Privacy policy' },
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
    <div id="about-us-page" className="bg-page pb-12 lg:pb-16">
      <InfoPageHeader
        crumb="About us"
        eyebrow="Our story"
        title="Elegance That Feels Like You"
        subtitle="Suit Aura Girls celebrates modern Indian women with ethnic wear that brings together traditional style and everyday comfort."
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-8 space-y-8 lg:space-y-12">
        {/* Story */}
        <section className="grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 md:gap-8 lg:gap-12 md:items-center" aria-labelledby="about-story-title">
          <div className="w-full max-w-[320px] md:max-w-none mx-auto">
            {storyImage ? (
              <div className="aspect-[4/5] overflow-hidden bg-sunken">
                <img src={storyImage.src} alt={storyImage.alt} loading="lazy" className="w-full h-full object-cover object-top" />
              </div>
            ) : (
              <div className="aspect-[4/5] bg-surface border border-line flex items-center justify-center p-8">
                <img src="/suit-aura-logo-480.webp" alt="Suit Aura Girls" width={480} height={240} className="w-3/4 h-auto" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale">Who we are</p>
            <h2 id="about-story-title" className="font-display font-medium text-[22px] leading-7 lg:text-[28px] lg:leading-9 text-ink mt-1.5">A boutique from Asansol, for women across India</h2>
            <p className="mt-3 text-sm leading-[22px] lg:text-[15px] lg:leading-6 text-ink">
              We bring together suits, kurtis, anarkalis and co-ord sets chosen for how they look, feel and move, from easy everyday pieces to festive favourites.
            </p>
            <p className="mt-3 text-sm leading-[22px] lg:text-[15px] lg:leading-6 text-ink">
              We believe dressing well should never be uncomfortable. Our silhouettes are designed to flatter all Indian body shapes in sizes from S to 5XL, with graceful drapes that move easily with you.
            </p>
            <div className="mt-5 flex flex-col min-[420px]:flex-row gap-2.5">
              <button type="button" onClick={() => navigateToCategory('All')} className="sag-btn-primary gap-2">
                Shop the collection <ArrowRight className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setActivePage('size-guide')} className="sag-btn-outline">
                Size guide
              </button>
            </div>
          </div>
        </section>

        {/* Promises (all backed by the store's policies) */}
        <section aria-labelledby="about-promises-title">
          <p className="text-[10.5px] leading-4 font-semibold uppercase tracking-[0.16em] text-sale">Shopping with us</p>
          <h2 id="about-promises-title" className="font-display font-medium text-[22px] leading-7 lg:text-[28px] lg:leading-9 text-ink mt-1.5">What you can count on</h2>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 sm:gap-x-10 border-t border-line">
            {PROMISES.map(({ icon: Icon, title, text, page, link }) => (
              <li key={title} className="flex gap-3 border-b border-line py-4">
                <span className="shrink-0 flex text-sale mt-0.5"><Icon mono className="w-5 h-5" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm leading-5 font-medium text-ink">{title}</h3>
                  <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{text}</p>
                  <button type="button" onClick={() => setActivePage(page)} className="sag-link gap-0.5 text-[12.5px]">
                    {link} <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Visit */}
        <section className="border border-line bg-surface p-4 sm:p-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-center" aria-labelledby="about-visit-title">
          <div className="flex items-start gap-3">
            <span className="shrink-0 flex text-sale mt-0.5"><PinIcon mono className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 id="about-visit-title" className="font-sans text-sm leading-5 font-semibold text-ink">Find our store</h2>
              <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{STORE_ADDRESS_LINES.join(' ')}</p>
            </div>
          </div>
          <div className="flex flex-col min-[420px]:flex-row gap-2.5">
            <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="sag-btn-outline h-12">
              Open in Google Maps
            </a>
            <button type="button" onClick={() => setActivePage('contact')} className="sag-btn-outline h-12">
              Contact us
            </button>
          </div>
        </section>

        <HelpCard topic="store" showContactLink={false} />
      </div>
    </div>
  );
};
