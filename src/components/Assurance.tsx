import React from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { createSupportWhatsAppUrl } from '../utils/storeContact';
import { WhatsAppIcon } from './BrandIcons';
import { LockIcon, ReturnIcon, TruckIcon } from './StoreIcons';

export type AssuranceGateway = 'razorpay' | 'payu';
const GATEWAY_NAME: Record<AssuranceGateway, string> = { razorpay: 'Razorpay', payu: 'PayU' };

/**
 * The four facts the store stands behind, worded in ONE place so they read the same on every page.
 * They are true today: payment is online only, by UPI, returns and exchange within 7 days,
 * delivery across India, help on WhatsApp. Do not add a claim here that the owner has not confirmed.
 * The gateway name is shown only when the caller knows which gateway is active (the pay step does).
 */
export const assuranceFacts = (gateway?: AssuranceGateway) => ({
  payment: `Secure UPI payment${gateway ? ` (${GATEWAY_NAME[gateway]})` : ''}`,
  returns: '7-day returns & exchange',
  delivery: 'Delivery across India',
  help: 'Questions? Chat with us on WhatsApp',
});

/** Short form for the line above a buy, checkout or pay button. */
export const assuranceLine = (gateway?: AssuranceGateway) =>
  gateway ? `Secure payment by ${GATEWAY_NAME[gateway]} · 7-day returns & exchange` : 'Secure online payment · 7-day returns & exchange';

interface AssuranceProps {
  /** full = the four rows in a tinted block; line = one small line with a lock; grid = 2x2 tiles (home, footer). */
  variant?: 'full' | 'line' | 'grid';
  gateway?: AssuranceGateway;
  /** Text for the WhatsApp message, so the store knows which page the shopper wrote from. */
  whatsappMessage?: string;
  /** Use on a dark surface (footer). */
  onDark?: boolean;
  className?: string;
}

export const Assurance: React.FC<AssuranceProps> = ({ variant = 'full', gateway, whatsappMessage = 'Hi Suit Aura Girls! I have a question.', onDark = false, className = '' }) => {
  const { setActivePage } = useShop();
  const facts = assuranceFacts(gateway);

  if (variant === 'line') {
    return (
      <p className={`flex items-center justify-center gap-1.5 text-xs leading-4 ${onDark ? 'text-on-dark-muted' : 'text-ink-muted'} ${className}`}>
        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{assuranceLine(gateway)}</span>
      </p>
    );
  }

  const open = (page: 'return-policy' | 'shipping-policy') => { setActivePage(page); window.scrollTo(0, 0); };
  const rows: Array<{ key: string; icon: React.ReactNode; text: string; onClick?: () => void; href?: string }> = [
    { key: 'payment', icon: <LockIcon className="w-5 h-5" mono />, text: facts.payment },
    { key: 'returns', icon: <ReturnIcon className="w-5 h-5" mono />, text: facts.returns, onClick: () => open('return-policy') },
    { key: 'delivery', icon: <TruckIcon className="w-5 h-5" mono />, text: facts.delivery, onClick: () => open('shipping-policy') },
    { key: 'help', icon: <WhatsAppIcon className="w-5 h-5" />, text: facts.help, href: createSupportWhatsAppUrl(whatsappMessage) },
  ];

  if (variant === 'grid') {
    const tile = `flex items-center gap-2.5 min-h-[52px] rounded-control px-3 py-2 text-left text-[13px] leading-[18px] font-semibold ${onDark ? 'bg-white/10 text-on-dark' : 'bg-brand-wash text-ink border border-brand-line'}`;
    return (
      <ul className={`grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 ${className}`}>
        {rows.map((row) => (
          <li key={row.key} className="flex">
            {row.href ? (
              <a href={row.href} target="_blank" rel="noopener noreferrer" className={`${tile} w-full`}><span className="shrink-0 flex">{row.icon}</span><span>{row.text}</span></a>
            ) : row.onClick ? (
              <button type="button" onClick={row.onClick} className={`${tile} w-full cursor-pointer`}><span className="shrink-0 flex">{row.icon}</span><span>{row.text}</span></button>
            ) : (
              <span className={`${tile} w-full`}><span className="shrink-0 flex">{row.icon}</span><span>{row.text}</span></span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={`rounded-card border border-brand-line bg-brand-wash px-4 ${className}`}>
      {rows.map((row) => {
        const inner = (
          <>
            <span className="shrink-0 flex text-brand">{row.icon}</span>
            <span className="flex-1 min-w-0">{row.text}</span>
            {(row.onClick || row.href) && <ChevronRight className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />}
          </>
        );
        if (row.href) return <a key={row.key} href={row.href} target="_blank" rel="noopener noreferrer" className="sag-row border-brand-line">{inner}</a>;
        if (row.onClick) return <button key={row.key} type="button" onClick={row.onClick} className="sag-row border-brand-line w-full text-left cursor-pointer">{inner}</button>;
        return <div key={row.key} className="sag-row border-brand-line">{inner}</div>;
      })}
    </div>
  );
};
