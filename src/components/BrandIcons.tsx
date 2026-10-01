import React from 'react';
import { siFacebook, siGmail, siInstagram, siWhatsapp, siX, siYoutube } from 'simple-icons';

type IconProps = { className?: string; mono?: boolean; 'aria-hidden'?: boolean | 'true' | 'false' };
type SimpleIcon = { title: string; path: string; hex: string };

// Official brand marks (Simple Icons) in their real colours; `mono` uses the text colour instead.
const make = (icon: SimpleIcon, fill?: string) => {
  const BrandIcon: React.FC<IconProps & { live?: boolean }> = ({ className = 'w-5 h-5', mono = false, live = true }) => (
    <svg viewBox="0 0 24 24" className={`${className} sag-ic ${live ? 'sag-live sag-a-pop' : ''}`} role="img" aria-hidden="true" focusable="false">
      <path d={icon.path} fill={mono ? 'currentColor' : fill || `#${icon.hex}`} />
    </svg>
  );
  BrandIcon.displayName = `${icon.title.replace(/\W/g, '')}Icon`;
  return BrandIcon;
};

export const WhatsAppIcon = make(siWhatsapp);
export const FacebookIcon = make(siFacebook);
export const XIcon = make(siX);
export const YouTubeIcon = make(siYoutube);
export const GmailIcon = make(siGmail);

/**
 * The store's shopping bag: plum bag with a champagne-gold handle (brand colours). `mono` draws it in the
 * text colour, for use on plum buttons. Accepts strokeWidth so it can stand in for a lucide icon.
 */
export const BagIcon: React.FC<IconProps & { strokeWidth?: number; live?: boolean }> = ({ className = 'w-5 h-5', mono = false, live = true }) => {
  const body = mono ? 'currentColor' : '#4B1D3F';
  const gold = mono ? 'currentColor' : '#C5A46D';
  const bagPath = 'M5.4 7.6h13.2c.6 0 1.1.46 1.15 1.06l.95 11.1A2.05 2.05 0 0 1 18.66 22H5.34a2.05 2.05 0 0 1-2.04-2.24l.95-11.1A1.15 1.15 0 0 1 5.4 7.6Z';
  return (
    <svg viewBox="0 0 24 24" className={`${className} sag-ic ${live ? 'sag-live sag-a-swing' : ''}`} role="img" aria-hidden="true" focusable="false">
      {/* mono: a light outline like the other icons; colour: the solid plum bag */}
      <path d={bagPath} fill={body} fillOpacity={mono ? 0.16 : 1} stroke={mono ? 'currentColor' : 'none'} strokeWidth={mono ? 1.7 : 0} strokeLinejoin="round" />
      {!mono && <path d="M5.4 7.6h13.2c.6 0 1.1.46 1.15 1.06l.12 1.34H4.13l.12-1.34A1.15 1.15 0 0 1 5.4 7.6Z" fill="#FFFFFF" opacity="0.14" />}
      <path d="M8.6 11V6.4a3.4 3.4 0 0 1 6.8 0V11" fill="none" stroke={mono ? 'currentColor' : gold} strokeWidth="1.7" strokeLinecap="round" />
      {!mono && <circle cx="8.6" cy="11.2" r="1.05" fill={gold} />}
      {!mono && <circle cx="15.4" cy="11.2" r="1.05" fill={gold} />}
    </svg>
  );
};

// Instagram's real logo uses its signature gradient (the brand mark itself, never a page decoration)
let gradientSeq = 0;
export const InstagramIcon: React.FC<IconProps & { live?: boolean }> = ({ className = 'w-5 h-5', mono = false, live = true }) => {
  const id = React.useMemo(() => `sag-ig-${(gradientSeq += 1)}`, []);
  return (
    <svg viewBox="0 0 24 24" className={`${className} sag-ic ${live ? 'sag-live sag-a-pop' : ''}`} role="img" aria-hidden="true" focusable="false">
      {!mono && (
        <defs>
          <radialGradient id={id} cx="0.3" cy="1.07" r="1.3">
            <stop offset="0" stopColor="#FFDD55" />
            <stop offset="0.1" stopColor="#FFDD55" />
            <stop offset="0.5" stopColor="#FF543E" />
            <stop offset="1" stopColor="#C837AB" />
          </radialGradient>
        </defs>
      )}
      <path d={siInstagram.path} fill={mono ? 'currentColor' : `url(#${id})`} />
    </svg>
  );
};
