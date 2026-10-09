import React from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ActivePage } from '../types';
import { STORE_ADDRESS, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY } from '../utils/storeContact';
import { Mail } from 'lucide-react';
import { FacebookIcon, InstagramIcon, WhatsAppIcon, XIcon } from './BrandIcons';
import { assuranceFacts } from './Assurance';

/**
 * The footer (Emerald Heritage): one emerald band, edge to edge. On top, centred: the serif wordmark with its
 * small ornament, one muted line and the social marks as round champagne outlines. Then the help and policy
 * links in columns under small champagne headings, with the store address beside them, and one row of small
 * print built from the store's own facts.
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

  const plainIcon = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full! border border-highlight/50 text-highlight transition-colors duration-300 hover:bg-highlight hover:text-dark active:bg-highlight active:text-dark';
  const socials = [
    { icon: InstagramIcon, href: storeSettings?.instagramUrl || STORE_INSTAGRAM_URL, label: 'Instagram' },
    { icon: FacebookIcon, href: storeSettings?.facebookUrl || '', label: 'Facebook' },
    { icon: XIcon, href: storeSettings?.twitterUrl || '', label: 'X (Twitter)' },
  ].filter((s) => s.href);

  // The same ten links as before, in three columns under plain headings
  const columns: Array<{ title: string; links: Array<[ActivePage, string]> }> = [
    { title: 'Orders', links: [
      ['track-order', 'Track order'],
      ['return-policy', 'Returns & exchange'],
      ['shipping-policy', 'Shipping'],
      ['cancellation-policy', 'Cancellation'],
    ] },
    { title: 'Help', links: [
      ['contact', 'Contact us'],
      ['size-guide', 'Size guide'],
      ['account', 'My account'],
    ] },
    { title: 'About', links: [
      ['about', 'About us'],
      ['privacy-policy', 'Privacy'],
      ['terms-policy', 'Terms'],
    ] },
  ];
  const heading = 'sag-caps mb-2 text-[10.5px] font-semibold uppercase leading-4 tracking-[0.24em] text-highlight';

  // Phones: room under the footer for whichever fixed bar the page shows (bottom navigation, bag bar or buy bar)
  const bottomRoom = activePage === 'cart' ? 'pb-28' : activePage === 'product-detail' ? 'pb-40' : 'pb-[calc(5.75rem+env(safe-area-inset-bottom))]';

  return (
    <footer id="main-footer" className={`sag-on-emerald w-full px-4 pt-12 sm:px-6 md:pt-16 md:pb-0 ${bottomRoom}`}>
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col items-center gap-3.5 pb-9 text-center">
          <button type="button" onClick={() => go('home')} className="sag-caps max-w-full truncate pl-[0.2em] font-display text-[22px] uppercase leading-none tracking-[0.2em]! cursor-pointer sm:text-[26px]" aria-label="Suit Aura Girls home">
            Suit Aura Girls
          </button>
          <span className="sag-orn" aria-hidden="true"><i /></span>
          <p className="text-[13.5px] leading-5 text-on-dark-muted">Ethnic wear · {facts.delivery}</p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {socials.map(({ icon: Icon, href, label }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={plainIcon}><Icon className="w-[19px] h-[19px]" mono /></a>
            ))}
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className={plainIcon}><WhatsAppIcon className="w-[19px] h-[19px]" mono /></a>
            <a href={`mailto:${email}`} aria-label={`Email ${email}`} className={plainIcon}><Mail className="w-[19px] h-[19px]" strokeWidth={1.5} aria-hidden="true" /></a>
          </div>
        </div>

        <div className="grid gap-x-4 gap-y-8 border-t border-line py-8 md:grid-cols-[3fr_1.6fr]">
          <nav aria-label="Help and policies" className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
            {columns.map((column) => (
              <div key={column.title}>
                <p className={heading}>{column.title}</p>
                <ul>
                  {column.links.map(([page, label]) => (
                    <li key={page}>
                      <button type="button" onClick={() => go(page)} className="flex min-h-10 items-center text-left text-[14px] leading-5 cursor-pointer">
                        <span className="sag-underline">{label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="text-[13.5px] leading-[1.65] text-on-dark-muted">
            <p className={heading}>Address</p>
            <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="block py-1.5 transition-colors hover:text-on-dark">
              {storeSettings?.address?.trim() || STORE_ADDRESS}
            </a>
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 border-t border-line pb-6 pt-[18px] text-[12px] leading-[18px] text-on-dark-muted">
          <p>© {new Date().getFullYear()} Suit Aura Girls</p>
          <p className="text-highlight">{facts.payment} · {facts.returns}</p>
        </div>
      </div>
    </footer>
  );
};
