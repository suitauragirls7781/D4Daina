import React from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ActivePage } from '../types';
import { STORE_ADDRESS, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY } from '../utils/storeContact';
import { Mail, MapPin } from 'lucide-react';
import { FacebookIcon, InstagramIcon, WhatsAppIcon, XIcon } from './BrandIcons';

/**
 * The "slim" footer (owner's pick 4): one dark block with the round logo and the name, three round buttons
 * (Instagram, WhatsApp, email), every help and policy link as a chip, and one line of small print.
 * It takes little room on a phone; the catalogue is reached from the header menu and the bottom navigation.
 */
export const Footer: React.FC = () => {
  const { setActivePage, activePage } = useShop();
  const { storeSettings } = useAdmin();
  const whatsappDigits = (storeSettings?.whatsapp || SUPPORT_PHONE_DISPLAY).replace(/\D/g, '');
  const whatsappNumber = whatsappDigits.length === 10 ? `91${whatsappDigits}` : whatsappDigits;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hi Suit Aura Girls! I have a question.')}`;
  const email = storeSettings?.storeEmail || 'contact.suitauragirls@gmail.com';

  const go = (page: ActivePage) => {
    setActivePage(page);
    window.scrollTo(0, 0);
  };

  const round = 'w-[42px] h-[42px] shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-on-dark transition-colors';
  const socials = [
    { icon: InstagramIcon, href: storeSettings?.instagramUrl || STORE_INSTAGRAM_URL, label: 'Instagram' },
    { icon: FacebookIcon, href: storeSettings?.facebookUrl || '', label: 'Facebook' },
    { icon: XIcon, href: storeSettings?.twitterUrl || '', label: 'X (Twitter)' },
  ].filter((s) => s.href);

  // The first chip (Track order) is the mint one
  const links: Array<[ActivePage, string]> = [
    ['track-order', 'Track order'],
    ['return-policy', 'Returns & exchange'],
    ['shipping-policy', 'Shipping'],
    ['cancellation-policy', 'Cancellation'],
    ['contact', 'Contact us'],
    ['size-guide', 'Size guide'],
    ['account', 'My account'],
    ['about', 'About us'],
    ['privacy-policy', 'Privacy'],
    ['terms-policy', 'Terms'],
  ];

  // Phones: room under the footer for whichever fixed bar the page shows (bottom navigation, bag bar or buy bar)
  const bottomRoom = activePage === 'cart' ? 'pb-28' : activePage === 'product-detail' ? 'pb-40' : 'pb-[calc(5rem+env(safe-area-inset-bottom))]';

  return (
    <footer id="main-footer" className={`w-full rounded-t-[28px] bg-dark text-on-dark pt-[18px] md:pb-6 ${bottomRoom}`}>
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => go('home')} className="flex min-w-0 items-center gap-2.5 rounded-full text-left cursor-pointer" aria-label="Suit Aura Girls home">
            <img src="/suit-aura-mark-132.webp" alt="" width="44" height="44" loading="lazy" className="h-11 w-11 shrink-0 rounded-full bg-white object-cover" />
            <span className="truncate text-base font-extrabold tracking-[0.04em] text-on-dark">SUIT AURA <span className="text-highlight">GIRLS</span></span>
          </button>
          <div className="flex shrink-0 gap-2">
            {socials.slice(0, 1).map(({ icon: Icon, href, label }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={round}><Icon className="w-5 h-5" /></a>
            ))}
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className={round}><WhatsAppIcon className="w-5 h-5" /></a>
            <a href={`mailto:${email}`} aria-label={`Email ${email}`} className={round}><Mail className="w-5 h-5" aria-hidden="true" /></a>
          </div>
        </div>

        <nav aria-label="Help and policies" className="mt-3.5">
          <ul className="flex flex-wrap gap-[7px]">
            {links.map(([page, label], index) => (
              <li key={page}>
                <button
                  type="button"
                  onClick={() => go(page)}
                  className={`h-9 px-3.5 rounded-full text-[12.5px] font-bold inline-flex items-center cursor-pointer transition-colors ${index === 0 ? 'bg-highlight text-ink' : 'bg-white/10 text-on-dark hover:bg-white/20'}`}
                >
                  {label}
                </button>
              </li>
            ))}
            {socials.slice(1).map(({ icon: Icon, href, label }) => (
              <li key={label}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="h-9 px-3.5 rounded-full bg-white/10 text-[12.5px] font-bold text-on-dark inline-flex items-center gap-1.5 hover:bg-white/20"><Icon className="w-4 h-4" /> {label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="mt-3.5 flex items-start gap-1.5 text-xs leading-[18px] text-on-dark-muted hover:text-on-dark">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{storeSettings?.address?.trim() || STORE_ADDRESS}</span>
        </a>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs leading-[18px] text-on-dark-muted">
          <p>© {new Date().getFullYear()} Suit Aura Girls</p>
          <p>UPI · Secure online payment</p>
        </div>
      </div>
    </footer>
  );
};
