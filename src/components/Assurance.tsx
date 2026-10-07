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
 * They are true today: payment is by UPI (in full, or the advance of a cash on delivery order when the owner has that on), returns and exchange within 7 days,
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

/**
 * "How your order works": three numbered steps on a white card. All three are true today: payment is online
 * only (UPI), the order email goes out once the payment is verified, and every order is tracked in the account.
 * The gateway is named only when the caller knows which one is active.
 */
export const HowOrderWorks: React.FC<{ gateway?: AssuranceGateway; className?: string }> = ({ gateway, className = '' }) => {
  const steps: Array<[string, string]> = [
    ['Pay by UPI', `Google Pay, PhonePe, Paytm or any UPI app.${gateway ? ` Payment is handled by ${GATEWAY_NAME[gateway]}.` : ''}`],
    ['Order confirmed at once', 'The receipt comes to your email.'],
    ['Track it here', 'Every step shows in My orders.'],
  ];
  return (
    <div className={`border border-line bg-surface p-4 lg:p-5 ${className}`}>
      <h3 className="font-display text-[17px] leading-6 text-ink">How your order works</h3>
      <ol className="mt-1.5">
        {steps.map(([title, text], index) => (
          <li key={title} className="flex items-start gap-3 border-t border-line py-2.5 first:border-t-0 last:pb-0">
            <span aria-hidden="true" className="sag-num w-4 shrink-0 text-[12px] leading-[18px] text-ink-muted">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium leading-[18px] text-ink">{title}</span>
              <span className="block text-[13px] leading-[18px] text-ink-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

interface AssuranceProps {
  /** full = the four facts as plain rows between hairlines; line = one small line with a lock; grid = the home trust grid (two columns, four in a row on desktop: a thin icon and the fact). */
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
    { key: 'payment', icon: <LockIcon className="w-[19px] h-[19px]" mono />, text: facts.payment },
    { key: 'returns', icon: <ReturnIcon className="w-[19px] h-[19px]" mono />, text: facts.returns, onClick: () => open('return-policy') },
    { key: 'delivery', icon: <TruckIcon className="w-[19px] h-[19px]" mono />, text: facts.delivery, onClick: () => open('shipping-policy') },
    { key: 'help', icon: <WhatsAppIcon className="w-[18px] h-[18px]" mono />, text: facts.help, href: createSupportWhatsAppUrl(whatsappMessage) },
  ];
  const iconColour = onDark ? 'text-highlight' : 'text-sale';

  if (variant === 'grid') {
    // A plain grid: a thin champagne icon and the fact in normal text. No block, no circles, no ticks.
    const cell = `flex w-full items-center gap-2.5 text-left ${onDark ? 'text-on-dark' : 'text-ink'}`;
    const body = (row: (typeof rows)[number]) => (
      <>
        <span className={`flex shrink-0 ${iconColour}`}>{row.icon}</span>
        <span className="min-w-0 text-[12.5px] leading-[1.3] lg:text-[13px]">{row.key === 'help' ? 'Chat with us on WhatsApp' : row.text}</span>
      </>
    );
    return (
      <ul className={`grid grid-cols-2 gap-x-2.5 gap-y-3.5 lg:grid-cols-4 lg:gap-x-8 ${className}`}>
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0">
            {row.href ? (
              <a href={row.href} target="_blank" rel="noopener noreferrer" className={cell}>{body(row)}</a>
            ) : row.onClick ? (
              <button type="button" onClick={row.onClick} className={`${cell} cursor-pointer`}>{body(row)}</button>
            ) : (
              <span className={cell}>{body(row)}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  // full: plain rows between hairlines
  const rowLine = `sag-row font-normal ${onDark ? 'border-white/20 text-on-dark' : ''}`;
  return (
    <div className={`border-y ${onDark ? 'border-white/20' : 'border-line'} ${className}`}>
      {rows.map((row) => {
        const inner = (
          <>
            <span className={`shrink-0 flex ${iconColour}`}>{row.icon}</span>
            <span className="flex-1 min-w-0">{row.text}</span>
            {(row.onClick || row.href) && <ChevronRight className={`w-4 h-4 shrink-0 ${onDark ? 'text-on-dark-muted' : 'text-ink-muted'}`} strokeWidth={1.5} aria-hidden="true" />}
          </>
        );
        if (row.href) return <a key={row.key} href={row.href} target="_blank" rel="noopener noreferrer" className={rowLine}>{inner}</a>;
        if (row.onClick) return <button key={row.key} type="button" onClick={row.onClick} className={`${rowLine} w-full text-left cursor-pointer`}>{inner}</button>;
        return <div key={row.key} className={rowLine}>{inner}</div>;
      })}
    </div>
  );
};
