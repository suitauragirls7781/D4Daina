import React, { useState } from 'react';
import { useShop } from '../context/ShopContext';
import { KIDS_TOYS, departmentOf } from '../utils/kids';
import { useAdmin } from '../context/AdminContext';
import { ActivePage } from '../types';
import { STORE_ADDRESS, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY } from '../utils/storeContact';
import { ArrowUp, ChevronDown, Clock, Lock, Mail, MapPin } from 'lucide-react';
import { FacebookIcon, InstagramIcon, WhatsAppIcon, XIcon } from './BrandIcons';
import { TruckIcon } from './StoreIcons';
import { Assurance } from './Assurance';

/** A link group: an accordion row on phones (48px) that opens to a two-column list; an open list from tablet width up. */
const FooterGroup: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({ title, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <nav aria-label={title} className="border-b border-white/15 sm:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="sm:hidden w-full h-12 flex items-center justify-between text-left text-[15px] font-semibold text-on-dark cursor-pointer"
      >
        {title}
        <ChevronDown className={`w-4 h-4 text-on-dark-muted ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <p className="hidden sm:block mb-2 text-[15px] font-semibold text-on-dark">{title}</p>
      {/* Phones: two columns of 44px links, so an open group is half as tall */}
      <ul className={`${open ? 'grid' : 'hidden'} grid-cols-2 gap-x-4 sm:block pb-2 sm:pb-0`}>{children}</ul>
    </nav>
  );
};

export const Footer: React.FC = () => {
  const { setActivePage, navigateToCategory, products = [], activePage } = useShop();
  const { storeSettings } = useAdmin();
  const whatsappDigits = (storeSettings?.whatsapp || SUPPORT_PHONE_DISPLAY).replace(/\D/g, '');
  const whatsappNumber = whatsappDigits.length === 10 ? `91${whatsappDigits}` : whatsappDigits;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hi Suit Aura Girls! I have a question.')}`;
  const email = storeSettings?.storeEmail || 'contact.suitauragirls@gmail.com';
  const collections = [...new Set(products.filter((p) => departmentOf(p) === 'women').map((p) => p.category))].slice(0, 4);
  const hasKidsToys = products.some((p) => departmentOf(p) !== 'women');

  const go = (page: ActivePage) => {
    setActivePage(page);
    window.scrollTo(0, 0);
  };

  const socials = [
    { icon: InstagramIcon, href: storeSettings?.instagramUrl || STORE_INSTAGRAM_URL, label: 'Instagram' },
    { icon: FacebookIcon, href: storeSettings?.facebookUrl || '', label: 'Facebook' },
    { icon: XIcon, href: storeSettings?.twitterUrl || '', label: 'X (Twitter)' },
  ].filter((s) => s.href);

  const policies: Array<[ActivePage, string]> = [
    ['shipping-policy', 'Shipping'],
    ['return-policy', 'Returns & exchanges'],
    ['cancellation-policy', 'Cancellation'],
    ['privacy-policy', 'Privacy'],
    ['terms-policy', 'Terms'],
  ];
  const Link: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
    <li className="min-w-0">
      <button onClick={onClick} className="min-h-11 sm:min-h-9 max-w-full break-words inline-flex items-center text-left text-sm text-on-dark-muted hover:text-on-dark hover:underline underline-offset-4 transition-colors cursor-pointer">
        {children}
      </button>
    </li>
  );

  // Phones: room under the footer for whichever fixed bar the page shows (bottom navigation, bag bar or buy bar)
  const bottomRoom = activePage === 'cart' ? 'pb-28' : activePage === 'product-detail' ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]';

  return (
    <footer id="main-footer" className={`w-full bg-dark text-on-dark pt-8 sm:pt-12 md:pb-10 ${bottomRoom}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Need help? */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="font-display text-[22px] leading-7 text-on-dark">Need help?</p>
            <p className="mt-1 text-sm leading-5 text-on-dark-muted">Ask us about size, fabric or your order.</p>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-on-dark-muted">
              <Clock className="w-4 h-4 shrink-0" aria-hidden="true" /> Monday to Saturday, 10:00 AM – 7:00 PM IST
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 shrink-0">
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="col-span-2 h-12 px-5 rounded-control bg-white text-ink text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-sunken transition-colors">
              <WhatsAppIcon className="w-5 h-5" /> Chat on WhatsApp
            </a>
            <button onClick={() => go('track-order')} className="h-12 px-3 sm:px-5 rounded-control border-[1.5px] border-on-dark-muted text-on-dark text-sm font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap hover:bg-white/10 transition-colors cursor-pointer">
              <TruckIcon className="w-5 h-5" mono /> Track my order
            </button>
            <button onClick={() => go('contact')} className="h-12 px-3 text-sm font-semibold text-on-dark underline underline-offset-4 hover:text-white cursor-pointer">
              Contact us
            </button>
          </div>
        </div>

        {/* The four facts, worded in one place (Assurance.tsx) */}
        <Assurance variant="grid" onDark className="mt-5 sm:mt-6" />

        <div className="mt-5 sm:mt-8 grid gap-5 sm:gap-8 md:grid-cols-12">
          {/* Links */}
          <div className="md:col-span-7 md:order-2 grid sm:grid-cols-3 sm:gap-x-6 border-t border-white/15 sm:border-0">
            {/* Shop starts open on phones: its links (Kids & Toys among them) are the quickest way into the catalogue from any page */}
            <FooterGroup title="Shop" defaultOpen>
              <Link onClick={() => navigateToCategory('All')}>All styles</Link>
              <Link onClick={() => navigateToCategory('New Arrivals')}>New arrivals</Link>
              {hasKidsToys && <Link onClick={() => navigateToCategory(KIDS_TOYS as any)}>Kids &amp; Toys</Link>}
              {collections.map((name) => (
                <Link key={name} onClick={() => navigateToCategory(name as any)}>{name}</Link>
              ))}
            </FooterGroup>
            <FooterGroup title="Help">
              <Link onClick={() => go('track-order')}>Track order</Link>
              <Link onClick={() => go('account')}>My account</Link>
              <Link onClick={() => go('size-guide')}>Size guide</Link>
              <Link onClick={() => go('contact')}>Contact us</Link>
              <Link onClick={() => go('about')}>About us</Link>
            </FooterGroup>
            <FooterGroup title="Policies">
              {policies.map(([page, label]) => (
                <Link key={page} onClick={() => go(page)}>{label}</Link>
              ))}
            </FooterGroup>
          </div>

          {/* Brand and business contact */}
          <div className="md:col-span-5 md:order-1">
            <span className="inline-flex rounded-control bg-white px-3 py-1.5">
              <img src="/suit-aura-logo-480.webp" alt="Suit Aura Girls" width="480" height="240" loading="lazy" className="h-12 w-auto object-contain" />
            </span>
            <p className="mt-2 text-sm leading-5 text-on-dark-muted max-w-sm">
              {storeSettings?.tagline?.trim() || 'Ethnic and contemporary wear for women, designed and finished with care in India.'}
            </p>
            <a href={`mailto:${email}`} className="mt-1 min-h-11 inline-flex items-center gap-2 text-sm text-on-dark hover:underline underline-offset-4 break-all">
              <Mail className="w-4 h-4 shrink-0 text-on-dark-muted" aria-hidden="true" /> {email}
            </a>
            <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 py-1 text-[13px] leading-5 text-on-dark-muted hover:text-on-dark max-w-sm">
              <MapPin className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{storeSettings?.address?.trim() || STORE_ADDRESS}</span>
            </a>
            {socials.length > 0 && (
              <div className="mt-2 flex gap-2">
                {socials.map(({ icon: Icon, href, label }) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="w-11 h-11 rounded-full bg-white flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 pt-4 sm:mt-8 sm:pt-5 border-t border-white/15 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-start gap-1.5 text-[13px] leading-5 text-on-dark-muted">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> Secure online payment by UPI
            </p>
            <p className="mt-1 text-[13px] leading-5 text-on-dark-muted">© {new Date().getFullYear()} Suit Aura Girls. All rights reserved.</p>
          </div>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="self-start sm:self-auto h-11 px-4 rounded-control border-[1.5px] border-on-dark-muted text-sm font-semibold text-on-dark inline-flex items-center gap-1.5 hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ArrowUp className="w-4 h-4" aria-hidden="true" /> Back to top
          </button>
        </div>
      </div>
    </footer>
  );
};
