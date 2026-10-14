import React, { useEffect, useRef } from 'react';
import { useShop } from '../context/ShopContext';
import { useAdmin } from '../context/AdminContext';
import { ActivePage } from '../types';
import { STORE_ADDRESS, STORE_INSTAGRAM_URL, STORE_MAPS_URL, SUPPORT_PHONE_DISPLAY } from '../utils/storeContact';
import { Mail } from 'lucide-react';
import { FacebookIcon, InstagramIcon, WhatsAppIcon, XIcon } from './BrandIcons';
import { assuranceFacts } from './Assurance';
import { IOS_INSTALL_STEPS, askToInstall, useInstallWay } from '../utils/installApp';
import { clamp, noPin, requestMeasure, setVar, useScrollFx } from '../aura';

/**
 * The footer (Aura): an ink block that lies UNDER the page and is uncovered as the last section scrolls away.
 * A wrapper of the footer's own height keeps its place in the page and clips it (clip-path), the footer itself
 * is fixed to the bottom of the screen. Where that cannot work (the footer is taller than the screen, reduced
 * motion, no sticky support) it is a normal block at the end of the page.
 * Inside: a small rose knot that is drawn as the footer comes up, the giant wordmark, the help and policy
 * links as pills, the social marks, the address and one row of small print from the store's own facts.
 */
export const Footer: React.FC = () => {
  const { setActivePage, activePage } = useShop();
  const { storeSettings } = useAdmin();
  const whatsappDigits = (storeSettings?.whatsapp || SUPPORT_PHONE_DISPLAY).replace(/\D/g, '');
  const whatsappNumber = whatsappDigits.length === 10 ? `91${whatsappDigits}` : whatsappDigits;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent('Hi Suit Aura Girls! I have a question.')}`;
  const email = storeSettings?.storeEmail || 'contact.suitauragirls@gmail.com';
  const facts = assuranceFacts();
  // Install the store as an app, only where the browser can (src/utils/installApp.ts)
  const installWay = useInstallWay();

  const go = (page: ActivePage) => {
    setActivePage(page);
    window.scrollTo(0, 0);
  };

  const socials = [
    { icon: InstagramIcon, href: storeSettings?.instagramUrl || STORE_INSTAGRAM_URL, label: 'Instagram' },
    { icon: FacebookIcon, href: storeSettings?.facebookUrl || '', label: 'Facebook' },
    { icon: XIcon, href: storeSettings?.twitterUrl || '', label: 'X (Twitter)' },
  ].filter((s) => s.href);

  // The same ten links as before (kept in their three groups; shown as one row of pills)
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

  // The footer's own height is the wrapper's height (measured, never guessed). "Under the page" only when the
  // whole footer fits on the screen; the choice is written straight to the element, not through React state.
  const wrapRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current;
    const foot = footRef.current;
    if (!wrap || !foot) return undefined;
    let seen = -1;
    const fit = () => {
      const height = foot.offsetHeight;
      const under = !noPin() && height > 0 && height <= window.innerHeight;
      const key = under ? height : 0;
      if (key === seen) return;
      seen = key;
      wrap.style.setProperty('--fh', `${height}px`);
      if (under) wrap.setAttribute('data-under', ''); else wrap.removeAttribute('data-under');
      requestMeasure();
    };
    fit();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    observer?.observe(foot);
    // A phone's address bar sliding away changes the screen height a little: that must not flip the choice
    let width = window.innerWidth;
    let screenHeight = window.innerHeight;
    const onResize = () => {
      if (window.innerWidth === width && Math.abs(window.innerHeight - screenHeight) <= 120) return;
      width = window.innerWidth;
      screenHeight = window.innerHeight;
      fit();
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => { observer?.disconnect(); window.removeEventListener('resize', onResize); };
  }, []);
  // As the footer comes up: the knot draws (--fp) and the wordmark settles from a little higher (--fy)
  useScrollFx(wrapRef, ({ el, y, vh, top, height }) => {
    const shown = clamp((y + vh - top) / Math.max(1, height));
    setVar(el, '--fp', clamp((shown - 0.25) / 0.7));
    setVar(el, '--fy', `${((1 - shown) * -46).toFixed(1)}px`);
  });

  // Phones: room under the footer for whichever fixed bar the page shows (tab bar, bag bar or buy bar)
  const room = activePage === 'cart' ? 'room-bag' : activePage === 'product-detail' ? 'room-buy' : '';
  const links = columns.flatMap((column) => column.links);

  return (
    <div ref={wrapRef} className="aura-ftw">
      <footer ref={footRef} id="main-footer" className={`aura-ft ${room}`}>
        <div className="mx-auto max-w-7xl">
          <svg className="aura-ft-k" viewBox="0 0 40 74" aria-hidden="true" focusable="false">
            <path pathLength={1} d="M20 0v26l14 14-14 14L6 40l14-14M20 54c-9 4-9 14 0 14s9-10 0-14v20" />
          </svg>
          <button type="button" onClick={() => go('home')} className="aura-ft-w" aria-label="Suit Aura Girls home">
            Suit <em>Aura</em> Girls
          </button>
          <p className="aura-ft-s">Ethnic wear · {facts.delivery}</p>

          <nav aria-label="Help and policies" className="aura-ft-ln">
            {links.map(([page, label]) => (
              <button key={page} type="button" onClick={() => go(page)}>{label}</button>
            ))}
            {installWay && (
              <button type="button" id="footer-install-app" onClick={() => { void askToInstall(); }} title={installWay === 'ios' ? IOS_INSTALL_STEPS : undefined}>
                {installWay === 'ios' ? `Install the app: ${IOS_INSTALL_STEPS.toLowerCase()}` : 'Install the app'}
              </button>
            )}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            {socials.map(({ icon: Icon, href, label }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="aura-ft-so"><Icon className="w-[19px] h-[19px]" mono /></a>
            ))}
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="aura-ft-so"><WhatsAppIcon className="w-[19px] h-[19px]" mono /></a>
            <a href={`mailto:${email}`} aria-label={`Email ${email}`} className="aura-ft-so"><Mail className="w-[19px] h-[19px]" strokeWidth={1.6} aria-hidden="true" /></a>
          </div>

          <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer" className="aura-ft-ad">
            {storeSettings?.address?.trim() || STORE_ADDRESS}
          </a>

          <div className="aura-ft-b">
            <span>© {new Date().getFullYear()} Suit Aura Girls</span>
            <span>{facts.payment} · {facts.returns}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
