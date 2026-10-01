import React from 'react';
import { useShop } from '../context/ShopContext';
import { KIDS_TOYS, departmentOf } from '../utils/kids';
import { useAdmin } from '../context/AdminContext';
import { ActivePage } from '../types';
import { STORE_ADDRESS, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY } from '../utils/storeContact';
import { ArrowUp, ChevronRight, Clock } from 'lucide-react';
import { FacebookIcon, GmailIcon, InstagramIcon, WhatsAppIcon, XIcon } from './BrandIcons';
import { LockIcon, PinIcon, ReturnIcon, TagIcon, TruckIcon } from './StoreIcons';

export const Footer: React.FC = () => {
  const { setActivePage, navigateToCategory, products = [], storeOffers, activePage } = useShop();
  const { storeSettings } = useAdmin();
  const whatsappDigits = (storeSettings?.whatsapp || SUPPORT_PHONE_DISPLAY).replace(/\D/g, '');
  const whatsappNumber = whatsappDigits.length === 10 ? `91${whatsappDigits}` : whatsappDigits;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hi Suit Aura Girls! I have a question.')}`;
  const email = storeSettings?.storeEmail || 'suitauragirls@gmail.com';
  const collections = [...new Set(products.filter((p) => departmentOf(p) === 'women').map((p) => p.category))].slice(0, 4);
  const hasKidsToys = products.some((p) => departmentOf(p) !== 'women');
  const prepaidOff = Number(storeOffers?.prepaidDiscount) || 0;
  const shippingFree = (Number(storeOffers?.shippingCharge) || 0) === 0;

  const go = (page: ActivePage) => {
    setActivePage(page);
    window.scrollTo(0, 0);
  };

  const socials = [
    { icon: InstagramIcon, href: storeSettings?.instagramUrl || STORE_INSTAGRAM_URL, label: 'Instagram' },
    { icon: FacebookIcon, href: storeSettings?.facebookUrl || '', label: 'Facebook' },
    { icon: XIcon, href: storeSettings?.twitterUrl || '', label: 'X (Twitter)' },
  ].filter((s) => s.href);

  // Only promises the store keeps: secure prepaid checkout, the 7-day return policy, delivery across India,
  // and the prepaid discount / free shipping when the owner has them switched on.
  const promises = [
    { icon: LockIcon, title: 'Secure payment', text: 'UPI & cards' },
    { icon: ReturnIcon, title: '7-day returns', text: 'Easy exchange too' },
    { icon: TruckIcon, title: shippingFree ? 'Free shipping' : 'Pan-India delivery', text: shippingFree ? 'On every order' : 'Tracked to your door' },
    prepaidOff > 0 ? { icon: TagIcon, title: `₹${prepaidOff} off`, text: 'When you pay online' } : { icon: TagIcon, title: 'Fair prices', text: 'MRP & savings shown' },
  ];

  const linkClass = 'group inline-flex items-center gap-1 py-1 text-[15px] text-white/75 hover:text-white transition-colors cursor-pointer text-left';
  const heading = 'font-serif text-xl text-white mb-3';
  const policies: Array<[ActivePage, string]> = [
    ['shipping-policy', 'Shipping'],
    ['return-policy', 'Returns & exchanges'],
    ['cancellation-policy', 'Cancellation'],
    ['privacy-policy', 'Privacy'],
    ['terms-policy', 'Terms'],
  ];
  const Link: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <button onClick={onClick} className={linkClass}>
      <span>{children}</span>
      <ChevronRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" aria-hidden="true" />
    </button>
  );

  return (
    <footer id="main-footer" className="w-full bg-[#FBF7F3] pt-4 sm:pt-10">
      {/* Help band */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative z-10 rounded-3xl bg-white border border-[#4B1D3F]/10 shadow-[0_24px_50px_-34px_rgba(42,26,38,0.55)] px-5 py-6 sm:px-10 sm:py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="text-center md:text-left">
            <p className="sag-eyebrow">We are here to help</p>
            <p className="mt-1.5 font-serif text-2xl sm:text-3xl text-[#4B1D3F] leading-tight">Questions about size, fabric or your order?</p>
            <p className="mt-1.5 flex items-center justify-center md:justify-start gap-1.5 text-sm text-[#2A1A26]/65">
              <Clock className="w-4 h-4 text-[#9C7A45]" /> Monday to Saturday, 10:00 AM – 7:00 PM IST
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 shrink-0">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="h-12 px-6 rounded-full bg-[#4B1D3F] hover:bg-[#3B1532] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors">
              <WhatsAppIcon className="w-5 h-5" /> Chat on WhatsApp
            </a>
            <button onClick={() => go('track-order')} className="h-12 px-6 rounded-full border border-[#4B1D3F]/20 bg-white hover:bg-[#F3EEF8] text-[#4B1D3F] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer">
              <TruckIcon className="w-5 h-5" /> Track my order
            </button>
          </div>
        </div>
      </div>

      {/* Phones: room for the bottom bar (and the bag page's checkout bar) so nothing hides behind them */}
      <div className={`-mt-12 bg-[#4B1D3F] text-white pt-20 md:pb-10 ${activePage === 'cart' ? 'pb-48' : activePage === 'product-detail' ? 'pb-40' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Promises */}
          <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {promises.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/10 px-3.5 py-3.5 sm:px-5 sm:py-4">
                <span className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-[#E8D2A4]">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" mono />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm sm:text-[15px] font-semibold leading-tight">{title}</span>
                  <span className="block text-xs sm:text-[13px] text-white/60 leading-tight mt-0.5">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-10 sm:mt-12 grid gap-10 md:grid-cols-12 md:gap-8">
            {/* Brand + contact */}
            <div className="md:col-span-5 text-center md:text-left">
              <span className="inline-flex rounded-2xl bg-[#FBF7F3] px-4 py-2">
                <img src="/suit-aura-logo-480.webp" alt="Suit Aura Girls" width="480" height="240" loading="lazy" className="h-14 sm:h-16 w-auto object-contain" />
              </span>
              <p className="mt-4 text-[15px] leading-relaxed text-white/70 max-w-sm mx-auto md:mx-0">
                {storeSettings?.tagline?.trim() || 'Ethnic and contemporary wear for women, designed and finished with care in India.'}
              </p>
              <div className="mt-5 flex flex-wrap justify-center md:justify-start gap-2">
                <a href={`mailto:${email}`} className="h-11 px-4 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 inline-flex items-center gap-2 text-sm font-medium transition-colors">
                  <GmailIcon className="w-[18px] h-[18px]" /> {email}
                </a>
                {socials.map(({ icon: Icon, href, label }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}
                    className="w-11 h-11 rounded-full bg-white hover:scale-105 flex items-center justify-center transition-transform">
                    <Icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
              <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="mt-5 flex items-start justify-center md:justify-start gap-2 text-[13px] leading-5 text-white/65 hover:text-white max-w-sm mx-auto md:mx-0">
                <span className="text-[#E8D2A4] mt-0.5"><PinIcon className="w-4 h-4" mono /></span>
                <span>{storeSettings?.address?.trim() || STORE_ADDRESS}</span>
              </a>
            </div>

            {/* Links */}
            <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8 border-t border-white/10 pt-8 md:border-0 md:pt-0">
              <nav aria-label="Shop">
                <p className={heading}>Shop</p>
                <ul className="space-y-1">
                  <li><Link onClick={() => navigateToCategory('All')}>All styles</Link></li>
                  <li><Link onClick={() => navigateToCategory('New Arrivals')}>New arrivals</Link></li>
                  {hasKidsToys && <li><Link onClick={() => navigateToCategory(KIDS_TOYS as any)}>Kids &amp; Toys</Link></li>}
                  {collections.map((name) => (
                    <li key={name}><Link onClick={() => navigateToCategory(name as any)}>{name}</Link></li>
                  ))}
                </ul>
              </nav>
              <nav aria-label="Help">
                <p className={heading}>Help</p>
                <ul className="space-y-1">
                  <li><Link onClick={() => go('track-order')}>Track order</Link></li>
                  <li><Link onClick={() => go('account')}>My account</Link></li>
                  <li><Link onClick={() => go('size-guide')}>Size guide</Link></li>
                  <li><Link onClick={() => go('contact')}>Contact us</Link></li>
                  <li><Link onClick={() => go('about')}>About us</Link></li>
                </ul>
              </nav>
              <nav aria-label="Policies" className="col-span-2 sm:col-span-1">
                <p className={heading}>Policies</p>
                <ul className="flex flex-wrap gap-2 sm:block sm:space-y-1">
                  {policies.map(([page, label]) => (
                    <li key={page}>
                      <span className="sm:hidden">
                        <button onClick={() => go(page)} className="h-9 px-3.5 rounded-full bg-white/10 border border-white/10 text-[13px] text-white/80 hover:text-white cursor-pointer">{label}</button>
                      </span>
                      <span className="hidden sm:inline"><Link onClick={() => go(page)}>{label}</Link></span>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/10 flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
            <p className="text-[13px] leading-relaxed text-white/65">
              <span className="inline-flex align-[-4px] mr-1.5 text-[#E8D2A4]"><LockIcon className="w-[18px] h-[18px]" mono /></span>Secure online payments · UPI · Cards · Net banking · Prepaid orders only
            </p>
            {/* Phones: the back-to-top button sits centred on its own line, clear of the floating assistant */}
            <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
              <p className="text-[13px] text-white/55">© {new Date().getFullYear()} Suit Aura Girls. All rights reserved.</p>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                aria-label="Back to top"
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
