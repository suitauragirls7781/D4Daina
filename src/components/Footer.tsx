import React from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ActivePage } from '../types';
import { STORE_ADDRESS, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY } from '../utils/storeContact';
import { Mail } from 'lucide-react';
import { FacebookIcon, InstagramIcon, WhatsAppIcon, XIcon } from './BrandIcons';
import { assuranceFacts } from './Assurance';

/**
 * The footer (Noir & Champagne): the only dark block of the store. The wordmark and one muted line, the help
 * and policy links in plain columns, the social marks as bare icons, a hairline, then the address and one
 * line of small print built from the store's own facts.
 */
export const Footer: React.FC = () => {
  const { setActivePage, activePage } = useShop();
  const { storeSettings } = useAdmin();
  const whatsappDigits = (storeSettings?.whatsapp || SUPPORT_PHONE_DISPLAY).replace(/\D/g, '');
  const whatsappNumber = whatsappDigits.length === 10 ? `91${whatsappDigits}` : whatsappDigits;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hi Suit Aura Girls! I have a question.')}`;
  const email = storeSettings?.storeEmail || 'contact.suitauragirls@gmail.com';
  const facts = assuranceFacts();

  const go = (page: ActivePage) => {
    setActivePage(page);
    window.scrollTo(0, 0);
  };

  const plainIcon = 'flex h-10 w-8 shrink-0 items-center justify-center text-on-dark hover:text-on-dark-muted transition-colors';
  const socials = [
    { icon: InstagramIcon, href: storeSettings?.instagramUrl || STORE_INSTAGRAM_URL, label: 'Instagram' },
    { icon: FacebookIcon, href: storeSettings?.facebookUrl || '', label: 'Facebook' },
    { icon: XIcon, href: storeSettings?.twitterUrl || '', label: 'X (Twitter)' },
  ].filter((s) => s.href);

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
  const bottomRoom = activePage === 'cart' ? 'pb-28' : activePage === 'product-detail' ? 'pb-40' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]';

  return (
    <footer id="main-footer" className={`w-full bg-dark text-on-dark pt-[26px] md:pt-10 md:pb-8 ${bottomRoom}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12">
          <div>
            <button type="button" onClick={() => go('home')} className="sag-caps block max-w-full truncate font-display text-[18px] font-medium uppercase leading-6 tracking-[0.14em] text-on-dark text-left cursor-pointer lg:text-[20px]" aria-label="Suit Aura Girls home">
              Suit Aura Girls
            </button>
            <p className="mt-1.5 text-[13px] leading-5 text-on-dark-muted">Ethnic wear · {facts.delivery}</p>
          </div>

          <nav aria-label="Help and policies" className="mt-5 lg:mt-0">
            <ul className="grid grid-cols-2 gap-x-2.5 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
              {links.map(([page, label]) => (
                <li key={page}>
                  <button type="button" onClick={() => go(page)} className="min-h-9 py-1 text-left text-[13px] leading-5 text-on-dark hover:text-on-dark-muted cursor-pointer transition-colors">
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-4 -ml-1.5 flex items-center gap-1.5">
          {socials.map(({ icon: Icon, href, label }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={plainIcon}><Icon className="w-[19px] h-[19px]" mono /></a>
          ))}
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className={plainIcon}><WhatsAppIcon className="w-[19px] h-[19px]" mono /></a>
          <a href={`mailto:${email}`} aria-label={`Email ${email}`} className={plainIcon}><Mail className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" /></a>
        </div>

        <div className="mt-4 border-t border-white/20 pt-3.5 text-[11.5px] leading-[18px] text-on-dark-muted md:flex md:items-start md:justify-between md:gap-8">
          <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="block hover:text-on-dark md:max-w-[60%]">
            {storeSettings?.address?.trim() || STORE_ADDRESS}
          </a>
          <p className="mt-1.5 md:mt-0 md:shrink-0 md:text-right">{facts.payment} · {facts.returns} · © {new Date().getFullYear()} Suit Aura Girls</p>
        </div>
      </div>
    </footer>
  );
};
