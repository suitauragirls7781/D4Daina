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
 * "How your order works": three big numbered steps on a white block. All three are true today: payment is online
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
    <div className={`aura-card aura-blk aura-lt p-5 lg:p-7 ${className}`}>
      <h3 className="aura-h2 aura-h-sm text-ink">How your order <em>works</em></h3>
      <ol className="mt-5 grid gap-5 lg:mt-7 lg:grid-cols-3 lg:gap-7">
        {steps.map(([title, text], index) => (
          <li key={title} data-rv data-rv-delay={index * 90} className="flex items-start gap-4 lg:flex-col lg:gap-3">
            <span aria-hidden="true" className="aura-num w-[46px] shrink-0 text-[54px] font-extrabold leading-[0.86] tracking-[-0.04em] text-accent lg:w-auto lg:text-[72px]">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[19px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink">{title}</span>
              <span className="mt-1 block text-[15px] leading-[1.45] text-ink-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
};

interface AssuranceProps {
  /** full = the four facts as rows with round icon chips; line = one small line with a lock; grid = the home trust grid (two columns, four in a row on desktop: a big round icon chip and the fact in bold). */
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
      <p className={`flex items-center justify-center gap-1.5 text-[13px] leading-[18px] ${onDark ? 'text-on-dark-muted' : 'aura-mu'} ${className}`}>
        <Lock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
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
  // The facts carry no fill of their own: text and chips follow the section they sit in (--fg / --inv), so the
  // same piece reads on paper, on a white card and on an ink, forest or rose section. onDark = paper on dark.
  const tone = onDark ? 'aura-dk' : '';
  const chip = 'aura-fact-chip flex shrink-0 items-center justify-center rounded-full';

  if (variant === 'grid') {
    // Two columns on phones, four in a row on desktop: in each cell a big round chip with the icon, then the
    // fact in bold. The file has no second line for a fact, so none is shown.
    const cell = 'aura-fact group flex h-full w-full flex-col items-start gap-3.5 text-left';
    const body = (row: (typeof rows)[number]) => (
      <>
        <span className={`${chip} h-[54px] w-[54px] [&>svg]:h-[24px] [&>svg]:w-[24px]`}>{row.icon}</span>
        <span className="min-w-0 text-[19px] font-extrabold leading-[1.15] tracking-[-0.02em] lg:text-[21px]">{row.key === 'help' ? 'Chat with us on WhatsApp' : row.text}</span>
      </>
    );
    return (
      <ul className={`grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4 lg:gap-x-8 ${tone} ${className}`}>
        {rows.map((row, index) => (
          <li key={row.key} data-rv data-rv-delay={index * 80} className="flex min-w-0">
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

  // full: rows, each a round chip with the icon, the fact in bold and an arrow where the row leads somewhere
  const rowLine = 'aura-fact group flex min-h-[64px] w-full items-center gap-3.5 py-2.5 text-left';
  return (
    <div className={`${tone} ${className}`}>
      {rows.map((row) => {
        const inner = (
          <>
            <span className={`${chip} h-11 w-11 [&>svg]:h-[20px] [&>svg]:w-[20px]`}>{row.icon}</span>
            <span className="min-w-0 flex-1 text-[15.5px] font-bold leading-[1.3]">{row.text}</span>
            {(row.onClick || row.href) && <ChevronRight className="aura-mu h-[18px] w-[18px] shrink-0 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" strokeWidth={1.6} aria-hidden="true" />}
          </>
        );
        if (row.href) return <a key={row.key} href={row.href} target="_blank" rel="noopener noreferrer" className={rowLine}>{inner}</a>;
        if (row.onClick) return <button key={row.key} type="button" onClick={row.onClick} className={`${rowLine} cursor-pointer`}>{inner}</button>;
        return <div key={row.key} className={rowLine}>{inner}</div>;
      })}
    </div>
  );
};
