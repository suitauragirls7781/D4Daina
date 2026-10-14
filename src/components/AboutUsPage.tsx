import React, { useMemo } from 'react';
import { useShop } from '../context/ShopContext';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { ActivePage } from '../types';
import { getCleanImageUrl } from '../utils/imageHelper';
import { STORE_ADDRESS_LINES, STORE_MAPS_URL } from '../utils/storeContact';
import { LockIcon, PinIcon, ReturnIcon, StoreIconProps, SupportIcon, TruckIcon } from './StoreIcons';
import { HelpCard, InfoPageHeader } from './PolicyPages';
import { AuraTitle, Drift, ScrollWords } from '../aura';
import { HomeAssuranceBand } from './HomeSections';

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
    const withPhoto = products.find((p) => p.inStock && (p.images?.[0] || p.image));
    return withPhoto ? { src: getCleanImageUrl(withPhoto.images?.[0] || withPhoto.image, 900), alt: withPhoto.name } : null;
  }, [products]);

  const body = 'text-[15px] leading-[23px] lg:text-[16px] lg:leading-[25px] text-ink';

  return (
    <div id="about-us-page" data-aura className="clay-pg pb-14 lg:pb-20">
      <InfoPageHeader
        crumb="About us"
        eyebrow="Our story"
        title="Elegance That Feels Like You"
        subtitle="Suit Aura Girls celebrates modern Indian women with ethnic wear that brings together traditional style and everyday comfort."
      />

      <div className="max-w-[1120px] mx-auto px-3 sm:px-6 pt-8 lg:pt-14 space-y-12 lg:space-y-20">
        {/* Story */}
        <section className="grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-7 md:gap-10 lg:gap-14 md:items-center px-1" aria-labelledby="about-story-title">
          <div className="w-full max-w-[340px] md:max-w-none mx-auto">
            {storyImage ? (
              <div data-rv="photo" style={{ '--rv-r': '24px' } as React.CSSProperties} className="aura-sk aspect-[4/5] rounded-[24px]">
                {/* Aura Kinetic: the photo travels a little slower than the page inside its frame */}
                <Drift amount={5} className="h-full w-full">
                  <img src={storyImage.src} alt={storyImage.alt} loading="lazy" className="w-full h-full object-cover object-top" />
                </Drift>
              </div>
            ) : (
              <div className="aspect-[4/5] rounded-[24px] bg-surface flex items-center justify-center p-8">
                <img src="/suit-aura-mark-132.webp" alt="Suit Aura Girls" width={132} height={132} className="h-[132px] w-[132px] rounded-full object-cover" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <AuraTitle
              label="Who we are"
              id="about-story-title"
              size="lg"
              title="A boutique from Asansol, for women across"
              accent="India"
            />
            <p data-rv className={`mt-5 ${body}`}>
              We bring together suits, kurtis, anarkalis and co-ord sets chosen for how they look, feel and move, from easy everyday pieces to festive favourites.
            </p>
            <p data-rv className={`mt-3 ${body}`}>
              Our silhouettes are designed to flatter all Indian body shapes in sizes from S to 5XL, with graceful drapes that move easily with you.
            </p>
            <div data-rv className="mt-6 flex flex-col min-[420px]:flex-row gap-2.5">
              <button type="button" onClick={() => navigateToCategory('All')} className="aura-btn">
                Shop the collection <ArrowRight strokeWidth={1.6} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setActivePage('size-guide')} className="aura-btn aura-btn-line">
                Size guide
              </button>
            </div>
          </div>
        </section>

      </div>

      {/* Aura Kinetic: the store's own sentence, lit word by word as it is read, then its real facts as the moving band */}
      <div className="mx-auto max-w-[1120px] px-4 pb-4 pt-16 sm:px-7 lg:pt-28">
        <ScrollWords text="We believe dressing well should never be *uncomfortable.*" className="aura-h2 aura-h-lg max-w-[13em]" />
      </div>
      <div className="mt-10 lg:mt-16"><HomeAssuranceBand id="about-facts" /></div>

      <div className="max-w-[1120px] mx-auto px-3 sm:px-6 pt-12 lg:pt-20 space-y-12 lg:space-y-20">
        {/* Promises (all backed by the store's policies) */}
        <section aria-labelledby="about-promises-title">
          <AuraTitle label="Shopping with us" title="What you can count" accent="on" id="about-promises-title" size="lg" className="px-1" />
          <ul className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {PROMISES.map(({ icon: PromiseIcon, title, text, page, link }) => (
              <li key={title} data-rv="card" className="aura-card flex gap-3.5 p-4 sm:p-5">
                <span className="aa-ic aa-ic-blush"><PromiseIcon mono className="w-5 h-5" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[20px] leading-6 font-extrabold tracking-[-0.02em] text-ink">{title}</h3>
                  <p className="mt-1.5 text-[14px] leading-5 text-ink-muted">{text}</p>
                  <button type="button" onClick={() => setActivePage(page)} className="sag-link gap-0.5 text-[13.5px]">
                    {link} <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.6} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-2.5">
          {/* Visit */}
          <section className="aura-card aura-blk p-4 sm:p-7 grid gap-5 md:grid-cols-[1fr_auto] md:items-center" aria-labelledby="about-visit-title">
            <div className="flex items-start gap-3.5">
              <span className="aa-ic"><PinIcon mono className="w-5 h-5" /></span>
              <div className="min-w-0">
                <h2 id="about-visit-title" className="text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em] text-ink">Find our store</h2>
                <p className="mt-1.5 text-[14.5px] leading-[21px] text-ink-muted">{STORE_ADDRESS_LINES.join(' ')}</p>
              </div>
            </div>
            <div className="flex flex-col min-[420px]:flex-row gap-2">
              <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="aura-btn aura-btn-sm">
                Open in Google Maps
              </a>
              <button type="button" onClick={() => setActivePage('contact')} className="aura-btn aura-btn-line aura-btn-sm">
                Contact us
              </button>
            </div>
          </section>

          <HelpCard topic="store" showContactLink={false} />
        </div>
      </div>
    </div>
  );
};
